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
import { ArrowRight, ArrowUpRight, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { BlurFade } from "@/registry/magicui/blur-fade";
import { NoiseTexture } from "@/components/ui/noise-texture";
import { GmailLogo } from "@/components/genie/gmail-logo";
import { HeroDesktopWindow } from "./acme-bikes-demo";
import { AcmeStorefrontBentoVisual } from "./acme-storefront";
import { UberDeliveryBento } from "./uber-delivery";
import {
  AutoCategoriseVisual,
  GenieBentoVisual,
  ImageFindVisual,
  NestBentoVisual,
  WriteBackVisual,
} from "./value-bentos";
import { OverivewoShowcaseSection } from "./overivewo-showcase-section";

const HeroScene = dynamic(() => import("./hero-scene"), { ssr: false });

const CANVAS = "#f7f7f4";
const CARD = "bg-white border border-black/[0.07]";
const RADIUS = "rounded-[20px]";
const BENTO_CTA_LINK = "text-[#b07b00] transition-colors hover:text-[#8a6000]";

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

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <BlurFade delay={delay} inView className={className}>
      {children}
    </BlurFade>
  );
}

const TESTIMONIALS = [
  {
    quote:
      "We connected Lightspeed in one sitting and had the whole catalogue live the same day. Genie wrote the descriptions we never had time for.",
    name: "James M.",
    handle: "Acme Bikes, Melbourne",
  },
  {
    quote:
      "Our storefront looks better than the website we paid an agency for, and it stays in sync with what's actually on the shelf.",
    name: "Sarah K.",
    handle: "Trailhead Cycles",
  },
  {
    quote:
      "Nest pickup texts alone save us hours every week. Customers reply, we see it instantly, linked to their work order.",
    name: "Tom R.",
    handle: "Westside Bike Co.",
  },
] as const;

const LOGOS = ["/ls.png", "/xero.png", "/stripe.svg", "/gmail.png", "/uber.svg", "/nest-logo.png"];

type TrustedIntegration =
  | {
      name: string;
      kind: "image";
      src: string;
      width: number;
      height?: number;
      unoptimized?: boolean;
      colorLogo?: boolean;
      imageClassName?: string;
    }
  | { name: string; kind: "wordmark"; label: string; className?: string }
  | { name: "Gmail"; kind: "gmail" };

const TRUSTED_INTEGRATIONS: TrustedIntegration[] = [
  { name: "Xero", kind: "image", src: "/xero.png", width: 52, height: 24, unoptimized: true, colorLogo: true },
  { name: "Deputy", kind: "wordmark", label: "deputy", className: "text-[15px] font-bold lowercase tracking-tight" },
  { name: "OpenAI", kind: "wordmark", label: "OpenAI", className: "text-[15px] font-semibold tracking-tight" },
  { name: "Stripe", kind: "image", src: "/stripe.svg", width: 56 },
  {
    name: "Lightspeed",
    kind: "image",
    src: "/ls.png",
    width: 92,
    height: 24,
    unoptimized: true,
    colorLogo: true,
    imageClassName: "rounded-sm",
  },
  { name: "Gmail", kind: "gmail" },
  { name: "Uber", kind: "image", src: "/uber.svg", width: 80, unoptimized: true, imageClassName: "h-7" },
  { name: "Nest", kind: "image", src: "/nest-logo.png", width: 56, unoptimized: true },
];

function TrustedIntegrationsSection() {
  return (
    <section className="mx-auto max-w-[1340px] px-5 pb-4 sm:px-6">
      <BlurFade inView>
        <p className="text-center text-sm text-zinc-500">
          Built to work with the tools independent bike shops already rely on — connect in minutes, not days
        </p>
      </BlurFade>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {TRUSTED_INTEGRATIONS.map((integration, idx) => (
          <BlurFade key={integration.name} delay={0.05 + idx * 0.05} inView>
            <div className="flex h-[4.2rem] items-center justify-center rounded-md border border-black/[0.07] bg-[#f2f1ee] px-3">
              {integration.kind === "gmail" ? (
                <GmailLogo className="h-[18px] w-auto max-w-[22px] opacity-90" />
              ) : integration.kind === "image" ? (
                <Image
                  src={integration.src}
                  alt={integration.name}
                  width={integration.width}
                  height={integration.height ?? 20}
                  unoptimized={integration.unoptimized}
                  className={cn(
                    "w-auto max-w-full object-contain",
                    integration.colorLogo ? "h-6 opacity-90" : "h-5 brightness-0 opacity-80",
                    integration.imageClassName,
                  )}
                />
              ) : (
                <span className={cn("text-zinc-900", integration.className)}>{integration.label}</span>
              )}
            </div>
          </BlurFade>
        ))}
      </div>
    </section>
  );
}

