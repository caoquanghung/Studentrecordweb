import { requireObject, StudyError } from '@/lib/study/errors';
import { jsonBody } from '@/lib/study/http';
import { getStatus, saveConsent } from '@/lib/study/repository';
import { runApi } from '@/lib/study/route';

export async function POST(request: Request) {
  return runApi(request, 'study:participate', true, async (context) => {
    const body = requireObject(await jsonBody(request));
    const confirmations = Array.isArray(body.confirmations) ? body.confirmations : [];
    const typedName = typeof body.name === 'string' ? body.name.trim() : '';
    if (confirmations.length !== 4 || typedName.length < 2 || typedName.length > 160) {
      throw new StudyError(422, 'INVALID_CONSENT', 'Complete every consent confirmation and enter the participant name.');
    }
    await saveConsent(context, { accepted: true, typedName, timing: requireObject(body.timing ?? {}) });
    return getStatus(context);
  });
}
