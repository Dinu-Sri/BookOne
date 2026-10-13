import { NextResponse } from 'next/server';
import { restoreTenantArchiveFromUpload } from '@/lib/tenant-archive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_DATA_BYTES = 40 * 1024 * 1024;

export async function POST(req: Request) {
  let password = '';
  let file: Buffer | null = null;
  try {
    const form = await req.formData();
    password = String(form.get('password') ?? '');
    const uploaded = form.get('file');
    if (uploaded && typeof uploaded === 'object' && 'arrayBuffer' in uploaded) {
      const blob = uploaded as File;
      if (blob.size > MAX_DATA_BYTES) {
        return NextResponse.json(
          { ok: false, error: 'That data file is too large to restore in one upload.' },
          { status: 400 },
        );
      }
      file = Buffer.from(await blob.arrayBuffer());
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Choose a company data file to restore.' }, { status: 400 });
  }
  if (!file?.length) {
    return NextResponse.json({ ok: false, error: 'Choose a company data file to restore.' }, { status: 400 });
  }
  const result = await restoreTenantArchiveFromUpload(file, password);
  if (!result.ok) {
    const denied = /permission/i.test(result.error);
    return NextResponse.json(result, { status: denied ? 403 : 400 });
  }
  return NextResponse.json(result);
}
