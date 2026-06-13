import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/seo/site';

// The page itself is a client component, so its SEO metadata lives here in a
// server layout. (Server-rendering the grid for richer crawlable content is a
// fast-follow.)
export const metadata: Metadata = {
  title: 'New bikes, parts & apparel',
  description:
    'Shop brand-new bikes, components and cycling apparel from independent bike shops on Yellow Jersey. Fresh stock added daily — delivery or local pickup.',
  alternates: { canonical: '/marketplace/new-products' },
  openGraph: {
    title: `New bikes, parts & apparel · ${SITE_NAME}`,
    description:
      'Shop brand-new bikes, components and cycling apparel from independent bike shops on Yellow Jersey.',
    url: '/marketplace/new-products',
  },
};

export default function NewProductsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
