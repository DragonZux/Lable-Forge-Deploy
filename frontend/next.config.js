const path = require('path');

/** @type {import('next').NextConfig} */
let withBundleAnalyzer;
try {
  withBundleAnalyzer = require('@next/bundle-analyzer')({
    enabled: process.env.ANALYZE === 'true',
  });
} catch {
  // Optional dependency not installed; fallback to identity function
  withBundleAnalyzer = (config) => config;
}

/** @type {import('next').NextConfig} */
const apiRewriteDestination = (
  process.env.INTERNAL_API_URL || 'http://127.0.0.1:8888/api'
).replace(/\/$/, '');

const allowedDevOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = withBundleAnalyzer({
  output: 'standalone',
  turbopack: {
    root: path.join(__dirname, '.'),
  },
  reactStrictMode: true,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiRewriteDestination}/:path*`,
      },
    ];
  },
  allowedDevOrigins,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
});

module.exports = nextConfig;
