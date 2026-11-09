import 'server-only';

export interface StudyConfig {
  reservationDurationSeconds: number;
  heartbeatIntervalSeconds: number;
  connectionTimeoutSeconds: number;
  telemetryFlushSeconds: number;
  playbackSampleSeconds: number;
  maxBufferingSeconds: number;
  assignmentMode: 'development-stub' | 'configured';
  demoMode: boolean;
}

function positiveInteger(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

export function getStudyConfig(): StudyConfig {
  const heartbeatIntervalSeconds = positiveInteger('STUDY_HEARTBEAT_INTERVAL_SECONDS', 5);
  const connectionTimeoutSeconds = positiveInteger('STUDY_CONNECTION_TIMEOUT_SECONDS', 20);
  if (connectionTimeoutSeconds <= heartbeatIntervalSeconds) {
    throw new Error('STUDY_CONNECTION_TIMEOUT_SECONDS must be greater than the heartbeat interval.');
  }

  const assignmentMode = process.env.STUDY_ASSIGNMENT_MODE === 'configured'
    ? 'configured'
    : 'development-stub';
  const demoMode = process.env.NODE_ENV !== 'production'
    && process.env.STUDENTWEB_DEMO_MODE !== 'false';

  if (process.env.NODE_ENV === 'production' && assignmentMode === 'development-stub') {
    throw new Error('Production requires STUDY_ASSIGNMENT_MODE=configured.');
  }

  return {
    reservationDurationSeconds: positiveInteger('STUDY_RESERVATION_DURATION_SECONDS', 1800),
    heartbeatIntervalSeconds,
    connectionTimeoutSeconds,
    telemetryFlushSeconds: positiveInteger('STUDY_TELEMETRY_FLUSH_SECONDS', 5),
    playbackSampleSeconds: positiveInteger('STUDY_PLAYBACK_SAMPLE_SECONDS', 1),
    maxBufferingSeconds: positiveInteger('STUDY_MAX_BUFFERING_SECONDS', 5),
    assignmentMode,
    demoMode,
  };
}

export function isClerkConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}
