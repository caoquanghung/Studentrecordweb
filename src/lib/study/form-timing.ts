'use client';

import { useCallback, useEffect, useRef } from 'react';

interface TimingState {
  openedAtMs: number;
  visibleSinceMs: number | null;
  visibleActiveMs: number;
}

export function useFormTiming() {
  const stateRef = useRef<TimingState>({
    openedAtMs: 0,
    visibleSinceMs: null,
    visibleActiveMs: 0,
  });

  useEffect(() => {
    const state = stateRef.current;
    const mountedAt = Date.now();
    state.openedAtMs = mountedAt;
    if (document.visibilityState === 'visible') state.visibleSinceMs = mountedAt;

    const visibilityChanged = () => {
      const now = Date.now();
      if (document.visibilityState === 'visible') {
        state.visibleSinceMs = now;
      } else if (state.visibleSinceMs !== null) {
        state.visibleActiveMs += Math.max(0, now - state.visibleSinceMs);
        state.visibleSinceMs = null;
      }
    };

    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      if (state.visibleSinceMs !== null) {
        state.visibleActiveMs += Math.max(0, Date.now() - state.visibleSinceMs);
        state.visibleSinceMs = null;
      }
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, []);

  return useCallback(() => {
    const state = stateRef.current;
    const submittedAtMs = Date.now();
    const openedAtMs = state.openedAtMs || submittedAtMs;
    const currentVisibleMs = state.visibleSinceMs === null
      ? 0
      : Math.max(0, submittedAtMs - state.visibleSinceMs);
    return {
      openedAt: new Date(openedAtMs).toISOString(),
      submittedAt: new Date(submittedAtMs).toISOString(),
      wallElapsedMs: Math.max(0, submittedAtMs - openedAtMs),
      visibleActiveMs: state.visibleActiveMs + currentVisibleMs,
    };
  }, []);
}
