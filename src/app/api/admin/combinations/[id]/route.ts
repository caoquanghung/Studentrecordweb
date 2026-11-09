import { requireObject, requireUuid } from '@/lib/study/errors';
import { adminUpdateCombination } from '@/lib/study/repository';
import { runApi } from '@/lib/study/route';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runApi(request, 'combinations:manage', true, async (context) => {
    const { id } = await params;
    const body = requireObject(await request.json());
    return adminUpdateCombination(context, requireUuid(id), {
      title: typeof body.title === 'string' ? body.title.trim().slice(0, 180) : undefined,
      description: typeof body.description === 'string' ? body.description.slice(0, 1000) : undefined,
      targetQuota: Number.isSafeInteger(body.targetQuota) && Number(body.targetQuota) >= 0 ? Number(body.targetQuota) : undefined,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
    });
  });
}
