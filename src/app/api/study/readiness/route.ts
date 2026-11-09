import { requireObject } from '@/lib/study/errors';
import { jsonBody } from '@/lib/study/http';
import { saveReadiness } from '@/lib/study/repository';
import { runApi } from '@/lib/study/route';
import { sourceMode } from '@/lib/study/validation';

export async function POST(request: Request) {
  return runApi(request, 'study:participate', true, async (context) => {
    const body = requireObject(await jsonBody(request));
    const mode = sourceMode(body.sourceMode);
    const passed = body.ready === true;
    await saveReadiness(context, mode, passed, requireObject(body.metrics ?? {}));
    return { ready: passed, sourceMode: mode };
  });
}
