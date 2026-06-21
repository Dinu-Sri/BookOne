'use server';

import { migrateLegacyCredentials } from '@bookone/auth';

export async function migrateLegacyLogin(email: string, password: string) {
  return migrateLegacyCredentials(email, password);
}
