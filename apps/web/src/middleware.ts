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
  const host = (request.headers.get('host') || '').toLowerCase().split(':')[0];

  // If an E2E/docs hostname hits the ERP container, Cloudflare is mis-routed
  // (tunnel points at web:3100 instead of Traefik or the e2e/docs service).
  const e2eHost = (process.env.E2E_HOST || 'bookone-e2e.clossyan.com').toLowerCase();
  const docsHost = (process.env.DOCS_HOST || 'bookone-docs.clossyan.com').toLowerCase();
  if (host === e2eHost || host.startsWith('bookone-e2e.') || host.includes('-e2e.')) {
    return new NextResponse(
      [
        'BookOne routing error',
        '',
        `Host "${host}" reached the ERP (Next.js) container, not the E2E runner.`,
        'That is why you see a Next.js 404 — the Playwright UI is a separate service.',
        '',
        'Fix in Cloudflare Zero Trust → Tunnel → Public hostname:',
        `  ${e2eHost}`,
        '  Service type: HTTP',
        '  URL: http://e2e:3200',
        '  (or http://bookone-staging-e2e:3200 — use the e2e container/service name)',
        '',
        'Do NOT point the e2e hostname at web:3100 / bookone-staging-web.',
        'Docs can use http://docs:80 ; app uses http://web:3100 or Traefik:80.',
        '',
        'After saving the tunnel, hard-refresh the e2e URL.',
        'Health check: https://' + e2eHost + '/api/health  →  JSON with service bookone-e2e-runner',
      ].join('\n'),
      {
        status: 502,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      },
    );
  }
  if (host === docsHost || host.startsWith('bookone-docs.')) {
    // Should be rare if docs service is up; helps diagnose tunnel → web mis-route
    if (pathname === '/' || pathname === '') {
      return NextResponse.redirect(new URL('/docs', request.url));
    }
  }

  // Dedicated E2E service host (e.g. bookone-e2e.clossyan.com) — keep /e2e on ERP as shortcut
  const e2ePublic =
    process.env.E2E_PUBLIC_URL || process.env.NEXT_PUBLIC_E2E_URL || '';
  if (e2ePublic && (pathname === '/e2e' || pathname === '/e2e/')) {
    return NextResponse.redirect(e2ePublic.replace(/\/$/, '') + '/');
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
