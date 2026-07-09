import { proxyNestBrandPortalRequest } from "@/lib/nest/brand-portal-client";
import {
  COACH_CONFIG_FIELDS,
  type CoachConfigField,
} from "@/lib/nest/prompt-coach-types";
import { LEGACY_KNOWLEDGE_SEED_FIELDS } from "@/lib/nest-portal/lib/brand-knowledge";

const LEGACY_FIELD_KEYS = new Set(
  LEGACY_KNOWLEDGE_SEED_FIELDS.map((field) => field.legacy_field_key),
);

export function isLegacyConfigField(field: string): field is CoachConfigField {
  return (
    (COACH_CONFIG_FIELDS as readonly string[]).includes(field) &&
    LEGACY_FIELD_KEYS.has(field)
  );
}

export type NestBusinessWriteResult = {
  field: CoachConfigField;
  value: string;
  knowledgeItemId: string | null;
  previousFieldValue: string;
  previousKnowledgeContent: string | null;
  /** When booking rules change, we may also scrub conflicting FAQ copy. */
  previousExtraKnowledge: string | null;
  extraKnowledgeUpdated: boolean;
  /** Scrubbed extra_knowledge after apply, if updated. */
  extraKnowledgeValue: string | null;
};

/**
 * Phrases in Extra knowledge / FAQ that fight a "never same-day / team confirms"
 * booking rule. Matched case-insensitively as whole lines or quoted claims.
 */
const SAME_DAY_CONFLICT_PATTERNS: RegExp[] = [
  /[“"]?the official service page says no need to book\.?\s*you can drop the bike off whenever suits\.?[”"]?/gi,
  /[-*•]?\s*the official service page says \*\*no need to book\*\*\.?/gi,
  /[-*•]?\s*the official wording says customers can \*\*drop off whenever suits you\*\*\.?/gi,
  /[-*•]?\s*no need to book\.?/gi,
  /[-*•]?\s*drop off whenever suits( you)?\.?/gi,
  /[-*•]?\s*you can drop (it|the bike) in today\.?/gi,
];

function scrubConflictingExtraKnowledge(extra: string): string {
  let next = extra;
  for (const pattern of SAME_DAY_CONFLICT_PATTERNS) {
    next = next.replace(pattern, "");
  }
  return next
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function bookingRuleNeedsExtraScrub(bookingText: string): boolean {
  const lower = bookingText.toLowerCase();
  return (
    lower.includes("never imply") ||
    lower.includes("same-day") ||
    lower.includes("same day") ||
    lower.includes("team in store will confirm")
  );
}

/**
 * Single write path for Nest business facts used by Train Nest.
 * Updates:
 * 1. Structured config field (portal rebuilds business_raw_prompt for sync fields)
 * 2. Matching legacy knowledge item (so retrieval cannot serve stale copy)
 * 3. For booking rules, scrubs known conflicting FAQ lines in extra_knowledge
 */
export async function writeNestBusinessFact(args: {
  brandKey: string;
  field: CoachConfigField;
  value: string;
  currentFieldValue?: string;
  currentExtraKnowledge?: string;
}): Promise<NestBusinessWriteResult> {
  const { brandKey, field } = args;
  const value = args.value;
  const previousFieldValue = args.currentFieldValue ?? "";

  // 1) Structured field — brand-portal-config rebuilds business_raw_prompt
  //    when the field is in RAW_PROMPT_SYNC_FIELDS.
  await proxyNestBrandPortalRequest(brandKey, {
    method: "PATCH",
    body: { [field]: value },
  });

  let knowledgeItemId: string | null = null;
  let previousKnowledgeContent: string | null = null;

  // 2) Legacy knowledge mirror (source of truth for retrieval / phone)
  if (isLegacyConfigField(field)) {
    try {
      const before = await proxyNestBrandPortalRequest(brandKey, {
        method: "GET",
        endpoint: "brand-portal-knowledge",
      });
      const items = Array.isArray(before.items) ? before.items : [];
      const existing = items.find((item) => {
        if (!item || typeof item !== "object") return false;
        const row = item as Record<string, unknown>;
        return row.legacy_field_key === field;
      }) as Record<string, unknown> | undefined;

      previousKnowledgeContent =
        existing && typeof existing.content_text === "string"
          ? existing.content_text
          : null;
      knowledgeItemId =
        existing && typeof existing.id === "string" ? existing.id : null;

      const upserted = await proxyNestBrandPortalRequest(brandKey, {
        method: "POST",
        endpoint: "brand-portal-knowledge",
        body: {
          action: "upsert_legacy",
          legacyFieldKey: field,
          contentText: value,
        },
      });
      const item = upserted.item as Record<string, unknown> | undefined;
      if (item && typeof item.id === "string") {
        knowledgeItemId = item.id;
      }
    } catch (error) {
      console.warn("[nest-business-write] legacy knowledge upsert failed:", error);
      throw new Error(
        `Saved ${field}, but could not sync the knowledge base. Nest may keep using old text until this is fixed.`,
      );
    }
  }

  // 3) Booking rules often conflict with FAQ "no need to book" copy — scrub it.
  let previousExtraKnowledge: string | null = null;
  let extraKnowledgeUpdated = false;
  let extraKnowledgeValue: string | null = null;

  if (field === "booking_info_text" && bookingRuleNeedsExtraScrub(value)) {
    try {
      const configRes = await proxyNestBrandPortalRequest(brandKey, { method: "GET" });
      const config =
        (configRes.config as Record<string, unknown> | undefined) ?? configRes;
      const extra =
        typeof args.currentExtraKnowledge === "string"
          ? args.currentExtraKnowledge
          : typeof config.extra_knowledge === "string"
            ? config.extra_knowledge
            : "";
      const scrubbed = scrubConflictingExtraKnowledge(extra);
      if (scrubbed !== extra.trim()) {
        previousExtraKnowledge = extra;
        extraKnowledgeValue = scrubbed;
        await proxyNestBrandPortalRequest(brandKey, {
          method: "PATCH",
          body: { extra_knowledge: scrubbed },
        });
        await proxyNestBrandPortalRequest(brandKey, {
          method: "POST",
          endpoint: "brand-portal-knowledge",
          body: {
            action: "upsert_legacy",
            legacyFieldKey: "extra_knowledge",
            contentText: scrubbed,
          },
        });
        extraKnowledgeUpdated = true;
      }
    } catch (error) {
      console.warn("[nest-business-write] extra_knowledge scrub failed:", error);
    }
  }

  return {
    field,
    value,
    knowledgeItemId,
    previousFieldValue,
    previousKnowledgeContent,
    previousExtraKnowledge,
    extraKnowledgeUpdated,
    extraKnowledgeValue,
  };
}

export async function restoreNestBusinessFact(args: {
  brandKey: string;
  field: CoachConfigField;
  previousFieldValue: string;
  knowledgeItemId?: string | null;
  previousExtraKnowledge?: string | null;
}): Promise<void> {
  await writeNestBusinessFact({
    brandKey: args.brandKey,
    field: args.field,
    value: args.previousFieldValue,
    currentFieldValue: args.previousFieldValue,
  });

  if (typeof args.previousExtraKnowledge === "string") {
    await proxyNestBrandPortalRequest(args.brandKey, {
      method: "PATCH",
      body: { extra_knowledge: args.previousExtraKnowledge },
    });
    await proxyNestBrandPortalRequest(args.brandKey, {
      method: "POST",
      endpoint: "brand-portal-knowledge",
      body: {
        action: "upsert_legacy",
        legacyFieldKey: "extra_knowledge",
        contentText: args.previousExtraKnowledge,
      },
    });
  }
}
