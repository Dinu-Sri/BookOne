/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  serverExternalPackages: ['bcryptjs', 'postgres'],
  // Intentionally NO global no-cache headers: Cloudflare's edge cache was
  // caching stale HTML that referenced deleted JS chunks, which caused the
  // "Unexpected token '<'" errors. We let Next.js send its own Cache-Control
  // (immutable for _next/static, short max-age for HTML) and rely on the
  // build stamp in the HTML to force a fresh fetch when the deploy changes.
};

module.exports = nextConfig;
