import Link from "next/link";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { productSlugId } from "@/lib/seo/site";

// Server-rendered product grid for the marketing hubs — plain links + <img> so
// the product names, prices and slug URLs are all in the crawlable HTML.

function formatAUD(price: number | null | undefined): string | null {
  if (price == null) return null;
  const n = typeof price === "number" ? price : parseFloat(String(price));
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function UsedGrid({ products }: { products: MarketplaceProduct[] }) {
  if (products.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => {
        const name = p.display_name || p.description || "Used bike";
        const href = `/marketplace/product/${productSlugId(p.id, name)}`;
        const price = formatAUD(p.price);
        const img = p.primary_image_url || p.card_url;
        return (
          <Link
            key={p.id}
            href={href}
            className="group block overflow-hidden rounded-[16px] border border-black/[0.07] bg-white transition-shadow hover:shadow-sm"
          >
            <div className="aspect-square overflow-hidden bg-[#f2f1ee]">
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img}
                  alt={name}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                />
              ) : null}
            </div>
            <div className="p-3">
              <p className="truncate text-[13px] font-medium text-zinc-900">{name}</p>
              {price ? <p className="mt-0.5 text-[13px] text-zinc-500">{price}</p> : null}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
