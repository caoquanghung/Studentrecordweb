import { requireObject, requireUuid } from '@/lib/study/errors';
import { jsonBody } from '@/lib/study/http';
import { appendEvents } from '@/lib/study/repository';
import { runApi } from '@/lib/study/route';
import { controlVersion, telemetryEvents } from '@/lib/study/validation';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runApi(request, 'study:participate', true, async (context) => {
    const { id } = await params;
    const body = requireObject(await jsonBody(request));
    return appendEvents(context, requireUuid(id, 'attemptId'), controlVersion(body.controlVersion), telemetryEvents(body.events));
  });
}
