/**
 * Next.js NextURL rewrites nested 127.x.x.x, [::1], and localhost across
 * String(url) before WHATWG parsing (next/dist/server/web/next-url.js).
 * NextRequest.url is that rewritten string unless a normalize flag is set,
 * so authorize must not read redirect_uri from req.nextUrl / req.url.
 *
 * The Fetch Request URL (Request.prototype.url) is the constructor target
 * before NextURL runs. Token exchange still requires exact redirect_uri.
 */

export function fetchRequestHref(req: Request): string {
  const getter = Object.getOwnPropertyDescriptor(Request.prototype, 'url')?.get;
  if (getter) {
    try {
      const href = getter.call(req);
      if (typeof href === 'string' && href.length > 0) return href;
    } catch {
      // Fall through to the instance url getter.
    }
  }
  return req.url;
}

export function oauthRequestUrl(req: Request): URL {
  return new URL(fetchRequestHref(req));
}

export function oauthSearchParams(req: Request): URLSearchParams {
  return oauthRequestUrl(req).searchParams;
}

/** Path and query for /login?from=, taken from the unnormalized request target. */
export function oauthSignInFromTarget(req: Request): string {
  const url = oauthRequestUrl(req);
  return `${url.pathname}${url.search}`;
}

/** Browser Location search is the received login URL; NextURL may have rewritten useSearchParams. */
export function loginCallbackFromSearch(search: string | URLSearchParams): string {
  const params =
    typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search;
  const from = params.get('from') || params.get('next');
  if (params.get('invite') === '1') return from || '/invite/complete';
  return from || '/';
}
