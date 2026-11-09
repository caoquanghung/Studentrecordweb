import { getStudyConfig } from '@/lib/study/config';
import { cleanup } from '@/lib/study/repository';
import { studyErrorResponse } from '@/lib/study/errors';
import type { AuthContext } from '@/lib/auth';
import { connection } from 'next/server';

export async function GET(request: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ code: 'UNAUTHORIZED', error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const context: AuthContext = {
      userId: 'internal-cleanup', email: 'internal@localhost', role: 'admin',
      permissions: ['study:participate', 'invitations:manage', 'combinations:manage', 'study-data:read', 'study-data:export'],
      demo: getStudyConfig().demoMode,
    };
    return Response.json({ data: await cleanup(context) });
  } catch (cause) {
    return studyErrorResponse(cause);
  }
}
