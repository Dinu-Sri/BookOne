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
  for (const name of SESSION_COOKIE_NAMES) {
    cookieStore.delete(name);
  }
  await signOut({ redirectTo: '/login' });
}
