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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthed = hasSessionCookie(request);

  // Unauthenticated users can only see /login.
  if (!isAuthed && pathname !== '/login') {
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
    // /api/search stays authenticated (docs require login).
    '/((?!_next/static|_next/image|favicon.ico|favicon.webp|logo.webp|api/auth|products/).*)',
  ],
};
