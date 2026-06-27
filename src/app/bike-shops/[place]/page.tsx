// Bike-shop directory by place (e.g. /bike-shops/melbourne, /bike-shops/camberwell).
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadAgentPage, loadListingsForPage, agentRouteMetadata } from '@/lib/seo/agent-pages';
import { SeoLanding } from '@/components/seo/seo-landing';

export const revalidate = 600;

type Params = Promise<{ place: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { place } = await params;
  return agentRouteMetadata(`/bike-shops/${place}`);
}

export default async function Page({ params }: { params: Params }) {
  const { place } = await params;
  const page = await loadAgentPage(`/bike-shops/${place}`);
  if (!page) notFound();
  const listings = await loadListingsForPage(page);
  return <SeoLanding page={page} listings={listings} />;
}
