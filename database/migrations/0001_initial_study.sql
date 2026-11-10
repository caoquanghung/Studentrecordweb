CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE app_users (
    id VARCHAR(128) PRIMARY KEY,
    email TEXT NOT NULL,
    normalized_email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    normalized_email TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'send_failed')),
    delivery_status TEXT NOT NULL DEFAULT 'unconfigured',
    delivery_reference TEXT,
    invited_by VARCHAR(128) REFERENCES app_users(id),
    accepted_by VARCHAR(128) REFERENCES app_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(128) NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
    invitation_id UUID NOT NULL UNIQUE REFERENCES invitations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE study_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    reservation_duration_seconds INTEGER NOT NULL DEFAULT 1800 CHECK (reservation_duration_seconds > 0),
    heartbeat_interval_seconds INTEGER NOT NULL DEFAULT 5 CHECK (heartbeat_interval_seconds > 0),
    connection_timeout_seconds INTEGER NOT NULL DEFAULT 20 CHECK (connection_timeout_seconds > heartbeat_interval_seconds),
    consent_version TEXT NOT NULL DEFAULT 'consent-v1',
    pre_study_version TEXT NOT NULL DEFAULT 'pre-v1',
    post_study_version TEXT NOT NULL DEFAULT 'post-v1',
    assignment_mode TEXT NOT NULL DEFAULT 'development-stub' CHECK (assignment_mode IN ('development-stub', 'configured')),
    config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO study_config (id) VALUES ('default');

CREATE TABLE consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    confirmation_method TEXT NOT NULL,
    typed_name TEXT,
    accepted BOOLEAN NOT NULL,
    timing JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(timing) = 'object'),
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (participant_id, version)
);

CREATE TABLE combinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    target_quota INTEGER NOT NULL CHECK (target_quota >= 0),
    current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE combination_versions (
    combination_id UUID NOT NULL REFERENCES combinations(id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK (version > 0),
    package_id TEXT NOT NULL,
    manifest JSONB NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
    manifest_sha256 TEXT,
    total_duration_seconds NUMERIC NOT NULL DEFAULT 0 CHECK (total_duration_seconds >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (combination_id, version)
);

CREATE TABLE combination_videos (
    combination_id UUID NOT NULL,
    combination_version INTEGER NOT NULL,
    video_id UUID NOT NULL DEFAULT gen_random_uuid(),
    sequence INTEGER NOT NULL CHECK (sequence >= 0),
    title TEXT NOT NULL,
    storage_url TEXT NOT NULL,
    blob_pathname TEXT,
    mime_type TEXT NOT NULL,
    duration_seconds NUMERIC NOT NULL CHECK (duration_seconds > 0),
    size_bytes BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),
    integrity JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(integrity) = 'object'),
    PRIMARY KEY (combination_id, combination_version, sequence),
    UNIQUE (combination_id, combination_version, video_id),
    FOREIGN KEY (combination_id, combination_version)
      REFERENCES combination_versions(combination_id, version) ON DELETE CASCADE
);

CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    combination_id UUID NOT NULL,
    combination_version INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'reserved'
      CHECK (status IN ('reserved', 'active', 'retry_required', 'released', 'completed')),
    selector_version TEXT NOT NULL,
    selector_metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(selector_metadata) = 'object'),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reservation_expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    release_reason TEXT,
    state_version BIGINT NOT NULL DEFAULT 1,
    FOREIGN KEY (combination_id, combination_version)
      REFERENCES combination_versions(combination_id, version),
    UNIQUE (id, participant_id)
);

CREATE UNIQUE INDEX assignments_one_current_per_participant
  ON assignments(participant_id) WHERE status IN ('reserved', 'active', 'retry_required');
CREATE INDEX assignments_capacity_idx
  ON assignments(combination_id, status, reservation_expires_at);
CREATE INDEX assignments_participant_idx ON assignments(participant_id, assigned_at DESC);

CREATE TABLE readiness_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    source_mode TEXT NOT NULL CHECK (source_mode IN ('stream', 'zip')),
    combination_version INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('passed', 'failed')),
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metrics) = 'object'),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX readiness_assignment_idx ON readiness_results(assignment_id, created_at DESC);

