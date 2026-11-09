import { runApi } from '@/lib/study/route';
import { getStatus } from '@/lib/study/repository';

export async function GET(request: Request) {
  return runApi(request, 'study:participate', false, getStatus);
}
