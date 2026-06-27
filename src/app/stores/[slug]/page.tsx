// Owned / authorised store page (e.g. /stores/ashburton-cycles) — the flagship
// local SEO asset, backed by the store's real inventory + profile.
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadAgentPage, loadListingsForPage, agentRouteMetadata } from '@/lib/seo/agent-pages';
import { SeoLanding } from '@/components/seo/seo-landing';

export const revalidate = 600;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  return agentRouteMetadata(`/stores/${slug}`);
}

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  const page = await loadAgentPage(`/stores/${slug}`);
  if (!page) notFound();
  const listings = await loadListingsForPage(page);
  return <SeoLanding page={page} listings={listings} />;
}
