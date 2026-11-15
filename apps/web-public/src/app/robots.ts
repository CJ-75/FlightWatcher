import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  // Flag gating is middleware (/pop → SPA when off). Sitemap stays empty until cities open.
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/pop/'],
        disallow: ['/api/'],
      },
    ],
    sitemap: [
      'https://waypop.co/sitemap.xml',
      'https://waypop.co/sitemap-index.xml',
    ],
    host: 'https://waypop.co',
  }
}
