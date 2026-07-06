// The Domestique playbook registry.
//
// Playbooks are bike-retail-specific triggers over the Lightspeed mirrors.
// Detection logic lives in detectors.ts; this file is the metadata catalogue
// used by the orchestrator, guardrails and settings UI.

import type { DomestiquePlaybookDefinition, DomestiquePlaybookKey } from "@/lib/types/domestique";

export const DOMESTIQUE_PLAYBOOKS: DomestiquePlaybookDefinition[] = [
  {
    key: "service_chase",
    name: "Service Chase",
    description:
      "Riders who bought a bike 10–12 months ago and haven't been back for a service. Workshop labour is the highest-margin revenue in the shop.",
    channel: "email_sms",
    cooldown_days: 7,
    assumed_conversion: 0.12,
    mechanics: [
      "Scans your POS sale lines for bike purchases 300–380 days old (minimum $500 line value).",
      "Checks each customer's history since that purchase — anyone with a workshop or service line is excluded.",
      "Customers with an email address receive the campaign email; riders with only a phone number get the text via Nest instead.",
      "Respects your contact budget (one marketing touch per customer per cooldown window) and withholds the holdout share to measure real lift.",
      "Assumes ~$150 average service value at a 12% booking rate for the estimate.",
    ],
  },
  {
    key: "first_service_rescue",
    name: "First-Service Rescue",
    description:
      "New bikes 5–8 weeks old whose free first service hasn't been redeemed. Locks in the service relationship for the life of the bike.",
    channel: "sms",
    cooldown_days: 7,
    assumed_conversion: 0.35,
    mechanics: [
      "Finds bike purchases 35–56 days old (minimum $400) with no workshop visit since.",
      "Text-only play — a personal nudge via Nest, never a marketing blast. Customers without a phone number are skipped.",
      "Your Nest intro and sign-off templates wrap the message, so it reads like it came from you.",
      "First services convert around 35% from a personal text and seed the paid service relationship.",
    ],
  },
  {
    key: "vip_winback",
    name: "VIP Win-back",
    description:
      "Top spenders who have gone quiet for 6+ months. A personal note, no discount — an invitation, not a coupon.",
    channel: "email",
    cooldown_days: 14,
    assumed_conversion: 0.08,
    mechanics: [
      "Targets CRM contacts with $1,500+ lifetime spend whose last purchase was more than 6 months ago.",
      "Deliberately no discount — VIPs respond to recognition, not coupons. The email is a personal note in your store's voice.",
      "Sent through your CRM email engine with full open/click tracking; every send appears in Outreach → Activity.",
      "You can edit the subject and body below before approving, and preview exactly what recipients will see.",
    ],
  },
  {
    key: "dead_stock_mover",
    name: "Dead-Stock Mover",
    description:
      "Stock past its stale threshold with weak sell-through. Margin-floored discounts applied to the storefront to free trapped cash.",
    channel: "discount",
    cooldown_days: 7,
    assumed_conversion: 0.2,
    mechanics: [
      "Scores every in-stock storefront product on staleness (days since last sold), velocity (units sold in 90 days) and overstock — only strong clearance candidates (score ≥ 0.55) qualify.",
      "Each discount is sized between 10% and your configured maximum, then capped so margin never drops below your floor.",
      "Discounts go live on your storefront product pages the moment you approve and run for the number of days shown below.",
      "When the timer ends the discount expires automatically and full price returns — nothing is deleted and no cleanup is needed.",
      "This is separate from your rotating Specials carousel. Products already queued in a Specials cycle are flagged so you can remove them here if you prefer the carousel to handle them.",
    ],
  },
  {
    key: "consumables_cadence",
    name: "Consumables Cadence",
    description:
      "Customers whose chain, tyres or brake pads are due on a typical wear interval. Predictable, high-frequency small baskets.",
    channel: "email",
    cooldown_days: 10,
    assumed_conversion: 0.1,
    mechanics: [
      "Watches purchase dates for wear parts: chains due 5–10 months after purchase, tyres 6–11 months, brake pads 4–9 months.",
      "Each targeted customer's specific part and purchase age is listed below — the trigger is their own buying history, not a generic blast.",
      "One reminder email per customer, sent through your CRM engine with tracking.",
      "Runs at most every 10 days and never re-contacts anyone inside your contact budget window.",
    ],
  },
];

const BY_KEY = new Map(DOMESTIQUE_PLAYBOOKS.map((p) => [p.key, p]));

export function getPlaybook(key: string): DomestiquePlaybookDefinition | null {
  return BY_KEY.get(key as DomestiquePlaybookKey) ?? null;
}

export function isPlaybookKey(key: string): key is DomestiquePlaybookKey {
  return BY_KEY.has(key as DomestiquePlaybookKey);
}

export const ALL_PLAYBOOK_KEYS: DomestiquePlaybookKey[] = DOMESTIQUE_PLAYBOOKS.map((p) => p.key);
