import { auth } from './auth';
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
    return NextResponse.redirect(new URL('/login', request.url));
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
