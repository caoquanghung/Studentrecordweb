import 'server-only';

import { auth, clerkClient } from '@clerk/nextjs/server';
import { getDb, isDbConfigured } from '@/lib/db';
import { getStudyConfig, isClerkConfigured } from '@/lib/study/config';
import { StudyError } from '@/lib/study/errors';
import { hasPermission, permissionsForRole, roleFromClaims, type AppPermission } from '@/lib/auth/roles';
import type { AppRole } from '@/types/study';

export interface AuthContext {
  userId: string;
  email: string;
  role: AppRole;
  permissions: readonly AppPermission[];
  demo: boolean;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

async function configuredIdentity(): Promise<AuthContext> {
  const session = await auth();
  if (!session.userId) throw new StudyError(401, 'UNAUTHENTICATED', 'Sign in to continue.');

  const client = await clerkClient();
  const user = await client.users.getUser(session.userId);
  const primaryAddress = user.primaryEmailAddress
    ?? user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
  if (!primaryAddress || primaryAddress.verification?.status !== 'verified') {
    throw new StudyError(403, 'VERIFIED_EMAIL_REQUIRED', 'A verified primary email address is required.');
  }
  const primary = primaryAddress.emailAddress;

  let role = roleFromClaims(session.sessionClaims);
  if (isDbConfigured) {
    const sql = getDb();
    const rows = await sql`SELECT role FROM app_users WHERE id = ${session.userId} LIMIT 1;`;
    if (rows[0]?.role === 'admin') role = 'admin';
  }

  return {
    userId: session.userId,
    email: normalizeEmail(primary),
    role,
    permissions: permissionsForRole(role),
    demo: false,
  };
}

function demoIdentity(request: Request): AuthContext {
  const requestedRole = request.headers.get('x-studentweb-demo-role')
    ?? request.headers.get('cookie')?.match(/(?:^|;\s*)studentweb-demo-role=(admin|student)/)?.[1]
    ?? (new URL(request.url).pathname.startsWith('/api/admin/') ? 'admin' : process.env.STUDENTWEB_DEMO_ROLE);
  const role: AppRole = requestedRole === 'admin' ? 'admin' : 'student';
  const requestedEmail = request.headers.get('x-studentweb-demo-email');
  const email = normalizeEmail(requestedEmail || (role === 'admin' ? 'researcher.demo@example.com' : 'student.demo@example.com'));
  return {
    userId: role === 'admin' ? 'demo-admin' : 'demo-student',
    email,
    role,
    permissions: permissionsForRole(role),
    demo: true,
  };
}

export async function getAuthContext(request: Request): Promise<AuthContext> {
  const config = getStudyConfig();
  if (config.demoMode && (!isClerkConfigured() || !isDbConfigured)) return demoIdentity(request);
  if (!isClerkConfigured()) throw new StudyError(503, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured.');
  return configuredIdentity();
}

export async function requirePermission(request: Request, permission: AppPermission) {
  const context = await getAuthContext(request);
  if (!hasPermission(context.role, permission)) {
    throw new StudyError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
  }
  return context;
}
