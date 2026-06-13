"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  useMotionValueEvent,
} from "framer-motion";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

const HeroScene = dynamic(() => import("./hero-scene"), { ssr: false });

class SceneBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background:
              "radial-gradient(55% 45% at 50% 30%, rgba(255,222,89,0.18), transparent 70%)",
          }}
        />
      );
    }
    return this.props.children;
  }
}

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 24 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.65, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

const INTEGRATIONS = [
  { name: "Lightspeed", src: "/ls.png", width: 28, height: 28 },
  { name: "Xero", src: "/xero.png", width: 72, height: 28 },
  { name: "Stripe", src: "/stripe.svg", width: 72, height: 28 },
  { name: "Gmail", src: "/gmail.svg", width: 72, height: 28 },
  { name: "Uber Direct", src: "/uber.svg", width: 72, height: 28 },
  { name: "Nest", src: "/nest-logo.png", width: 28, height: 28 },
] as const;

type BentoItem = {
  id: string;
  span: string;
  logo?: { src: string; width: number; height: number; alt: string };
  title: string;
  desc: string;
  screenshot?: string;
  screenshotAlt?: string;
  screenshotPosition?: string;
  brandPanel?: { src: string; alt: string; bg?: string };
};

const BENTO: BentoItem[] = [
  {
    id: "genie",
    span: "col-span-12 lg:col-span-7 lg:row-span-2",
    title: "Genie — your AI shop assistant",
    desc: "Ask in plain English. Inventory, purchase orders, Gmail replies, Xero numbers and charts — without leaving chat.",
    screenshot: "/home2/genie-home.png",
    screenshotAlt: "Yellow Jersey Genie store home with metrics and chat",
    screenshotPosition: "object-top",
  },
  {
    id: "lightspeed",
    span: "col-span-12 sm:col-span-6 lg:col-span-5",
    logo: { src: "/ls.png", width: 22, height: 22, alt: "Lightspeed" },
    title: "Lightspeed, synced both ways",
    desc: "Connect once. Stock and sales flow in — marketplace orders write right back to your POS.",
    screenshot: "/home2/product-optimise.png",
    screenshotAlt: "Product Optimise with Lightspeed catalogue",
    screenshotPosition: "object-top",
  },
  {
    id: "uploads",
    span: "col-span-12 sm:col-span-6 lg:col-span-5",
    title: "AI smart uploads",
    desc: "Photograph a bike on the shop floor. AI writes the title, specs, condition and price guide in about 60 seconds.",
    screenshot: "/home2/product-optimise.png",
    screenshotAlt: "Product Optimise AI copy and photo workflows",
    screenshotPosition: "object-[center_20%]",
  },
  {
    id: "nest",
    span: "col-span-12 sm:col-span-6 lg:col-span-4",
    logo: { src: "/nest-logo.png", width: 22, height: 22, alt: "Nest" },
    title: "Nest messaging",
    desc: "SMS customers from your dashboard. Pickup reminders and service follow-ups, linked to Lightspeed profiles.",
    brandPanel: { src: "/nest-logo.png", alt: "Nest", bg: "bg-[#f4fbf6]" },
  },
  {
    id: "optimise",
    span: "col-span-12 sm:col-span-6 lg:col-span-4",
    title: "Product Optimise",
    desc: "Bulk-fix images and copy across your catalogue. CSV intake, AI-generated descriptions and brand photos.",
    screenshot: "/home2/product-optimise.png",
    screenshotAlt: "Product Optimise workflow picker",
    screenshotPosition: "object-top",
  },
  {
    id: "xero",
    span: "col-span-12 sm:col-span-6 lg:col-span-4",
    logo: { src: "/xero.png", width: 56, height: 22, alt: "Xero" },
    title: "Xero connected",
    desc: "Supplier invoices, bills and accounting numbers surfaced in Genie — no tab switching.",
    screenshot: "/home2/genie-home.png",
    screenshotAlt: "Genie home with Xero connected badge",
    screenshotPosition: "object-[center_55%]",
  },
];

const FEATURE_ROWS = [
  {
    kicker: "Genie",
    logo: undefined,
    title: "The assistant that knows your shop.",
    body: "Genie plugs into Lightspeed, Gmail and Xero. Sales summaries, customer replies, carousels and purchase orders — propose and approve in one click.",
    screenshot: "/home2/genie-home.png",
    screenshotAlt: "Genie store home dashboard",
    reverse: false,
  },
  {
    kicker: "Lightspeed",
    logo: { src: "/ls.png", width: 24, height: 24, alt: "Lightspeed" },
    title: "Your POS and marketplace, in sync.",
    body: "Yellow Jersey mirrors your Lightspeed inventory on your storefront and the national marketplace. When something sells online, it writes right back.",
    screenshot: "/home2/product-optimise.png",
    screenshotAlt: "Optimise Lightspeed catalogue products",
    reverse: true,
  },
  {
    kicker: "AI smart uploads",
    logo: undefined,
    title: "List from the shop floor.",
    body: "Snap a photo or bulk-upload a folder. AI identifies the bike, writes the listing, suggests a price and queues images for approval.",
    screenshot: "/home2/product-optimise.png",
    screenshotAlt: "AI optimise and CSV upload flows",
    reverse: false,
  },
] as const;

