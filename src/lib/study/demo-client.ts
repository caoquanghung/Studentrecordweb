'use client';

import type { Assignment, Combination, SourceMode, StudyAttempt, StudyStatus, TelemetryEvent } from '@/types/study';

const STORAGE_KEY = 'studentweb-demo-state-v1';

export interface DemoState {
  consented: boolean;
  preStudy: Record<string, unknown> | null;
  postStudy: Record<string, unknown> | null;
  assignment: Assignment | null;
  attempt: StudyAttempt | null;
  completed: boolean;
  sourceMode: SourceMode;
  readiness: boolean;
  telemetry: TelemetryEvent[];
}

export const DEMO_COMBINATION: Combination = {
  id: 'demo-combination-a',
  title: 'Tổ hợp bài giảng mẫu A',
  description: 'Playlist phát triển dùng để kiểm tra toàn bộ luồng Student Web.',
  version: 1,
  targetQuota: 20,
  completedCount: 8,
  heldCount: 3,
  enabled: true,
  videos: [
    {
      id: 'demo-video-1',
      title: 'Bài 1 · Quan sát và tương tác',
      sequence: 1,
      durationSeconds: 30,
      storageUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      mimeType: 'video/mp4',
    },
    {
      id: 'demo-video-2',
      title: 'Bài 2 · Thiết kế lấy người dùng làm trung tâm',
      sequence: 2,
      durationSeconds: 30,
      storageUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      mimeType: 'video/mp4',
    },
  ],
};

function emptyState(): DemoState {
  return {
    consented: false,
    preStudy: null,
    postStudy: null,
    assignment: null,
    attempt: null,
    completed: false,
    sourceMode: 'stream',
    readiness: false,
    telemetry: [],
  };
}

function readState(): DemoState {
  if (typeof window === 'undefined') return emptyState();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '') as Partial<DemoState>;
    return { ...emptyState(), ...parsed };
  } catch {
    return emptyState();
  }
}

function writeState(patch: Partial<DemoState>) {
  const next = { ...readState(), ...patch };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function expireAssignment(state: DemoState): DemoState {
  if (!state.assignment || state.assignment.status === 'active' || state.assignment.status === 'completed') return state;
  if (Date.parse(state.assignment.reservationExpiresAt) > Date.now()) return state;
  return writeState({ assignment: { ...state.assignment, status: 'released', stateVersion: state.assignment.stateVersion + 1 }, attempt: null, readiness: false });
}

export function demoStatus(): StudyStatus {
  const state = expireAssignment(readState());
  return {
    mode: 'demo',
    participantId: 'p-demo-001',
    email: 'student.demo@example.com',
    role: 'student',
    invited: true,
    consented: state.consented,
    preStudySubmitted: Boolean(state.preStudy),
    assignment: state.assignment,
    attempt: state.attempt,
    combination: state.assignment && state.assignment.status !== 'released' ? DEMO_COMBINATION : null,
    postStudySubmitted: Boolean(state.postStudy),
    completed: state.completed,
    serverTime: new Date().toISOString(),
    policy: {
      heartbeatIntervalSeconds: 5,
      telemetryFlushSeconds: 5,
      playbackSampleSeconds: 1,
      maxBufferingSeconds: 5,
      readinessSampleBytes: 1_048_576,
      readinessTimeoutSeconds: 15,
      streamBitrateMargin: 1.5,
      minimumStreamMbps: 2,
    },
  };
}

export function demoSaveConsent() {
  writeState({ consented: true });
  return demoStatus();
}

export function demoSavePreStudy(answers: Record<string, unknown>) {
  if (!readState().consented) throw new Error('CONSENT_REQUIRED');
  writeState({ preStudy: answers });
  return demoStatus();
}

export function demoAssign() {
  const current = readState();
  if (!current.preStudy) throw new Error('PRE_STUDY_REQUIRED');
  if (current.assignment && current.assignment.status !== 'released') return demoStatus();
  const assignedAt = new Date();
  const assignment: Assignment = {
    id: crypto.randomUUID(),
    combinationId: DEMO_COMBINATION.id,
    combinationVersion: DEMO_COMBINATION.version,
    status: 'reserved',
    assignedAt: assignedAt.toISOString(),
    reservationExpiresAt: new Date(assignedAt.getTime() + 30 * 60 * 1000).toISOString(),
    stateVersion: 1,
  };
  writeState({ assignment, attempt: null, readiness: false, postStudy: null });
  return demoStatus();
}

export function demoSetReadiness(sourceMode: SourceMode, ready: boolean) {
  const state = expireAssignment(readState());
  if (!state.assignment || state.assignment.status === 'released') throw new Error('ASSIGNMENT_REQUIRED');
  writeState({ sourceMode, readiness: ready });
  return { ready, sourceMode };
}

export function demoStartAttempt(sourceMode: SourceMode) {
  const state = expireAssignment(readState());
  if (!state.assignment || state.assignment.status === 'released') throw new Error('RESERVATION_EXPIRED');
  if (!state.consented) throw new Error('CONSENT_REQUIRED');
  if (!state.preStudy) throw new Error('PRE_STUDY_REQUIRED');
  if (!state.readiness || state.sourceMode !== sourceMode) throw new Error('READINESS_REQUIRED');
  if (state.attempt && ['watching', 'post_study', 'completing'].includes(state.attempt.status)) return demoStatus();
  const attempt: StudyAttempt = {
    id: crypto.randomUUID(),
    assignmentId: state.assignment.id,
    attemptNumber: (state.attempt?.attemptNumber ?? 0) + 1,
    controlVersion: (state.attempt?.controlVersion ?? 0) + 1,
    status: 'watching',
    sourceMode,
    currentVideoSequence: 0,
    leaseExpiresAt: new Date(Date.now() + 20_000).toISOString(),
  };
  writeState({ attempt, assignment: { ...state.assignment, status: 'active', stateVersion: state.assignment.stateVersion + 1 }, sourceMode, telemetry: [] });
  return demoStatus();
}

export function demoHeartbeat(attemptId: string) {
  const state = readState();
  if (!state.attempt || state.attempt.id !== attemptId || state.attempt.status === 'invalid') throw new Error('ATTEMPT_INVALID');
  const attempt = { ...state.attempt, leaseExpiresAt: new Date(Date.now() + 20_000).toISOString() };
  writeState({ attempt });
  return attempt;
}

export function demoEvents(attemptId: string, events: TelemetryEvent[]) {
  const state = readState();
  if (!state.attempt || state.attempt.id !== attemptId || state.attempt.status === 'invalid') throw new Error('ATTEMPT_INVALID');
  const telemetry = [...state.telemetry];
  for (const event of events) {
    const existing = telemetry.find((item) => item.eventId === event.eventId || item.sequence === event.sequence);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(event)) throw new Error('EVENT_CONFLICT');
      continue;
    }
    telemetry.push(event);
  }
  telemetry.sort((left, right) => left.sequence - right.sequence);
  writeState({ telemetry });
  const accepted = new Set(telemetry.map((event) => event.sequence));
  let acceptedThrough = 0;
  while (accepted.has(acceptedThrough + 1)) acceptedThrough += 1;
  return { acceptedThrough };
}

