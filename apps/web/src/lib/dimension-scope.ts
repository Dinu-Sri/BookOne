import { inArray, isNull, or } from '@bookone/db';
import { inDimensionScope, type DimensionScope } from '@bookone/auth';
import type { AnyColumn, SQL } from 'drizzle-orm';
import { getMyAccess } from '@/lib/access';

export async function currentDimensionScope(): Promise<DimensionScope> {
  const access = await getMyAccess();
  return {
    locationIds: access?.locationIds ?? null,
    brandIds: access?.brandIds ?? null,
  };
}

export function columnInScope(column: AnyColumn, ids: string[] | null): SQL | undefined {
  if (!ids || ids.length === 0) return undefined;
  return or(isNull(column), inArray(column, ids));
}

export async function assertDimensionScope(dims: { locationId?: string | null; brandId?: string | null }): Promise<void> {
  const scope = await currentDimensionScope();
  if (!inDimensionScope(scope, dims)) {
    throw new Error('You can only work in your assigned shops.');
  }
}