function Card({
  className,
  children,
  pad = true,
  noise = false,
  surface = "white",
}: {
  className?: string;
  children: React.ReactNode;
  pad?: boolean;
  noise?: boolean;
  surface?: "white" | "light-beige";
}) {
  const surfaceClass =
    surface === "light-beige"
      ? "bg-[#f2f1ee] border border-black/[0.07]"
      : CARD;

  return (
    <div className={cn("relative overflow-hidden", RADIUS, surfaceClass)}>
      {noise && <NoiseTexture />}
      <div className={cn(noise && "relative z-10", pad && "p-7", className)}>{children}</div>
    </div>
  );
}

function LearnLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn("group mt-5 inline-flex w-fit items-center gap-1.5 text-sm font-medium", BENTO_CTA_LINK)}
    >
      {children}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function MinorBento({
  title,
  desc,
  href,
  cta,
  children,
}: {
  title: string;
  desc: string;
  href: string;
  cta: string;
  children: React.ReactNode;
}) {
  return (
    <Card surface="light-beige" pad={false} className="flex h-full flex-col">
      <div className="px-6 pb-4 pt-6">
        <h4 className="text-[17px] font-medium tracking-tight text-zinc-950">{title}</h4>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">{desc}</p>
        <Link
          href={href}
          className={cn("group mt-3 inline-flex items-center gap-1 text-sm font-medium", BENTO_CTA_LINK)}
        >
          {cta}
          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </div>
      <div className="px-3 pb-3">
        <div className="h-[240px] overflow-hidden rounded-[14px] bg-[#e4e0d8] p-5">
          {children}
        </div>
      </div>
    </Card>
  );
}

