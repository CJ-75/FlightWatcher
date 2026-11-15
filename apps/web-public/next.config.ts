import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@waypop/shared'],
  // Dev overlay only — never in production builds
  devIndicators: process.env.NODE_ENV === 'development' ? undefined : false,
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'thumb.wikimedia.org' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.waypop.co' },
    ],
  },
  // Prefer fra1 on Vercel project settings.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      {
        source: '/pop/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value:
              'public, s-maxage=86400, stale-while-revalidate=604800',
          },
        ],
      },
      {
        source: '/sitemaps/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value:
              'public, s-maxage=3600, stale-while-revalidate=86400',
          },
        ],
      },
    ]
  },
}

export default nextConfig
