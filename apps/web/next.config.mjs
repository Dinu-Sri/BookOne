import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMDX } from 'fumadocs-mdx/next';

function readAppVersion() {
  try {
    const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
    return readFileSync(join(root, 'VERSION'), 'utf8').trim();
  } catch {
    return '0.0.0';
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: readAppVersion(),
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  serverExternalPackages: ['bcryptjs', 'postgres', 'sharp', 'qrcode'],
  // Product photo uploads send the original image; server compresses to 400x400 WebP.
  // Tenant archive data restore uploads a .bookone-data file (cap 40 MB).
  // Attachments packs over 8 MB use chunked POST /api/company/backup/restore-files.
  experimental: {
    serverActions: {
      bodySizeLimit: '40mb',
    },
  },
  // Intentionally NO global no-cache headers: Cloudflare's edge cache was
  // caching stale HTML that referenced deleted JS chunks, which caused the
  // "Unexpected token '<'" errors. We let Next.js send its own Cache-Control
  // (immutable for _next/static, short max-age for HTML) and rely on the
  // build stamp in the HTML to force a fresh fetch when the deploy changes.
};

const withMDX = createMDX({
  configPath: 'source.config.ts',
});

export default withMDX(nextConfig);
