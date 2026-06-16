/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  serverExternalPackages: ['bcryptjs', 'postgres'],
  async headers() {
    return [
      {
        source: '/((?!_next/static|_next/image|favicon).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
