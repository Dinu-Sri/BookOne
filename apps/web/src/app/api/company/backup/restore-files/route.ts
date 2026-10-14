import { NextResponse } from 'next/server';
import { MAX_FILES_UPLOAD_BYTES } from '@bookone/db';
import {
  commitFilesRestoreUpload,
  initFilesRestoreUpload,
  putFilesRestoreChunk,
  restoreTenantFilesArchiveFromUpload,
} from '@/lib/tenant-archive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function fail(result: { ok: false; error: string }) {
  const denied = /permission/i.test(result.error);
  return NextResponse.json(result, { status: denied ? 403 : 400 });
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Choose an attachments pack to restore.' },
      { status: 400 },
    );
  }

  const action = String(form.get('action') ?? '');
  if (action === 'init') {
    const totalBytes = Number(form.get('totalBytes') ?? 0);
    const chunkCount = Number(form.get('chunkCount') ?? 0);
    const result = await initFilesRestoreUpload(totalBytes, chunkCount);
    if (!result.ok) return fail(result);
    return NextResponse.json(result);
  }
  if (action === 'chunk') {
    const sessionId = String(form.get('sessionId') ?? '');
    const index = Number(form.get('index') ?? -1);
    const uploaded = form.get('chunk');
    let chunk: Buffer | null = null;
    if (uploaded && typeof uploaded === 'object' && 'arrayBuffer' in uploaded) {
      chunk = Buffer.from(await (uploaded as File).arrayBuffer());
    }
    if (!chunk?.length) {
      return NextResponse.json(
        { ok: false, error: 'That attachments pack is damaged or incomplete.' },
        { status: 400 },
      );
    }
    const result = await putFilesRestoreChunk(sessionId, index, chunk);
    if (!result.ok) return fail(result);
    return NextResponse.json(result);
  }
  if (action === 'commit') {
    const sessionId = String(form.get('sessionId') ?? '');
    const password = String(form.get('password') ?? '');
    const result = await commitFilesRestoreUpload(sessionId, password);
    if (!result.ok) return fail(result);
    return NextResponse.json(result);
  }

  const password = String(form.get('password') ?? '');
  const uploaded = form.get('file');
  let file: Buffer | null = null;
  if (uploaded && typeof uploaded === 'object' && 'arrayBuffer' in uploaded) {
    const blob = uploaded as File;
    if (blob.size > MAX_FILES_UPLOAD_BYTES) {
      return NextResponse.json(
        { ok: false, error: 'That attachments pack is too large to restore.' },
        { status: 400 },
      );
    }
    file = Buffer.from(await blob.arrayBuffer());
  }
  if (!file?.length) {
    return NextResponse.json(
      { ok: false, error: 'Choose an attachments pack to restore.' },
      { status: 400 },
    );
  }
  const result = await restoreTenantFilesArchiveFromUpload(file, password);
  if (!result.ok) return fail(result);
  return NextResponse.json(result);
}
