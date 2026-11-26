import { db, sql } from '@bookone/db';

/**
 * Serialise number allocation for one tenant/series until the current
 * transaction ends (QA-1126-17). Concurrent postings used `count(*) + 1` and
 * received the same invoice number and customer code.
 */
export async function lockNumberSeries(key: string): Promise<void> {
  await db().execute(sql`select pg_advisory_xact_lock(hashtextextended(${`numbering:${key}`}, 0))`);
}

export { firstFreeNumber } from './first-free-number';
