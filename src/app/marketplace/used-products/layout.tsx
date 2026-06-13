import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/seo/site';

// The page itself is a client component, so its SEO metadata lives here in a
// server layout. (Server-rendering the grid for richer crawlable content is a
// fast-follow.)
export const metadata: Metadata = {
  title: 'Used bikes, parts & apparel for sale',
  description:
    'Buy quality used bikes, components and cycling gear from local riders and bike shops on Yellow Jersey. Every listing condition-rated — delivery or local pickup.',
  alternates: { canonical: '/marketplace/used-products' },
  openGraph: {
    title: `Used bikes, parts & apparel for sale · ${SITE_NAME}`,
    description:
      'Buy quality used bikes, components and cycling gear from local riders and bike shops on Yellow Jersey.',
    url: '/marketplace/used-products',
  },
};

export default function UsedProductsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
