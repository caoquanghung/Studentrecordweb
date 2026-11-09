export type AppRole = 'student' | 'admin';

export type WorkflowStep =
  | 'introduction'
  | 'consent'
  | 'pre-study'
  | 'assignment'
  | 'preparation'
  | 'run'
  | 'post-study'
  | 'complete';

export type AssignmentStatus =
  | 'reserved'
  | 'active'
  | 'retry_required'
  | 'released'
  | 'completed';

export type AttemptStatus =
  | 'watching'
  | 'post_study'
  | 'completing'
  | 'invalid'
  | 'completed';

export type SourceMode = 'stream' | 'zip';

export interface StudyVideo {
  id: string;
  title: string;
  sequence: number;
  durationSeconds: number;
  storageUrl: string;
  mimeType: string;
  sizeBytes?: number;
}

export interface StudyPackageManifestVideo {
  videoId: string;
  sequence: number;
  relativePath: string;
  mimeType: string;
  durationSeconds: number;
  sizeBytes?: number;
  integrity?: {
    algorithm?: string;
    chunkSizeBytes?: number;
    orderedChunkDigests?: string[];
  };
}

export interface StudyPackageManifest {
  schemaVersion: number;
  combinationId: string;
  contentVersion: number;
  packageId: string;
  videos: StudyPackageManifestVideo[];
}

export interface StudyPackageDescriptor {
  packageId: string;
  manifest?: StudyPackageManifest | Record<string, unknown>;
  manifestSha256?: string | null;
  combination: Combination;
}

export interface Combination {
  id: string;
  title: string;
  description: string;
  version: number;
  targetQuota: number;
  completedCount: number;
  heldCount: number;
  enabled: boolean;
  videos: StudyVideo[];
}

export interface Assignment {
  id: string;
  combinationId: string;
  combinationVersion: number;
  status: AssignmentStatus;
  assignedAt: string;
  reservationExpiresAt: string;
  stateVersion: number;
}

export interface StudyAttempt {
  id: string;
  assignmentId: string;
  attemptNumber: number;
  controlVersion: number;
  status: AttemptStatus;
  sourceMode: SourceMode;
  currentVideoSequence: number;
  leaseExpiresAt: string;
}

export interface StudyStatus {
  mode: 'demo' | 'configured' | 'setup-required';
  participantId: string | null;
  email: string | null;
  role: AppRole;
  invited: boolean;
  consented: boolean;
  preStudySubmitted: boolean;
  assignment: Assignment | null;
  attempt: StudyAttempt | null;
  combination: Combination | null;
  postStudySubmitted: boolean;
  completed: boolean;
  serverTime: string;
  policy?: {
    heartbeatIntervalSeconds: number;
    telemetryFlushSeconds: number;
    playbackSampleSeconds: number;
    maxBufferingSeconds: number;
  };
}

export interface TelemetryEvent {
  eventId: string;
  sequence: number;
  eventType: string;
  clientWallTime: string;
  clientMonotonicMs: number;
  payload: Record<string, unknown>;
}

export interface ApiErrorBody {
  error: string;
  code: string;
}

export interface ApiResult<T> {
  data: T;
}
