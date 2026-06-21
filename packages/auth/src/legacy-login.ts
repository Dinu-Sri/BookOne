import 'server-only';

import { randomUUID } from 'node:crypto';
import { compare } from 'bcryptjs';
import { hashPassword } from 'better-auth/crypto';
import { and, db, eq, isNull, pgClient, users } from '@bookone/db';

export interface LegacyLoginMigrationResult {
  ok: boolean;
  error?: string;
}

export async function migrateLegacyCredentials(email: string, password: string): Promise<LegacyLoginMigrationResult> {
  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail || !password) return { ok: false, error: 'Email and password are required.' };

  const [legacyUser] = await db()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(and(eq(users.email, normalizedEmail), isNull(users.voidedAt)))
    .limit(1);

  if (!legacyUser || legacyUser.passwordHash === 'better-auth-managed') {
    return { ok: false, error: 'Invalid email or password.' };
  }

  let validLegacyPassword = false;
  try {
    validLegacyPassword = await compare(password, legacyUser.passwordHash);
  } catch {
    validLegacyPassword = false;
  }
  if (!validLegacyPassword) {
    return { ok: false, error: 'Invalid email or password.' };
  }

  const authRows = await pgClient()`
    SELECT id FROM auth_users WHERE lower(email) = ${normalizedEmail} LIMIT 1
  `;
  const authUserId = authRows[0]?.id ? String(authRows[0].id) : randomUUID();

  if (authRows.length === 0) {
    await pgClient()`
      INSERT INTO auth_users (id, name, email, "emailVerified", "createdAt", "updatedAt")
      VALUES (${authUserId}, ${legacyUser.name}, ${normalizedEmail}, TRUE, NOW(), NOW())
    `;
  } else {
    await pgClient()`
      UPDATE auth_users
      SET name = COALESCE(NULLIF(name, ''), ${legacyUser.name}),
          "emailVerified" = TRUE,
          "updatedAt" = NOW()
      WHERE id = ${authUserId}
    `;
  }

  const credentialRows = await pgClient()`
    SELECT id FROM auth_accounts
    WHERE "userId" = ${authUserId} AND "providerId" = 'credential'
    LIMIT 1
  `;
  const betterAuthPassword = await hashPassword(password);

  if (credentialRows.length === 0) {
    await pgClient()`
      INSERT INTO auth_accounts (id, "userId", "accountId", "providerId", password, "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${authUserId}, ${authUserId}, 'credential', ${betterAuthPassword}, NOW(), NOW())
    `;
  } else {
    await pgClient()`
      UPDATE auth_accounts
      SET password = ${betterAuthPassword}, "updatedAt" = NOW()
      WHERE id = ${String(credentialRows[0]!.id)}
    `;
  }

  return { ok: true };
}
