import type {
  AgentRiskTier,
  ConsentChannel,
  ConsentPurpose,
} from "../customer-graph/types";

export const BIKE_PROGRAMME_KEYS = [
  "new_bike_welcome",
  "first_service",
  "annual_service",
  "workorder_milestones",
  "missed_call",
  "ebike_safety_warranty",
  "compatible_upgrades",
  "vip_care",
  "at_risk_rider",
  "seasonal_workshop",
  "group_ride_clinic",
  "review_referral",
] as const;

export type BikeProgrammeKey = (typeof BIKE_PROGRAMME_KEYS)[number];

export type ProgrammeTiming = {
  delayMinutes: number;
  cadence: string;
  cooldownDays: number;
  localTimeWindow: string;
};

export type BikeProgrammeDefinition = {
  key: BikeProgrammeKey;
  name: string;
  description: string;
  trigger: string;
  channels: ConsentChannel[];
  riskTier: AgentRiskTier;
  consentPurpose: ConsentPurpose;
  timing: ProgrammeTiming;
  defaultEnabled: boolean;
  mechanics: string[];
};