export function demoEnterPostStudy(attemptId: string) {
  const state = readState();
  if (!state.attempt || state.attempt.id !== attemptId) throw new Error('ATTEMPT_INVALID');
  writeState({ attempt: { ...state.attempt, status: 'post_study' } });
  return demoStatus();
}

export function demoSavePostStudy(answers: Record<string, unknown>) {
  if (readState().attempt?.status !== 'post_study') throw new Error('POST_STUDY_LOCKED');
  writeState({ postStudy: answers });
  return demoStatus();
}

export function demoInvalidate(attemptId: string, reason: string) {
  const state = readState();
  if (!state.attempt || state.attempt.id !== attemptId) return demoStatus();
  const beforeDeadline = state.assignment && Date.parse(state.assignment.reservationExpiresAt) > Date.now();
  writeState({
    attempt: { ...state.attempt, status: 'invalid' },
    assignment: state.assignment ? { ...state.assignment, status: beforeDeadline ? 'retry_required' : 'released', stateVersion: state.assignment.stateVersion + 1 } : null,
    telemetry: [],
  });
  window.sessionStorage.setItem('studentweb-last-invalidation', reason);
  return demoStatus();
}

export function demoComplete(attemptId: string) {
  const state = readState();
  if (state.completed && state.attempt?.id === attemptId) return demoStatus();
  if (!state.attempt || state.attempt.id !== attemptId || !state.postStudy) throw new Error('SYNC_PENDING');
  if (state.attempt.status !== 'post_study') throw new Error('VIEWING_INCOMPLETE');
  writeState({
    completed: true,
    attempt: { ...state.attempt, status: 'completed' },
    assignment: state.assignment ? { ...state.assignment, status: 'completed', stateVersion: state.assignment.stateVersion + 1 } : null,
  });
  return demoStatus();
}

export function resetDemoState() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function getDemoFormDraft(kind: 'pre-study' | 'post-study') {
  const state = readState();
  return kind === 'pre-study' ? state.preStudy : state.postStudy;
}
