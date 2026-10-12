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
  if (pathname === '/i' || pathname.startsWith('/i/')) return true;
  if (pathname === '/invite' || pathname.startsWith('/invite/')) return true;
  // Public product docs + docs search API (no session required).
  if (pathname === '/docs' || pathname.startsWith('/docs/')) return true;
  if (pathname === '/api/search') return true;
  if (pathname === '/ops/logs' || pathname.startsWith('/ops/logs')) return true;
  if (pathname === '/api/ops' || pathname.startsWith('/api/ops/')) return true;
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthed = hasSessionCookie(request);
  const host = (request.headers.get('host') || '').toLowerCase().split(':')[0];

  // If a docs hostname hits the ERP container, Cloudflare is mis-routed.
  const docsHost = (process.env.DOCS_HOST || 'bookone-docs.clossyan.com').toLowerCase();
  if (host === docsHost || host.startsWith('bookone-docs.')) {
    // Should be rare if docs service is up; helps diagnose tunnel → web mis-route
    if (pathname === '/' || pathname === '') {
      return NextResponse.redirect(new URL('/docs', request.url));
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

  // Do not bounce /login → / here. If home/session is broken, that loop
  // becomes ERR_TOO_MANY_REDIRECTS. The login page can send signed-in users on.

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-bookone-pathname', pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
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
