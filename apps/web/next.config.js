/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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