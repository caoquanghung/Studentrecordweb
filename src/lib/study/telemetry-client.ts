'use client';

import { del, get, set } from 'idb-keyval';
import type { TelemetryEvent } from '@/types/study';
import { studyClient } from './client';

const queueKey = (attemptId: string) => `studentweb-telemetry-${attemptId}`;
const queueLocks = new Map<string, Promise<void>>();

async function serialized<T>(attemptId: string, operation: () => Promise<T>) {
  const previous = queueLocks.get(attemptId) ?? Promise.resolve();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => gate);
  queueLocks.set(attemptId, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (queueLocks.get(attemptId) === tail) queueLocks.delete(attemptId);
  }
}

async function storedQueue(attemptId: string) {
  const queue = (await get<TelemetryEvent[]>(queueKey(attemptId))) ?? [];
  return queue.slice().sort((left, right) => left.sequence - right.sequence);
}

export async function readTelemetryQueue(attemptId: string) {
  return storedQueue(attemptId);
}

export async function enqueueTelemetry(attemptId: string, event: TelemetryEvent) {
  return serialized(attemptId, async () => {
    const queue = await storedQueue(attemptId);
    const existing = queue.find((item) => item.eventId === event.eventId || item.sequence === event.sequence);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(event)) {
        throw new Error('Telemetry ID or sequence was reused with different content.');
      }
      return;
    }
    await set(queueKey(attemptId), [...queue, event].sort((left, right) => left.sequence - right.sequence));
  });
}

export async function flushTelemetry(attemptId: string, controlVersion: number) {
  return serialized(attemptId, async () => {
    const queue = await storedQueue(attemptId);
    if (!queue.length) return 0;
    const result = await studyClient.events(attemptId, controlVersion, queue.slice(0, 100));
    const remaining = queue.filter((event) => event.sequence > result.acceptedThrough);
    if (remaining.length) await set(queueKey(attemptId), remaining);
    else await del(queueKey(attemptId));
    return result.acceptedThrough;
  });
}

export async function purgeTelemetryQueue(attemptId: string) {
  return serialized(attemptId, () => del(queueKey(attemptId)));
}
