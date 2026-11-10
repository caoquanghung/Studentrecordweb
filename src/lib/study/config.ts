import 'server-only';

export interface StudyConfig {
  reservationDurationSeconds: number;
  heartbeatIntervalSeconds: number;
  connectionTimeoutSeconds: number;
  telemetryFlushSeconds: number;
  playbackSampleSeconds: number;
  maxBufferingSeconds: number;
  readinessTtlSeconds: number;
  readinessSampleBytes: number;
  readinessTimeoutSeconds: number;
  streamBitrateMargin: number;
  minimumStreamMbps: number;
  minimumPlaybackRatio: number;
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

function positiveNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number.`);
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

  const minimumPlaybackRatio = positiveNumber('STUDY_MIN_PLAYBACK_RATIO', 0.9);
  if (minimumPlaybackRatio > 1) throw new Error('STUDY_MIN_PLAYBACK_RATIO must be at most 1.');

  return {
    reservationDurationSeconds: positiveInteger('STUDY_RESERVATION_DURATION_SECONDS', 1800),
    heartbeatIntervalSeconds,
    connectionTimeoutSeconds,
    telemetryFlushSeconds: positiveInteger('STUDY_TELEMETRY_FLUSH_SECONDS', 5),
    playbackSampleSeconds: positiveInteger('STUDY_PLAYBACK_SAMPLE_SECONDS', 1),
    maxBufferingSeconds: positiveInteger('STUDY_MAX_BUFFERING_SECONDS', 5),
    readinessTtlSeconds: positiveInteger('STUDY_READINESS_TTL_SECONDS', 120),
    readinessSampleBytes: positiveInteger('STUDY_READINESS_SAMPLE_BYTES', 1_048_576),
    readinessTimeoutSeconds: positiveInteger('STUDY_READINESS_TIMEOUT_SECONDS', 15),
    streamBitrateMargin: positiveNumber('STUDY_STREAM_BITRATE_MARGIN', 1.5),
    minimumStreamMbps: positiveNumber('STUDY_MIN_STREAM_MBPS', 2),
    minimumPlaybackRatio,
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
