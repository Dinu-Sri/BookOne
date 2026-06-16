import { auth } from './auth';
import { withTenantContext } from '@bookone/db';
import { NextResponse, type NextRequest } from 'next/server';

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.webp|logo.webp|design-system).*)',
  ],
};

export async function middleware(request: NextRequest) {
  const session = await auth();
  const { pathname } = request.nextUrl;

  if (!session?.user && pathname !== '/login') {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (session?.user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const response = NextResponse.next();

  if (session?.user?.tenantId) {
    response.headers.set('x-tenant-id', session.user.tenantId);
  }

  return response;
}

export async function withAuth(request: NextRequest, handler: () => Promise<Response>): Promise<Response> {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return withTenantContext(session.user.tenantId, handler);
}
