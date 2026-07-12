import type {
  AgentAction,
  AutomationSummary,
  CustomerEvent,
  CustomerProfile,
  CustomerSummary,
  TodayItem,
} from "@/lib/crm/customer-graph/types";

export type CrmAction = TodayItem | AgentAction;
export type CrmCustomerSummary = CustomerSummary;
export type CrmCustomerProfile = CustomerProfile;
export type CrmCustomerEvent = CustomerEvent;
export type CrmAutomation = AutomationSummary;

export type TodayGroupResponse = {
  id?: string;
  key?: string;
  label: string;
  actions?: CrmAction[];
  items?: CrmAction[];
  count?: number;
};

export type TodayResponse = {
  groups?: TodayGroupResponse[];
  summary?: Record<string, unknown>;
  today?: {
    groups: TodayGroupResponse[];
    totalCount?: number;
    generatedAt?: string;
  };
};

export type CustomerListResponse = {
  customers?: CrmCustomerSummary[];
  items?: CrmCustomerSummary[];
  nextCursor?: string | null;
  total?: number;
  page?: {
    nextCursor?: string | null;
    hasMore?: boolean;
    limit?: number;
  };
};

export type CustomerTimelineResponse = {
  events?: CrmCustomerEvent[];
  items?: CrmCustomerEvent[];
  nextCursor?: string | null;
  page?: {
    nextCursor?: string | null;
    hasMore?: boolean;
  };
};

export type AutomationResponse = {
  automations?: CrmAutomation[];
  approvals?: CrmAction[];
  runs?: AutomationRun[];
};

export type AutomationRun = {
  id: string;
  name?: string;
  automationName?: string;
  status?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  summary?: string | null;
};

export function actionTitle(action: CrmAction): string {
  return action.title;
}

export function actionSummary(action: CrmAction): string | null {
  return action.summary;
}

export function actionCustomerId(action: CrmAction): string | null {
  return action.customerId;
}

export function actionCustomerName(action: CrmAction): string | null {
  return "customerName" in action ? action.customerName : null;
}

export function actionDueAt(action: CrmAction): string | null {
  return action.dueAt;
}

export function actionRiskTier(action: CrmAction): string {
  return action.riskTier;
}

export function actionDecisions(
  action: CrmAction,
): Array<"approve" | "dismiss" | "snooze"> {
  if ("availableDecisions" in action) return action.availableDecisions;
  return ["approve", "dismiss", "snooze"];
}

export function formatAud(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCrmDate(
  value: string | null | undefined,
  fallback = "Not recorded",
): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatCrmDateTime(
  value: string | null | undefined,
  fallback = "Not recorded",
): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function errorMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object") return fallback;
  const record = value as { error?: unknown; message?: unknown };
  if (typeof record.message === "string") return record.message;
  if (typeof record.error === "string") return record.error;
  if (
    record.error &&
    typeof record.error === "object" &&
    "message" in record.error &&
    typeof record.error.message === "string"
  ) {
    return record.error.message;
  }
  return fallback;
}
