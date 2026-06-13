import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo/site';

// Served at /robots.txt. Allows the public marketplace surface (storefronts,
// product pages, category pages, the discovery feed) and blocks everything
// behind auth or that is internal/transactional. Points crawlers at the sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin',
          '/dev',
          '/onboarding',
          '/settings',
          '/messages',
          '/upload',
          '/sync-inventory',
          '/optimize',
          '/products', // internal product editor (public product pages live under /marketplace/product)
          '/connect-lightspeed',
          '/auth',
          '/login',
          '/mockup',
          '/test-cards',
          '/test-card-designs',
          '/test-panels',
          '/v2',
          '/preview-verify',
          '/marketplace/checkout',
          '/marketplace/purchases',
          '/marketplace/settings',
          '/marketplace/sell',
          '/marketplace/sell-prototypes',
          '/marketplace/sell-redesign',
          '/marketplace/mobile-prototypes',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
