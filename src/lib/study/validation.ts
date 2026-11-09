import { StudyError, requireObject, requireUuid } from '@/lib/study/errors';
import type { SourceMode, TelemetryEvent } from '@/types/study';

export function emailAddress(value: unknown) {
  if (typeof value !== 'string' || value.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    throw new StudyError(422, 'INVALID_EMAIL', 'Enter a valid email address.');
  }
  return value.trim();
}

export function sourceMode(value: unknown): SourceMode {
  if (value !== 'stream' && value !== 'zip') throw new StudyError(422, 'INVALID_SOURCE_MODE', 'Source mode must be stream or zip.');
  return value;
}

export function controlVersion(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new StudyError(422, 'INVALID_CONTROL_VERSION', 'A valid control version is required.');
  return Number(value);
}

export function telemetryEvents(value: unknown): TelemetryEvent[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new StudyError(422, 'INVALID_EVENT_BATCH', 'Send between 1 and 100 telemetry events.');
  }
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (bytes > 262_144) throw new StudyError(413, 'EVENT_BATCH_TOO_LARGE', 'The telemetry batch is too large.');
  const allowedEventTypes = new Set([
    'attempt_started',
    'buffering_ended',
    'buffering_started',
    'playback_checkpoint',
    'playing',
    'post_study_submitted',
    'video_ended',
  ]);
  const events = value.map((entry) => {
    const item = requireObject(entry);
    const eventId = requireUuid(item.eventId, 'eventId');
    if (!Number.isSafeInteger(item.sequence) || Number(item.sequence) <= 0) throw new StudyError(422, 'INVALID_EVENT', 'Event sequence must be a positive integer.');
    if (typeof item.eventType !== 'string' || !allowedEventTypes.has(item.eventType)) {
      throw new StudyError(422, 'INVALID_EVENT', 'Event type is not supported.');
    }
    if (typeof item.clientWallTime !== 'string' || !Number.isFinite(Date.parse(item.clientWallTime))) throw new StudyError(422, 'INVALID_EVENT', 'Event time is invalid.');
    if (typeof item.clientMonotonicMs !== 'number' || !Number.isFinite(item.clientMonotonicMs) || item.clientMonotonicMs < 0) throw new StudyError(422, 'INVALID_EVENT', 'Event duration is invalid.');
    const payload = requireObject(item.payload ?? {});
    if (item.eventType === 'video_ended') {
      requireUuid(payload.videoId, 'videoId');
      if (!Number.isSafeInteger(payload.videoSequence) || Number(payload.videoSequence) < 0) {
        throw new StudyError(422, 'INVALID_EVENT', 'Video sequence is invalid.');
      }
    }
    return {
      eventId, sequence: Number(item.sequence), eventType: item.eventType,
      clientWallTime: item.clientWallTime, clientMonotonicMs: item.clientMonotonicMs, payload,
    } satisfies TelemetryEvent;
  });
  const eventIds = new Set<string>();
  const sequences = new Set<number>();
  for (const event of events) {
    if (eventIds.has(event.eventId) || sequences.has(event.sequence)) {
      throw new StudyError(422, 'DUPLICATE_EVENT', 'Event IDs and sequences must be unique within a batch.');
    }
    eventIds.add(event.eventId);
    sequences.add(event.sequence);
  }
  return events;
}
