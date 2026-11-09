import type {
  Assignment,
  Combination,
  SourceMode,
  StudyAttempt,
  StudyStatus,
  TelemetryEvent,
} from '@/types/study';
import { getStudyConfig } from '@/lib/study/config';
import { StudyError } from '@/lib/study/errors';

interface DemoParticipant {
  id: string;
  email: string;
  consented: boolean;
  preStudy: Record<string, unknown> | null;
  postStudy: Record<string, unknown> | null;
  assignment: Assignment | null;
  attempt: StudyAttempt | null;
  telemetry: TelemetryEvent[];
  sourceMode: SourceMode | null;
  completed: boolean;
}

interface DemoInvitation {
  id: string;
  email: string;
  status: 'pending' | 'accepted' | 'revoked';
  deliveryStatus: string;
  createdAt: string;
}

interface DemoState {
  invitations: DemoInvitation[];
  participants: Map<string, DemoParticipant>;
  combinations: Combination[];
}

const demoCombinations: Combination[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Foundations of Human–Computer Interaction',
    description: 'A two-part sample lecture playlist for development and protocol rehearsal.',
    version: 1,
    targetQuota: 12,
    completedCount: 3,
    heldCount: 0,
    enabled: true,
    videos: [
      {
        id: '11111111-1111-4111-8111-111111111101', sequence: 0,
        title: 'Introduction to HCI', durationSeconds: 30,
        storageUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        mimeType: 'video/mp4',
      },
      {
        id: '11111111-1111-4111-8111-111111111102', sequence: 1,
        title: 'Evaluating Interactive Systems', durationSeconds: 30,
        storageUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        mimeType: 'video/mp4',
      },
    ],
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Designing for People',
    description: 'An alternate fixture used to exercise assignment and quota behavior.',
    version: 1,
    targetQuota: 10,
    completedCount: 4,
    heldCount: 0,
    enabled: true,
    videos: [
      {
        id: '22222222-2222-4222-8222-222222222201', sequence: 0,
        title: 'Human-Centered Design', durationSeconds: 30,
        storageUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        mimeType: 'video/mp4',
      },
    ],
  },
];

const globalDemo = globalThis as typeof globalThis & { __studentWebDemo?: DemoState };
const state: DemoState = globalDemo.__studentWebDemo ?? {
  invitations: [{
    id: '00000000-0000-4000-8000-000000000001', email: 'student.demo@example.com',
    status: 'accepted', deliveryStatus: 'demo', createdAt: new Date().toISOString(),
  }],
  participants: new Map(),
  combinations: structuredClone(demoCombinations),
};
globalDemo.__studentWebDemo = state;

function now() { return new Date(); }
function clone<T>(value: T): T { return structuredClone(value); }

export function demoBootstrap(email: string) {
  const invitation = state.invitations.find((item) => item.email === email && item.status !== 'revoked');
  if (!invitation && email !== 'researcher.demo@example.com') {
    throw new StudyError(403, 'INVITATION_REQUIRED', 'This email has not been invited.');
  }
  let participant = state.participants.get(email);
  if (!participant) {
    participant = {
      id: email === 'student.demo@example.com' ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' : crypto.randomUUID(),
      email, consented: false, preStudy: null, postStudy: null,
      assignment: null, attempt: null, telemetry: [], sourceMode: null, completed: false,
    };
    state.participants.set(email, participant);
  }
  if (invitation) invitation.status = 'accepted';
  return clone(participant);
}

function participant(email: string) {
  if (!state.participants.has(email)) demoBootstrap(email);
  return state.participants.get(email)!;
}
function combinationFor(item: DemoParticipant) {
  return state.combinations.find((combination) => combination.id === item.assignment?.combinationId) ?? null;
}

function expire(item: DemoParticipant) {
  if (item.assignment && ['reserved', 'retry_required'].includes(item.assignment.status)
      && Date.parse(item.assignment.reservationExpiresAt) <= Date.now()) {
    const combination = combinationFor(item);
    if (combination) combination.heldCount = Math.max(0, combination.heldCount - 1);
    item.assignment = { ...item.assignment, status: 'released', stateVersion: item.assignment.stateVersion + 1 };
  }
}

