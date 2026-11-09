import { requireObject, requireUuid } from '@/lib/study/errors';
import { jsonBody } from '@/lib/study/http';
import { getStatus, invalidateAttempt } from '@/lib/study/repository';
import { runApi } from '@/lib/study/route';
import { controlVersion } from '@/lib/study/validation';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runApi(request, 'study:participate', true, async (context) => {
    const { id } = await params;
    const body = requireObject(await jsonBody(request));
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 80) : 'interrupted';
    await invalidateAttempt(context, requireUuid(id, 'attemptId'), controlVersion(body.controlVersion), reason);
    return getStatus(context);
  });
}
