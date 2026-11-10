import { requireObject, StudyError } from '@/lib/study/errors';
import { adminCombinations, adminCreateCombination } from '@/lib/study/repository';
import { runApi } from '@/lib/study/route';
import { jsonBody } from '@/lib/study/http';

export async function GET(request: Request) {
  return runApi(request, 'combinations:manage', false, adminCombinations);
}

export async function POST(request: Request) {
  return runApi(request, 'combinations:manage', true, async (context) => {
    const body = requireObject(await jsonBody(request));
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const targetQuota = Number(body.targetQuota);
    if (!title || title.length > 180 || !Number.isSafeInteger(targetQuota) || targetQuota < 0) {
      throw new StudyError(422, 'INVALID_COMBINATION', 'Enter a title and a nonnegative quota.');
    }
    return adminCreateCombination(context, { title, description: typeof body.description === 'string' ? body.description.slice(0, 1000) : '', targetQuota });
  });
}
