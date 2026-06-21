import 'server-only';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './auth';

export async function signOut(options?: { redirectTo?: string }) {
  await auth.api.signOut({ headers: await headers() });
  if (options?.redirectTo) {
    redirect(options.redirectTo);
  }
}
