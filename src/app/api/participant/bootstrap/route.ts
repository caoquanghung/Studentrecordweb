import { runApi } from '@/lib/study/route';
import { bootstrap, getStatus } from '@/lib/study/repository';

export async function POST(request: Request) {
  return runApi(request, 'study:participate', true, async (context) => {
    await bootstrap(context);
    return getStatus(context);
  });
}
