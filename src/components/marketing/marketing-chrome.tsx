import Image from "next/image";
import Link from "next/link";

// Shared full-bleed marketing chrome (nav + canvas + footer) matching the
// home2 design language. Server component — these pages are SEO content and
// must render their text in the initial HTML.

const NAV_LINKS = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/blog", label: "Blog" },
  { href: "/sell-your-bike", label: "Sell your bike" },
  { href: "/used-bikes", label: "Used bikes" },
  { href: "/guides", label: "Guides" },
  { href: "/home2", label: "For shops" },
];

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen text-zinc-900" style={{ background: "#f7f7f4" }}>
      <header className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#f7f7f4]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1340px] items-center justify-between px-5 py-2.5 sm:px-6 sm:py-3">
          <Link href="/home2" aria-label="Yellow Jersey home">
            <Image src="/yjlogo.svg" alt="Yellow Jersey" width={138} height={20} className="h-5 w-auto" priority />
          </Link>
          <nav className="hidden items-center gap-7 text-[13px] text-zinc-600 md:flex">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="transition-colors hover:text-zinc-900">
                {l.label}
              </Link>
            ))}
            <Link href="/login" className="transition-colors hover:text-zinc-900">
              Sign in
            </Link>
          </nav>
          <Link
            href="/marketplace/sell"
            className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-zinc-800"
          >
            List your bike
          </Link>
        </div>
      </header>

      <main className="relative z-10">{children}</main>

      <footer className="border-t border-black/[0.06]">
        <div className="mx-auto flex max-w-[1340px] flex-col gap-4 px-5 py-10 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-zinc-500">
            <Link href="/marketplace" className="hover:text-zinc-900">Marketplace</Link>
            <Link href="/bikes" className="hover:text-zinc-900">Shop by category</Link>
            <Link href="/brands" className="hover:text-zinc-900">Brands</Link>
            <Link href="/bike-shops" className="hover:text-zinc-900">Bike shops</Link>
            <Link href="/marketplace/used-products" className="hover:text-zinc-900">Used bikes</Link>
            <Link href="/sell-your-bike" className="hover:text-zinc-900">Sell your bike</Link>
            <Link href="/blog" className="hover:text-zinc-900">Blog</Link>
            <Link href="/guides" className="hover:text-zinc-900">Guides</Link>
            <Link href="/home2" className="hover:text-zinc-900">For bike shops</Link>
            <Link href="/return-policy" className="hover:text-zinc-900">Return policy</Link>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-black/[0.06] pt-5">
            <Image src="/yjlogo.svg" alt="Yellow Jersey" width={120} height={18} className="h-4 w-auto opacity-80" />
            <p className="text-xs text-zinc-400">© {new Date().getFullYear()} Yellow Jersey · Made in Melbourne</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
