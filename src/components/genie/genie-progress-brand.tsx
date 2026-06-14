import Image from "next/image";
import { GmailLogo } from "@/components/genie/gmail-logo";
import { DeputyLogo } from "@/components/genie/deputy-logo";
import { cn } from "@/lib/utils";

const LIGHTSPEED_PHASES = new Set([
  "lightspeed_sales",
  "lightspeed_inventory",
  "lightspeed_customers",
  "lightspeed_workorders",
  "customer_context",
  "specialist",
  "rechecking",
]);

const GMAIL_PHASES = new Set(["gmail", "gmail_done"]);

const XERO_PHASES = new Set(["xero", "xero_done"]);

const DEPUTY_PHASES = new Set(["deputy", "deputy_done"]);

function textLooksLikeGmail(text: string): boolean {
  return /\bgmail\b|\binbox\b|email content|composio|searching gmail|reading \d+ email/i.test(text);
}

function textLooksLikeXero(text: string): boolean {
  return /\bxero\b|profit & loss|profit and loss|balance sheet|trial balance|aged payable|aged receivable|supplier bill|chart of accounts/i.test(
    text,
  );
}

function textLooksLikeDeputy(text: string): boolean {
  return /\bdeputy\b|\broster\b|\btimesheet\b|\bshift\b|hours worked|who worked|clocked on/i.test(text);
}

export function resolveGenieProgressBrand(
  phase?: string,
  text?: string,
): "gmail" | "xero" | "deputy" | null {
  const normalizedPhase = phase?.trim() ?? "";
  const normalizedText = text?.trim().toLowerCase() ?? "";

  if (GMAIL_PHASES.has(normalizedPhase)) return "gmail";
  if (XERO_PHASES.has(normalizedPhase)) return "xero";
  if (DEPUTY_PHASES.has(normalizedPhase)) return "deputy";
  if (LIGHTSPEED_PHASES.has(normalizedPhase)) {
    if (normalizedPhase === "rechecking" && textLooksLikeGmail(normalizedText)) return "gmail";
    if (normalizedPhase === "rechecking" && textLooksLikeXero(normalizedText)) return "xero";
    if (normalizedPhase === "rechecking" && textLooksLikeDeputy(normalizedText)) return "deputy";
    return null;
  }

  if (!normalizedText) return null;
  if (textLooksLikeGmail(normalizedText)) return "gmail";
  if (textLooksLikeXero(normalizedText)) return "xero";
  if (textLooksLikeDeputy(normalizedText)) return "deputy";
  return null;
}

export function GenieProgressBrandIcon({
  phase,
  text,
  className,
}: {
  phase?: string;
  text?: string;
  className?: string;
}) {
  const brand = resolveGenieProgressBrand(phase, text);
  if (!brand) return null;

  if (brand === "gmail") {
    return (
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.06]",
          className,
        )}
      >
        <GmailLogo className="h-[13px] max-w-[16px]" />
      </span>
    );
  }

  if (brand === "xero") {
    return (
      <span className={cn("flex h-4 w-4 shrink-0 overflow-hidden rounded-full", className)}>
        <Image
          src="/xero.png"
          alt="Xero"
          width={16}
          height={16}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  if (brand === "deputy") {
    return (
      <span className={cn("flex h-4 w-4 shrink-0 overflow-hidden rounded-[4px]", className)}>
        <DeputyLogo className="h-full w-full" />
      </span>
    );
  }

  return null;
}
