import { adminOverview } from '@/lib/study/repository';
import { runApi } from '@/lib/study/route';

export async function GET(request: Request) {
  return runApi(request, 'study-data:read', false, adminOverview);
}
