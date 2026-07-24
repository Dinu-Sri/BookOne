import { NextResponse } from 'next/server';
import { getBucketsCatalog } from '@/lib/e2e-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** List E2E buckets + presets for /e2e UI. */
export async function GET() {
  return NextResponse.json(getBucketsCatalog());
}