export function demoStatus(email: string, role: 'student' | 'admin'): StudyStatus {
  const item = participant(email);
  const config = getStudyConfig();
  expire(item);
  return {
    mode: 'demo', participantId: item.id, email, role, invited: true,
    consented: item.consented, preStudySubmitted: Boolean(item.preStudy),
    assignment: item.assignment ? clone(item.assignment) : null,
    attempt: item.attempt ? clone(item.attempt) : null,
    combination: combinationFor(item) ? clone(combinationFor(item)!) : null,
    postStudySubmitted: Boolean(item.postStudy), completed: item.completed,
    serverTime: now().toISOString(),
    policy: {
      heartbeatIntervalSeconds: config.heartbeatIntervalSeconds,
      telemetryFlushSeconds: config.telemetryFlushSeconds,
      playbackSampleSeconds: config.playbackSampleSeconds,
      maxBufferingSeconds: config.maxBufferingSeconds,
    },
  };
}

export function demoSaveConsent(email: string, accepted: boolean) {
  const item = participant(email);
  item.consented = accepted;
  return { accepted, version: 'consent-v1', acceptedAt: now().toISOString() };
}

export function demoSavePreStudy(email: string, answers: Record<string, unknown>) {
  const item = participant(email);
  if (!item.consented) throw new StudyError(409, 'CONSENT_REQUIRED', 'Consent is required before the pre-study form.');
  item.preStudy = clone(answers);
  return { submitted: true, version: 'pre-v1', answers: clone(answers) };
}

export function demoAssign(email: string) {
  const item = participant(email);
  expire(item);
  if (!item.preStudy) throw new StudyError(409, 'PRE_STUDY_REQUIRED', 'Complete the pre-study form first.');
  if (item.assignment && item.assignment.status !== 'released') return clone(item.assignment);
  const candidate = state.combinations.filter((value) => value.enabled && value.completedCount + value.heldCount < value.targetQuota)
    .sort((a, b) => (b.targetQuota - b.completedCount - b.heldCount) - (a.targetQuota - a.completedCount - a.heldCount))[0];
  if (!candidate) throw new StudyError(409, 'NO_CAPACITY', 'No combination currently has an available slot.');
  const assignedAt = now();
  item.assignment = {
    id: crypto.randomUUID(), combinationId: candidate.id, combinationVersion: candidate.version,
    status: 'reserved', assignedAt: assignedAt.toISOString(),
    reservationExpiresAt: new Date(assignedAt.getTime() + getStudyConfig().reservationDurationSeconds * 1000).toISOString(),
    stateVersion: 1,
  };
  item.attempt = null;
  candidate.heldCount += 1;
  return clone(item.assignment);
}

export function demoPackage(email: string) {
  const item = participant(email);
  expire(item);
  const combination = combinationFor(item);
  if (!item.assignment || item.assignment.status === 'released' || !combination) {
    throw new StudyError(409, 'ASSIGNMENT_REQUIRED', 'An active assignment is required.');
  }
  const packageId = `demo-${combination.id}-v${combination.version}`;
  return clone({
    packageId,
    manifestSha256: null,
    manifest: {
      schemaVersion: 1,
      combinationId: combination.id,
      contentVersion: combination.version,
      packageId,
      videos: combination.videos.map((video) => ({
        videoId: video.id,
        sequence: video.sequence,
        relativePath: `videos/${video.sequence}-${video.id}.${video.mimeType === 'video/webm' ? 'webm' : 'mp4'}`,
        mimeType: video.mimeType,
        durationSeconds: video.durationSeconds,
        sizeBytes: video.sizeBytes,
      })),
    },
    combination,
  });
}

export function demoReadiness(email: string, sourceMode: SourceMode, metrics: Record<string, unknown>) {
  const item = participant(email);
  expire(item);
  if (!item.assignment || item.assignment.status === 'released') throw new StudyError(409, 'RESERVATION_EXPIRED', 'The reservation expired.');
  item.sourceMode = sourceMode;
  return { status: 'passed', sourceMode, metrics, expiresAt: new Date(Date.now() + 120_000).toISOString() };
}

export function demoStart(email: string, sourceMode: SourceMode) {
  const item = participant(email);
  expire(item);
  if (!item.assignment || item.assignment.status === 'released') throw new StudyError(409, 'RESERVATION_EXPIRED', 'The reservation expired.');
  if (!item.consented) throw new StudyError(409, 'CONSENT_REQUIRED', 'Consent is required before starting.');
  if (!item.preStudy) throw new StudyError(409, 'PRE_STUDY_REQUIRED', 'Complete the pre-study form before starting.');
  if (!item.sourceMode || item.sourceMode !== sourceMode) throw new StudyError(409, 'READINESS_REQUIRED', 'Complete preparation first.');
  if (item.attempt && ['watching', 'post_study', 'completing'].includes(item.attempt.status)) return clone(item.attempt);
  const attemptNumber = (item.attempt?.attemptNumber ?? 0) + 1;
  item.attempt = {
    id: crypto.randomUUID(), assignmentId: item.assignment.id, attemptNumber,
    controlVersion: attemptNumber, status: 'watching', sourceMode, currentVideoSequence: 0,
    leaseExpiresAt: new Date(Date.now() + getStudyConfig().connectionTimeoutSeconds * 1000).toISOString(),
  };
  item.assignment.status = 'active';
  item.assignment.stateVersion += 1;
  item.telemetry = [];
  return clone(item.attempt);
}

