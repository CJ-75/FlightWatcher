import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@waypop/shared'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'thumb.wikimedia.org' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.waypop.co' },
    ],
  },
  // Prefer fra1 on Vercel project settings (not settable only here).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
        ],
      },
    ]
  },
}

export default nextConfig
