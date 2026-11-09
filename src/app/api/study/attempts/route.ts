import { requireObject } from '@/lib/study/errors';
import { jsonBody } from '@/lib/study/http';
import { getStatus, startAttempt } from '@/lib/study/repository';
import { runApi } from '@/lib/study/route';
import { sourceMode } from '@/lib/study/validation';

export async function POST(request: Request) {
  return runApi(request, 'study:participate', true, async (context) => {
    const body = requireObject(await jsonBody(request));
    await startAttempt(context, sourceMode(body.sourceMode));
    return getStatus(context);
  });
}
