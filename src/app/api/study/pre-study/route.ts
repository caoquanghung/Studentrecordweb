import { requireObject } from '@/lib/study/errors';
import { jsonBody } from '@/lib/study/http';
import { getStatus, savePreStudy } from '@/lib/study/repository';
import { runApi } from '@/lib/study/route';
import { preStudyAnswers } from '@/lib/study/validation';

export async function PUT(request: Request) {
  return runApi(request, 'study:participate', true, async (context) => {
    const body = requireObject(await jsonBody(request));
    const answers = preStudyAnswers(body.answers);
    await savePreStudy(context, answers, requireObject(body.timing ?? {}));
    return getStatus(context);
  });
}
