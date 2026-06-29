import Image from "next/image";
import Link from "next/link";
import { SiteFooter } from "@/components/layout/site-footer";

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

      <SiteFooter />
    </div>
  );
}
