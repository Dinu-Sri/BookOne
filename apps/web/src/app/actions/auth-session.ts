'use server';

import { signOut } from '@bookone/auth';

export async function signOutCurrentUser() {
  await signOut({ redirectTo: '/login' });
}
