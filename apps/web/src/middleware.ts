import { NextResponse, type NextRequest } from 'next/server';

// IMPORTANT:
// This middleware is intentionally a *local* file inside apps/web/, not a
// re-export from @bookone/auth. When middleware is re-exported across a
// workspace boundary in Next.js 15, the `config.matcher` regex is sometimes
// dropped during bundling, which causes the middleware to fire on
// `/_next/static/*` and redirect every JS chunk to /login.

// We intentionally use a minimal cookie check inline (no auth server call)
// so database/auth dependencies do not leak into the Edge runtime bundle.
const SESSION_COOKIE_NAMES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
];

function hasSessionCookie(req: NextRequest): boolean {
  const cookies = req.cookies;
  return SESSION_COOKIE_NAMES.some((name) => cookies.has(name));
}

function isPublicPath(pathname: string): boolean {
  if (pathname === '/login') return true;
  // Public product docs + docs search API (no session required).
  if (pathname === '/docs' || pathname.startsWith('/docs/')) return true;
  if (pathname === '/api/search') return true;
  // E2E console + runner APIs (no session; credentials entered for the test run only).
  if (pathname === '/e2e' || pathname.startsWith('/e2e/')) return true;
  if (pathname === '/api/e2e' || pathname.startsWith('/api/e2e/')) return true;
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthed = hasSessionCookie(request);

  // Dedicated E2E service host (e.g. bookone-e2e.clossyan.com) — keep /e2e on ERP as shortcut
  const e2ePublic =
    process.env.E2E_PUBLIC_URL || process.env.NEXT_PUBLIC_E2E_URL || '';
  if (
    e2ePublic &&
    (pathname === '/e2e' || pathname.startsWith('/e2e/'))
  ) {
    // Leave API on this host for backward compat only if path is /api/e2e
    // Redirect console UI to standalone runner
    if (pathname === '/e2e' || pathname === '/e2e/') {
      return NextResponse.redirect(e2ePublic.replace(/\/$/, '') + '/');
    }
  }

  // Unauthenticated users may only access public routes.
  if (!isAuthed && !isPublicPath(pathname)) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('from', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated users hitting /login bounce to home.
  if (isAuthed && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Exclude Next.js internals, the auth API routes, and static assets.
  // Order of alternation matters: more specific prefixes first.
  matcher: [
    // Exclude Next internals, auth API, and static public assets.
    // /docs and /api/search are public (handled in isPublicPath).
    '/((?!_next/static|_next/image|favicon.ico|favicon.webp|logo.webp|api/auth|products/).*)',
  ],
};
