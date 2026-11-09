'use client';

import type { SourceMode, StudyPackageDescriptor, StudyStatus, TelemetryEvent } from '@/types/study';

export class StudyApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: options.body
        ? { 'content-type': 'application/json', ...options.headers }
        : options.headers,
      cache: 'no-store',
    });
  } catch {
    throw new StudyApiError(0, 'NETWORK_ERROR', 'Không thể kết nối với máy chủ study.');
  }

  const body = await response.json().catch(() => ({})) as {
    data?: T;
    error?: string;
    code?: string;
  };
  if (!response.ok) {
    throw new StudyApiError(
      response.status,
      body.code ?? 'REQUEST_FAILED',
      body.error ?? 'Không thể hoàn tất yêu cầu.',
    );
  }
  return (body.data ?? body) as T;
}

export const studyClient = {
  status: () => request<StudyStatus>('/api/study/status'),
  package: () => request<StudyPackageDescriptor>('/api/study/package'),
  consent: (payload: Record<string, unknown>) => request<StudyStatus>('/api/study/consent', { method: 'POST', body: JSON.stringify(payload) }),
  preStudy: (answers: Record<string, unknown>, timing: Record<string, unknown> = {}) => request<StudyStatus>('/api/study/pre-study', { method: 'PUT', body: JSON.stringify({ answers, timing }) }),
  assignment: () => request<StudyStatus>('/api/study/assignment', { method: 'POST', body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }) }),
  readiness: (sourceMode: SourceMode, ready = true, metrics: Record<string, unknown> = {}) => request<{ ready: boolean; sourceMode: SourceMode }>('/api/study/readiness', { method: 'POST', body: JSON.stringify({ sourceMode, ready, metrics }) }),
  start: (sourceMode: SourceMode) => request<StudyStatus>('/api/study/attempts', { method: 'POST', body: JSON.stringify({ sourceMode, idempotencyKey: crypto.randomUUID() }) }),
  heartbeat: (attemptId: string, controlVersion: number) => request<unknown>(`/api/study/attempts/${attemptId}/heartbeat`, { method: 'POST', body: JSON.stringify({ controlVersion }) }),
  events: (attemptId: string, controlVersion: number, events: TelemetryEvent[]) => request<{ acceptedThrough: number }>(`/api/study/attempts/${attemptId}/events`, { method: 'POST', body: JSON.stringify({ controlVersion, events }) }),
  videoComplete: (attemptId: string, controlVersion: number) => request<StudyStatus>(`/api/study/attempts/${attemptId}/video-complete`, { method: 'POST', body: JSON.stringify({ controlVersion }) }),
  invalidate: (attemptId: string, controlVersion: number, reason: string) => request<StudyStatus>(`/api/study/attempts/${attemptId}/invalidate`, { method: 'POST', body: JSON.stringify({ controlVersion, reason }) }),
  postStudy: (attemptId: string, controlVersion: number, answers: Record<string, unknown>, submitted: boolean, timing: Record<string, unknown> = {}) => request<StudyStatus>('/api/study/post-study', { method: 'PUT', body: JSON.stringify({ attemptId, controlVersion, answers, submitted, timing }) }),
  complete: (attemptId: string, controlVersion: number, acknowledgedSequence: number) => request<StudyStatus>(`/api/study/attempts/${attemptId}/complete`, { method: 'POST', body: JSON.stringify({ controlVersion, acknowledgedSequence, idempotencyKey: crypto.randomUUID() }) }),
};
