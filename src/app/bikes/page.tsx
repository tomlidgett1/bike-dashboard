import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SeoHub } from '@/components/seo/seo-hub';
import { listPublishedPages } from '@/lib/seo/agent-pages';
import { SITE_NAME } from '@/lib/seo/site';

export const revalidate = 600;

export function generateMetadata(): Metadata {
  const title = 'Bikes, Parts & Cycling Gear in Melbourne';
  const description =
    'Browse bikes, parts and cycling gear by category in Melbourne on Yellow Jersey — helmets, wheels, pedals, lights and more from local bike shops and riders.';
  return {
    title,
    description,
    alternates: { canonical: '/bikes' },
    openGraph: { type: 'website', title: `${title} · ${SITE_NAME}`, description, url: '/bikes' },
  };
}

export default async function BikesHub() {
  const cats = await listPublishedPages(['marketplace_category', 'suburb_category'], 200);
  if (cats.length === 0) notFound();
  return (
    <SeoHub
      url="/bikes"
      h1="Bikes & Cycling Gear in Melbourne"
      intro="Browse every category of bikes, parts and cycling gear available in Melbourne — from local bike shops and riders, with delivery or local pickup."
      sections={[{ heading: 'Shop by category', items: cats }]}
    />
  );
}
