import { requireObject } from '@/lib/study/errors';
import { adminCreateInvitation, adminInvitations } from '@/lib/study/repository';
import { runApi } from '@/lib/study/route';
import { emailAddress } from '@/lib/study/validation';

export async function GET(request: Request) {
  return runApi(request, 'invitations:manage', false, adminInvitations);
}

export async function POST(request: Request) {
  return runApi(request, 'invitations:manage', true, async (context) => {
    const body = requireObject(await request.json());
    return adminCreateInvitation(context, emailAddress(body.email));
  });
}
