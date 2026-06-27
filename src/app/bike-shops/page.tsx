import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SeoHub } from '@/components/seo/seo-hub';
import { listPublishedPages } from '@/lib/seo/agent-pages';
import { SITE_NAME } from '@/lib/seo/site';

export const revalidate = 600;

export function generateMetadata(): Metadata {
  const title = 'Bike Shops in Melbourne';
  const description =
    'Find local bike shops across Melbourne on Yellow Jersey — services, repairs, brands carried and live stock, by suburb.';
  return {
    title,
    description,
    alternates: { canonical: '/bike-shops' },
    openGraph: { type: 'website', title: `${title} · ${SITE_NAME}`, description, url: '/bike-shops' },
  };
}

export default async function BikeShopsHub() {
  const shops = await listPublishedPages(['store_directory', 'owned_store'], 200);
  if (shops.length === 0) notFound();
  return (
    <SeoHub
      url="/bike-shops"
      h1="Bike Shops in Melbourne"
      intro="Find local bike shops across Melbourne — the brands they carry, services and repairs they offer, and their live stock on Yellow Jersey."
      sections={[{ heading: 'Bike shops by area', items: shops }]}
    />
  );
}
