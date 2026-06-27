import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Package, RotateCcw, ShieldCheck, AlertCircle } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-chrome";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/lib/seo/structured-data";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo/site";

const TITLE = "Return policy";
const DESCRIPTION =
  "Yellow Jersey return policy — change-of-mind returns within 20 days for unopened items, plus buyer protection for items not as described or damaged in transit.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/return-policy" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${TITLE} · ${SITE_NAME}`,
    description: DESCRIPTION,
    url: absoluteUrl("/return-policy"),
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} · ${SITE_NAME}`,
    description: DESCRIPTION,
  },
};

const CARD = "rounded-md border border-black/[0.07] bg-white";

const ELIGIBLE = [
  "Item is unopened and in its original packaging",
  "Item shows no signs of use, wear or damage",
  "Return is requested within 20 days of delivery",
  "Proof of purchase from Yellow Jersey is provided",
];

const NOT_ELIGIBLE = [
  "Items that have been opened, assembled or used",
  "Custom or made-to-order products",
  "Items marked as final sale",
  "Damage caused after delivery",
];

const STEPS = [
  {
    icon: Package,
    title: "Contact us",
    body: "Email support@yellowjersey.com.au with your order number and reason for return. We'll confirm eligibility and send return instructions.",
  },
  {
    icon: RotateCcw,
    title: "Send it back",
    body: "Pack the item securely in its original packaging where possible. You are responsible for return shipping unless the item is faulty or not as described.",
  },
  {
    icon: ShieldCheck,
    title: "Receive your refund",
    body: "Once we inspect the return and confirm it meets our policy, your refund is processed to your original payment method within 5–10 business days.",
  },
];

export default function ReturnPolicyPage() {
  return (
    <MarketingShell>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: "Yellow Jersey", url: SITE_URL },
            { name: "Return policy", url: absoluteUrl("/return-policy") },
          ]),
        ]}
      />

      <section className="mx-auto max-w-[1340px] px-5 pb-10 pt-12 sm:px-6 sm:pb-12 sm:pt-20">
        <p className="text-sm font-medium text-[#b07b00]">Returns</p>
        <h1 className="mt-3 max-w-4xl text-[2.6rem] font-medium leading-[1.06] tracking-tight text-zinc-950 sm:text-[3.4rem]">
          Return policy.
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-zinc-500 sm:text-lg sm:leading-relaxed">
          We want you to shop with confidence on Yellow Jersey. Here is how returns work for
          marketplace orders across Australia.
        </p>
      </section>

      <section className="mx-auto max-w-[1340px] px-5 pb-10 sm:px-6">
        <div className={`${CARD} p-7 sm:p-10`}>
          <div className="flex gap-3.5">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ffde59] text-zinc-900">
              <RotateCcw className="h-[18px] w-[18px]" />
            </span>
            <div>
              <h2 className="text-[1.35rem] font-medium tracking-tight text-zinc-950 sm:text-[1.5rem]">
                20-day change-of-mind returns
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-zinc-600">
                Returns are allowed within <strong className="font-medium text-zinc-900">20 days</strong> of
                delivery for items that are <strong className="font-medium text-zinc-900">unopened</strong> and
                free from defects. The item must be in its original, resalable condition with all tags,
                accessories and packaging included.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-zinc-500">
                If an item arrives faulty, damaged or not as described, you are covered by our buyer
                protection — regardless of whether the packaging has been opened.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1340px] px-5 py-10 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className={`${CARD} p-7`}>
            <h2 className="text-[17px] font-medium text-zinc-950">Eligible for return</h2>
            <ul className="mt-4 space-y-3">
              {ELIGIBLE.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-zinc-600">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className={`${CARD} p-7`}>
            <h2 className="text-[17px] font-medium text-zinc-950">Not eligible for return</h2>
            <ul className="mt-4 space-y-3">
              {NOT_ELIGIBLE.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-zinc-600">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1340px] px-5 py-10 sm:px-6">
        <h2 className="text-[1.75rem] font-medium tracking-tight text-zinc-950 sm:text-[2.15rem]">
          How to start a return.
        </h2>
        <div className="mt-8 grid gap-3 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className="rounded-md border border-black/[0.07] bg-[#f2f1ee] p-7"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-zinc-900">
                  <step.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="text-xs font-medium text-zinc-400">Step {i + 1}</span>
              </div>
              <h3 className="mt-4 text-[17px] font-medium tracking-tight text-zinc-950">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1340px] px-5 py-10 sm:px-6">
        <div className={`${CARD} p-7 sm:p-10`}>
          <h2 className="text-[1.35rem] font-medium tracking-tight text-zinc-950">
            Buyer protection
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-500">
            Every Yellow Jersey order includes buyer protection at no extra cost. If your item never
            arrives, is damaged in transit, or is not as described in the listing, contact us and we
            will help resolve the issue — including a full refund where appropriate.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-500">
            Payments are held securely until you confirm receipt, giving you time to inspect your order
            on arrival.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1340px] px-5 py-10 sm:px-6">
        <h2 className="text-[1.35rem] font-medium tracking-tight text-zinc-950">Questions?</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-500">
          Email{" "}
          <a
            href="mailto:support@yellowjersey.com.au?subject=Return%20request"
            className="font-medium text-zinc-800 underline underline-offset-2 hover:text-zinc-950"
          >
            support@yellowjersey.com.au
          </a>{" "}
          with your order number and we will get back to you as soon as we can. You can also visit our{" "}
          <Link href="/marketplace/help" className="font-medium text-zinc-800 underline underline-offset-2 hover:text-zinc-950">
            help centre
          </Link>
          .
        </p>
        <div className="mt-8">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            Back to marketplace
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
