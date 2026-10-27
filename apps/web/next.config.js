/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lint is a separate Turborepo task; Next's internal ESLint pass cannot
  // resolve the shared type-aware config and reports false positives.
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ['@cutbray/ui', '@cutbray/shared'],
  experimental: {
    optimizePackageImports: ['@cutbray/ui', 'lucide-react'],
  },
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '9000' },
      { protocol: 'https', hostname: '*.cloudflarestorage.com' },
    ],
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://localhost:3001/api/:path*' },
    ];
  },
};

module.exports = nextConfig;