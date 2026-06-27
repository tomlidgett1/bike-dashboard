// Category x place hub (e.g. /bikes/road-bikes/melbourne, /bikes/electric-bikes/camberwell).
// Renders only when the agent has published an seo_pages row for this URL.
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadAgentPage, loadListingsForPage, agentRouteMetadata } from '@/lib/seo/agent-pages';
import { SeoLanding } from '@/components/seo/seo-landing';

export const revalidate = 600;

type Params = Promise<{ category: string; place: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { category, place } = await params;
  return agentRouteMetadata(`/bikes/${category}/${place}`);
}

export default async function Page({ params }: { params: Params }) {
  const { category, place } = await params;
  const page = await loadAgentPage(`/bikes/${category}/${place}`);
  if (!page) notFound();
  const listings = await loadListingsForPage(page);
  return <SeoLanding page={page} listings={listings} />;
}
