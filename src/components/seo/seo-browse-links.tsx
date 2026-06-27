// Drop-in internal-link footer. Rendered on the marketplace homepage (Yellow
// Jersey's highest-authority page) so Google discovers the agent's SEO pages by
// crawling links from a page it already visits daily — far faster than the
// sitemap alone. Server component; renders nothing until pages exist.
import Link from 'next/link';
import { listPublishedPages, type PageLink } from '@/lib/seo/agent-pages';

function Column({ title, hubHref, hubLabel, items }: { title: string; hubHref: string; hubLabel: string; items: PageLink[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-3 text-[13px] font-semibold text-gray-900">{title}</h3>
      <ul className="space-y-1.5">
        {items.slice(0, 12).map((p) => (
          <li key={p.url}>
            <Link href={p.url} className="text-[13px] text-gray-500 transition hover:text-gray-900">{p.h1 || p.title}</Link>
          </li>
        ))}
        <li>
          <Link href={hubHref} className="text-[13px] font-medium text-gray-700 hover:text-gray-900">{hubLabel} →</Link>
        </li>
      </ul>
    </div>
  );
}

export async function SeoBrowseLinks() {
  const [cats, brands, shops] = await Promise.all([
    listPublishedPages(['marketplace_category', 'suburb_category'], 24),
    listPublishedPages(['brand_city'], 24),
    listPublishedPages(['store_directory', 'owned_store'], 24),
  ]);
  if (cats.length + brands.length + shops.length === 0) return null;

  return (
    <section className="border-t border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-6">
        <h2 className="mb-8 text-sm font-semibold uppercase tracking-wide text-gray-500">Browse Yellow Jersey</h2>
        <div className="grid gap-8 sm:grid-cols-3">
          <Column title="Shop by category" hubHref="/bikes" hubLabel="All categories" items={cats} />
          <Column title="Shop by brand" hubHref="/brands" hubLabel="All brands" items={brands} />
          <Column title="Bike shops near you" hubHref="/bike-shops" hubLabel="All bike shops" items={shops} />
        </div>
      </div>
    </section>
  );
}
