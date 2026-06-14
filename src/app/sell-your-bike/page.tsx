import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Camera,
  Tag,
  Truck,
  Sparkles,
  ShieldCheck,
  Users,
  MessageSquareOff,
} from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-chrome";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/lib/seo/structured-data";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo/site";

const TITLE = "Sell your bike online — free, to real riders";
const DESCRIPTION =
  "Sell your bike on Yellow Jersey, the Australian marketplace built for cyclists. Snap a photo and AI writes the listing, set a fair price, and sell to local riders with secure payment, delivery or pickup. No lowball DMs.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/sell-your-bike" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${TITLE} · ${SITE_NAME}`,
    description: DESCRIPTION,
    url: absoluteUrl("/sell-your-bike"),
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} · ${SITE_NAME}`,
    description: DESCRIPTION,
  },
};

const STEPS = [
  {
    icon: Camera,
    title: "Snap a photo",
    body: "Take a photo of your bike and our AI fills in the make, model, size and a clean, accurate description — no typing out specs.",
  },
  {
    icon: Tag,
    title: "Set your price",
    body: "We suggest a fair price from real sale data on similar bikes. You stay in control of the final number.",
  },
  {
    icon: Truck,
    title: "Sell and hand over",
    body: "Sell to riders across Australia with secure payment, then choose Uber delivery or local pickup. Done.",
  },
];

const WHY = [
  {
    icon: Users,
    title: "Real cyclists, not randoms",
    body: "Your bike is seen by people who actually ride — buyers searching for exactly what you're selling.",
  },
  {
    icon: Sparkles,
    title: "AI writes the listing",
    body: "Genie identifies your bike and drafts the title, specs and description from a single photo.",
  },
  {
    icon: ShieldCheck,
    title: "Get paid securely",
    body: "Payments run through Stripe, so there's no risky cash meet-up and no waiting on a bank transfer.",
  },
  {
    icon: MessageSquareOff,
    title: "No endless DMs",
    body: "No 'is this still available?', no lowballers, no ghosting. Just genuine buyers and a clean checkout.",
  },
];

const CATEGORIES = [
  "Road bikes",
  "Mountain bikes",
  "Gravel & cyclocross",
  "E-bikes",
  "Wheels & components",
  "Apparel & accessories",
];

const FAQ = [
  {
    q: "How much does it cost to sell my bike?",
    a: "Creating a listing is free. You only pay a small fee when your bike actually sells, and you'll always see it before you confirm.",
  },
  {
    q: "How do I get paid?",
    a: "Buyers pay securely through Stripe at checkout. Once the sale is complete, the funds are released to you — no cash meet-ups or risky transfers.",
  },
  {
    q: "How does delivery work?",
    a: "You choose. Offer local pickup, or send it across town with Uber delivery. Many sellers offer both so buyers can pick what suits them.",
  },
  {
    q: "How long does it take to list a bike?",
    a: "About two minutes. Snap a photo, our AI drafts the details and description, you confirm the price, and it's live.",
  },
  {
    q: "What can I sell on Yellow Jersey?",
    a: "Road, mountain, gravel and e-bikes, plus wheels, components, apparel and accessories — new or used.",
  },
  {
    q: "Is it safe to sell here?",
    a: "Yes. Payments are handled by Stripe and buyers are real, verified riders — not anonymous classifieds traffic.",
  },
];

const CARD = "rounded-[20px] border border-black/[0.07] bg-white";
const BEIGE = "rounded-[20px] border border-black/[0.07] bg-[#f2f1ee]";

function DarkPill({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
    >
      {children}
    </Link>
  );
}

