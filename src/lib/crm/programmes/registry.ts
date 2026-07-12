import type { BikeProgrammeDefinition, BikeProgrammeKey } from "./types";

export const BIKE_PROGRAMMES: readonly BikeProgrammeDefinition[] = [
  {
    key: "new_bike_welcome",
    name: "New-bike welcome",
    description: "Welcomes a rider, records their bike and sets expectations for care and workshop support.",
    trigger: "A completed sale contains a complete bike or e-bike linked to a customer.",
    channels: ["email"],
    riskTier: "approval",
    consentPurpose: "service",
    timing: { delayMinutes: 1_440, cadence: "Once per new bike", cooldownDays: 30, localTimeWindow: "09:00–17:00" },
    defaultEnabled: true,
    mechanics: [
      "Wait one day after collection so the message does not compete with the receipt.",
      "Reference the recorded bike and explain how the store can help with fit, setup and servicing.",
      "Create the first-service reminder without sending another message immediately.",
    ],
  },
  {
    key: "first_service",
    name: "First service",
    description: "Prompts the rider to book the important first check after cables, spokes and bolts settle.",
    trigger: "A new bike is 35–56 days from purchase and has no completed first service.",
    channels: ["sms", "email"],
    riskTier: "approval",
    consentPurpose: "service",
    timing: { delayMinutes: 50_400, cadence: "Once, with one follow-up", cooldownDays: 21, localTimeWindow: "09:00–17:00" },
    defaultEnabled: true,
    mechanics: [
      "Check for a qualifying workshop record before proposing contact.",
      "Prefer a concise service text when service consent and a mobile number are available.",
      "Stop the programme as soon as a first service is booked or completed.",
    ],
  },
  {
    key: "annual_service",
    name: "Annual service",
    description: "Brings bikes back to the workshop around their annual service interval.",
    trigger: "A bike is 11–13 months from purchase or its last completed service.",
    channels: ["email", "sms"],
    riskTier: "approval",
    consentPurpose: "service",
    timing: { delayMinutes: 0, cadence: "Annual", cooldownDays: 120, localTimeWindow: "09:00–17:00" },
    defaultEnabled: true,
    mechanics: [
      "Use the newest of purchase date and completed service date as the service anchor.",
      "Exclude bikes already booked into the workshop.",
      "Explain the practical reason for the service rather than leading with an offer.",
    ],
  },
  {
    key: "workorder_milestones",
    name: "Workorder milestones",
    description: "Keeps customers informed when their bike is checked in, delayed, ready or collected.",
    trigger: "A linked workorder changes to a customer-relevant milestone.",
    channels: ["sms", "email"],
    riskTier: "approval",
    consentPurpose: "transactional",
    timing: { delayMinutes: 0, cadence: "Per milestone", cooldownDays: 0, localTimeWindow: "08:00–18:00" },
    defaultEnabled: true,
    mechanics: [
      "Deduplicate on workorder and milestone so retries cannot send twice.",
      "Include only confirmed workshop facts and never invent completion estimates.",
      "Require approval for the external message even though internal status updates are autonomous.",
    ],
  },
  {
    key: "missed_call",
    name: "Missed-call follow-up",
    description: "Creates a prompt to return a customer call and, when approved, sends a short acknowledgement.",
    trigger: "A known customer calls the store and the call is unanswered.",
    channels: ["sms", "voice"],
    riskTier: "approval",
    consentPurpose: "transactional",
    timing: { delayMinutes: 5, cadence: "Per missed call", cooldownDays: 1, localTimeWindow: "08:00–18:00" },
    defaultEnabled: false,
    mechanics: [
      "Match only an exact normalised Australian phone identity.",
      "Create the internal callback task immediately.",
      "Collapse repeated calls from the same customer into one task for the day.",
    ],
  },
  {
    key: "ebike_safety_warranty",
    name: "E-bike safety and warranty",
    description: "Provides model-relevant battery care, safety checks and warranty reminders.",
    trigger: "An e-bike reaches a configured battery-care, safety-check or warranty milestone.",
    channels: ["email"],
    riskTier: "approval",
    consentPurpose: "service",
    timing: { delayMinutes: 0, cadence: "At recorded milestones", cooldownDays: 90, localTimeWindow: "09:00–17:00" },
    defaultEnabled: true,
    mechanics: [
      "Run only for bikes explicitly recorded as e-bikes.",
      "Use recorded purchase and warranty dates; do not infer warranty terms.",
      "Separate safety and warranty information from promotional content.",
    ],
  },
  {
    key: "compatible_upgrades",
    name: "Compatible upgrades",
    description: "Suggests useful parts only when compatibility with the customer's recorded bike is known.",
    trigger: "A compatible upgrade is available for a recorded bike and the customer is eligible for marketing.",
    channels: ["email"],
    riskTier: "approval",
    consentPurpose: "marketing",
    timing: { delayMinutes: 0, cadence: "At most quarterly", cooldownDays: 90, localTimeWindow: "09:00–17:00" },
    defaultEnabled: false,
    mechanics: [
      "Require a positive compatibility signal; category similarity is not enough.",
      "Exclude customers without express marketing consent.",
      "Show the compatibility evidence and product before approval.",
    ],
  },
  {
    key: "vip_care",
    name: "VIP care",
    description: "Recognises high-value riders with personal service rather than automatic discounts.",
    trigger: "A customer enters the store's VIP lifecycle stage or reaches a service milestone.",
    channels: ["email", "voice"],
    riskTier: "approval",
    consentPurpose: "service",
    timing: { delayMinutes: 1_440, cadence: "Quarterly at most", cooldownDays: 90, localTimeWindow: "09:00–17:00" },
    defaultEnabled: true,
    mechanics: [
      "Use recorded relationship value and recency rather than a generic customer score.",
      "Propose recognition or priority workshop help, not a default coupon.",
      "Keep the customer list small enough for a genuinely personal review.",
    ],
  },
  {
    key: "at_risk_rider",
    name: "At-risk rider care",
    description: "Surfaces cooling customer relationships and prepares a personal, useful check-in.",
    trigger: "A previously active customer enters the at-risk lifecycle stage.",
    channels: ["email", "sms"],
    riskTier: "approval",
    consentPurpose: "marketing",
    timing: { delayMinutes: 1_440, cadence: "Once per at-risk period", cooldownDays: 60, localTimeWindow: "09:00–17:00" },
    defaultEnabled: true,
    mechanics: [
      "Require recorded marketing consent before proposing contact.",
      "Lead with service and riding help rather than a default discount.",
      "Stop immediately when the customer replies, books service or purchases.",
    ],
  },
  {
    key: "seasonal_workshop",
    name: "Seasonal workshop",
    description: "Offers timely workshop preparation before local riding peaks and weather changes.",
    trigger: "The store enters a configured seasonal service window.",
    channels: ["email"],
    riskTier: "approval",
    consentPurpose: "marketing",
    timing: { delayMinutes: 0, cadence: "Seasonal", cooldownDays: 90, localTimeWindow: "09:00–17:00" },
    defaultEnabled: false,
    mechanics: [
      "Use the store's configured local season rather than a global calendar assumption.",
      "Target riders whose bikes are plausibly due, excluding existing bookings.",
      "Require marketing consent and a person to approve the final audience and message.",
    ],
  },
  {
    key: "group_ride_clinic",
    name: "Group ride or clinic",
    description: "Invites suitable riders to a store ride, maintenance clinic or skills session.",
    trigger: "The store schedules an event with an audience definition and capacity.",
    channels: ["email", "sms"],
    riskTier: "approval",
    consentPurpose: "community",
    timing: { delayMinutes: 0, cadence: "Per event", cooldownDays: 14, localTimeWindow: "09:00–17:00" },
    defaultEnabled: false,
    mechanics: [
      "Require an event date, capacity and store-approved audience.",
      "Use express event consent and honour channel withdrawals.",
      "Stop inviting once capacity is reached or the event is cancelled.",
    ],
  },
  {
    key: "review_referral",
    name: "Review and referral",
    description: "Asks satisfied customers for an honest review or referral after a successful interaction.",
    trigger: "A sale or workorder completes without an unresolved issue and the cooling-off delay passes.",
    channels: ["email", "sms"],
    riskTier: "approval",
    consentPurpose: "marketing",
    timing: { delayMinutes: 4_320, cadence: "After eligible positive outcomes", cooldownDays: 180, localTimeWindow: "09:00–17:00" },
    defaultEnabled: false,
    mechanics: [
      "Wait three days after completion and suppress when an enquiry or complaint remains open.",
      "Ask for an honest review without incentives or sentiment gating.",
      "Require express review consent and cap requests to one every six months.",
    ],
  },
] as const;

const PROGRAMME_BY_KEY = new Map(BIKE_PROGRAMMES.map((programme) => [programme.key, programme]));

export function getBikeProgramme(key: string): BikeProgrammeDefinition | null {
  return PROGRAMME_BY_KEY.get(key as BikeProgrammeKey) ?? null;
}

export function validateBikeProgrammeRegistry(
  programmes: readonly BikeProgrammeDefinition[] = BIKE_PROGRAMMES,
): string[] {
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const programme of programmes) {
    if (keys.has(programme.key)) errors.push(`Duplicate programme key: ${programme.key}`);
    keys.add(programme.key);
    if (!programme.name.trim()) errors.push(`${programme.key} has no name.`);
    if (!programme.trigger.trim()) errors.push(`${programme.key} has no trigger.`);
    if (programme.channels.length === 0) errors.push(`${programme.key} has no channel.`);
    if (programme.mechanics.length < 2) errors.push(`${programme.key} needs clearer mechanics.`);
    if (programme.timing.delayMinutes < 0 || programme.timing.cooldownDays < 0) {
      errors.push(`${programme.key} has invalid timing.`);
    }
  }
  return errors;
}
