import Link from "next/link";
import { listPublishedPages, type PageLink } from "@/lib/seo/agent-pages";

const SEO_SECTIONS = [
  {
    id: "categories",
    title: "Shop by category",
    hubHref: "/bikes",
    hubLabel: "All categories",
    types: ["marketplace_category", "suburb_category"] as const,
    limit: 24,
  },
  {
    id: "brands",
    title: "Shop by brand",
    hubHref: "/brands",
    hubLabel: "All brands",
    types: ["brand_city"] as const,
    limit: 24,
  },
  {
    id: "shops",
    title: "Bike shops near you",
    hubHref: "/bike-shops",
    hubLabel: "All bike shops",
    types: ["store_directory", "owned_store"] as const,
    limit: 24,
  },
  {
    id: "blog",
    title: "From the blog",
    hubHref: "/blog",
    hubLabel: "All articles",
    types: ["blog"] as const,
    limit: 8,
  },
] as const;

/** How many links are visible before the "+N more" expander. */
const VISIBLE_LINKS = 6;

function SeoLinkColumn({
  title,
  hubHref,
  hubLabel,
  items,
}: {
  title: string;
  hubHref: string;
  hubLabel: string;
  items: PageLink[];
}) {
  if (items.length === 0) return null;

  const visible = items.slice(0, VISIBLE_LINKS);
  const overflow = items.slice(VISIBLE_LINKS);

  const linkClassName =
    "block truncate text-sm text-gray-500 transition-colors hover:text-gray-900";

  return (
    <nav aria-label={title}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-900">
        {title}
      </p>
      <ul className="mt-4 space-y-2.5">
        {visible.map((page) => (
          <li key={page.url}>
            <Link href={page.url} className={linkClassName}>
              {page.h1 || page.title}
            </Link>
          </li>
        ))}
      </ul>
      {overflow.length > 0 && (
        // Native details keeps the overflow links in server HTML for crawlers
        <details className="group mt-2.5">
          <summary className="cursor-pointer list-none text-sm text-gray-400 transition-colors hover:text-gray-600 [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">+{overflow.length} more</span>
            <span className="hidden group-open:inline">Show less</span>
          </summary>
          <ul className="mt-2.5 space-y-2.5">
            {overflow.map((page) => (
              <li key={page.url}>
                <Link href={page.url} className={linkClassName}>
                  {page.h1 || page.title}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="mt-3">
        <Link
          href={hubHref}
          className="text-sm font-medium text-gray-700 underline-offset-4 transition-colors hover:text-gray-900 hover:underline"
        >
          {hubLabel} →
        </Link>
      </p>
    </nav>
  );
}

/** Collapsible SEO internal-link sections. All links stay in server HTML for crawlers. */
export async function SiteFooterSeoSections() {
  const sections = await Promise.all(
    SEO_SECTIONS.map(async (section) => ({
      ...section,
      items: await listPublishedPages([...section.types], section.limit),
    })),
  );

  const visible = sections.filter((section) => section.items.length > 0);
  if (visible.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
      {visible.map((section) => (
        <SeoLinkColumn
          key={section.id}
          title={section.title}
          hubHref={section.hubHref}
          hubLabel={section.hubLabel}
          items={section.items}
        />
      ))}
    </div>
  );
}
