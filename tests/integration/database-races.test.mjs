import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.STUDENTWEB_TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl) && process.env.STUDENTWEB_ALLOW_DB_TESTS === 'true';
const skipReason = enabled
  ? false
  : 'Set STUDENTWEB_TEST_DATABASE_URL and STUDENTWEB_ALLOW_DB_TESTS=true for an isolated migrated database.';
const sql = enabled ? neon(databaseUrl) : null;

function ids(participantCount = 1) {
  const token = randomUUID();
  return {
    combinationId: randomUUID(),
    videoId: randomUUID(),
    invitationIds: Array.from({ length: participantCount }, () => randomUUID()),
    participantIds: Array.from({ length: participantCount }, () => randomUUID()),
    userIds: Array.from({ length: participantCount }, (_, index) => `db-test-${index}-${token}`),
    emails: Array.from({ length: participantCount }, (_, index) => `db-test-${index}-${token}@example.invalid`),
  };
}

async function requireSchema() {
  const rows = await sql`SELECT
    to_regprocedure('reserve_study_assignment(uuid,uuid,integer,text,jsonb,integer)') IS NOT NULL AS reserve_ready,
    to_regprocedure('start_study_attempt(uuid,uuid,text,integer,jsonb)') IS NOT NULL AS start_ready,
    to_regprocedure('invalidate_study_attempt(uuid,uuid,bigint,text)') IS NOT NULL AS invalidate_ready,
    to_regprocedure('complete_study_attempt(uuid,uuid,bigint,bigint)') IS NOT NULL AS complete_ready;`;
  assert.deepEqual(
    [rows[0].reserve_ready, rows[0].start_ready, rows[0].invalidate_ready, rows[0].complete_ready],
    [true, true, true, true],
    'Apply and verify the Student Web migration in the isolated test database first.',
  );
}

async function seedBase(fixture, quota = 1, durationSeconds = 1) {
  for (let index = 0; index < fixture.participantIds.length; index += 1) {
    await sql`INSERT INTO app_users (id, email, normalized_email, role)
      VALUES (${fixture.userIds[index]}, ${fixture.emails[index]}, ${fixture.emails[index]}, 'student');`;
    await sql`INSERT INTO invitations (id, email, normalized_email, status, delivery_status, accepted_by, accepted_at)
      VALUES (${fixture.invitationIds[index]}::uuid, ${fixture.emails[index]}, ${fixture.emails[index]},
        'accepted', 'test', ${fixture.userIds[index]}, NOW());`;
    await sql`INSERT INTO participants (id, user_id, invitation_id)
      VALUES (${fixture.participantIds[index]}::uuid, ${fixture.userIds[index]}, ${fixture.invitationIds[index]}::uuid);`;
  }
  await sql`INSERT INTO combinations (id, title, enabled, target_quota, current_version)
    VALUES (${fixture.combinationId}::uuid, 'Database race fixture', TRUE, ${quota}, 1);`;
  await sql`INSERT INTO combination_versions (combination_id, version, package_id, manifest, total_duration_seconds)
    VALUES (${fixture.combinationId}::uuid, 1, ${`test-${fixture.combinationId}`}, '{}'::jsonb, ${durationSeconds});`;
  await sql`INSERT INTO combination_videos (
      combination_id, combination_version, video_id, sequence, title, storage_url, mime_type, duration_seconds
    ) VALUES (
      ${fixture.combinationId}::uuid, 1, ${fixture.videoId}::uuid, 0, 'Race video',
      'https://example.invalid/video.mp4', 'video/mp4', ${durationSeconds}
    );`;
}

async function cleanup(fixture) {
  for (const participantId of fixture.participantIds) {
    await sql`DELETE FROM participants WHERE id = ${participantId}::uuid;`;
  }
  await sql`DELETE FROM combinations WHERE id = ${fixture.combinationId}::uuid;`;
  for (const invitationId of fixture.invitationIds) {
    await sql`DELETE FROM invitations WHERE id = ${invitationId}::uuid;`;
  }
  for (const userId of fixture.userIds) {
    await sql`DELETE FROM app_users WHERE id = ${userId};`;
  }
}

