import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = ts.transpileModule(
  readFileSync(new URL('../../src/lib/study/demo-store.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;

class StudyError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function fixture() {
  const exported = { exports: {} };
  vm.runInNewContext(source, {
    module: exported,
    exports: exported.exports,
    structuredClone,
    crypto,
    Date,
    require(name) {
      if (name === '@/lib/study/config') {
        return { getStudyConfig: () => ({ reservationDurationSeconds: 60, connectionTimeoutSeconds: 20 }) };
      }
      if (name === '@/lib/study/errors') return { StudyError };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return exported.exports;
}

function expectCode(code) {
  return (cause) => cause instanceof Error && cause.code === code;
}

function event(eventId, sequence, eventType, payload = {}) {
  return {
    eventId, sequence, eventType, payload,
    clientWallTime: new Date().toISOString(),
    clientMonotonicMs: sequence * 1000,
  };
}

test('enforces invitation, consent, pre-study, assignment, and readiness in order', () => {
  const api = fixture();
  const invited = 'student.demo@example.com';

  assert.throws(() => api.demoBootstrap('not-invited@example.com'), expectCode('INVITATION_REQUIRED'));
  assert.throws(() => api.demoSavePreStudy(invited, { age: 20 }), expectCode('CONSENT_REQUIRED'));
  assert.throws(() => api.demoAssign(invited), expectCode('PRE_STUDY_REQUIRED'));

  api.demoSaveConsent(invited, true);
  api.demoSavePreStudy(invited, { age: 20, familiarity: 3 });
  const assignment = api.demoAssign(invited);
  assert.throws(() => api.demoStart(invited, 'stream'), expectCode('READINESS_REQUIRED'));

  api.demoReadiness(invited, 'stream', { downloadMbps: 25 });
  const attempt = api.demoStart(invited, 'stream');
  assert.equal(attempt.assignmentId, assignment.id);
  assert.equal(attempt.status, 'watching');
  assert.equal(api.demoStart(invited, 'stream').id, attempt.id, 'duplicate start returns the active attempt');
});

test('deduplicates event IDs and sequences before moving to post-study', () => {
  const api = fixture();
  const email = 'student.demo@example.com';
  api.demoSaveConsent(email, true);
  api.demoSavePreStudy(email, { age: 21 });
  api.demoAssign(email);
  api.demoReadiness(email, 'zip', { packageId: 'fixture' });
  const attempt = api.demoStart(email, 'zip');

  const first = event('event-1', 1, 'video_ended', {
    videoId: '11111111-1111-4111-8111-111111111101', videoSequence: 0,
  });
  const duplicateSequence = event('event-2', 1, 'video_progress', { mediaTime: 10 });
  assert.throws(
    () => api.demoAppendEvents(email, attempt.id, attempt.controlVersion, [first, first, duplicateSequence]),
    expectCode('EVENT_CONFLICT'),
  );
  let result = api.demoAppendEvents(email, attempt.id, attempt.controlVersion, [first]);
  assert.equal(result.acceptedThrough, 1);
  assert.equal(result.attempt.status, 'watching');

  result = api.demoAppendEvents(email, attempt.id, attempt.controlVersion, [
    event('event-3', 2, 'video_ended', {
      videoId: '11111111-1111-4111-8111-111111111102', videoSequence: 1,
    }),
  ]);
  assert.equal(result.acceptedThrough, 2);
  assert.equal(result.attempt.status, 'post_study');
  assert.equal(api.demoAdminParticipant('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa').telemetry.length, 2);
});

test('invalidating purges attempt telemetry but preserves questionnaires and retry ownership', () => {
  const api = fixture();
  const email = 'student.demo@example.com';
  api.demoSaveConsent(email, true);
  api.demoSavePreStudy(email, { age: 21 });
  const assignment = api.demoAssign(email);
  api.demoReadiness(email, 'stream', {});
  const attempt = api.demoStart(email, 'stream');
  api.demoAppendEvents(email, attempt.id, attempt.controlVersion, [
    event('event-1', 1, 'video_progress', { mediaTime: 3 }),
    event('video-0', 2, 'video_ended', {
      videoId: '11111111-1111-4111-8111-111111111101', videoSequence: 0,
    }),
    event('video-1', 3, 'video_ended', {
      videoId: '11111111-1111-4111-8111-111111111102', videoSequence: 1,
    }),
  ]);
  api.demoSavePostStudy(email, { understanding: 5 }, false);

  const invalid = api.demoInvalidate(email, attempt.id, attempt.controlVersion, 'hidden');
  const detail = api.demoAdminParticipant('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(invalid.retryEligible, true);
  assert.equal(invalid.assignment.id, assignment.id);
  assert.equal(invalid.assignment.status, 'retry_required');
  assert.deepEqual(JSON.parse(JSON.stringify(detail.telemetry)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(detail.preStudy)), { age: 21 });
  assert.deepEqual(JSON.parse(JSON.stringify(detail.postStudy)), { understanding: 5 });

  assert.throws(
    () => api.demoAppendEvents(email, attempt.id, attempt.controlVersion, [event('late', 2, 'video_progress')]),
    expectCode('ATTEMPT_INVALID'),
  );
});

test('completes once only after all fixture videos and post-study are present', () => {
  const api = fixture();
  const email = 'student.demo@example.com';
  api.demoSaveConsent(email, true);
  api.demoSavePreStudy(email, { age: 21 });
  api.demoAssign(email);
  api.demoReadiness(email, 'stream', {});
  const attempt = api.demoStart(email, 'stream');
  api.demoAppendEvents(email, attempt.id, attempt.controlVersion, [
    event('video-0', 1, 'video_ended', {
      videoId: '11111111-1111-4111-8111-111111111101', videoSequence: 0,
    }),
    event('video-1', 2, 'video_ended', {
      videoId: '11111111-1111-4111-8111-111111111102', videoSequence: 1,
    }),
  ]);
  assert.throws(() => api.demoComplete(email, attempt.id, attempt.controlVersion), expectCode('POST_STUDY_REQUIRED'));
  api.demoSavePostStudy(email, { understanding: 6 }, true);
  api.demoAppendEvents(email, attempt.id, attempt.controlVersion, [
    event('post-study', 3, 'post_study_submitted'),
  ]);

  const completed = api.demoComplete(email, attempt.id, attempt.controlVersion);
  assert.equal(completed.completed, true);
  assert.equal(completed.attempt.status, 'completed');
  assert.equal(completed.assignment.status, 'completed');
  assert.equal(api.demoComplete(email, attempt.id, attempt.controlVersion).completed, true);
});
