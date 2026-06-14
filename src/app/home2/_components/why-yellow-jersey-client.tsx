"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Download } from "lucide-react";
import { BlurFade } from "@/registry/magicui/blur-fade";

const CANVAS = "#f7f7f4";

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <BlurFade delay={delay} inView className={className}>
      {children}
    </BlurFade>
  );
}

export function WhyYellowJerseyClient() {
  return (
    <div className="relative min-h-screen text-zinc-900" style={{ background: CANVAS }}>
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#f7f7f4]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-5 py-2.5 sm:px-6 sm:py-3">
          <Link href="/home2">
            <Image src="/yjlogo.svg" alt="Yellow Jersey" width={138} height={20} className="h-5 w-auto" priority />
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/home2" className="hidden items-center gap-1.5 text-[13px] text-zinc-600 hover:text-zinc-900 sm:inline-flex">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to home
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-zinc-800"
            >
              List your shop
              <Download className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[680px] px-5 sm:px-6">
        {/* Article header */}
        <article className="py-14 sm:py-20">
          <Reveal>
            <p className="text-[13px] font-semibold uppercase tracking-wide text-[#b07b00]">For bike shops</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="mt-3 text-[2.1rem] font-medium leading-[1.12] tracking-tight text-zinc-950 sm:text-[2.75rem]">
              Buyers shop online. Bikes still need real service.
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-5 text-[18px] leading-relaxed text-zinc-600">
              The way people buy bikes has changed — but a bike isn&apos;t a parcel. Here&apos;s why your shop
              wins by going digital the right way, and where most options get it wrong.
            </p>
          </Reveal>
          <Reveal delay={0.14}>
            <div className="mt-6 flex items-center gap-3 border-b border-black/[0.08] pb-6 text-[13px] text-zinc-500">
              <Image src="/yjlogo.svg" alt="" width={84} height={12} className="h-3 w-auto opacity-70" />
              <span>·</span>
              <span>4 min read</span>
            </div>
          </Reveal>

          {/* Body */}
          <div className="mt-8 space-y-10">
            <Reveal>
              <section>
                <h2 className="text-[1.45rem] font-medium tracking-tight text-zinc-950">
                  The people buying bikes have changed
                </h2>
                <p className="mt-3 text-[16px] leading-[1.75] text-zinc-700">
                  A big share of today&apos;s demand comes from older, well-off riders buying e-bikes for
                  recreation and travel. They aren&apos;t chasing the cheapest price online. They want a proper
                  test ride, expert advice, and someone local to call when something needs fixing.
                </p>
                <p className="mt-4 text-[16px] leading-[1.75] text-zinc-700">
                  That&apos;s exactly what an independent shop does best. The challenge isn&apos;t service —
                  it&apos;s being found online in the first place, and turning that online interest into a sale
                  you actually keep.
                </p>
              </section>
            </Reveal>

            <Reveal>
              <section>
                <h2 className="text-[1.45rem] font-medium tracking-tight text-zinc-950">
                  Online-only sellers leave a gap you can fill
                </h2>
                <p className="mt-3 text-[16px] leading-[1.75] text-zinc-700">
                  When people buy a bike from a direct-to-consumer brand, they&apos;re left to handle assembly,
                  set-up and software updates on their own. And the flood of cheap, unbranded e-bikes from
                  online marketplaces has made things worse — many are unsafe, with no replacement parts, no
                  diagnostics and a real fire risk from uncertified batteries.
                </p>
                <p className="mt-4 text-[16px] leading-[1.75] text-zinc-700">
                  Reputable shops won&apos;t touch them. That&apos;s not a weakness — it&apos;s your advantage.
                  Your shop is the trusted place that actually makes a bike safe and ready to ride.
                </p>
              </section>
            </Reveal>

            <Reveal>
              <figure className="rounded-xl border border-black/[0.07] bg-white p-6">
                <blockquote className="text-[18px] font-medium leading-[1.6] tracking-tight text-zinc-900">
                  &ldquo;The sale is only half the job. The trust is built in the workshop.&rdquo;
                </blockquote>
              </figure>
            </Reveal>

            <Reveal>
              <section>
                <h2 className="text-[1.45rem] font-medium tracking-tight text-zinc-950">
                  Why selling online has been so hard
                </h2>
                <p className="mt-3 text-[16px] leading-[1.75] text-zinc-700">
                  For years, shops were told the answer was to build their own website. In reality, that means
                  constant marketing spend, manual stock updates, and someone to manage it all — while competing
                  for attention against global giants. Most shops never get the traffic to make it pay off.
                </p>
                <p className="mt-4 text-[16px] leading-[1.75] text-zinc-700">
                  So many turned to older marketplaces instead. But those have their own problems:
                </p>
                <ul className="mt-4 space-y-3">
                  {[
                    ["Phantom stock", "Items sold over the counter stay listed online, so customers buy things that are already gone, then wait weeks for a refund."],
                    ["No follow-through", "The marketplace takes a commission but walks away from delivery and service. Customers are left chasing orders with no updates."],
                    ["Rising costs", "Ad fees climb and prices get pushed into a race to the bottom, eating your margin."],
                  ].map(([title, body]) => (
                    <li key={title} className="text-[16px] leading-[1.7] text-zinc-700">
                      <span className="font-semibold text-zinc-900">{title}.</span> {body}
                    </li>
                  ))}
                </ul>
              </section>
            </Reveal>

            <Reveal>
              <section>
                <h2 className="text-[1.45rem] font-medium tracking-tight text-zinc-950">
                  A better way: connected commerce
                </h2>
                <p className="mt-3 text-[16px] leading-[1.75] text-zinc-700">
                  Yellow Jersey works differently. Instead of a separate website to manage, it sits on top of
                  the point-of-sale you already use, like Lightspeed. Your shop becomes a listing on a curated
                  national marketplace, and everything stays in sync automatically.
                </p>
                <p className="mt-4 text-[16px] leading-[1.75] text-zinc-700">
                  Sell a set of tyres at the counter and the online listing updates in real time. Customers only
                  ever see what you actually have, so phantom stock disappears. No double-entry, no second
                  dashboard to learn.
                </p>
              </section>
            </Reveal>

            <Reveal>
              <section>
                <h2 className="text-[1.45rem] font-medium tracking-tight text-zinc-950">
                  An online sale becomes a workshop job
                </h2>
                <p className="mt-3 text-[16px] leading-[1.75] text-zinc-700">
                  This is the part generic web stores can&apos;t do. When someone buys a bike online, Yellow
                  Jersey turns it into a real job in your shop:
                </p>
                <ol className="mt-4 space-y-4">
                  {[
                    ["Stock is reserved instantly", "The bike is removed from the marketplace and your POS, so it can never be sold twice."],
                    ["A workshop job is created", "The sale becomes a service ticket with the customer's details, ready for assembly."],
                    ["Your mechanic makes it ready", "Workshop time is booked for assembly, safety checks and firmware updates."],
                    ["The customer is kept in the loop", "As the job moves to 'ready for pickup', they get automatic texts and emails. No chasing."],
                  ].map(([title, body], i) => (
                    <li key={title} className="flex gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[13px] font-semibold text-white">
                        {i + 1}
                      </span>
                      <p className="text-[16px] leading-[1.6] text-zinc-700">
                        <span className="font-semibold text-zinc-900">{title}.</span> {body}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            </Reveal>

            <Reveal>
              <section>
                <h2 className="text-[1.45rem] font-medium tracking-tight text-zinc-950">
                  Keep the sale and the customer
                </h2>
                <p className="mt-3 text-[16px] leading-[1.75] text-zinc-700">
                  Customers get the easy online experience they expect. You keep the part that actually builds
                  loyalty — the service, the advice and the local warranty. That&apos;s the whole idea: the reach
                  of a big retailer, with the trust only a local shop can offer.
                </p>
              </section>
            </Reveal>
          </div>

          {/* Inline CTA */}
          <Reveal>
            <div className="mt-12 rounded-xl border border-black/[0.07] bg-white p-7 text-center">
              <h3 className="text-[1.35rem] font-medium tracking-tight text-zinc-950">
                Start selling online in minutes
              </h3>
              <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-zinc-500">
                Connect Lightspeed and list your shop, without giving up the service that makes you the local
                expert.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  List your shop
                  <Download className="h-4 w-4" />
                </Link>
                <Link
                  href="/marketplace"
                  className="inline-flex items-center gap-2 rounded-full bg-black/[0.06] px-5 py-2.5 text-sm font-medium text-zinc-800 hover:bg-black/[0.1]"
                >
                  Explore the marketplace
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </Reveal>
        </article>
      </main>

      <footer className="border-t border-black/[0.06]">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-4 px-5 py-8 sm:px-6">
          <Image src="/yjlogo.svg" alt="Yellow Jersey" width={120} height={18} className="h-4 w-auto opacity-80" />
          <p className="text-xs text-zinc-400">© {new Date().getFullYear()} Yellow Jersey · Made in Melbourne</p>
        </div>
      </footer>
    </div>
  );
}
