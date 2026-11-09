import { requireObject, requireUuid, StudyError } from '@/lib/study/errors';
import { jsonBody } from '@/lib/study/http';
import { getStatus } from '@/lib/study/repository';
import { runApi } from '@/lib/study/route';
import { controlVersion } from '@/lib/study/validation';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runApi(request, 'study:participate', true, async (context) => {
    const { id } = await params;
    const attemptId = requireUuid(id, 'attemptId');
    const body = requireObject(await jsonBody(request));
    const version = controlVersion(body.controlVersion);
    const status = await getStatus(context);
    if (status.attempt?.id !== attemptId || status.attempt.controlVersion !== version || status.attempt.status !== 'post_study') {
      throw new StudyError(409, 'VIEWING_INCOMPLETE', 'All assigned videos must finish before post-study.');
    }
    return status;
  });
}