export default function SellYourBikePage() {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <MarketingShell>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: "Yellow Jersey", url: SITE_URL },
            { name: "Sell your bike", url: absoluteUrl("/sell-your-bike") },
          ]),
          faqLd,
        ]}
      />

      {/* Hero */}
      <section className="mx-auto max-w-[1340px] px-5 pb-12 pt-12 sm:px-6 sm:pb-16 sm:pt-20">
        <p className="text-sm font-medium text-[#b07b00]">Sell your bike</p>
        <h1 className="mt-3 max-w-4xl text-[2.6rem] font-medium leading-[1.06] tracking-tight text-zinc-950 sm:text-[3.4rem] lg:text-[3.75rem]">
          Sell your bike, the easy way.
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-zinc-500 sm:text-lg sm:leading-relaxed">
          List in two minutes and reach riders across Australia. Snap a photo — our AI writes the rest —
          then sell with secure payment and delivery or local pickup.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <DarkPill href="/marketplace/sell">
            List your bike
            <ArrowRight className="h-4 w-4" />
          </DarkPill>
          <Link
            href="/marketplace/used-products"
            className="inline-flex items-center gap-2 rounded-full bg-black/[0.06] px-5 py-2.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-black/[0.1]"
          >
            Browse used bikes
          </Link>
        </div>
        <p className="mt-3 text-sm text-zinc-500">Free to list · No lowball DMs · Delivery or local pickup</p>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-[1340px] px-5 py-10 sm:px-6 sm:py-14">
        <h2 className="text-[1.75rem] font-medium tracking-tight text-zinc-950 sm:text-[2.15rem]">
          From your garage to sold, in three steps.
        </h2>
        <div className="mt-8 grid gap-3 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className={`${BEIGE} flex h-full flex-col p-7`}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ffde59] text-zinc-900">
                  <s.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="text-xs font-medium text-zinc-400">Step {i + 1}</span>
              </div>
              <h3 className="mt-4 text-[17px] font-medium tracking-tight text-zinc-950">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why Yellow Jersey vs classifieds */}
      <section className="mx-auto max-w-[1340px] px-5 py-10 sm:px-6 sm:py-14">
        <div className={`${CARD} p-7 sm:p-10`}>
          <div className="max-w-2xl">
            <h2 className="text-[1.75rem] font-medium tracking-tight text-zinc-950 sm:text-[2.15rem]">
              A better way than Gumtree or Facebook.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-zinc-500">
              Yellow Jersey is built for bikes and the people who ride them — so selling is faster, safer
              and far less hassle than the classifieds.
            </p>
          </div>
          <div className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {WHY.map((w) => (
              <div key={w.title} className="flex gap-3.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f2f1ee] text-zinc-700">
                  <w.icon className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-[15px] font-medium text-zinc-900">{w.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-500">{w.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What you can sell */}
      <section className="mx-auto max-w-[1340px] px-5 py-10 sm:px-6 sm:py-14">
        <h2 className="text-[1.75rem] font-medium tracking-tight text-zinc-950 sm:text-[2.15rem]">
          Sell any bike, part or kit.
        </h2>
        <div className="mt-6 flex flex-wrap gap-2.5">
          {CATEGORIES.map((c) => (
            <Link
              key={c}
              href="/marketplace/sell"
              className="rounded-full border border-black/[0.08] bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-black/20 hover:text-zinc-900"
            >
              {c}
            </Link>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-[1340px] px-5 py-10 sm:px-6 sm:py-14">
        <h2 className="text-[1.75rem] font-medium tracking-tight text-zinc-950 sm:text-[2.15rem]">
          Questions, answered.
        </h2>
        <div className="mt-8 grid gap-x-10 gap-y-8 lg:grid-cols-2">
          {FAQ.map((f) => (
            <div key={f.q}>
              <h3 className="text-[15px] font-medium text-zinc-900">{f.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-black/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-[1340px] px-5 text-center sm:px-6">
          <h2 className="text-3xl font-medium tracking-tight text-zinc-950 sm:text-[2.5rem]">
            Ready to sell your bike?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-zinc-500">
            List it in two minutes and reach riders looking for exactly what you have.
          </p>
          <div className="mt-8 flex justify-center">
            <DarkPill href="/marketplace/sell">
              List your bike
              <ArrowRight className="h-4 w-4" />
            </DarkPill>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
