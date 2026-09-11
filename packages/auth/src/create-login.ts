import 'server-only';

import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { pgClient } from '@bookone/db';

export async function createCredentialLogin(opts: {
  email: string;
  name: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = opts.email.toLowerCase().trim();
  const name = opts.name.trim();
  const password = opts.password;
  if (!email || !email.includes('@')) return { ok: false, error: 'Enter a valid email.' };
  if (!name) return { ok: false, error: 'Enter their name.' };
  if (password.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };

  const existing = await pgClient()`
    SELECT id FROM auth_users WHERE lower(email) = ${email} LIMIT 1
  `;
  if (existing.length > 0) {
    return { ok: false, error: 'That email already has a BookOne login. Use an invite link instead.' };
  }

  const authUserId = randomUUID();
  const hashed = await hashPassword(password);
  await pgClient()`
    INSERT INTO auth_users (id, name, email, "emailVerified", "createdAt", "updatedAt")
    VALUES (${authUserId}, ${name}, ${email}, TRUE, NOW(), NOW())
  `;
  await pgClient()`
    INSERT INTO auth_accounts (id, "userId", "accountId", "providerId", password, "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${authUserId}, ${authUserId}, 'credential', ${hashed}, NOW(), NOW())
  `;
  return { ok: true };
}

export async function setCredentialPassword(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = email.toLowerCase().trim();
  if (!normalized || !normalized.includes('@')) return { ok: false, error: 'Enter a valid email.' };
  if (password.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
  const authRows = await pgClient()`
    SELECT id FROM auth_users WHERE lower(email) = ${normalized} LIMIT 1
  `;
  if (authRows.length === 0) return { ok: false, error: 'That person does not have a login yet. Add them with a password first.' };
  const authUserId = String(authRows[0]!.id);
  const hashed = await hashPassword(password);
  const credentialRows = await pgClient()`
    SELECT id FROM auth_accounts
    WHERE "userId" = ${authUserId} AND "providerId" = 'credential'
    LIMIT 1
  `;
  if (credentialRows.length === 0) {
    await pgClient()`
      INSERT INTO auth_accounts (id, "userId", "accountId", "providerId", password, "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${authUserId}, ${authUserId}, 'credential', ${hashed}, NOW(), NOW())
    `;
  } else {
    await pgClient()`
      UPDATE auth_accounts
      SET password = ${hashed}, "updatedAt" = NOW()
      WHERE id = ${String(credentialRows[0]!.id)}
    `;
  }
  await pgClient()`
    UPDATE auth_users SET "emailVerified" = TRUE, "updatedAt" = NOW() WHERE id = ${authUserId}
  `;
  return { ok: true };
}
