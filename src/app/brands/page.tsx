import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SeoHub } from '@/components/seo/seo-hub';
import { listPublishedPages } from '@/lib/seo/agent-pages';
import { SITE_NAME } from '@/lib/seo/site';

export const revalidate = 600;

export function generateMetadata(): Metadata {
  const title = 'Cycling Brands in Melbourne';
  const description =
    'Shop cycling brands available in Melbourne on Yellow Jersey — bikes, components and accessories from local bike shops and riders.';
  return {
    title,
    description,
    alternates: { canonical: '/brands' },
    openGraph: { type: 'website', title: `${title} · ${SITE_NAME}`, description, url: '/brands' },
  };
}

export default async function BrandsHub() {
  const brands = await listPublishedPages(['brand_city'], 200);
  if (brands.length === 0) notFound();
  return (
    <SeoHub
      url="/brands"
      h1="Cycling Brands in Melbourne"
      intro="Shop cycling brands available in Melbourne — bikes, components and accessories from local bike shops and riders, with delivery or local pickup."
      sections={[{ heading: 'Shop by brand', items: brands }]}
    />
  );
}