CREATE TABLE attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
    control_version BIGINT NOT NULL CHECK (control_version > 0),
    status TEXT NOT NULL DEFAULT 'watching'
      CHECK (status IN ('watching', 'post_study', 'completing', 'invalid', 'completed')),
    source_mode TEXT NOT NULL CHECK (source_mode IN ('stream', 'zip')),
    current_video_sequence INTEGER NOT NULL DEFAULT 0 CHECK (current_video_sequence >= 0),
    last_accepted_sequence BIGINT NOT NULL DEFAULT 0 CHECK (last_accepted_sequence >= 0),
    lease_expires_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invalidated_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    invalidation_reason TEXT,
    purge_status TEXT NOT NULL DEFAULT 'none' CHECK (purge_status IN ('none', 'pending', 'completed')),
    policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(policy_snapshot) = 'object'),
    UNIQUE (assignment_id, attempt_number),
    UNIQUE (id, assignment_id)
);

CREATE UNIQUE INDEX attempts_one_active_per_assignment
  ON attempts(assignment_id) WHERE status IN ('watching', 'post_study', 'completing');
CREATE INDEX attempts_cleanup_idx ON attempts(status, lease_expires_at);

CREATE TABLE form_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    form_kind TEXT NOT NULL CHECK (form_kind IN ('pre_study', 'post_study')),
    form_version TEXT NOT NULL,
    assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL,
    attempt_id UUID REFERENCES attempts(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
    answers JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object'),
    timing JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(timing) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    FOREIGN KEY (assignment_id, participant_id)
      REFERENCES assignments(id, participant_id),
    FOREIGN KEY (attempt_id, assignment_id)
      REFERENCES attempts(id, assignment_id)
);

CREATE UNIQUE INDEX form_responses_pre_unique
  ON form_responses(participant_id, form_kind, form_version)
  WHERE form_kind = 'pre_study';
CREATE UNIQUE INDEX form_responses_post_unique
  ON form_responses(participant_id, form_kind, form_version, assignment_id)
  WHERE form_kind = 'post_study';
CREATE INDEX form_responses_participant_idx ON form_responses(participant_id, form_kind, status);

CREATE TABLE telemetry_events (
    id UUID PRIMARY KEY,
    attempt_id UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    sequence BIGINT NOT NULL CHECK (sequence > 0),
    event_type TEXT NOT NULL,
    client_wall_time TIMESTAMPTZ NOT NULL,
    client_monotonic_ms NUMERIC NOT NULL CHECK (client_monotonic_ms >= 0),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (attempt_id, sequence)
);

CREATE INDEX telemetry_attempt_sequence_idx ON telemetry_events(attempt_id, sequence);

CREATE TABLE idempotency_keys (
    actor_id VARCHAR(128) NOT NULL,
    operation TEXT NOT NULL,
    key TEXT NOT NULL,
    request_digest TEXT NOT NULL,
    response JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (actor_id, operation, key)
);

