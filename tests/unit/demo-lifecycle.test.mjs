import assert from 'node:assert/strict';
import test from 'node:test';
import {
  demoAssign,
  demoComplete,
  demoEnterPostStudy,
  demoEvents,
  demoInvalidate,
  demoSaveConsent,
  demoSavePostStudy,
  demoSavePreStudy,
  demoSetReadiness,
  demoStartAttempt,
  demoStatus,
  resetDemoState,
} from '../../src/lib/study/demo-client.ts';

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.get(key) ?? null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
}

const localStorage = new MemoryStorage();
const sessionStorage = new MemoryStorage();
globalThis.window = { localStorage, sessionStorage };

function reset() {
  resetDemoState();
  sessionStorage.clear();
}

function prepareAssignment() {
  demoSaveConsent();
  demoSavePreStudy({ age: 21, familiarity: 3 });
  return demoAssign();
}

test.beforeEach(reset);

test('keeps one reservation when assignment is requested repeatedly', () => {
  const first = prepareAssignment();
  const second = demoAssign();

  assert.equal(first.assignment.status, 'reserved');
  assert.equal(second.assignment.id, first.assignment.id);
  assert.equal(second.assignment.reservationExpiresAt, first.assignment.reservationExpiresAt);
  assert.equal(second.preStudySubmitted, true);
});

test('deduplicates telemetry retries and acknowledges the contiguous stored sequence', () => {
  prepareAssignment();
  demoSetReadiness('zip', true);
  const started = demoStartAttempt('zip');
  const attemptId = started.attempt.id;
  const first = {
    eventId: 'event-1', sequence: 1, eventType: 'attempt_started',
    clientWallTime: new Date().toISOString(), clientMonotonicMs: 1, payload: {},
  };
  const second = { ...first, eventId: 'event-2', sequence: 2, eventType: 'video_started' };

  assert.equal(demoEvents(attemptId, [first, first]).acceptedThrough, 1);
  assert.equal(demoEvents(attemptId, [first, second]).acceptedThrough, 2);

  const stored = JSON.parse(localStorage.getItem('studentweb-demo-state-v1'));
  assert.deepEqual(stored.telemetry.map((event) => event.eventId), ['event-1', 'event-2']);
});

test('invalidation purges viewing telemetry while preserving forms and the original reservation', () => {
  const assigned = prepareAssignment();
  demoSetReadiness('stream', true);
  const started = demoStartAttempt('stream');
  const attemptId = started.attempt.id;
  demoEvents(attemptId, [{
    eventId: 'viewing-event', sequence: 1, eventType: 'video_progress',
    clientWallTime: new Date().toISOString(), clientMonotonicMs: 1000,
    payload: { mediaTime: 1 },
  }]);
  demoEnterPostStudy(attemptId);
  demoSavePostStudy({ understanding: 5 });

  const invalid = demoInvalidate(attemptId, 'visibility_hidden');
  const stored = JSON.parse(localStorage.getItem('studentweb-demo-state-v1'));

  assert.equal(invalid.attempt.status, 'invalid');
  assert.equal(invalid.assignment.status, 'retry_required');
  assert.equal(invalid.assignment.id, assigned.assignment.id);
  assert.equal(invalid.assignment.reservationExpiresAt, assigned.assignment.reservationExpiresAt);
  assert.equal(invalid.preStudySubmitted, true);
  assert.equal(invalid.postStudySubmitted, true);
  assert.deepEqual(stored.telemetry, []);
  assert.equal(sessionStorage.getItem('studentweb-last-invalidation'), 'visibility_hidden');
});

test('completion is idempotent for an already completed demo attempt', () => {
  prepareAssignment();
  demoSetReadiness('stream', true);
  const started = demoStartAttempt('stream');
  demoEnterPostStudy(started.attempt.id);
  demoSavePostStudy({ understanding: 6 });

  const first = demoComplete(started.attempt.id);
  const second = demoComplete(started.attempt.id);
  assert.equal(first.completed, true);
  assert.equal(first.assignment.status, 'completed');
  assert.equal(second.assignment.id, first.assignment.id);
  assert.equal(second.attempt.id, first.attempt.id);
  assert.equal(demoStatus().completed, true);
});