function BrowserFrame({
  src,
  alt,
  position = "object-top",
  tall = false,
}: {
  src: string;
  alt: string;
  position?: string;
  tall?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 bg-white shadow-[0_24px_80px_-24px_rgba(0,0,0,0.14)]">
      <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50/90 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
        <Image src="/yjsmall.svg" alt="" width={16} height={16} className="ml-1 opacity-70" />
      </div>
      <div className={cn("relative w-full overflow-hidden bg-zinc-50", tall ? "h-[420px]" : "h-[320px] sm:h-[360px]")}>
        <Image
          src={src}
          alt={alt}
          fill
          className={cn("object-cover", position)}
          sizes="(max-width: 768px) 100vw, 560px"
          priority={src.includes("genie-home")}
        />
      </div>
    </div>
  );
}

function BentoCard({ item, large = false }: { item: BentoItem; large?: boolean }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-md border border-zinc-200 bg-white">
      <div className={cn("flex flex-1 flex-col p-5 sm:p-6", large && "sm:p-7")}>
        <div className="flex items-center gap-2.5">
          {item.logo ? (
            <Image
              src={item.logo.src}
              alt={item.logo.alt}
              width={item.logo.width}
              height={item.logo.height}
              className="h-6 w-auto object-contain"
              unoptimized={item.logo.src.endsWith(".png")}
            />
          ) : null}
        </div>
        <h3
          className={cn(
            "mt-3 font-semibold tracking-tight text-zinc-950",
            large ? "text-xl sm:text-2xl" : "text-base sm:text-lg"
          )}
        >
          {item.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">{item.desc}</p>
      </div>
      <div
        className={cn(
          "relative border-t border-zinc-100 bg-zinc-50",
          large ? "h-[280px] sm:h-[340px]" : "h-[180px] sm:h-[200px]"
        )}
      >
        {item.brandPanel ? (
          <div className={cn("flex h-full items-center justify-center", item.brandPanel.bg ?? "bg-zinc-50")}>
            <Image
              src={item.brandPanel.src}
              alt={item.brandPanel.alt}
              width={64}
              height={64}
              className="h-16 w-16 object-contain opacity-90"
              unoptimized
            />
          </div>
        ) : item.screenshot ? (
          <>
            <Image
              src={item.screenshot}
              alt={item.screenshotAlt ?? item.title}
              fill
              className={cn("object-cover", item.screenshotPosition ?? "object-top")}
              sizes="(max-width: 768px) 100vw, 400px"
            />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-white to-transparent" />
          </>
        ) : null}
      </div>
    </article>
  );
}