function currentAttempt(email: string, attemptId: string, controlVersion: number, requireLive = true) {
  const item = participant(email);
  const attempt = item.attempt;
  if (!attempt || attempt.id !== attemptId) throw new StudyError(404, 'ATTEMPT_NOT_FOUND', 'Attempt not found.');
  if (attempt.controlVersion !== controlVersion) throw new StudyError(409, 'STALE_CONTROL', 'This tab no longer controls the attempt.');
  if (attempt.status === 'invalid') throw new StudyError(409, 'ATTEMPT_INVALID', 'The attempt is no longer valid.');
  if (requireLive && attempt.status !== 'completed' && Date.parse(attempt.leaseExpiresAt) <= Date.now()) {
    item.telemetry = [];
    attempt.status = 'invalid';
    if (item.assignment) {
      item.assignment.status = Date.parse(item.assignment.reservationExpiresAt) > Date.now()
        ? 'retry_required'
        : 'released';
      item.assignment.stateVersion += 1;
    }
    throw new StudyError(409, 'ATTEMPT_INVALID', 'The attempt connection lease expired.');
  }
  return { item, attempt };
}

export function demoHeartbeat(email: string, attemptId: string, controlVersion: number) {
  const { attempt } = currentAttempt(email, attemptId, controlVersion);
  attempt.leaseExpiresAt = new Date(Date.now() + getStudyConfig().connectionTimeoutSeconds * 1000).toISOString();
  return clone(attempt);
}

export function demoAppendEvents(email: string, attemptId: string, controlVersion: number, events: TelemetryEvent[]) {
  const { item, attempt } = currentAttempt(email, attemptId, controlVersion);
  const combination = combinationFor(item);
  if (!combination) throw new StudyError(409, 'ASSIGNMENT_REQUIRED', 'Combination not found.');
  const nextTelemetry = item.telemetry.map(clone);
  let nextVideoSequence = attempt.currentVideoSequence;
  for (const event of events) {
    const duplicate = nextTelemetry.find((existing) => existing.eventId === event.eventId || existing.sequence === event.sequence);
    if (duplicate) {
      if (JSON.stringify(duplicate) !== JSON.stringify(event)) {
        throw new StudyError(409, 'EVENT_CONFLICT', 'An event ID or sequence was reused with different content.');
      }
      continue;
    }
    if (event.eventType === 'video_ended' && typeof event.payload.videoSequence === 'number') {
      const expected = combination.videos[nextVideoSequence];
      if (!expected || event.payload.videoSequence !== expected.sequence || event.payload.videoId !== expected.id) {
        throw new StudyError(409, 'VIEWING_ORDER_INVALID', 'Videos must finish in their assigned order.');
      }
      nextVideoSequence += 1;
    }
    nextTelemetry.push(clone(event));
  }
  item.telemetry = nextTelemetry;
  attempt.currentVideoSequence = nextVideoSequence;
  if (combination && attempt.currentVideoSequence >= combination.videos.length) attempt.status = 'post_study';
  const accepted = new Set(item.telemetry.map((event) => event.sequence));
  let acceptedThrough = 0;
  while (accepted.has(acceptedThrough + 1)) acceptedThrough += 1;
  return { acceptedThrough, attempt: clone(attempt) };
}

export function demoSavePostStudy(email: string, answers: Record<string, unknown>, submitted: boolean) {
  const item = participant(email);
  if (!item.assignment) throw new StudyError(409, 'ASSIGNMENT_REQUIRED', 'An assignment is required.');
  if (!item.attempt || item.attempt.status !== 'post_study') {
    throw new StudyError(409, 'POST_STUDY_LOCKED', 'Finish every assigned video before post-study.');
  }
  item.postStudy = clone(answers);
  return { submitted, version: 'post-v1', answers: clone(answers) };
}

