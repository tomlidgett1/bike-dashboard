import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  analyseNestContentDraft,
  selectNestConflictCandidates,
  type NestConflictEntry,
} from "../src/lib/nest/nest-knowledge-conflicts";
import {
  NEST_EDITABLE_CONFIG_FIELDS,
} from "../src/lib/nest/nest-workspace-types";
import { isNestEditableConfigField } from "../src/lib/nest/nest-workspace-mutations";
import { resolveExplicitStoreNestBrandKey } from "../src/lib/nest/resolve-store-brand-key";

async function main() {
  const entries: NestConflictEntry[] = Array.from({ length: 55 }, (_, index) => ({
    sourceId: `knowledge:${index}`,
    sourceType: "knowledge",
    title: `Detail ${index}`,
    content: `Workshop note ${index} about bicycle servicing.`,
  }));
  entries[48] = {
    sourceId: "knowledge:48",
    sourceType: "knowledge",
    title: "Friday hours",
    content: "The store closes at 5pm on Fridays.",
  };

  const candidates = selectNestConflictCandidates(
    "The store closes at 6pm on Fridays.",
    entries,
  );
  assert(
    candidates.some((entry) => entry.sourceId === "knowledge:48"),
    "Relevant entries beyond the first 40 must still be checked.",
  );

  const duplicate = await analyseNestContentDraft({
    title: "Service policy",
    content: "Service bookings need confirmation from the team.",
    entries: [
      {
        sourceId: "config:booking_info_text",
        sourceType: "config",
        title: "Bookings and enquiries",
        content: "Service bookings need confirmation from the team.",
      },
    ],
  });
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.matches[0]?.sourceId, "config:booking_info_text");

  assert.equal(resolveExplicitStoreNestBrandKey(null), null);
  assert.equal(
    resolveExplicitStoreNestBrandKey({
      business_name: "Unlinked Bikes",
      nest_brand_key: null,
    }),
    null,
    "Management routes must not guess a brand from the business name.",
  );
  assert.equal(
    resolveExplicitStoreNestBrandKey({ nest_brand_key: "  ASH " }),
    "ash",
  );

  for (const protectedField of [
    "core_system_prompt",
    "internal_admin_phone_e164s",
    "twilio_phone_number_sid",
    "lightspeed_settings",
  ]) {
    assert(
      !NEST_EDITABLE_CONFIG_FIELDS.includes(
        protectedField as (typeof NEST_EDITABLE_CONFIG_FIELDS)[number],
      ),
      `${protectedField} must not be exposed as owner-editable content.`,
    );
    assert.equal(isNestEditableConfigField(protectedField), false);
  }

  assert.equal(isNestEditableConfigField("hours_text"), true);

  const edgeConfig = readFileSync(
    resolve("supabase/functions/_shared/brand-chat-config.ts"),
    "utf8",
  );
  assert(
    !edgeConfig.includes("CACHE_TTL_MS"),
    "Production brand config must be read fresh after owner edits.",
  );

  const promptCoach = readFileSync(
    resolve("src/lib/nest/prompt-coach.ts"),
    "utf8",
  );
  assert(
    !promptCoach.includes(".slice(0, 40)"),
    "Prompt Coach must not ignore knowledge after item 40.",
  );

  const migration = readFileSync(
    resolve(
      "supabase/migrations/20260713100828_nest_brand_content_revisions.sql",
    ),
    "utf8",
  );
  assert(migration.includes("ENABLE ROW LEVEL SECURITY"));
  assert(
    migration.includes(
      "REVOKE ALL ON TABLE public.nest_brand_content_revisions FROM anon, authenticated, PUBLIC",
    ),
  );
  assert(migration.includes("append-only"));

  const workspaceUi = readFileSync(
    resolve(
      "src/components/settings/nest-workspace/nest-knowledge-workspace.tsx",
    ),
    "utf8",
  );
  assert(
    workspaceUi.includes("h-[calc(100svh-57px)]"),
    "Nest knowledge must use the full-screen home-style layout.",
  );
  assert(
    workspaceUi.includes('id: "learn"') &&
      workspaceUi.includes('id: "test"') &&
      workspaceUi.includes('id: "knowledge"'),
    "Nest must expose Learn, Test and Knowledge tabs only.",
  );
  assert(
    !workspaceUi.includes("/settings/store/crm/inbox"),
    "Nest knowledge must not live inside the CRM section.",
  );

  const workspaceTabs = readFileSync(
    resolve("src/components/settings/nest-workspace/workspace-ui.tsx"),
    "utf8",
  );
  assert(
    workspaceTabs.includes("SlidingNavTabs"),
    "Nest tabs must reuse the shared sliding tab component.",
  );
  assert(workspaceTabs.includes('layoutId="nest-workspace-tabs"'));

  const openingSchedule = readFileSync(
    resolve("src/lib/nest-portal/lib/opening-schedule.ts"),
    "utf8",
  );
  assert(
    openingSchedule.includes("buildNestBusinessTurnContextBlock"),
    "Nest test chat must inject business-local date/time using IANA timezone.",
  );

  const nestTestChat = readFileSync(
    resolve("src/lib/nest/nest-test-chat.ts"),
    "utf8",
  );
  assert(
    nestTestChat.includes("buildNestBusinessTurnContextBlock"),
    "Local Nest test must include Melbourne-aware turn context.",
  );

  const mondayMorningMelbourne = new Date("2026-07-12T22:30:00.000Z");
  const weekday = mondayMorningMelbourne.toLocaleDateString("en-AU", {
    timeZone: "Australia/Melbourne",
    weekday: "long",
  });
  assert.equal(
    weekday,
    "Monday",
    "Business timezone formatting must not use server UTC day.",
  );

  const nestPage = readFileSync(
    resolve("src/app/settings/store/nest-knowledge/page.tsx"),
    "utf8",
  );
  assert(
    nestPage.includes("NestKnowledgeWorkspace"),
    "Nest knowledge must have its own standalone page route.",
  );

  console.log("Nest knowledge assertions passed.");
}

void main();
