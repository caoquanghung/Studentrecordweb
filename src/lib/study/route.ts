import type { AuthContext } from '@/lib/auth';
import { connection } from 'next/server';
import { requirePermission } from '@/lib/auth';
import type { AppPermission } from '@/lib/auth/roles';
import { studyErrorResponse } from '@/lib/study/errors';
import { apiOk, enforceSameOrigin } from '@/lib/study/http';

export async function runApi<T>(
  request: Request,
  permission: AppPermission,
  mutation: boolean,
  operation: (context: AuthContext) => Promise<T>,
) {
  await connection();
  try {
    if (mutation) enforceSameOrigin(request);
    const context = await requirePermission(request, permission);
    return apiOk(await operation(context));
  } catch (cause) {
    return studyErrorResponse(cause);
  }
}