export function Home2Client() {
  const reduced = useReducedMotion() ?? false;
  const { scrollYProgress, scrollY } = useScroll();
  const [scrolled, setScrolled] = React.useState(false);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0.35]);

  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 24));

  return (
    <div className="relative min-h-screen bg-[#fafafa] text-zinc-900">
      <motion.div
        className="pointer-events-none fixed inset-0 z-0"
        style={{ opacity: heroOpacity }}
        aria-hidden
      >
        <SceneBoundary>
          <HeroScene scrollProgress={scrollYProgress} reduced={reduced} />
        </SceneBoundary>
        <div className="absolute inset-0 bg-gradient-to-b from-[#fafafa]/40 via-[#fafafa]/70 to-[#fafafa]" />
      </motion.div>

      <header
        className={cn(
          "sticky top-0 z-50 border-b transition-colors duration-200",
          scrolled
            ? "border-zinc-200/80 bg-[#fafafa]/85 backdrop-blur-md"
            : "border-transparent bg-transparent"
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/home2" className="relative z-10 shrink-0">
            <Image src="/yjlogo.svg" alt="Yellow Jersey" width={160} height={22} priority className="h-5 w-auto sm:h-6" />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <a href="#platform" className="hidden rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 sm:inline-flex">
              Platform
            </a>
            <a href="#bento" className="hidden rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 md:inline-flex">
              Features
            </a>
            <Link href="/login" className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100">
              Sign in
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              List your shop
              <ArrowRight className="h-4 w-4" />
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-24 lg:px-8 lg:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal delay={0.05}>
              <p className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm">
                <Image src="/ls.png" alt="" width={16} height={16} className="rounded-sm" unoptimized />
                Marketplace for shops and riders
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl lg:text-[3.25rem] lg:leading-[1.08]">
                The platform local bike shops
                <span className="block text-zinc-500">use to win online.</span>
              </h1>
            </Reveal>
            <Reveal delay={0.18}>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-zinc-500 sm:text-lg">
                Branded storefront, national marketplace, Lightspeed sync and Genie AI —
                so independent shops sell everywhere without the admin.
              </p>
            </Reveal>
            <Reveal delay={0.26}>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link href="/login" className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-800">
                  Get started for your shop
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/connect-lightspeed" className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50">
                  <Image src="/ls.png" alt="" width={18} height={18} unoptimized />
                  Connect Lightspeed
                </Link>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.34} className="mx-auto mt-14 max-w-5xl">
            <BrowserFrame src="/home2/genie-home.png" alt="Genie store home" tall />
          </Reveal>
        </section>

        <section className="border-y border-zinc-200/80 bg-white py-10">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Connects with the tools you already use
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
              {INTEGRATIONS.map((item) => (
                <div key={item.name} className="flex h-9 items-center justify-center opacity-80 transition-opacity hover:opacity-100">
                  <Image
                    src={item.src}
                    alt={item.name}
                    width={item.width}
                    height={item.height}
                    className={cn(
                      "w-auto object-contain",
                      item.src.endsWith(".png") && item.name !== "Xero" ? "h-7" : "h-6"
                    )}
                    unoptimized={item.src.endsWith(".png")}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="platform" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Built for the shop floor</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              Real tools from your store dashboard.
            </h2>
          </Reveal>

          <div className="mt-16 space-y-24 sm:mt-20 sm:space-y-28">
            {FEATURE_ROWS.map((row, i) => (
              <div
                key={row.kicker}
                className={cn(
                  "grid items-center gap-10 lg:grid-cols-2 lg:gap-16",
                  row.reverse && "lg:[&>*:first-child]:order-2"
                )}
              >
                <Reveal delay={0.05}>
                  <div>
                    <div className="flex items-center gap-2">
                      {row.logo ? (
                        <Image src={row.logo.src} alt={row.logo.alt} width={row.logo.width} height={row.logo.height} unoptimized />
                      ) : null}
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">{row.kicker}</p>
                    </div>
                    <h3 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">{row.title}</h3>
                    <p className="mt-4 text-base leading-relaxed text-zinc-500">{row.body}</p>
                  </div>
                </Reveal>
                <Reveal delay={0.12 + i * 0.04}>
                  <BrowserFrame src={row.screenshot} alt={row.screenshotAlt} />
                </Reveal>
              </div>
            ))}
          </div>
        </section>

        <section id="bento" className="border-t border-zinc-200/80 bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">The full toolkit</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
                One login. Every workflow your shop runs.
              </h2>
            </Reveal>

            <div className="mt-12 grid grid-cols-12 gap-3 sm:gap-4">
              {BENTO.map((cell, i) => (
                <Reveal key={cell.id} delay={0.04 * (i % 4)} className={cn("min-h-[280px]", cell.span)}>
                  <BentoCard item={cell} large={cell.id === "genie"} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <Reveal>
            <div className="overflow-hidden rounded-md border border-zinc-200 bg-zinc-950">
              <div className="grid lg:grid-cols-2">
                <div className="border-b border-white/10 p-8 sm:p-10 lg:border-b-0 lg:border-r">
                  <div className="flex items-center gap-2">
                    <Image src="/ls.png" alt="Lightspeed" width={24} height={24} unoptimized />
                    <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">For bike shops</span>
                  </div>
                  <h3 className="mt-5 text-2xl font-semibold tracking-tight text-white">Storefront + marketplace + POS sync</h3>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                    Sell from your branded store and across Yellow Jersey. Lightspeed inventory stays live; orders write back.
                  </p>
                  <Link href="/login" className="mt-8 inline-flex items-center gap-2 rounded-md bg-[#ffde59] px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-[#f0cf45]">
                    Open a store account
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="p-8 sm:p-10">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">For riders</p>
                  <h3 className="mt-5 text-2xl font-semibold tracking-tight text-white">Real shops, real inventory</h3>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                    New and used bikes from independent stores. Delivery or pickup — and AI listings when you sell.
                  </p>
                  <Link href="/marketplace" className="mt-8 inline-flex items-center gap-2 rounded-md border border-white/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/5">
                    Explore marketplace
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 pt-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="rounded-md border border-zinc-200 bg-white px-6 py-14 text-center shadow-sm sm:px-12 sm:py-16">
              <h2 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
                Ready to put your shop in the lead?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base text-zinc-500">
                Connect Lightspeed, let Genie handle the busywork, and go live the same day.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link href="/login" className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-800">
                  List your shop
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/connect-lightspeed" className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50">
                  <Image src="/ls.png" alt="" width={18} height={18} unoptimized />
                  Connect Lightspeed
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="relative z-10 border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-6 lg:px-8">
          <Image src="/yjlogo.svg" alt="Yellow Jersey" width={140} height={20} className="h-5 w-auto" />
          <p className="text-xs text-zinc-400">© {new Date().getFullYear()} Yellow Jersey · Made in Melbourne</p>
        </div>
      </footer>
    </div>
  );
}
