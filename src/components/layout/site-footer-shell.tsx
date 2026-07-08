"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const LINK_COLUMNS = [
  {
    heading: "Shop",
    links: [
      { href: "/marketplace", label: "Marketplace" },
      { href: "/marketplace?space=stores", label: "Bike stores" },
      { href: "/bikes", label: "Categories" },
      { href: "/brands", label: "Brands" },
      { href: "/bike-shops", label: "Bike shops" },
    ],
  },
  {
    heading: "Sell",
    links: [
      { href: "/marketplace/sell", label: "List an item" },
      { href: "/home2", label: "For bike shops" },
      { href: "/return-policy", label: "Return policy" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { href: "/blog", label: "Blog" },
      { href: "/guides", label: "Guides" },
      { href: "/marketplace/help", label: "Help centre" },
    ],
  },
] as const;

interface SiteFooterShellProps {
  className?: string;
  children?: React.ReactNode;
}

/** Static footer chrome — brand block, link columns, legal bar. SEO leaf links slot in via children. */
export function SiteFooterShell({ className, children }: SiteFooterShellProps) {
  return (
    <footer className={cn("border-t border-gray-200 bg-white", className)}>
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        {/* Main footer grid */}
        <div className="grid gap-10 py-12 sm:py-14 lg:grid-cols-12 lg:gap-8">
          {/* Brand block */}
          <div className="lg:col-span-5">
            <Link href="/marketplace" aria-label="Yellow Jersey home" className="inline-block">
              <Image
                src="/yjlogo.svg"
                alt="Yellow Jersey"
                width={148}
                height={22}
                className="h-[22px] w-auto"
              />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-gray-500">
              Australia&apos;s marketplace for bicycles, parts and cycling gear
              — from local bike stores and riders like you.
            </p>
            <a
              href="mailto:support@yellowjersey.com.au"
              className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-gray-900 underline-offset-4 hover:underline"
            >
              support@yellowjersey.com.au
            </a>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7">
            {LINK_COLUMNS.map((column) => (
              <nav key={column.heading} aria-label={column.heading}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-900">
                  {column.heading}
                </p>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-gray-500 transition-colors hover:text-gray-900"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        {/* SEO explore sections (server-rendered links for crawlers) */}
        {children ? (
          <div className="border-t border-gray-100 py-8">{children}</div>
        ) : null}

        {/* Legal bar */}
        <div className="flex flex-col gap-3 border-t border-gray-100 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-400">
            &copy; {new Date().getFullYear()} Yellow Jersey. Made in Melbourne.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-gray-400">
            <Link href="/return-policy" className="transition-colors hover:text-gray-600">
              Returns
            </Link>
            <Link href="/marketplace/help" className="transition-colors hover:text-gray-600">
              Help centre
            </Link>
            <a
              href="mailto:support@yellowjersey.com.au"
              className="transition-colors hover:text-gray-600"
            >
              Contact
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
