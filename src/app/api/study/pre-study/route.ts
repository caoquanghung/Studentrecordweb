import { requireObject, StudyError } from '@/lib/study/errors';
import { jsonBody } from '@/lib/study/http';
import { getStatus, savePreStudy } from '@/lib/study/repository';
import { runApi } from '@/lib/study/route';

export async function PUT(request: Request) {
  return runApi(request, 'study:participate', true, async (context) => {
    const body = requireObject(await jsonBody(request));
    const answers = requireObject(body.answers);
    if (!Number.isFinite(Number(answers.age)) || Number(answers.age) < 6 || Number(answers.age) > 120) {
      throw new StudyError(422, 'INVALID_PRE_STUDY', 'Enter a valid age.');
    }
    await savePreStudy(context, answers, requireObject(body.timing ?? {}));
    return getStatus(context);
  });
}
