import { headers } from 'next/headers';
import { pickPublicOrigin } from './public-origin-core';

/**
 * Public origin for absolute links in the current request: the host the user
 * is on when it is a configured origin, else AUTH_URL. See public-origin-core.
 */
export async function publicOrigin(): Promise<string> {
  const h = await headers();
  return pickPublicOrigin(h.get('x-forwarded-host') ?? h.get('host'), process.env);
}
