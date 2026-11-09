import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { getStudyConfig, isClerkConfigured } from '@/lib/study/config';

function isPublicRoute(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  return pathname.startsWith('/sign-in')
    || pathname.startsWith('/privacy')
    || pathname === '/api/internal/study-cleanup';
}

const configuredMiddleware = isClerkConfigured() ? clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) await auth.protect();
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