CREATE TABLE admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id VARCHAR(128) NOT NULL REFERENCES app_users(id),
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION reserve_study_assignment(
    p_participant_id UUID,
    p_combination_id UUID,
    p_combination_version INTEGER,
    p_selector_version TEXT,
    p_selector_metadata JSONB,
    p_duration_seconds INTEGER
) RETURNS JSONB LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_now TIMESTAMPTZ;
    v_existing assignments%ROWTYPE;
    v_combination combinations%ROWTYPE;
    v_completed INTEGER;
    v_held INTEGER;
    v_created assignments%ROWTYPE;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_participant_id::text, 0));
    SELECT * INTO v_existing FROM assignments
      WHERE participant_id = p_participant_id
        AND status IN ('reserved', 'active', 'retry_required', 'completed')
      ORDER BY assigned_at DESC LIMIT 1;

    IF v_existing.status = 'completed' THEN
      RETURN jsonb_build_object('assignment', to_jsonb(v_existing), 'existing', TRUE);
    END IF;

    v_now := clock_timestamp();
    IF v_existing.status = 'active' THEN
      IF EXISTS (SELECT 1 FROM attempts t WHERE t.assignment_id = v_existing.id
        AND t.status IN ('watching', 'post_study', 'completing')
        AND t.lease_expires_at > v_now) THEN
        RETURN jsonb_build_object('assignment', to_jsonb(v_existing), 'existing', TRUE);
      END IF;
      DELETE FROM telemetry_events WHERE attempt_id IN (
        SELECT id FROM attempts WHERE assignment_id = v_existing.id
          AND status IN ('watching', 'post_study', 'completing')
      );
      UPDATE attempts SET status = 'invalid', invalidated_at = v_now,
        invalidation_reason = 'connection_timeout', purge_status = 'completed',
        current_video_sequence = 0, last_accepted_sequence = 0
        WHERE assignment_id = v_existing.id
          AND status IN ('watching', 'post_study', 'completing');
      UPDATE assignments SET status = CASE WHEN reservation_expires_at > v_now
          THEN 'retry_required' ELSE 'released' END,
        released_at = CASE WHEN reservation_expires_at <= v_now THEN v_now ELSE released_at END,
        release_reason = CASE WHEN reservation_expires_at <= v_now
          THEN 'attempt_invalid_after_deadline' ELSE release_reason END,
        state_version = state_version + 1
        WHERE id = v_existing.id RETURNING * INTO v_existing;
    END IF;

    SELECT * INTO v_combination FROM combinations WHERE id = p_combination_id FOR UPDATE;
    IF NOT FOUND OR NOT v_combination.enabled OR v_combination.current_version <> p_combination_version THEN
      RETURN jsonb_build_object('error', 'COMBINATION_UNAVAILABLE');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM combination_videos
      WHERE combination_id = p_combination_id AND combination_version = p_combination_version
    ) THEN
      RETURN jsonb_build_object('error', 'COMBINATION_NOT_READY');
    END IF;

    IF v_existing.id IS NOT NULL THEN
      IF v_existing.status = 'active'
         OR v_existing.reservation_expires_at > v_now THEN
        RETURN jsonb_build_object('assignment', to_jsonb(v_existing), 'existing', TRUE);
      END IF;
      UPDATE assignments SET status = 'released', released_at = v_now,
        release_reason = 'reservation_expired', state_version = state_version + 1
        WHERE id = v_existing.id;
    END IF;

    SELECT COUNT(*)::INTEGER INTO v_completed FROM assignments
      WHERE combination_id = p_combination_id AND status = 'completed';
    SELECT COUNT(*)::INTEGER INTO v_held FROM assignments a
      WHERE a.combination_id = p_combination_id
        AND (
          (a.status IN ('reserved', 'retry_required') AND a.reservation_expires_at > v_now)
          OR (a.status = 'active' AND (
            a.reservation_expires_at > v_now OR EXISTS (
              SELECT 1 FROM attempts t WHERE t.assignment_id = a.id
                AND t.status IN ('watching', 'post_study', 'completing')
                AND t.lease_expires_at > v_now
            )
          ))
        );
    IF v_completed + v_held >= v_combination.target_quota THEN
      RETURN jsonb_build_object('error', 'NO_CAPACITY');
    END IF;

    INSERT INTO assignments (
      participant_id, combination_id, combination_version, selector_version,
      selector_metadata, assigned_at, reservation_expires_at
    ) VALUES (
      p_participant_id, p_combination_id, p_combination_version, p_selector_version,
      COALESCE(p_selector_metadata, '{}'::jsonb), v_now,
      v_now + make_interval(secs => p_duration_seconds)
    ) RETURNING * INTO v_created;
    RETURN jsonb_build_object('assignment', to_jsonb(v_created), 'existing', FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION start_study_attempt(
    p_participant_id UUID,
    p_assignment_id UUID,
    p_source_mode TEXT,
    p_timeout_seconds INTEGER,
    p_policy_snapshot JSONB
) RETURNS JSONB LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_assignment assignments%ROWTYPE;
    v_attempt attempts%ROWTYPE;
    v_now TIMESTAMPTZ;
    v_number INTEGER;
    v_consent_version TEXT;
    v_pre_version TEXT;
BEGIN
    SELECT a.* INTO v_assignment FROM assignments a
      JOIN combinations c ON c.id = a.combination_id
      WHERE a.id = p_assignment_id AND a.participant_id = p_participant_id
      FOR UPDATE OF c, a;
    v_now := clock_timestamp();
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'ASSIGNMENT_NOT_FOUND'); END IF;
    IF v_assignment.status = 'completed' THEN RETURN jsonb_build_object('error', 'ALREADY_COMPLETED'); END IF;
    SELECT * INTO v_attempt FROM attempts WHERE assignment_id = p_assignment_id
      AND status IN ('watching', 'post_study', 'completing')
      AND lease_expires_at > v_now LIMIT 1;
    IF v_attempt.id IS NOT NULL THEN
      RETURN jsonb_build_object('attempt', to_jsonb(v_attempt), 'existing', TRUE);
    END IF;
    DELETE FROM telemetry_events WHERE attempt_id IN (
      SELECT id FROM attempts WHERE assignment_id = p_assignment_id
        AND status IN ('watching', 'post_study', 'completing')
        AND lease_expires_at <= v_now
    );
    UPDATE attempts SET status = 'invalid', invalidated_at = v_now,
      invalidation_reason = 'connection_timeout', purge_status = 'completed',
      current_video_sequence = 0, last_accepted_sequence = 0
      WHERE assignment_id = p_assignment_id
        AND status IN ('watching', 'post_study', 'completing')
        AND lease_expires_at <= v_now;
    IF v_assignment.status = 'released' OR v_assignment.reservation_expires_at <= v_now THEN
      UPDATE assignments SET status = 'released', released_at = v_now,
        release_reason = 'reservation_expired', state_version = state_version + 1
        WHERE id = v_assignment.id AND status <> 'released';
      RETURN jsonb_build_object('error', 'RESERVATION_EXPIRED');
    END IF;
    SELECT consent_version, pre_study_version INTO v_consent_version, v_pre_version FROM study_config WHERE id = 'default';
    IF NOT EXISTS (SELECT 1 FROM consents WHERE participant_id = p_participant_id AND version = v_consent_version AND accepted) THEN
      RETURN jsonb_build_object('error', 'CONSENT_REQUIRED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM form_responses WHERE participant_id = p_participant_id
      AND form_kind = 'pre_study' AND form_version = v_pre_version AND status = 'submitted') THEN
      RETURN jsonb_build_object('error', 'PRE_STUDY_REQUIRED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM readiness_results WHERE assignment_id = p_assignment_id
      AND source_mode = p_source_mode AND combination_version = v_assignment.combination_version
      AND status = 'passed' AND expires_at > v_now) THEN
      RETURN jsonb_build_object('error', 'READINESS_REQUIRED');
    END IF;
    SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_number FROM attempts WHERE assignment_id = p_assignment_id;
    INSERT INTO attempts (
      assignment_id, attempt_number, control_version, source_mode, lease_expires_at, started_at, policy_snapshot
    ) VALUES (
      p_assignment_id, v_number, v_number, p_source_mode,
      v_now + make_interval(secs => p_timeout_seconds), v_now, COALESCE(p_policy_snapshot, '{}'::jsonb)
    ) RETURNING * INTO v_attempt;
    UPDATE assignments SET status = 'active', state_version = state_version + 1 WHERE id = p_assignment_id;
    RETURN jsonb_build_object('attempt', to_jsonb(v_attempt), 'existing', FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION invalidate_study_attempt(
    p_participant_id UUID,
    p_attempt_id UUID,
    p_control_version BIGINT,
    p_reason TEXT
) RETURNS JSONB LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_assignment assignments%ROWTYPE;
    v_attempt attempts%ROWTYPE;
    v_now TIMESTAMPTZ;
    v_next_status TEXT;
BEGIN
    SELECT a.* INTO v_assignment FROM assignments a
      JOIN attempts t ON t.assignment_id = a.id
      JOIN combinations c ON c.id = a.combination_id
      WHERE t.id = p_attempt_id AND a.participant_id = p_participant_id
      FOR UPDATE OF c, a, t;
    v_now := clock_timestamp();
    IF v_assignment.id IS NULL THEN RETURN jsonb_build_object('error', 'ATTEMPT_NOT_FOUND'); END IF;
    SELECT * INTO v_attempt FROM attempts WHERE id = p_attempt_id;
    IF v_attempt.id IS NULL THEN RETURN jsonb_build_object('error', 'ATTEMPT_NOT_FOUND'); END IF;
    IF v_attempt.status = 'completed' THEN RETURN jsonb_build_object('error', 'ALREADY_COMPLETED'); END IF;
    IF v_attempt.status = 'invalid' THEN
      RETURN jsonb_build_object('attempt', to_jsonb(v_attempt), 'retryEligible', v_assignment.status = 'retry_required');
    END IF;
    IF v_attempt.control_version <> p_control_version THEN RETURN jsonb_build_object('error', 'STALE_CONTROL'); END IF;
    DELETE FROM telemetry_events WHERE attempt_id = p_attempt_id;
    UPDATE attempts SET status = 'invalid', invalidated_at = v_now,
      invalidation_reason = LEFT(COALESCE(p_reason, 'interrupted'), 80), purge_status = 'completed',
      current_video_sequence = 0, last_accepted_sequence = 0
      WHERE id = p_attempt_id RETURNING * INTO v_attempt;
    v_next_status := CASE WHEN v_assignment.reservation_expires_at > v_now THEN 'retry_required' ELSE 'released' END;
    UPDATE assignments SET status = v_next_status,
      released_at = CASE WHEN v_next_status = 'released' THEN v_now ELSE released_at END,
      release_reason = CASE WHEN v_next_status = 'released' THEN 'attempt_invalid_after_deadline' ELSE release_reason END,
      state_version = state_version + 1 WHERE id = v_assignment.id;
    RETURN jsonb_build_object('attempt', to_jsonb(v_attempt), 'retryEligible', v_next_status = 'retry_required',
      'reservationExpiresAt', v_assignment.reservation_expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION complete_study_attempt(
    p_participant_id UUID,
    p_attempt_id UUID,
    p_control_version BIGINT,
    p_acknowledged_sequence BIGINT
) RETURNS JSONB LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_assignment assignments%ROWTYPE;
    v_attempt attempts%ROWTYPE;
    v_now TIMESTAMPTZ;
    v_required INTEGER;
    v_ended INTEGER;
    v_post_version TEXT;
    v_total_duration NUMERIC;
    v_client_elapsed_ms NUMERIC;
    v_minimum_playback_ratio NUMERIC;
BEGIN
    SELECT a.* INTO v_assignment FROM assignments a
      JOIN attempts t ON t.assignment_id = a.id
      JOIN combinations c ON c.id = a.combination_id
      WHERE t.id = p_attempt_id AND a.participant_id = p_participant_id
      FOR UPDATE OF c, a, t;
    v_now := clock_timestamp();
    IF v_assignment.id IS NULL THEN RETURN jsonb_build_object('error', 'ATTEMPT_NOT_FOUND'); END IF;
    SELECT * INTO v_attempt FROM attempts WHERE id = p_attempt_id;
    IF v_attempt.status = 'completed' THEN
      RETURN jsonb_build_object('attempt', to_jsonb(v_attempt), 'assignment', to_jsonb(v_assignment), 'existing', TRUE);
    END IF;
    IF v_attempt.id IS NULL OR v_attempt.status NOT IN ('post_study', 'completing')
       OR v_attempt.control_version <> p_control_version OR v_attempt.lease_expires_at <= v_now THEN
      RETURN jsonb_build_object('error', 'ATTEMPT_INVALID');
    END IF;
    v_minimum_playback_ratio := COALESCE(
      NULLIF(v_attempt.policy_snapshot->>'minimumPlaybackRatio', '')::numeric,
      0.9
    );
    SELECT COUNT(*)::INTEGER INTO v_required FROM combination_videos
      WHERE combination_id = v_assignment.combination_id AND combination_version = v_assignment.combination_version;
    SELECT COUNT(DISTINCT (payload->>'videoId'))::INTEGER INTO v_ended FROM telemetry_events e
      WHERE e.attempt_id = p_attempt_id AND e.event_type = 'video_ended'
        AND EXISTS (SELECT 1 FROM combination_videos cv
          WHERE cv.combination_id = v_assignment.combination_id
            AND cv.combination_version = v_assignment.combination_version
            AND cv.video_id::text = e.payload->>'videoId'
            AND cv.sequence = (e.payload->>'videoSequence')::integer);
    SELECT total_duration_seconds INTO v_total_duration FROM combination_versions
      WHERE combination_id = v_assignment.combination_id AND version = v_assignment.combination_version;
    SELECT COALESCE(MAX(client_monotonic_ms), 0) INTO v_client_elapsed_ms FROM telemetry_events
      WHERE attempt_id = p_attempt_id AND event_type = 'video_ended';
    IF v_required = 0 OR v_ended <> v_required
       OR v_minimum_playback_ratio <= 0 OR v_minimum_playback_ratio > 1
       OR v_client_elapsed_ms < v_total_duration * 1000 * v_minimum_playback_ratio
       OR EXTRACT(EPOCH FROM (v_now - v_attempt.started_at)) < v_total_duration * v_minimum_playback_ratio
       OR EXISTS (
         SELECT 1 FROM combination_videos cv
         WHERE cv.combination_id = v_assignment.combination_id
           AND cv.combination_version = v_assignment.combination_version
           AND NOT EXISTS (SELECT 1 FROM telemetry_events e
             WHERE e.attempt_id = p_attempt_id AND e.event_type = 'video_ended'
               AND e.payload->>'videoId' = cv.video_id::text
               AND (e.payload->>'videoSequence')::integer = cv.sequence)
       ) OR EXISTS (
         SELECT 1 FROM telemetry_events e
         WHERE e.attempt_id = p_attempt_id AND e.event_type = 'video_ended'
           AND NOT EXISTS (SELECT 1 FROM combination_videos cv
             WHERE cv.combination_id = v_assignment.combination_id
               AND cv.combination_version = v_assignment.combination_version
               AND cv.video_id::text = e.payload->>'videoId'
               AND cv.sequence = (e.payload->>'videoSequence')::integer)
       ) OR EXISTS (
         SELECT 1 FROM telemetry_events earlier JOIN telemetry_events later
           ON earlier.attempt_id = later.attempt_id
          AND earlier.event_type = 'video_ended' AND later.event_type = 'video_ended'
          AND (earlier.payload->>'videoSequence')::integer < (later.payload->>'videoSequence')::integer
          AND earlier.sequence >= later.sequence
         WHERE earlier.attempt_id = p_attempt_id
       ) THEN RETURN jsonb_build_object('error', 'VIEWING_INCOMPLETE'); END IF;
    SELECT post_study_version INTO v_post_version FROM study_config WHERE id = 'default';
    IF NOT EXISTS (SELECT 1 FROM form_responses WHERE participant_id = p_participant_id
      AND form_kind = 'post_study' AND form_version = v_post_version
      AND assignment_id = v_assignment.id AND attempt_id = p_attempt_id AND status = 'submitted') THEN
      RETURN jsonb_build_object('error', 'POST_STUDY_REQUIRED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM telemetry_events WHERE attempt_id = p_attempt_id
        AND event_type = 'post_study_submitted')
      OR p_acknowledged_sequence <= 0
      OR p_acknowledged_sequence <> v_attempt.last_accepted_sequence
      OR v_attempt.last_accepted_sequence <> (SELECT COALESCE(MAX(sequence), 0)
        FROM telemetry_events WHERE attempt_id = p_attempt_id) THEN
      RETURN jsonb_build_object('error', 'SYNC_PENDING');
    END IF;
    UPDATE attempts SET status = 'completed', completed_at = v_now WHERE id = p_attempt_id RETURNING * INTO v_attempt;
    UPDATE assignments SET status = 'completed', completed_at = v_now,
      state_version = state_version + 1 WHERE id = v_assignment.id RETURNING * INTO v_assignment;
    RETURN jsonb_build_object('attempt', to_jsonb(v_attempt), 'assignment', to_jsonb(v_assignment), 'existing', FALSE);
END;
$$;
