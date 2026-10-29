'use server';

import { cookies } from 'next/headers';
import { signOut } from '@bookone/auth';

const SESSION_COOKIE_NAMES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
  'better-auth.session_token.sig',
  '__Secure-better-auth.session_token.sig',
];

function expireSessionCookie(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  name: string,
  extras: { secure?: boolean; httpOnly?: boolean },
) {
  cookieStore.set(name, '', {
    path: '/',
    maxAge: 0,
    expires: new Date(0),
    sameSite: 'lax',
    ...extras,
  });
}

export async function signOutCurrentUser() {
  const cookieStore = await cookies();
  // Expire both Secure and host-only session cookies with HttpOnly so a leftover
  // session_token is not kept beside an empty non-HttpOnly twin.
  for (const name of SESSION_COOKIE_NAMES) {
    cookieStore.delete(name);
    expireSessionCookie(cookieStore, name, { httpOnly: true });
    expireSessionCookie(cookieStore, name, { httpOnly: true, secure: true });
  }
  await signOut({ redirectTo: '/login' });
}
