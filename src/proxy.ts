import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { getStudyConfig, isClerkConfigured } from '@/lib/study/config';
import { roleFromClaims } from '@/lib/auth/roles';
import { getDb, isDbConfigured } from '@/lib/db';

function isPublicRoute(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  return pathname.startsWith('/sign-in')
    || pathname.startsWith('/privacy')
    || pathname === '/api/internal/study-cleanup';
}

/** The home page is the participant flow; admins go straight to the dashboard unless previewing it. */
function isParticipantHome(request: NextRequest) {
  return request.nextUrl.pathname === '/'
    && request.nextUrl.searchParams.get('preview') !== 'participant';
}

async function isAdmin(userId: string, sessionClaims: unknown) {
  if (roleFromClaims(sessionClaims) === 'admin') return true;
  if (!isDbConfigured) return false;
  const rows = await getDb()`SELECT role FROM app_users WHERE id = ${userId} LIMIT 1;`;
  return rows[0]?.role === 'admin';
}

const configuredMiddleware = isClerkConfigured() ? clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return;
  const { userId, sessionClaims } = await auth.protect();
  if (isParticipantHome(request) && await isAdmin(userId, sessionClaims)) {
    return NextResponse.redirect(new URL('/admin', request.url));
  }
}) : null;

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (configuredMiddleware) return configuredMiddleware(request, event);
  if (getStudyConfig().demoMode) return NextResponse.next();
  return NextResponse.json(
    { code: 'AUTH_NOT_CONFIGURED', error: 'Authentication is not configured.' },
    { status: 503 },
  );
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
};