export function demoInvalidate(email: string, attemptId: string, controlVersion: number, reason: string) {
  const { item, attempt } = currentAttempt(email, attemptId, controlVersion, false);
  attempt.status = 'invalid';
  item.telemetry = [];
  if (!item.assignment) throw new StudyError(409, 'ASSIGNMENT_REQUIRED', 'Assignment not found.');
  const eligible = Date.parse(item.assignment.reservationExpiresAt) > Date.now();
  item.assignment.status = eligible ? 'retry_required' : 'released';
  item.assignment.stateVersion += 1;
  return { retryEligible: eligible, reason, assignment: clone(item.assignment), attempt: clone(attempt) };
}

export function demoComplete(email: string, attemptId: string, controlVersion: number) {
  const { item, attempt } = currentAttempt(email, attemptId, controlVersion);
  if (attempt.status === 'completed' && item.assignment?.status === 'completed') {
    return { completed: true, attempt: clone(attempt), assignment: clone(item.assignment) };
  }
  const combination = combinationFor(item);
  if (attempt.status !== 'post_study' || !combination || attempt.currentVideoSequence < combination.videos.length) {
    throw new StudyError(409, 'VIEWING_INCOMPLETE', 'All videos must finish before completion.');
  }
  if (!item.postStudy) throw new StudyError(409, 'POST_STUDY_REQUIRED', 'Submit the post-study form first.');
  const accepted = new Set(item.telemetry.map((event) => event.sequence));
  let acceptedThrough = 0;
  while (accepted.has(acceptedThrough + 1)) acceptedThrough += 1;
  const maximumSequence = Math.max(0, ...item.telemetry.map((event) => event.sequence));
  if (!item.telemetry.some((event) => event.eventType === 'post_study_submitted')
    || acceptedThrough !== maximumSequence) {
    throw new StudyError(409, 'SYNC_PENDING', 'Required telemetry has not synchronized.');
  }
  attempt.status = 'completed';
  if (!item.assignment) throw new StudyError(409, 'ASSIGNMENT_REQUIRED', 'Assignment not found.');
  item.assignment.status = 'completed';
  item.assignment.stateVersion += 1;
  item.completed = true;
  combination.completedCount += 1;
  combination.heldCount = Math.max(0, combination.heldCount - 1);
  return { completed: true, attempt: clone(attempt), assignment: clone(item.assignment) };
}

export function demoAdminInvitations() { return clone(state.invitations); }
export function demoAdminCreateInvitation(email: string) {
  const normalized = email.trim().toLowerCase();
  let invitation = state.invitations.find((item) => item.email === normalized);
  if (!invitation) {
    invitation = { id: crypto.randomUUID(), email: normalized, status: 'pending', deliveryStatus: 'unconfigured', createdAt: now().toISOString() };
    state.invitations.unshift(invitation);
  }
  return clone(invitation);
}
export function demoAdminCombinations() { return clone(state.combinations); }
export function demoAdminCreateCombination(input: { title: string; description?: string; targetQuota: number }) {
  const combination: Combination = {
    id: crypto.randomUUID(), title: input.title, description: input.description ?? '', version: 1,
    targetQuota: input.targetQuota, completedCount: 0, heldCount: 0, enabled: true, videos: [],
  };
  state.combinations.push(combination);
  return clone(combination);
}
export function demoAdminUpdateCombination(id: string, patch: Partial<Pick<Combination, 'title' | 'description' | 'targetQuota' | 'enabled'>>) {
  const combination = state.combinations.find((item) => item.id === id);
  if (!combination) throw new StudyError(404, 'COMBINATION_NOT_FOUND', 'Combination not found.');
  Object.assign(combination, patch);
  return clone(combination);
}
export function demoAdminParticipants() {
  return [...state.participants.values()].map((item) => ({
    id: item.id, email: item.email, consented: item.consented, preStudySubmitted: Boolean(item.preStudy),
    status: item.completed ? 'completed' : item.attempt?.status ?? item.assignment?.status ?? 'invited',
    assignment: item.assignment, sourceMode: item.sourceMode,
  }));
}
export function demoAdminParticipant(id: string) {
  const item = [...state.participants.values()].find((value) => value.id === id);
  if (!item) throw new StudyError(404, 'PARTICIPANT_NOT_FOUND', 'Participant not found.');
  return clone({ ...item, combination: combinationFor(item) });
}
export function demoCleanup() {
  let changed = 0;
  for (const item of state.participants.values()) {
    const before = item.assignment?.status;
    expire(item);
    if (before !== item.assignment?.status) changed += 1;
  }
  return { processed: changed };
}
