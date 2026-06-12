"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { VariantStepper } from "./_components/variant-stepper";
import { VariantList } from "./_components/variant-list";
import { VariantDeck } from "./_components/variant-deck";

type VariantKey = "stepper" | "list" | "deck";

const VARIANTS: {
  key: VariantKey;
  short: string;
  name: string;
  blurb: string;
}[] = [
  {
    key: "stepper",
    short: "Guided",
    name: "A · Guided steps",
    blurb:
      "One task per full screen with a progress bar. Spacious, foolproof, never cramped — review each item on its own page.",
  },
  {
    key: "list",
    short: "List",
    name: "B · Smart list",
    blurb:
      "Everything on one scrolling screen. Items appear as a tidy list you tap to expand and edit inline. See it all at a glance.",
  },
  {
    key: "deck",
    short: "Swipe",
    name: "C · Swipe deck",
    blurb:
      "Review items as a card deck. Swipe right to keep, left to skip, tap to edit. Built for speed and momentum.",
  },
];

export default function SellPrototypesPage() {
  const [variant, setVariant] = React.useState<VariantKey>("stepper");
  const [nonce, setNonce] = React.useState(0);

  const active = VARIANTS.find((v) => v.key === variant)!;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[460px] flex-col bg-white sm:border-x sm:border-gray-200">
      {/* Prototype chrome */}
      <div className="border-b border-gray-100 px-4 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Prototype
            </p>
            <h1 className="text-[17px] font-bold text-gray-900">
              Bulk upload · mobile
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setNonce((n) => n + 1)}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-50 active:scale-[0.98]"
          >
            Restart
          </button>
        </div>

        {/* Variant switcher — large tab design */}
        <div className="mt-3 flex w-full items-center rounded-md bg-gray-100 p-0.5">
          {VARIANTS.map((v) => {
            const isActive = v.key === variant;
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => setVariant(v.key)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-white text-gray-800 shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70",
                )}
              >
                {v.short}
              </button>
            );
          })}
        </div>

        <p className="mt-2.5 text-[13px] leading-relaxed text-gray-500">
          <span className="font-semibold text-gray-700">{active.name}.</span>{" "}
          {active.blurb}
        </p>
      </div>

      {/* Active prototype (remounts on variant change or restart) */}
      <div className="flex-1">
        {variant === "stepper" && <VariantStepper key={`stepper-${nonce}`} />}
        {variant === "list" && <VariantList key={`list-${nonce}`} />}
        {variant === "deck" && <VariantDeck key={`deck-${nonce}`} />}
      </div>
    </div>
  );
}