test('serializes quota allocation and duplicate participant reservations', { skip: skipReason }, async () => {
  await requireSchema();
  const fixture = ids(2);
  try {
    await seedBase(fixture, 1);
    const reserve = (participantId) => sql`SELECT reserve_study_assignment(
      ${participantId}::uuid, ${fixture.combinationId}::uuid, 1,
      'db-race-test-v1', '{}'::jsonb, 1800
    ) AS result;`;
    const results = await Promise.all(fixture.participantIds.map(reserve));
    const winners = results.map((rows) => rows[0].result).filter((result) => result.assignment);
    assert.equal(winners.length, 1);
    assert.equal(results.filter((rows) => rows[0].result.error === 'NO_CAPACITY').length, 1);

    const winnerId = winners[0].assignment.participant_id;
    const duplicates = await Promise.all([reserve(winnerId), reserve(winnerId)]);
    assert.equal(duplicates[0][0].result.assignment.id, winners[0].assignment.id);
    assert.equal(duplicates[1][0].result.assignment.id, winners[0].assignment.id);

    const counts = await sql`SELECT COUNT(*)::integer AS count FROM assignments
      WHERE combination_id = ${fixture.combinationId}::uuid
        AND status IN ('reserved','active','retry_required','completed');`;
    assert.equal(counts[0].count, 1);
  } finally {
    await cleanup(fixture);
  }
});

test('serializes completion against invalidation with one terminal outcome', { skip: skipReason }, async () => {
  await requireSchema();
  const fixture = ids(1);
  const assignmentId = randomUUID();
  const attemptId = randomUUID();
  try {
    await seedBase(fixture, 1, 0.01);
    await sql`INSERT INTO assignments (
        id, participant_id, combination_id, combination_version, status, selector_version,
        assigned_at, reservation_expires_at
      ) VALUES (
        ${assignmentId}::uuid, ${fixture.participantIds[0]}::uuid, ${fixture.combinationId}::uuid,
        1, 'active', 'db-race-test-v1', NOW(), NOW() + INTERVAL '30 minutes'
      );`;
    await sql`INSERT INTO attempts (
        id, assignment_id, attempt_number, control_version, status, source_mode,
        current_video_sequence, last_accepted_sequence, lease_expires_at, started_at, policy_snapshot
      ) VALUES (
        ${attemptId}::uuid, ${assignmentId}::uuid, 1, 1, 'post_study', 'stream',
        1, 2, NOW() + INTERVAL '1 minute', NOW() - INTERVAL '1 minute',
        '{"minimumPlaybackRatio":0.9,"connectionTimeoutSeconds":20}'::jsonb
      );`;
    await sql`INSERT INTO telemetry_events (
        id, attempt_id, sequence, event_type, client_wall_time, client_monotonic_ms, payload
      ) VALUES
      (${randomUUID()}::uuid, ${attemptId}::uuid, 1, 'video_ended', NOW(), 1000,
        ${JSON.stringify({ videoId: fixture.videoId, videoSequence: 0 })}::jsonb),
      (${randomUUID()}::uuid, ${attemptId}::uuid, 2, 'post_study_submitted', NOW(), 1100, '{}'::jsonb);`;
    await sql`INSERT INTO form_responses (
        participant_id, form_kind, form_version, assignment_id, attempt_id, status, answers, timing, submitted_at
      ) SELECT ${fixture.participantIds[0]}::uuid, 'post_study', post_study_version,
        ${assignmentId}::uuid, ${attemptId}::uuid, 'submitted', '{}'::jsonb, '{}'::jsonb, NOW()
        FROM study_config WHERE id = 'default';`;

    await Promise.all([
      sql`SELECT complete_study_attempt(${fixture.participantIds[0]}::uuid, ${attemptId}::uuid, 1, 2);`,
      sql`SELECT invalidate_study_attempt(${fixture.participantIds[0]}::uuid, ${attemptId}::uuid, 1, 'race-test');`,
    ]);

    const state = await sql`SELECT t.status AS attempt_status, a.status AS assignment_status,
        (SELECT COUNT(*)::integer FROM telemetry_events e WHERE e.attempt_id = t.id) AS event_count
      FROM attempts t JOIN assignments a ON a.id = t.assignment_id WHERE t.id = ${attemptId}::uuid;`;
    const outcome = state[0];
    assert.ok(
      (outcome.attempt_status === 'completed' && outcome.assignment_status === 'completed' && outcome.event_count === 2)
      || (outcome.attempt_status === 'invalid' && outcome.assignment_status === 'retry_required' && outcome.event_count === 0),
    );
  } finally {
    await cleanup(fixture);
  }
});
