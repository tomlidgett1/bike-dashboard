// Server-rendered landing page for the agent's published SEO surfaces. No client
// JS — everything Google needs (H1, copy, live listings, FAQs, internal links,
// JSON-LD) is in the server HTML.
import Link from 'next/link';
import { MarketingShell } from '@/components/marketing/marketing-chrome';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbSchema, itemListSchema, faqSchema } from '@/lib/seo/structured-data';
import { absoluteUrl, productPath, productSlugId, SITE_NAME } from '@/lib/seo/site';
import type { AgentPage } from '@/lib/seo/agent-pages';
import type { MarketplaceProduct } from '@/lib/types/marketplace';

const aud = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);

function sectionFor(page: AgentPage): { name: string; url: string } {
  switch (page.page_type) {
    case 'brand_city':
      return { name: 'Brands', url: '/marketplace' };
    case 'store_directory':
    case 'owned_store':
      return { name: 'Bike Shops', url: '/bike-shops/melbourne' };
    default:
      return { name: 'Marketplace', url: '/marketplace' };
  }
}

function ListingCard({ product }: { product: MarketplaceProduct }) {
  const name = product.display_name || product.description || 'Bike for sale';
  const href = productPath(productSlugId(product.id, name));
  const price = typeof product.price === 'number' ? product.price : Number(product.price);
  const img = product.primary_image_url && /^https?:\/\//i.test(product.primary_image_url) ? product.primary_image_url : null;
  return (
    <Link href={href} className="group block overflow-hidden rounded-lg border border-gray-200 bg-white transition hover:shadow-md">
      <div className="aspect-square w-full overflow-hidden bg-gray-50">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={name} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-300">No image</div>
        )}
      </div>
      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-medium text-gray-900">{name}</h3>
        {Number.isFinite(price) && price > 0 && <p className="mt-1 text-sm font-semibold text-gray-700">{aud(price)}</p>}
        {product.store_name && <p className="mt-0.5 text-xs text-gray-500">{product.store_name}</p>}
      </div>
    </Link>
  );
}

export function SeoLanding({ page, listings }: { page: AgentPage; listings: MarketplaceProduct[] }) {
  const content = page.content ?? {};
  const section = sectionFor(page);
  const h1 = page.h1 || page.title || 'Yellow Jersey';

  const schemas: Record<string, unknown>[] = [
    breadcrumbSchema([
      { name: SITE_NAME, url: absoluteUrl('/') },
      { name: section.name, url: absoluteUrl(section.url) },
      { name: h1, url: absoluteUrl(page.url) },
    ]),
  ];
  if (listings.length) {
    schemas.push(
      itemListSchema(
        listings.map((p) => ({
          url: absoluteUrl(productPath(productSlugId(p.id, p.display_name || p.description || 'bike'))),
          name: p.display_name || p.description || 'Bike for sale',
        })),
      ),
    );
  }
  if (content.faqs?.length) schemas.push(faqSchema(content.faqs));
  // Page-specific JSON-LD authored into the row (e.g. Service/LocalBusiness on
  // the /bike-service pages). Stored as JSON strings; skip anything unparsable.
  for (const raw of content.schema ?? []) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') schemas.push(parsed);
    } catch {
      // ignore malformed schema strings
    }
  }

  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6">
      <JsonLd data={schemas} />

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-gray-500">
        <Link href="/" className="hover:underline">{SITE_NAME}</Link>
        <span className="mx-1.5">/</span>
        <Link href={section.url} className="hover:underline">{section.name}</Link>
        <span className="mx-1.5">/</span>
        <span className="text-gray-700">{h1}</span>
      </nav>

      {/* Hero */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{h1}</h1>
        {content.intro && <p className="mt-3 max-w-3xl text-lg text-gray-600">{content.intro}</p>}
      </header>

      {/* Live listings */}
      {listings.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-xl font-semibold text-gray-900">Available now</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {listings.map((p) => <ListingCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      {/* Content blocks */}
      {content.blocks && content.blocks.length > 0 && (
        <section className="mb-12 grid gap-6 sm:grid-cols-2">
          {content.blocks.map((b, i) => (
            <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-5">
              <h2 className="mb-2 text-lg font-semibold text-gray-900">{b.heading}</h2>
              <p className="text-gray-600">{b.body}</p>
            </div>
          ))}
        </section>
      )}

      {/* FAQs */}
      {content.faqs && content.faqs.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-xl font-semibold text-gray-900">Frequently asked questions</h2>
          <dl className="space-y-4">
            {content.faqs.map((f, i) => (
              <div key={i} className="rounded-lg border border-gray-100 p-4">
                <dt className="font-medium text-gray-900">{f.q}</dt>
                <dd className="mt-1 text-gray-600">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Internal links */}
      {content.internal_links && content.internal_links.length > 0 && (
        <section className="border-t border-gray-100 pt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Explore more</h2>
          <ul className="flex flex-wrap gap-2">
            {content.internal_links.map((l, i) => (
              <li key={i}>
                <Link href={l.url} className="inline-block rounded-full border border-gray-200 px-3 py-1 text-sm text-gray-700 hover:border-gray-400 hover:text-gray-900">
                  {l.anchor}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </MarketingShell>
  );
}
