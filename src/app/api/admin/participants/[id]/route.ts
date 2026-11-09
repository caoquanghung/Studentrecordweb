import { requireUuid } from '@/lib/study/errors';
import { adminParticipant } from '@/lib/study/repository';
import { runApi } from '@/lib/study/route';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runApi(request, 'study-data:read', false, async (context) => {
    const { id } = await params;
    return adminParticipant(context, requireUuid(id, 'participantId'));
  });
}
