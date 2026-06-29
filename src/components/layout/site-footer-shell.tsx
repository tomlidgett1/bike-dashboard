"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const ESSENTIAL_LINKS = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/marketplace/sell", label: "Sell" },
  { href: "/bikes", label: "Categories" },
  { href: "/brands", label: "Brands" },
  { href: "/bike-shops", label: "Bike shops" },
  { href: "/blog", label: "Blog" },
  { href: "/guides", label: "Guides" },
  { href: "/return-policy", label: "Return policy" },
] as const;

interface SiteFooterShellProps {
  className?: string;
  children?: React.ReactNode;
}

/** Static footer chrome — logo, essential links, copyright. SEO leaf links slot in via children. */
export function SiteFooterShell({ className, children }: SiteFooterShellProps) {
  return (
    <footer className={cn("border-t border-gray-200 bg-white", className)}>
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Link href="/marketplace" aria-label="Yellow Jersey home">
              <Image
                src="/yjlogo.svg"
                alt="Yellow Jersey"
                width={132}
                height={20}
                className="h-5 w-auto"
              />
            </Link>
            <p className="mt-2 text-sm text-gray-500">
              Australia&apos;s marketplace for bicycles, parts, and cycling gear.
            </p>
          </div>

          <nav
            aria-label="Footer"
            className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600"
          >
            {ESSENTIAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="whitespace-nowrap transition-colors hover:text-gray-900"
              >
                {link.label}
              </Link>
            ))}
            <a
              href="mailto:support@yellowjersey.com.au"
              className="whitespace-nowrap transition-colors hover:text-gray-900"
            >
              Contact
            </a>
          </nav>
        </div>

        {children ? <div className="mt-6 border-t border-gray-100 pt-6">{children}</div> : null}

        <div className="mt-6 flex flex-col gap-2 border-t border-gray-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-400">
            &copy; {new Date().getFullYear()} Yellow Jersey &middot; Made in Melbourne
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
            <Link href="/marketplace/help" className="transition-colors hover:text-gray-600">
              Help centre
            </Link>
            <Link href="/home2" className="transition-colors hover:text-gray-600">
              For bike shops
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
