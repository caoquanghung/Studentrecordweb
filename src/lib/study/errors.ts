import { NextResponse } from 'next/server';

export class StudyError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function studyErrorResponse(cause: unknown) {
  if (cause instanceof StudyError) {
    return NextResponse.json({ code: cause.code, error: cause.message }, {
      status: cause.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
  console.error('Student Web request failed', cause);
  return NextResponse.json(
    { code: 'INTERNAL_ERROR', error: 'The request could not be completed.' },
    { status: 500, headers: { 'cache-control': 'private, no-store' } },
  );
}

export function requireObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new StudyError(422, 'INVALID_REQUEST', 'A JSON object is required.');
  }
  return value as Record<string, unknown>;
}

export function requireUuid(value: unknown, name = 'id') {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new StudyError(422, 'INVALID_REQUEST', `${name} must be a UUID.`);
  }
  return value;
}
