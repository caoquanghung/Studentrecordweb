import { NextResponse } from 'next/server';
import { StudyError } from '@/lib/study/errors';

export function apiOk<T>(data: T, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('cache-control', 'private, no-store');
  return NextResponse.json({ data }, { ...init, headers });
}

export function apiError(status: number, code: string, error: string) {
  return NextResponse.json({ code, error }, { status, headers: { 'cache-control': 'private, no-store' } });
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const requestUrl = new URL(request.url);
    const expectedHost = request.headers.get('host') ?? requestUrl.host;
    const expectedProtocol = request.headers.get('x-forwarded-proto') ?? requestUrl.protocol.replace(':', '');
    const originUrl = new URL(origin);
    return originUrl.host === expectedHost
      && originUrl.protocol.replace(':', '') === expectedProtocol;
  } catch {
    return false;
  }
}

export function enforceSameOrigin(request: Request) {
  if (!requireSameOrigin(request)) {
    throw new StudyError(403, 'CROSS_ORIGIN_REQUEST', 'Cross-origin mutations are not allowed.');
  }
}

export async function jsonBody(request: Request) {
  try {
    return await request.json() as unknown;
  } catch {
    throw new StudyError(400, 'INVALID_JSON', 'The request body must be valid JSON.');
  }
}
