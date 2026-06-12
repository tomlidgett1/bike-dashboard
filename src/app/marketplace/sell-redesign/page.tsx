"use client";

import * as React from "react";
import {
  Wand2,
  LayoutList,
  Layers,
  ArrowLeft,
  RotateCcw,
  ChevronRight,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FlowGuided } from "./_components/flow-guided";
import { FlowForm } from "./_components/flow-form";
import { FlowBulk } from "./_components/flow-bulk";
import { BRAND_SOFT } from "./_components/data";

// ============================================================
// Sell flow redesign — localhost prototype hub.
// Not linked from navigation; not for production.
//
// Information architecture (confirmed):
//   • Quick upload (one bike)
//        ├─ Guided  — one question at a time
//        └─ Form    — everything on one page
//   • Bulk upload (several at once)
// Every path supports the full bike spec sheet + AI recommendations.
// ============================================================

export const dynamic = "force-dynamic";

type Flow = "guided" | "form" | "bulk";

const META: Record<Flow, { name: string }> = {
  guided: { name: "Quick · Guided" },
  form: { name: "Quick · Form" },
  bulk: { name: "Bulk upload" },
};

export default function SellRedesignPage() {
  const [flow, setFlow] = React.useState<Flow | null>(null);
  const [nonce, setNonce] = React.useState(0);

  const pick = (f: Flow) => {
    setNonce((n) => n + 1);
    setFlow(f);
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[460px] flex-col bg-white sm:border-x sm:border-gray-200">
      {/* Chrome */}
      <div className="flex h-14 items-center justify-between gap-2 border-b border-gray-100 px-3">
        {flow ? (
          <>
            <button
              type="button"
              onClick={() => setFlow(null)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100"
            >
              <ArrowLeft className="h-4 w-4" />
              Methods
            </button>
            <span className="truncate rounded-md bg-gray-100 px-2 py-1 text-[12px] font-semibold text-gray-600">
              {META[flow].name}
            </span>
            <button
              type="button"
              onClick={() => setNonce((n) => n + 1)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100"
              aria-label="Restart"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </>
        ) : (
          <div className="flex w-full items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Prototype · localhost only
              </p>
              <h1 className="text-[16px] font-bold text-gray-900">List your bike</h1>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2 py-1 text-[12px] font-medium text-gray-600">
              <Sparkles className="h-3.5 w-3.5" />
              AI-assisted
            </span>
          </div>
        )}
      </div>

      {flow === null && <EntryChooser onPick={pick} />}
      {flow === "guided" && <FlowGuided key={`guided-${nonce}`} />}
      {flow === "form" && <FlowForm key={`form-${nonce}`} />}
      {flow === "bulk" && <FlowBulk key={`bulk-${nonce}`} />}
    </div>
  );
}

function EntryChooser({ onPick }: { onPick: (f: Flow) => void }) {
  return (
    <div className="px-4 pb-10 pt-6">
      <h2 className="text-[24px] font-bold leading-tight tracking-tight text-gray-900">
        How would you like to list?
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-gray-500">
        Every path uses AI to do the heavy lifting and lets you add the full bike spec sheet.
      </p>

      {/* Quick upload — Guided / Form sub-options */}
      <p className="mt-6 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        Quick upload · one bike
      </p>
      <div className="mt-2 space-y-2">
        <OptionRow
          icon={Wand2}
          title="Guided"
          badge="Simplest"
          desc="One question at a time — confirm AI's answers as you go."
          onClick={() => onPick("guided")}
        />
        <OptionRow
          icon={LayoutList}
          title="Form"
          desc="Everything on one page, pre-filled by AI. Best for power sellers."
          onClick={() => onPick("form")}
        />
      </div>

      {/* Bulk upload */}
      <p className="mt-6 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        Several at once
      </p>
      <div className="mt-2">
        <OptionRow
          icon={Layers}
          title="Bulk upload"
          desc="Photograph everything; AI sorts it into separate listings."
          onClick={() => onPick("bulk")}
        />
      </div>

      {/* Shared-capability note — white card, rounded-xl */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-3.5">
        <div className="flex items-start gap-2.5">
          <span
            className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md"
            style={{ backgroundColor: BRAND_SOFT }}
          >
            <Sparkles className="h-4 w-4 text-gray-800" />
          </span>
          <p className="text-[12px] leading-relaxed text-gray-600">
            Every path can add the{" "}
            <span className="font-semibold text-gray-800">full component spec sheet</span> buyers see
            on product pages — auto-filled from the manufacturer by AI, or entered by hand.
          </p>
        </div>
      </div>
    </div>
  );
}

function OptionRow({
  icon: Icon,
  title,
  desc,
  badge,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md border border-gray-200 bg-white px-3.5 py-3.5 text-left transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-[0.99]"
    >
      <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-md bg-gray-100">
        <Icon className="h-5 w-5 text-gray-700" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-gray-900">{title}</span>
          {badge && (
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-gray-800"
              style={{ backgroundColor: BRAND_SOFT }}
            >
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-gray-500">{desc}</span>
      </span>
      <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-300" />
    </button>
  );
}
