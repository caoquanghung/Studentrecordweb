import { getStatus, requestAssignment } from '@/lib/study/repository';
import { runApi } from '@/lib/study/route';

export async function POST(request: Request) {
  return runApi(request, 'study:participate', true, async (context) => {
    await requestAssignment(context);
    return getStatus(context);
  });
}
