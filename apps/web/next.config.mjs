import { createMDX } from 'fumadocs-mdx/next';

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  serverExternalPackages: ['bcryptjs', 'postgres', 'sharp'],
  // Product photo uploads send the original image; server compresses to 400x400 WebP.
  // Default Server Action body limit is 1MB — too small for phone photos.
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
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
