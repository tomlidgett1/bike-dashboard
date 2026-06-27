// Brand x place hub (e.g. /brands/orbea/melbourne).
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadAgentPage, loadListingsForPage, agentRouteMetadata } from '@/lib/seo/agent-pages';
import { SeoLanding } from '@/components/seo/seo-landing';

export const revalidate = 600;

type Params = Promise<{ brand: string; place: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { brand, place } = await params;
  return agentRouteMetadata(`/brands/${brand}/${place}`);
}

export default async function Page({ params }: { params: Params }) {
  const { brand, place } = await params;
  const page = await loadAgentPage(`/brands/${brand}/${place}`);
  if (!page) notFound();
  const listings = await loadListingsForPage(page);
  return <SeoLanding page={page} listings={listings} />;
}
