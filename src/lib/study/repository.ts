import 'server-only';

import { clerkClient } from '@clerk/nextjs/server';
import { getDb } from '@/lib/db';
import type { AuthContext } from '@/lib/auth';
import { getStudyConfig } from '@/lib/study/config';
import { StudyError } from '@/lib/study/errors';
import * as demo from '@/lib/study/demo-store';
import type {
  Assignment,
  Combination,
  SourceMode,
  StudyAttempt,
  StudyStatus,
  StudyVideo,
  TelemetryEvent,
} from '@/types/study';

type Row = Record<string, unknown>;

function text(value: unknown) { return typeof value === 'string' ? value : ''; }
function number(value: unknown) { return typeof value === 'number' ? value : Number(value ?? 0); }
function iso(value: unknown) { return value instanceof Date ? value.toISOString() : text(value); }
function jsonObject(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function recordAdminAudit(
  context: AuthContext,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown> = {},
) {
  if (context.demo) return;
  const sql = getDb();
  await sql`INSERT INTO admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
    VALUES (${context.userId}, ${action}, ${targetType}, ${targetId}, ${JSON.stringify(metadata)}::jsonb);`;
}

function mapAssignment(row: Row): Assignment {
  return {
    id: text(row.id), combinationId: text(row.combination_id), combinationVersion: number(row.combination_version),
    status: text(row.status) as Assignment['status'], assignedAt: iso(row.assigned_at),
    reservationExpiresAt: iso(row.reservation_expires_at), stateVersion: number(row.state_version),
  };
}

function mapAttempt(row: Row): StudyAttempt {
  return {
    id: text(row.id), assignmentId: text(row.assignment_id), attemptNumber: number(row.attempt_number),
    controlVersion: number(row.control_version), status: text(row.status) as StudyAttempt['status'],
    sourceMode: text(row.source_mode) as SourceMode, currentVideoSequence: number(row.current_video_sequence),
    leaseExpiresAt: iso(row.lease_expires_at),
  };
}

function mapVideo(row: Row): StudyVideo {
  return {
    id: text(row.video_id), title: text(row.title), sequence: number(row.sequence),
    durationSeconds: number(row.duration_seconds), storageUrl: text(row.storage_url),
    mimeType: text(row.mime_type), sizeBytes: row.size_bytes == null ? undefined : number(row.size_bytes),
  };
}

async function dbCombination(combinationId: string, version?: number): Promise<Combination | null> {
  const sql = getDb();
  const rows = await sql`SELECT c.*, COALESCE(${version ?? null}::integer, c.current_version) AS selected_version,
      (SELECT COUNT(*) FROM assignments a WHERE a.combination_id = c.id AND a.status = 'completed') AS completed_count,
      (SELECT COUNT(*) FROM assignments a WHERE a.combination_id = c.id AND (
        (a.status IN ('reserved','retry_required') AND a.reservation_expires_at > clock_timestamp())
        OR (a.status = 'active' AND (a.reservation_expires_at > clock_timestamp() OR EXISTS (
          SELECT 1 FROM attempts t WHERE t.assignment_id = a.id
            AND t.status IN ('watching','post_study','completing') AND t.lease_expires_at > clock_timestamp()
        )))
      )) AS held_count
    FROM combinations c WHERE c.id = ${combinationId}::uuid LIMIT 1;`;
  if (!rows[0]) return null;
  const selectedVersion = number(rows[0].selected_version);
  const videos = await sql`SELECT * FROM combination_videos WHERE combination_id = ${combinationId}::uuid
    AND combination_version = ${selectedVersion} ORDER BY sequence;`;
  return {
    id: text(rows[0].id), title: text(rows[0].title), description: text(rows[0].description),
    version: selectedVersion, targetQuota: number(rows[0].target_quota), completedCount: number(rows[0].completed_count),
    heldCount: number(rows[0].held_count), enabled: Boolean(rows[0].enabled), videos: videos.map(mapVideo),
  };
}

export async function bootstrap(context: AuthContext) {
  if (context.demo) return demo.demoBootstrap(context.email);
  const sql = getDb();
  const rows = await sql`WITH user_row AS (
      INSERT INTO app_users (id, email, normalized_email, role)
      VALUES (${context.userId}, ${context.email}, ${context.email}, ${context.role})
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, normalized_email = EXCLUDED.normalized_email,
        updated_at = NOW(), role = CASE WHEN app_users.role = 'admin' THEN 'admin' ELSE EXCLUDED.role END
      RETURNING *
    ), accepted AS (
      UPDATE invitations SET status = 'accepted', accepted_by = ${context.userId}, accepted_at = COALESCE(accepted_at, NOW())
      WHERE normalized_email = ${context.email} AND status IN ('pending','accepted') RETURNING *
    ), participant_row AS (
      INSERT INTO participants (user_id, invitation_id)
      SELECT ${context.userId}, id FROM accepted
      ON CONFLICT (user_id) DO UPDATE SET invitation_id = EXCLUDED.invitation_id
      RETURNING *
    ) SELECT * FROM participant_row;`;
  if (!rows[0] && context.role !== 'admin') {
    throw new StudyError(403, 'INVITATION_REQUIRED', 'This email has not been invited.');
  }
  return rows[0] ?? { id: null, email: context.email, role: context.role };
}

async function participantId(context: AuthContext) {
  const row = await bootstrap(context) as Row;
  if (!row.id) throw new StudyError(403, 'PARTICIPANT_REQUIRED', 'An invited participant account is required.');
  return text(row.id);
}

async function reconcileParticipantState(pid: string) {
  const sql = getDb();
  const expiredAttempts = await sql`SELECT t.id, t.control_version FROM attempts t
    JOIN assignments a ON a.id = t.assignment_id
    WHERE a.participant_id = ${pid}::uuid
      AND t.status IN ('watching','post_study','completing')
      AND t.lease_expires_at <= clock_timestamp()
    ORDER BY t.started_at LIMIT 10;`;
  for (const attempt of expiredAttempts) {
    await sql`SELECT invalidate_study_attempt(${pid}::uuid, ${text(attempt.id)}::uuid,
      ${number(attempt.control_version)}, 'connection_timeout');`;
  }
  await sql`UPDATE assignments SET status = 'released', released_at = clock_timestamp(),
      release_reason = 'reservation_expired', state_version = state_version + 1
    WHERE participant_id = ${pid}::uuid AND status IN ('reserved','retry_required')
      AND reservation_expires_at <= clock_timestamp();`;
}

export async function getStatus(context: AuthContext): Promise<StudyStatus> {
  if (context.demo) return demo.demoStatus(context.email, context.role);
  const sql = getDb();
  const runtimeConfig = getStudyConfig();
  const policy = {
    heartbeatIntervalSeconds: runtimeConfig.heartbeatIntervalSeconds,
    telemetryFlushSeconds: runtimeConfig.telemetryFlushSeconds,
    playbackSampleSeconds: runtimeConfig.playbackSampleSeconds,
    maxBufferingSeconds: runtimeConfig.maxBufferingSeconds,
    readinessSampleBytes: runtimeConfig.readinessSampleBytes,
    readinessTimeoutSeconds: runtimeConfig.readinessTimeoutSeconds,
    streamBitrateMargin: runtimeConfig.streamBitrateMargin,
    minimumStreamMbps: runtimeConfig.minimumStreamMbps,
  };
  const participants = await sql`SELECT p.* FROM participants p WHERE p.user_id = ${context.userId} LIMIT 1;`;
  const participant = participants[0];
  const invitations = await sql`SELECT status FROM invitations WHERE normalized_email = ${context.email} LIMIT 1;`;
  if (!participant) {
    return {
      mode: 'configured', participantId: null, email: context.email, role: context.role,
      invited: invitations[0]?.status === 'pending' || invitations[0]?.status === 'accepted', consented: false,
      preStudySubmitted: false, assignment: null, attempt: null, combination: null,
      postStudySubmitted: false, completed: false, serverTime: new Date().toISOString(), policy,
    };
  }
  const pid = text(participant.id);
  await reconcileParticipantState(pid);
  const configRows = await sql`SELECT * FROM study_config WHERE id = 'default';`;
  const config = configRows[0];
  const consent = await sql`SELECT 1 FROM consents WHERE participant_id = ${pid}::uuid
    AND version = ${text(config.consent_version)} AND accepted LIMIT 1;`;
  const pre = await sql`SELECT 1 FROM form_responses WHERE participant_id = ${pid}::uuid
    AND form_kind = 'pre_study' AND form_version = ${text(config.pre_study_version)} AND status = 'submitted' LIMIT 1;`;
  const assignments = await sql`SELECT * FROM assignments WHERE participant_id = ${pid}::uuid
    ORDER BY assigned_at DESC LIMIT 1;`;
  const assignment = assignments[0] ? mapAssignment(assignments[0]) : null;
  const attempts = assignment ? await sql`SELECT * FROM attempts WHERE assignment_id = ${assignment.id}::uuid
    ORDER BY attempt_number DESC LIMIT 1;` : [];
  const attempt = attempts[0] ? mapAttempt(attempts[0]) : null;
  if (attempts[0] && ['watching', 'post_study', 'completing'].includes(text(attempts[0].status))) {
    const snapshot = jsonObject(attempts[0].policy_snapshot);
    if (number(snapshot.telemetryFlushSeconds) > 0) policy.telemetryFlushSeconds = number(snapshot.telemetryFlushSeconds);
    if (number(snapshot.playbackSampleSeconds) > 0) policy.playbackSampleSeconds = number(snapshot.playbackSampleSeconds);
    if (number(snapshot.maxBufferingSeconds) > 0) policy.maxBufferingSeconds = number(snapshot.maxBufferingSeconds);
  }
  const combination = assignment ? await dbCombination(assignment.combinationId, assignment.combinationVersion) : null;
  const post = assignment ? await sql`SELECT 1 FROM form_responses WHERE participant_id = ${pid}::uuid
    AND form_kind = 'post_study' AND form_version = ${text(config.post_study_version)}
    AND assignment_id = ${assignment.id}::uuid AND status = 'submitted' LIMIT 1;` : [];
  return {
    mode: 'configured', participantId: pid, email: context.email, role: context.role, invited: true,
    consented: Boolean(consent[0]), preStudySubmitted: Boolean(pre[0]), assignment, attempt, combination,
    postStudySubmitted: Boolean(post[0]), completed: assignment?.status === 'completed', serverTime: new Date().toISOString(), policy,
  };
}

export async function saveConsent(context: AuthContext, input: { accepted: boolean; typedName?: string; timing?: Record<string, unknown> }) {
  if (context.demo) return demo.demoSaveConsent(context.email, input.accepted);
  const pid = await participantId(context);
  const sql = getDb();
  const rows = await sql`INSERT INTO consents (participant_id, version, confirmation_method, typed_name, accepted, timing)
    SELECT ${pid}::uuid, consent_version, 'typed-confirmation', ${input.typedName ?? null}, ${input.accepted},
      ${JSON.stringify(input.timing ?? {})}::jsonb
      FROM study_config WHERE id = 'default'
    ON CONFLICT (participant_id, version) DO UPDATE SET confirmation_method = EXCLUDED.confirmation_method,
      typed_name = EXCLUDED.typed_name, accepted = EXCLUDED.accepted, timing = EXCLUDED.timing, accepted_at = NOW()
    RETURNING *;`;
  return rows[0];
}

export async function savePreStudy(context: AuthContext, answers: Record<string, unknown>, timing: Record<string, unknown>) {
  if (context.demo) return demo.demoSavePreStudy(context.email, answers);
  const pid = await participantId(context);
  const sql = getDb();
  const rows = await sql`INSERT INTO form_responses (participant_id, form_kind, form_version, status, answers, timing, submitted_at)
    SELECT ${pid}::uuid, 'pre_study', pre_study_version, 'submitted', ${JSON.stringify(answers)}::jsonb,
      ${JSON.stringify(timing)}::jsonb, NOW() FROM study_config sc WHERE id = 'default'
      AND EXISTS (SELECT 1 FROM consents c WHERE c.participant_id = ${pid}::uuid
        AND c.version = sc.consent_version AND c.accepted)
    ON CONFLICT (participant_id, form_kind, form_version) WHERE form_kind = 'pre_study'
    DO UPDATE SET answers = EXCLUDED.answers, timing = EXCLUDED.timing, status = 'submitted',
      submitted_at = NOW(), updated_at = NOW() RETURNING *;`;
  if (!rows[0]) throw new StudyError(409, 'CONSENT_REQUIRED', 'Consent is required before the pre-study form.');
  return rows[0];
}

export async function requestAssignment(context: AuthContext) {
  if (context.demo) return demo.demoAssign(context.email);
  const pid = await participantId(context);
  const config = getStudyConfig();
  if (config.assignmentMode !== 'development-stub') {
    throw new StudyError(503, 'ALGORITHM_NOT_CONFIGURED', 'The production assignment algorithm has not been connected.');
  }
  const sql = getDb();
  const prerequisites = await sql`SELECT EXISTS (
      SELECT 1 FROM form_responses f JOIN study_config sc ON sc.id = 'default'
      WHERE f.participant_id = ${pid}::uuid AND f.form_kind = 'pre_study'
        AND f.form_version = sc.pre_study_version AND f.status = 'submitted'
    ) AS ready;`;
  if (!prerequisites[0]?.ready) {
    throw new StudyError(409, 'PRE_STUDY_REQUIRED', 'Complete the pre-study form before assignment.');
  }
  const candidates = await sql`SELECT c.id, c.current_version FROM combinations c
    WHERE c.enabled AND EXISTS (
      SELECT 1 FROM combination_videos cv
      WHERE cv.combination_id = c.id AND cv.combination_version = c.current_version
    ) AND c.target_quota > (
      SELECT COUNT(*) FROM assignments a WHERE a.combination_id = c.id AND (
        a.status = 'completed' OR (a.status IN ('reserved','retry_required') AND a.reservation_expires_at > clock_timestamp())
        OR (a.status = 'active' AND (a.reservation_expires_at > clock_timestamp() OR EXISTS (
          SELECT 1 FROM attempts t WHERE t.assignment_id = a.id AND t.status IN ('watching','post_study','completing')
            AND t.lease_expires_at > clock_timestamp()
        )))
      )
    ) ORDER BY c.id LIMIT 10;`;
  for (const candidate of candidates) {
    const rows = await sql`SELECT reserve_study_assignment(${pid}::uuid, ${text(candidate.id)}::uuid,
      ${number(candidate.current_version)}, 'development-stub-v1', '{}'::jsonb,
      ${config.reservationDurationSeconds}) AS result;`;
    const result = jsonObject(rows[0]?.result);
    if (result.assignment) return mapAssignment(jsonObject(result.assignment));
    if (result.error !== 'NO_CAPACITY') throw new StudyError(409, text(result.error), 'The selected combination is unavailable.');
  }
  throw new StudyError(409, 'NO_CAPACITY', 'No combination currently has an available slot.');
}

export async function getPackage(context: AuthContext) {
  if (context.demo) return demo.demoPackage(context.email);
  const status = await getStatus(context);
  if (!status.assignment || !status.combination || status.assignment.status === 'released') {
    throw new StudyError(409, 'ASSIGNMENT_REQUIRED', 'An active assignment is required.');
  }
  const sql = getDb();
  const versions = await sql`SELECT package_id, manifest, manifest_sha256 FROM combination_versions
    WHERE combination_id = ${status.assignment.combinationId}::uuid
      AND version = ${status.assignment.combinationVersion} LIMIT 1;`;
  return {
    participantId: status.participantId ?? '',
    packageId: versions[0]?.package_id,
    manifest: versions[0]?.manifest,
    manifestSha256: versions[0]?.manifest_sha256,
    combination: status.combination,
  };
}

export async function saveReadiness(context: AuthContext, sourceMode: SourceMode, passed: boolean, metrics: Record<string, unknown>) {
  if (context.demo) return demo.demoReadiness(context.email, sourceMode, metrics);
  const status = await getStatus(context);
  if (!status.assignment || status.assignment.status === 'released') throw new StudyError(409, 'ASSIGNMENT_REQUIRED', 'An active assignment is required.');
  const sql = getDb();
  const config = getStudyConfig();
  if (passed && sourceMode === 'stream') {
    const measuredMbps = number(metrics.downloadMbps);
    const measuredVideos = status.combination?.videos.filter((video) => video.sizeBytes && video.durationSeconds > 0) ?? [];
    const mediaRequirement = measuredVideos.length
      ? Math.max(...measuredVideos.map((video) => (Number(video.sizeBytes) * 8) / video.durationSeconds / 1_000_000))
        * config.streamBitrateMargin
      : 0;
    const requiredMbps = Math.max(config.minimumStreamMbps, mediaRequirement);
    if (!Number.isFinite(measuredMbps) || measuredMbps < requiredMbps
      || number(metrics.sampleBytes) < 65_536
      || text(metrics.testedVideoId) !== status.combination?.videos[0]?.id) {
      throw new StudyError(422, 'READINESS_EVIDENCE_INVALID', 'The streaming readiness evidence does not meet the configured policy.');
    }
  }
  if (passed && sourceMode === 'zip') {
    const versions = await sql`SELECT package_id FROM combination_versions
      WHERE combination_id = ${status.assignment.combinationId}::uuid
        AND version = ${status.assignment.combinationVersion} LIMIT 1;`;
    if (text(metrics.packageId) !== text(versions[0]?.package_id)
      || number(metrics.videoCount) !== (status.combination?.videos.length ?? 0)) {
      throw new StudyError(422, 'READINESS_EVIDENCE_INVALID', 'The ZIP readiness evidence does not match the assigned package.');
    }
  }
  const rows = await sql`INSERT INTO readiness_results (assignment_id, source_mode, combination_version, status, metrics, expires_at)
    VALUES (${status.assignment.id}::uuid, ${sourceMode}, ${status.assignment.combinationVersion},
      ${passed ? 'passed' : 'failed'}, ${JSON.stringify(metrics)}::jsonb,
      NOW() + make_interval(secs => ${config.readinessTtlSeconds})) RETURNING *;`;
  return rows[0];
}

export async function startAttempt(context: AuthContext, sourceMode: SourceMode) {
  if (context.demo) return demo.demoStart(context.email, sourceMode);
  const pid = await participantId(context);
  const status = await getStatus(context);
  if (!status.assignment) throw new StudyError(409, 'ASSIGNMENT_REQUIRED', 'An active assignment is required.');
  const sql = getDb();
  const config = getStudyConfig();
  const policySnapshot = {
    connectionTimeoutSeconds: config.connectionTimeoutSeconds,
    telemetryFlushSeconds: config.telemetryFlushSeconds,
    playbackSampleSeconds: config.playbackSampleSeconds,
    maxBufferingSeconds: config.maxBufferingSeconds,
    minimumPlaybackRatio: config.minimumPlaybackRatio,
  };
  const rows = await sql`SELECT start_study_attempt(${pid}::uuid, ${status.assignment.id}::uuid,
    ${sourceMode}, ${config.connectionTimeoutSeconds}, ${JSON.stringify(policySnapshot)}::jsonb) AS result;`;
  const result = jsonObject(rows[0]?.result);
  if (result.error) throw new StudyError(409, text(result.error), 'The study attempt could not be started.');
  return mapAttempt(jsonObject(result.attempt));
}

export async function heartbeat(context: AuthContext, attemptId: string, controlVersion: number) {
  if (context.demo) return demo.demoHeartbeat(context.email, attemptId, controlVersion);
  const pid = await participantId(context);
  const sql = getDb();
  const rows = await sql`UPDATE attempts t SET lease_expires_at = clock_timestamp()
      + make_interval(secs => COALESCE(NULLIF(t.policy_snapshot->>'connectionTimeoutSeconds', '')::integer,
        ${getStudyConfig().connectionTimeoutSeconds}))
    FROM assignments a WHERE t.id = ${attemptId}::uuid AND t.assignment_id = a.id
      AND a.participant_id = ${pid}::uuid AND t.control_version = ${controlVersion}
      AND t.status IN ('watching','post_study','completing') AND t.lease_expires_at > clock_timestamp()
    RETURNING t.*;`;
  if (!rows[0]) throw new StudyError(409, 'ATTEMPT_INVALID', 'The attempt expired or this tab no longer controls it.');
  return mapAttempt(rows[0]);
}

export async function appendEvents(context: AuthContext, attemptId: string, controlVersion: number, events: TelemetryEvent[]) {
  if (context.demo) return demo.demoAppendEvents(context.email, attemptId, controlVersion, events);
  const pid = await participantId(context);
  const sql = getDb();
  const rows = await sql`WITH locked AS MATERIALIZED (
      SELECT t.id, t.assignment_id FROM attempts t JOIN assignments a ON a.id = t.assignment_id
      WHERE t.id = ${attemptId}::uuid AND a.participant_id = ${pid}::uuid
        AND t.control_version = ${controlVersion} AND t.status IN ('watching','post_study','completing')
        AND t.lease_expires_at > clock_timestamp() FOR UPDATE OF t
    ), event_rows AS MATERIALIZED (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(events)}::jsonb)
        AS e("eventId" UUID, sequence BIGINT, "eventType" TEXT, "clientWallTime" TIMESTAMPTZ,
          "clientMonotonicMs" NUMERIC, payload JSONB)
    ), conflicts AS (
      SELECT COUNT(*)::integer AS count
      FROM telemetry_events existing
      CROSS JOIN locked
      CROSS JOIN event_rows incoming
      WHERE (existing.id = incoming."eventId"
          OR (existing.attempt_id = locked.id AND existing.sequence = incoming.sequence))
        AND (existing.attempt_id <> locked.id
        OR existing.id <> incoming."eventId"
        OR existing.sequence <> incoming.sequence
        OR existing.event_type IS DISTINCT FROM incoming."eventType"
        OR existing.client_wall_time IS DISTINCT FROM incoming."clientWallTime"
        OR existing.client_monotonic_ms IS DISTINCT FROM incoming."clientMonotonicMs"
        OR existing.payload IS DISTINCT FROM incoming.payload)
    ), inserted AS (
      INSERT INTO telemetry_events (id, attempt_id, sequence, event_type, client_wall_time, client_monotonic_ms, payload)
      SELECT e."eventId", locked.id, e.sequence, e."eventType", e."clientWallTime", e."clientMonotonicMs", e.payload
      FROM locked CROSS JOIN event_rows e
      WHERE (SELECT count FROM conflicts) = 0
      ON CONFLICT DO NOTHING RETURNING sequence, event_type, payload
    ), all_events AS MATERIALIZED (
      SELECT e.sequence, e.event_type, e.payload
      FROM telemetry_events e CROSS JOIN locked WHERE e.attempt_id = locked.id
      UNION ALL
      SELECT sequence, event_type, payload FROM inserted
    ), bounds AS (
      SELECT COALESCE(MAX(sequence), 0)::bigint AS max_sequence FROM all_events
    ), watermark AS (
      SELECT CASE WHEN bounds.max_sequence = 0 THEN 0 ELSE COALESCE((
        SELECT missing - 1 FROM generate_series(1, bounds.max_sequence) AS missing
        WHERE NOT EXISTS (SELECT 1 FROM all_events e WHERE e.sequence = missing)
        ORDER BY missing LIMIT 1
      ), bounds.max_sequence) END::bigint AS accepted_through FROM bounds
    ), expected AS MATERIALIZED (
      SELECT cv.video_id, cv.sequence FROM combination_videos cv
      JOIN assignments a ON a.combination_id = cv.combination_id
        AND a.combination_version = cv.combination_version
      CROSS JOIN locked WHERE a.id = locked.assignment_id
    ), proof AS (
      SELECT
        (SELECT COUNT(*)::integer FROM expected) AS required,
        COALESCE((SELECT MIN(expected.sequence) FROM expected WHERE NOT EXISTS (
          SELECT 1 FROM all_events e WHERE e.event_type = 'video_ended'
            AND e.payload->>'videoId' = expected.video_id::text
            AND (e.payload->>'videoSequence')::integer = expected.sequence
        )), (SELECT COUNT(*)::integer FROM expected)) AS video_sequence,
        EXISTS (SELECT 1 FROM all_events e WHERE e.event_type = 'video_ended'
            AND NOT EXISTS (SELECT 1 FROM expected
              WHERE expected.video_id::text = e.payload->>'videoId'
                AND expected.sequence = (e.payload->>'videoSequence')::integer)) AS unexpected,
        EXISTS (SELECT 1 FROM expected earlier CROSS JOIN expected later
          JOIN all_events later_event ON later_event.event_type = 'video_ended'
            AND later_event.payload->>'videoId' = later.video_id::text
            AND (later_event.payload->>'videoSequence')::integer = later.sequence
          JOIN all_events earlier_event ON earlier_event.event_type = 'video_ended'
            AND earlier_event.payload->>'videoId' = earlier.video_id::text
            AND (earlier_event.payload->>'videoSequence')::integer = earlier.sequence
          WHERE earlier.sequence < later.sequence
            AND earlier_event.sequence >= later_event.sequence) AS out_of_order
    ), updated AS (
      UPDATE attempts t SET
        last_accepted_sequence = GREATEST(t.last_accepted_sequence, watermark.accepted_through),
        current_video_sequence = GREATEST(t.current_video_sequence, proof.video_sequence),
        status = CASE WHEN proof.required > 0 AND proof.video_sequence = proof.required
          AND NOT proof.unexpected AND NOT proof.out_of_order THEN 'post_study' ELSE t.status END
      FROM locked, watermark, proof WHERE t.id = locked.id RETURNING t.*
    ) SELECT updated.*, conflicts.count AS conflict_count FROM updated CROSS JOIN conflicts;`;
  if (!rows[0]) throw new StudyError(409, 'ATTEMPT_INVALID', 'The attempt is no longer accepting telemetry.');
  if (number(rows[0].conflict_count) > 0) {
    throw new StudyError(409, 'EVENT_CONFLICT', 'An event ID or sequence was reused with different content.');
  }
  return { acceptedThrough: number(rows[0].last_accepted_sequence), attempt: mapAttempt(rows[0]) };
}

export async function savePostStudy(context: AuthContext, attemptId: string, controlVersion: number, answers: Record<string, unknown>, timing: Record<string, unknown>, submitted: boolean) {
  if (context.demo) return demo.demoSavePostStudy(context.email, answers, submitted);
  const pid = await participantId(context);
  const sql = getDb();
  const rows = await sql`INSERT INTO form_responses (
      participant_id, form_kind, form_version, assignment_id, attempt_id, status, answers, timing, submitted_at
    ) SELECT ${pid}::uuid, 'post_study', sc.post_study_version, a.id, t.id,
      ${submitted ? 'submitted' : 'draft'}, ${JSON.stringify(answers)}::jsonb,
      ${JSON.stringify(timing)}::jsonb, ${submitted ? new Date().toISOString() : null}::timestamptz
      FROM study_config sc JOIN attempts t ON t.id = ${attemptId}::uuid
      JOIN assignments a ON a.id = t.assignment_id
      WHERE sc.id = 'default' AND a.participant_id = ${pid}::uuid
        AND t.control_version = ${controlVersion} AND t.status = 'post_study'
        AND t.lease_expires_at > clock_timestamp()
    ON CONFLICT (participant_id, form_kind, form_version, assignment_id) WHERE form_kind = 'post_study'
    DO UPDATE SET attempt_id = EXCLUDED.attempt_id, answers = EXCLUDED.answers, timing = EXCLUDED.timing,
      status = EXCLUDED.status, submitted_at = EXCLUDED.submitted_at, updated_at = NOW() RETURNING *;`;
  if (!rows[0]) throw new StudyError(409, 'POST_STUDY_LOCKED', 'Post-study is not available for this attempt.');
  return rows[0];
}

export async function invalidateAttempt(context: AuthContext, attemptId: string, controlVersion: number, reason: string) {
  if (context.demo) return demo.demoInvalidate(context.email, attemptId, controlVersion, reason);
  const pid = await participantId(context);
  const sql = getDb();
  const rows = await sql`SELECT invalidate_study_attempt(${pid}::uuid, ${attemptId}::uuid,
    ${controlVersion}, ${reason}) AS result;`;
  const result = jsonObject(rows[0]?.result);
  if (result.error) throw new StudyError(409, text(result.error), 'The attempt could not be invalidated.');
  return result;
}

export async function completeAttempt(context: AuthContext, attemptId: string, controlVersion: number, acknowledgedSequence: number) {
  if (context.demo) return demo.demoComplete(context.email, attemptId, controlVersion, acknowledgedSequence);
  const pid = await participantId(context);
  const sql = getDb();
  const rows = await sql`SELECT complete_study_attempt(${pid}::uuid, ${attemptId}::uuid,
    ${controlVersion}, ${acknowledgedSequence}) AS result;`;
  const result = jsonObject(rows[0]?.result);
  if (result.error) throw new StudyError(409, text(result.error), 'The study could not be completed.');
  return result;
}

export async function adminInvitations(context: AuthContext) {
  if (context.demo) return demo.demoAdminInvitations();
  const sql = getDb();
  return sql`SELECT * FROM invitations ORDER BY created_at DESC LIMIT 500;`;
}

export async function adminCreateInvitation(context: AuthContext, email: string) {
  if (context.demo) return demo.demoAdminCreateInvitation(email);
  const normalized = email.trim().toLowerCase();
  const sql = getDb();
  const rows = await sql`INSERT INTO invitations (email, normalized_email, invited_by, delivery_status)
    VALUES (${email.trim()}, ${normalized}, ${context.userId}, 'unconfigured')
    ON CONFLICT (normalized_email) DO UPDATE SET email = EXCLUDED.email,
      status = CASE WHEN invitations.status IN ('revoked','send_failed') THEN 'pending' ELSE invitations.status END,
      revoked_at = NULL RETURNING *;`;
  const row = rows[0];
  if (row?.delivery_status === 'sent' && row?.status !== 'send_failed') return row;
  let outcome: Row;
  let auditAction: string;
  try {
    const client = await clerkClient();
    const invitation = await client.invitations.createInvitation({
      emailAddress: normalized,
      ignoreExisting: true,
      notify: true,
      redirectUrl: process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/sign-in`
        : '/sign-in',
      publicMetadata: { role: 'student' },
    });
    const delivered = await sql`UPDATE invitations SET delivery_status = 'sent',
      delivery_reference = ${invitation.id}, status = 'pending'
      WHERE id = ${text(row.id)}::uuid RETURNING *;`;
    outcome = delivered[0];
    auditAction = 'invitation.sent';
  } catch {
    const failed = await sql`UPDATE invitations SET delivery_status = 'failed', status = 'send_failed'
      WHERE id = ${text(row.id)}::uuid RETURNING *;`;
    outcome = failed[0];
    auditAction = 'invitation.delivery_failed';
  }
  await recordAdminAudit(context, auditAction, 'invitation', text(row.id), {
    deliveryStatus: text(outcome.delivery_status),
  });
  return outcome;
}

export async function adminCombinations(context: AuthContext) {
  if (context.demo) return demo.demoAdminCombinations();
  const sql = getDb();
  const rows = await sql`SELECT id FROM combinations ORDER BY created_at;`;
  return Promise.all(rows.map((row) => dbCombination(text(row.id))));
}

export async function adminCreateCombination(context: AuthContext, input: { title: string; description?: string; targetQuota: number }) {
  if (context.demo) return demo.demoAdminCreateCombination(input);
  const sql = getDb();
  const rows = await sql`WITH combination AS (
      INSERT INTO combinations (title, description, target_quota, enabled) VALUES (${input.title}, ${input.description ?? ''}, ${input.targetQuota}, FALSE) RETURNING *
    ), version AS (
      INSERT INTO combination_versions (combination_id, version, package_id, manifest, total_duration_seconds)
      SELECT id, 1, 'placeholder-' || id::text, jsonb_build_object('schemaVersion', 1, 'videos', '[]'::jsonb), 0 FROM combination
    ) SELECT * FROM combination;`;
  await recordAdminAudit(context, 'combination.created', 'combination', text(rows[0].id), {
    targetQuota: input.targetQuota,
    enabled: false,
  });
  return dbCombination(text(rows[0].id));
}

export async function adminUpdateCombination(context: AuthContext, id: string, patch: { title?: string; description?: string; targetQuota?: number; enabled?: boolean }) {
  if (context.demo) return demo.demoAdminUpdateCombination(id, patch);
  const sql = getDb();
  const current = await dbCombination(id);
  if (!current) throw new StudyError(404, 'COMBINATION_NOT_FOUND', 'Combination not found.');
  if (patch.enabled === true && current.videos.length === 0) {
    throw new StudyError(409, 'COMBINATION_NOT_READY', 'Add a validated content version with at least one video before enabling this combination.');
  }
  const target = patch.targetQuota ?? current.targetQuota;
  const rows = await sql`UPDATE combinations SET title = ${patch.title ?? current.title},
      description = ${patch.description ?? current.description}, target_quota = ${target},
      enabled = ${patch.enabled ?? current.enabled}, updated_at = NOW()
    WHERE id = ${id}::uuid AND ${target} >= (
      SELECT COUNT(*) FROM assignments WHERE combination_id = ${id}::uuid
        AND (status = 'completed' OR (status IN ('reserved','retry_required') AND reservation_expires_at > clock_timestamp())
          OR status = 'active')
    ) RETURNING id;`;
  if (!rows[0]) throw new StudyError(409, 'QUOTA_BELOW_CURRENT_USAGE', 'Quota cannot be lower than completed and held slots.');
  await recordAdminAudit(context, 'combination.updated', 'combination', id, {
    changedFields: Object.keys(patch).sort(),
  });
  return dbCombination(id);
}

export async function adminParticipants(context: AuthContext) {
  if (context.demo) return demo.demoAdminParticipants();
  const sql = getDb();
  return sql`SELECT p.id, u.email,
      EXISTS (SELECT 1 FROM consents c WHERE c.participant_id = p.id AND c.accepted) AS consented,
      EXISTS (SELECT 1 FROM form_responses f WHERE f.participant_id = p.id AND f.form_kind = 'pre_study' AND f.status = 'submitted') AS pre_study_submitted,
      a.id AS assignment_id, a.status, a.combination_id, a.reservation_expires_at,
      c.title AS combination_title, t.status AS attempt_status, t.source_mode,
      COALESCE(t.completed_at, t.invalidated_at, t.started_at, a.completed_at, a.assigned_at, p.created_at) AS updated_at
    FROM participants p JOIN app_users u ON u.id = p.user_id
    LEFT JOIN LATERAL (SELECT * FROM assignments WHERE participant_id = p.id ORDER BY assigned_at DESC LIMIT 1) a ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM attempts WHERE assignment_id = a.id ORDER BY attempt_number DESC LIMIT 1) t ON TRUE
    LEFT JOIN combinations c ON c.id = a.combination_id
    ORDER BY p.created_at DESC LIMIT 1000;`;
}

export async function adminOverview(context: AuthContext) {
  const [invitationRows, participantRows, combinationRows] = await Promise.all([
    adminInvitations(context),
    adminParticipants(context),
    adminCombinations(context),
  ]);
  const invitations = (invitationRows as Row[]).map((row) => ({
    id: text(row.id),
    email: text(row.email),
    status: text(row.status),
    deliveryStatus: text(row.delivery_status ?? row.deliveryStatus),
    createdAt: iso(row.created_at ?? row.createdAt),
    acceptedAt: row.accepted_at || row.acceptedAt ? iso(row.accepted_at ?? row.acceptedAt) : null,
  }));
  const combinations = (combinationRows as Combination[]).map((combination) => ({
    id: combination.id,
    title: combination.title,
    targetQuota: combination.targetQuota,
    completedCount: combination.completedCount,
    heldCount: combination.heldCount,
    enabled: combination.enabled,
    version: combination.version,
    videoCount: combination.videos.length,
  }));
  const combinationTitles = new Map(combinations.map((combination) => [combination.id, combination.title]));
  const participants = (participantRows as Row[]).map((row) => {
    const assignment = jsonObject(row.assignment);
    const combinationId = text(row.combination_id ?? assignment.combinationId);
    const attemptStatus = text(row.attempt_status);
    const assignmentStatus = text(row.status);
    const currentStatus = ['watching', 'post_study', 'completing', 'completed'].includes(attemptStatus)
      ? attemptStatus
      : assignmentStatus || attemptStatus || 'invited';
    return {
      id: text(row.id),
      email: text(row.email),
      combination: text(row.combination_title) || combinationTitles.get(combinationId) || '—',
      status: currentStatus,
      sourceMode: text(row.source_mode ?? row.sourceMode) || null,
      updatedAt: iso(row.updated_at ?? row.updatedAt) || new Date().toISOString(),
    };
  });
  const statuses = (name: string) => participants.filter((participant) => participant.status === name).length;
  return {
    mode: context.demo ? 'demo' : 'configured',
    metrics: {
      invited: invitations.length,
      reserved: statuses('reserved') + statuses('retry_required'),
      active: statuses('watching') + statuses('active'),
      postStudy: statuses('post_study'),
      completed: statuses('completed'),
      available: combinations.reduce((sum, combination) => (
        sum + Math.max(0, combination.targetQuota - combination.completedCount - combination.heldCount)
      ), 0),
    },
    invitations,
    participants,
    combinations,
  };
}

export async function adminParticipant(context: AuthContext, id: string) {
  if (context.demo) return demo.demoAdminParticipant(id);
  const sql = getDb();
  const rows = await sql`SELECT p.*, u.email FROM participants p JOIN app_users u ON u.id = p.user_id WHERE p.id = ${id}::uuid;`;
  if (!rows[0]) throw new StudyError(404, 'PARTICIPANT_NOT_FOUND', 'Participant not found.');
  const [forms, assignments, attempts, telemetry] = await Promise.all([
    sql`SELECT * FROM form_responses WHERE participant_id = ${id}::uuid ORDER BY created_at;`,
    sql`SELECT * FROM assignments WHERE participant_id = ${id}::uuid ORDER BY assigned_at;`,
    sql`SELECT t.* FROM attempts t JOIN assignments a ON a.id = t.assignment_id
      WHERE a.participant_id = ${id}::uuid ORDER BY t.started_at;`,
    sql`SELECT e.* FROM telemetry_events e JOIN attempts t ON t.id = e.attempt_id
      JOIN assignments a ON a.id = t.assignment_id WHERE a.participant_id = ${id}::uuid ORDER BY e.received_at;`,
  ]);
  return { participant: rows[0], forms, assignments, attempts, telemetry };
}

export async function adminExport(context: AuthContext) {
  if (context.demo) return demo.demoAdminExport();
  const sql = getDb();
  const rows = await sql`SELECT
      clock_timestamp() AS exported_at,
      (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]'::jsonb)
        FROM (SELECT p.id, p.created_at FROM participants p) r) AS participants,
      (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.assigned_at), '[]'::jsonb)
        FROM (SELECT * FROM assignments) r) AS assignments,
      (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.started_at), '[]'::jsonb)
        FROM (SELECT * FROM attempts) r) AS attempts,
      (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at), '[]'::jsonb)
        FROM (SELECT * FROM form_responses) r) AS forms,
      (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.attempt_id, r.sequence), '[]'::jsonb)
        FROM (SELECT * FROM telemetry_events) r) AS telemetry,
      (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]'::jsonb)
        FROM (SELECT * FROM combinations) r) AS combinations,
      (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.combination_id, r.version), '[]'::jsonb)
        FROM (SELECT * FROM combination_versions) r) AS combination_versions,
      (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.combination_id, r.combination_version, r.sequence), '[]'::jsonb)
        FROM (SELECT * FROM combination_videos) r) AS combination_videos;`;
  const snapshot = rows[0] ?? {};
  const exportedAt = iso(snapshot.exported_at);
  await recordAdminAudit(context, 'study_data.exported', 'study', 'default', {
    schemaVersion: 'student-study-export-v1',
    exportedAt,
    identityMappingIncluded: false,
  });
  return {
    metadata: [{
      schemaVersion: 'student-study-export-v1',
      exportedAt,
      timeZone: 'UTC',
      identityMappingIncluded: false,
      invalidAttemptTelemetry: 'purged',
    }],
    participants: Array.isArray(snapshot.participants) ? snapshot.participants : [],
    assignments: Array.isArray(snapshot.assignments) ? snapshot.assignments : [],
    attempts: Array.isArray(snapshot.attempts) ? snapshot.attempts : [],
    forms: Array.isArray(snapshot.forms) ? snapshot.forms : [],
    telemetry: Array.isArray(snapshot.telemetry) ? snapshot.telemetry : [],
    combinations: Array.isArray(snapshot.combinations) ? snapshot.combinations : [],
    combinationVersions: Array.isArray(snapshot.combination_versions) ? snapshot.combination_versions : [],
    combinationVideos: Array.isArray(snapshot.combination_videos) ? snapshot.combination_videos : [],
  };
}

export async function cleanup(context: AuthContext) {
  if (context.demo) return demo.demoCleanup();
  const sql = getDb();
  const expired = await sql`SELECT t.id, t.control_version, a.participant_id
    FROM attempts t JOIN assignments a ON a.id = t.assignment_id
    WHERE t.status IN ('watching','post_study','completing') AND t.lease_expires_at <= clock_timestamp()
    ORDER BY t.lease_expires_at LIMIT 100;`;
  let invalidated = 0;
  for (const attempt of expired) {
    const result = await sql`SELECT invalidate_study_attempt(${text(attempt.participant_id)}::uuid,
      ${text(attempt.id)}::uuid, ${number(attempt.control_version)}, 'connection_timeout') AS result;`;
    if (!jsonObject(result[0]?.result).error) invalidated += 1;
  }
  const released = await sql`UPDATE assignments SET status = 'released', released_at = clock_timestamp(),
      release_reason = 'reservation_expired', state_version = state_version + 1
    WHERE id IN (SELECT id FROM assignments WHERE status IN ('reserved','retry_required')
      AND reservation_expires_at <= clock_timestamp() ORDER BY reservation_expires_at LIMIT 100) RETURNING id;`;
  return { invalidated, released: released.length };
}
