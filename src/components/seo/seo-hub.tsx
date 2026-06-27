// Crawlable index/hub page (e.g. /bikes, /brands, /bike-shops). Lists every
// published leaf page so Google discovers them via internal links, not just the
// sitemap. Server-rendered inside the Yellow Jersey shell.
import Link from 'next/link';
import { MarketingShell } from '@/components/marketing/marketing-chrome';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbSchema, itemListSchema } from '@/lib/seo/structured-data';
import { absoluteUrl, SITE_NAME } from '@/lib/seo/site';
import type { PageLink } from '@/lib/seo/agent-pages';

export function SeoHub({
  h1,
  intro,
  url,
  sections,
}: {
  h1: string;
  intro: string;
  url: string;
  sections: Array<{ heading: string; items: PageLink[] }>;
}) {
  const all = sections.flatMap((s) => s.items);
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6">
        <JsonLd
          data={[
            breadcrumbSchema([
              { name: SITE_NAME, url: absoluteUrl('/') },
              { name: h1, url: absoluteUrl(url) },
            ]),
            itemListSchema(all.map((p) => ({ url: absoluteUrl(p.url), name: p.h1 || p.title || p.url }))),
          ]}
        />

        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-gray-500">
          <Link href="/" className="hover:underline">{SITE_NAME}</Link>
          <span className="mx-1.5">/</span>
          <span className="text-gray-700">{h1}</span>
        </nav>

        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{h1}</h1>
          <p className="mt-3 max-w-3xl text-lg text-gray-600">{intro}</p>
        </header>

        {sections.map((s, i) => (
          <section key={i} className="mb-10">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">{s.heading}</h2>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {s.items.map((p) => (
                <li key={p.url}>
                  <Link
                    href={p.url}
                    className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-800 transition hover:border-gray-400 hover:bg-gray-50"
                  >
                    <span>{p.h1 || p.title}</span>
                    {p.supply_count > 0 && <span className="ml-2 text-xs text-gray-400">{p.supply_count}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </MarketingShell>
  );
}
