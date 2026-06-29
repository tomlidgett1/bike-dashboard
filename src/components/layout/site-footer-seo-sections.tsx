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

function SeoDetailsSection({
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

  return (
    <details className="group rounded-md border border-gray-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-gray-800 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="text-gray-400 transition-transform duration-200 group-open:rotate-90"
        >
          ›
        </span>
        <span>{title}</span>
        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-500">
          {items.length}
        </span>
      </summary>
      <div className="border-t border-gray-100 px-4 py-3">
        <p className="mb-2">
          <Link
            href={hubHref}
            className="text-xs font-medium text-gray-600 transition-colors hover:text-gray-900"
          >
            {hubLabel} →
          </Link>
        </p>
        <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((page) => (
            <li key={page.url}>
              <Link
                href={page.url}
                className="block truncate text-[13px] text-gray-500 transition-colors hover:text-gray-900"
              >
                {page.h1 || page.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </details>
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
    <nav aria-label="Browse Yellow Jersey" className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        Explore
      </p>
      {visible.map((section) => (
        <SeoDetailsSection
          key={section.id}
          title={section.title}
          hubHref={section.hubHref}
          hubLabel={section.hubLabel}
          items={section.items}
        />
      ))}
    </nav>
  );
}
