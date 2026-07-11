export const CUSTOMER_AUTOMATION_PILOT_HANDLES = ["+61414187820"] as const;

export const CUSTOMER_TENTH_MESSAGE_MEDIA_RULE_KEY =
  "customer_tenth_message_media" as const;
export const CUSTOMER_TENTH_MESSAGE_MEDIA_AUTOMATION_TYPE =
  "customer_tenth_message_media" as const;
export const CUSTOMER_DEEP_INTEREST_YOUTUBE_RULE_KEY =
  "customer_deep_interest_youtube" as const;
export const CUSTOMER_DEEP_INTEREST_YOUTUBE_AUTOMATION_TYPE =
  "customer_deep_interest_youtube" as const;

export type CustomerAutomationRuleKey =
  | typeof CUSTOMER_TENTH_MESSAGE_MEDIA_RULE_KEY
  | typeof CUSTOMER_DEEP_INTEREST_YOUTUBE_RULE_KEY;

export type CustomerAutomationActionStatus =
  | "sent"
  | "skipped"
  | "error";

export interface CustomerAutomationProfile {
  handle: string;
  name: string | null;
  botNumber: string | null;
  onboardCount: number;
  onboardState: string | null;
  entryState: string | null;
  firstValueWedge: string | null;
  activationScore: number;
  capabilityCategoriesUsed: string[];
  authUserId: string | null;
  status: string;
  timezone: string | null;
  firstSeen: number;
  lastSeen: number;
  deepProfileSnapshot: Record<string, unknown> | null;
  lastProactiveSentAt: string | null;
  lastProactiveIgnored: boolean;
  proactiveIgnoreCount: number;
}

export interface CustomerAutomationRuleState {
  id: number;
  handle: string;
  ruleKey: string;
  lastEvaluatedAt: string | null;
  lastOutcome: string | null;
  lastReason: string | null;
  lastMetricValue: number | null;
  lastProfileSnapshot: Record<string, unknown>;
  lastMetadata: Record<string, unknown>;
  firstEligibleAt: string | null;
  sendInProgressAt: string | null;
  lastSentAt: string | null;
  sentCount: number;
  lastTriggeredBy: string | null;
  lastAutomationRunId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerAutomationActionResult {
  handle: string;
  ruleKey: CustomerAutomationRuleKey;
  status: CustomerAutomationActionStatus;
  reason?: string;
  manual: boolean;
  metricValue?: number;
  chatId?: string | null;
  automationRunId?: number | null;
}

export interface CustomerAutomationTickResult {
  message: string;
  processed: number;
  sent: number;
  skipped: number;
  errors: number;
  handles: string[];
  actions: CustomerAutomationActionResult[];
}

export function isCustomerAutomationRuleKey(
  value: string,
): value is CustomerAutomationRuleKey {
  return value === CUSTOMER_TENTH_MESSAGE_MEDIA_RULE_KEY ||
    value === CUSTOMER_DEEP_INTEREST_YOUTUBE_RULE_KEY;
}