export function Home2Client() {
  const reduced = useReducedMotion() ?? false;
  const { scrollYProgress, scrollY } = useScroll();
  const [scrolled, setScrolled] = React.useState(false);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.12], [0.4, 0]);

  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 16));

  return (
    <div className="relative min-h-screen text-zinc-900" style={{ background: CANVAS }}>
      <motion.div className="pointer-events-none fixed inset-0 z-0" style={{ opacity: heroOpacity }} aria-hidden>
        <HeroScene scrollProgress={scrollYProgress} reduced={reduced} />
      </motion.div>

      {/* Nav */}
      <header
        className={cn(
          "sticky top-0 z-50 transition-colors duration-200",
          scrolled ? "border-b border-black/[0.06] bg-[#f7f7f4]/90 backdrop-blur-md" : "bg-transparent"
        )}
      >
        <div className="mx-auto flex max-w-[1340px] items-center justify-between px-5 py-2.5 sm:px-6 sm:py-3">
          <Link href="/home2">
            <Image src="/yjlogo.svg" alt="Yellow Jersey" width={138} height={20} className="h-5 w-auto" priority />
          </Link>
          <nav className="hidden items-center gap-7 text-[13px] text-zinc-600 md:flex">
            <a href="#bento" className="hover:text-zinc-900">Platform</a>
            <Link href="/home2/why-yellow-jersey" className="hover:text-zinc-900">Why Yellow Jersey</Link>
            <Link href="/marketplace" className="hover:text-zinc-900">Marketplace</Link>
            <Link href="/login" className="hover:text-zinc-900">Sign in</Link>
          </nav>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-zinc-800"
          >
            List your shop
            <Download className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto max-w-[1340px] px-5 pb-12 pt-8 sm:px-6 sm:pb-16 sm:pt-10">
          <Reveal>
            <h1 className="max-w-4xl text-[2.6rem] font-medium leading-[1.06] tracking-tight text-zinc-950 sm:text-[3.4rem] lg:text-[3.75rem]">
              Yellow Jersey is the connected commerce platform for independent bike shops.
            </h1>
          </Reveal>
          <Reveal delay={0.05}>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-zinc-500 sm:text-lg sm:leading-relaxed">
              Connect Lightspeed, launch a storefront, and let AI handle the busywork behind the scenes.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/login" className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800">
                Get started for your shop
                <Download className="h-4 w-4" />
              </Link>
              <Link href="/marketplace" className="inline-flex items-center gap-2 rounded-full bg-black/[0.06] px-5 py-2.5 text-sm font-medium text-zinc-800 hover:bg-black/[0.1]">
                Explore marketplace
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <p className="mt-3 text-sm text-zinc-500">Most shops connect Lightspeed and go live in under 10 minutes.</p>
          </Reveal>
          <Reveal delay={0.14} className="mt-12 sm:mt-16">
            <HeroDesktopWindow />
          </Reveal>
        </section>

        <TrustedIntegrationsSection />

        {/* Bento */}
        <section id="bento" className="mx-auto max-w-[1340px] px-5 py-16 sm:px-6 sm:py-24">
          <div className="flex flex-col gap-16 sm:gap-20">
          {/* Value bento 1: Genie */}
          <Reveal>
            <Card surface="light-beige" className="grid items-center gap-8 lg:grid-cols-[minmax(0,360px)_1fr] lg:gap-10">
              <div className="max-w-[360px]">
                <h3 className="text-2xl font-medium tracking-tight text-zinc-950 sm:text-[1.9rem]">
                  Ask anything about your business.
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-zinc-500">
                  Genie connects to Lightspeed, Xero, Deputy and the open web, then answers in plain
                  English. Sales, stock, rosters, accounting and live research, all from one question.
                </p>
                <LearnLink href="/login">Learn about Genie</LearnLink>
              </div>
              <div className="min-w-0">
                <GenieBentoVisual />
              </div>
            </Card>
          </Reveal>

          {/* Value bento 2: build your own store */}
          <Reveal delay={0.06}>
            <Card surface="light-beige" className="grid items-center gap-8 lg:grid-cols-[1fr_minmax(0,360px)] lg:gap-10">
              <div className="min-w-0 order-2 lg:order-1">
                <AcmeStorefrontBentoVisual />
              </div>
              <div className="order-1 max-w-[360px] lg:order-2 lg:ml-auto">
                <p className="flex items-center gap-2 text-[13px] text-zinc-500">
                  <Image
                    src="/ls.png"
                    alt=""
                    width={16}
                    height={16}
                    className="shrink-0 rounded-md"
                    unoptimized
                  />
                  Lightspeed connected
                </p>
                <h3 className="mt-2 text-2xl font-medium tracking-tight text-zinc-950 sm:text-[1.9rem]">
                  Connect Lightspeed, get your own store.
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-zinc-500">
                  Connect Lightspeed and your catalogue is live in minutes — a fast, branded storefront and a
                  national marketplace listing. This is the live Acme Bikes storefront. Click the tabs to explore.
                </p>
                <LearnLink href="/connect-lightspeed">Learn about storefronts</LearnLink>
              </div>
            </Card>
          </Reveal>

          {/* Value bento 3 — Nest AI concierge */}
          <Reveal delay={0.05}>
            <Card surface="light-beige" className="grid items-center gap-8 lg:grid-cols-[minmax(0,360px)_1fr] lg:gap-10">
              <div className="max-w-[360px]">
                <h3 className="text-2xl font-medium tracking-tight text-zinc-950 sm:text-[1.9rem]">
                  An AI concierge for every customer.
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-zinc-500">
                  Nest drafts replies from live work-order and inventory data, so you just hit send.
                  Pickups, service reminders and product questions, handled in one inbox.
                </p>
                <LearnLink href="/login">Learn about Nest</LearnLink>
              </div>
              <div className="min-w-0">
                <NestBentoVisual />
              </div>
            </Card>
          </Reveal>

          {/* Uber Direct delivery */}
          <Reveal delay={0.06}>
            <UberDeliveryBento />
          </Reveal>

          {/* Overivewo action cards */}
          <Reveal delay={0.06}>
            <OverivewoShowcaseSection />
          </Reveal>

          {/* Minor value props — three in a row */}
          <div className="flex flex-col gap-8 sm:gap-10">
            <Reveal delay={0.04}>
              <div className="max-w-2xl">
                <h3 className="text-[1.75rem] font-medium tracking-tight text-zinc-950 sm:text-[2.15rem]">
                  Get hours back in the shop.
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-zinc-500 sm:text-base">
                  Less admin, faster workflows, and stock that stays accurate — so your team stays on the
                  floor, not behind a screen.
                </p>
              </div>
            </Reveal>
            <div className="grid items-stretch gap-3 lg:grid-cols-3">
            <Reveal delay={0.04} className="h-full">
              <MinorBento
                title="Sales write back to Lightspeed"
                desc="Every online and in-store sale posts straight back to your POS, so your stock count is always right."
                href="/connect-lightspeed"
                cta="Learn about write-back"
              >
                <WriteBackVisual />
              </MinorBento>
            </Reveal>
            <Reveal delay={0.08} className="h-full">
              <MinorBento
                title="A photo for every product"
                desc="Genie finds clean, on-brand imagery for products that sync without one, so the catalogue always looks sharp."
                href="/login"
                cta="Learn about photo finding"
              >
                <ImageFindVisual />
              </MinorBento>
            </Reveal>
            <Reveal delay={0.12} className="h-full">
              <MinorBento
                title="Auto categorise from Lightspeed"
                desc="Inventory sorted into categories automatically — no manual tagging."
                href="/connect-lightspeed"
                cta="Learn about categorisation"
              >
                <AutoCategoriseVisual />
              </MinorBento>
            </Reveal>
            </div>
          </div>

          {/* Marketplace band */}
          <Reveal delay={0.06}>
            <Card noise className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
              <div>
                <h3 className="text-[1.6rem] font-medium tracking-tight text-zinc-950">
                  For shops and riders, one platform.
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-500">
                  Stores get a branded storefront, Lightspeed sync and Genie — usually live within minutes of
                  connecting. Riders browse real inventory, buy online, and list their own bikes with AI smart uploads.
                </p>
                <LearnLink href="/marketplace">Learn about the marketplace</LearnLink>
                <div className="mt-6 flex flex-wrap gap-2">
                  {LOGOS.map((src) => (
                    <span key={src} className="flex h-9 items-center justify-center rounded-md border border-black/[0.06] bg-[#faf9f7] px-3">
                      <Image
                        src={src}
                        alt=""
                        width={src.includes("xero") ? 46 : src.includes("gmail") ? 22 : 22}
                        height={20}
                        className="h-5 w-auto object-contain opacity-80"
                        unoptimized={src.endsWith(".png")}
                      />
                    </span>
                  ))}
                </div>
              </div>
              <div className="relative h-[240px] overflow-hidden rounded-[14px] border border-black/[0.06] sm:h-[280px]">
                <Image src="/home2/genie-home.png" alt="Yellow Jersey dashboard" fill className="object-cover object-top" sizes="560px" />
              </div>
            </Card>
          </Reveal>

          {/* Testimonials */}
          <div className="grid gap-3 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} delay={0.05 * i}>
                <Card noise={i === 1} className="flex h-full min-h-[200px] flex-col justify-between">
                  <p className="text-[15px] leading-relaxed text-zinc-700">{t.quote}</p>
                  <div className="mt-6 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
                      {t.name.charAt(0)}
                    </span>
                    <div>
                      <p className="text-[13px] font-medium text-zinc-900">{t.name}</p>
                      <p className="text-xs text-zinc-400">{t.handle}</p>
                    </div>
                  </div>
                </Card>
              </Reveal>
            ))}
          </div>

          {/* Why Yellow Jersey CTA */}
          <Reveal delay={0.04}>
            <Card className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
              <div className="max-w-xl">
                <h3 className="text-[1.5rem] font-medium tracking-tight text-zinc-950 sm:text-[1.75rem]">
                  Why do bike shops need this?
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-zinc-500">
                  Buyers shop online, but bikes still need real service. See how connected commerce keeps the
                  sale and the customer with your shop.
                </p>
              </div>
              <Link
                href="/home2/why-yellow-jersey"
                className="inline-flex shrink-0 items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Why Yellow Jersey
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Card>
          </Reveal>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-black/[0.06] py-20 sm:py-28">
          <Reveal className="mx-auto max-w-[1340px] px-5 text-center sm:px-6">
            <h2 className="text-3xl font-medium tracking-tight text-zinc-950 sm:text-[2.5rem]">Try Yellow Jersey</h2>
            <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-zinc-500">
              Connect Lightspeed and launch your storefront in minutes.
            </p>
            <Link
              href="/login"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800"
            >
              List your shop
              <Download className="h-4 w-4" />
            </Link>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-black/[0.06]">
        <div className="mx-auto flex max-w-[1340px] flex-wrap items-center justify-between gap-4 px-5 py-8 sm:px-6">
          <Image src="/yjlogo.svg" alt="Yellow Jersey" width={120} height={18} className="h-4 w-auto opacity-80" />
          <p className="text-xs text-zinc-400">© {new Date().getFullYear()} Yellow Jersey · Made in Melbourne</p>
        </div>
      </footer>
    </div>
  );
}
