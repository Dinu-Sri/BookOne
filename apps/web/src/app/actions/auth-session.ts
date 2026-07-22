'use server';

import { cookies } from 'next/headers';
import { signOut } from '@bookone/auth';

const SESSION_COOKIE_NAMES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
  'better-auth.session_token.sig',
  '__Secure-better-auth.session_token.sig',
];

export async function signOutCurrentUser() {
  const cookieStore = await cookies();
  // Delete with path so Secure / host-only variants are cleared for middleware.
  for (const name of SESSION_COOKIE_NAMES) {
    cookieStore.delete(name);
    cookieStore.set(name, '', { path: '/', maxAge: 0 });
    cookieStore.set(name, '', { path: '/', maxAge: 0, secure: true, sameSite: 'lax' });
  }
  await signOut({ redirectTo: '/login' });
}
