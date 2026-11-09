import { requireObject, StudyError } from '@/lib/study/errors';
import { jsonBody } from '@/lib/study/http';
import { getStatus, savePostStudy } from '@/lib/study/repository';
import { runApi } from '@/lib/study/route';
import { controlVersion } from '@/lib/study/validation';

export async function PUT(request: Request) {
  return runApi(request, 'study:participate', true, async (context) => {
    const body = requireObject(await jsonBody(request));
    const attemptId = typeof body.attemptId === 'string' ? body.attemptId : '';
    const version = controlVersion(body.controlVersion);
    const status = await getStatus(context);
    if (!status.attempt || status.attempt.id !== attemptId
      || status.attempt.controlVersion !== version || status.attempt.status !== 'post_study') {
      throw new StudyError(409, 'POST_STUDY_LOCKED', 'Post-study opens only after every assigned video finishes.');
    }
    await savePostStudy(context, attemptId, version, requireObject(body.answers), requireObject(body.timing ?? {}), body.submitted === true);
    return getStatus(context);
  });
}
