/** JSON-safe primitives used by CRM API contracts and persisted metadata. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const CUSTOMER_LIFECYCLE_STAGES = [
  "prospect",
  "new",
  "active",
  "vip",
  "reactivated",
  "at_risk",
  "dormant",
  "churned",
  "unknown",
] as const;

export type CustomerLifecycleStage = (typeof CUSTOMER_LIFECYCLE_STAGES)[number];

export const CUSTOMER_LIFECYCLE_LABELS: Record<CustomerLifecycleStage, string> = {
  prospect: "Prospects",
  new: "New",
  active: "Active",
  vip: "High value",
  reactivated: "Reactivated",
  at_risk: "At risk",
  dormant: "Dormant",
  churned: "Churned",
  unknown: "Unallocated",
};

export type CustomerIdentityKind =
  | "email"
  | "phone"
  | "lightspeed_customer_id"
  | "nest_handle"
  | "gmail_sender"
  | "instagram_thread";

export type CustomerIdentity = {
  id: string;
  customerId: string;
  kind: CustomerIdentityKind;
  value: string;
  normalisedValue: string;
  source: string;
  isPrimary: boolean;
  verifiedAt: string | null;
  createdAt: string;
};

export type ConsentChannel = "email" | "sms" | "voice" | "phone" | "push" | "in_app";
export type ConsentPurpose =
  | "transactional"
  | "service"
  | "marketing"
  | "community"
  | "events"
  | "reviews"
  | "warranty";
export type ConsentStatus = "granted" | "denied" | "withdrawn" | "unknown";

export type CustomerConsent = {
  id: string;
  customerId: string;
  channel: ConsentChannel;
  purpose: ConsentPurpose;
  status: ConsentStatus;
  source: string;
  legalBasis: string | null;
  grantedAt: string | null;
  withdrawnAt: string | null;
  updatedAt: string;
};

export type CustomerBike = {
  id: string;
  customerId: string;
  brand: string | null;
  model: string | null;
  modelYear: number | null;
  serialNumber: string | null;
  frameSize: string | null;
  colour: string | null;
  bikeType: string | null;
  isEBike: boolean;
  purchaseDate: string | null;
  lastServiceAt: string | null;
  nextServiceDueAt: string | null;
  warrantyExpiresAt: string | null;
  source: string;
  sourceId: string | null;
  metadata: Record<string, JsonValue>;
  createdAt: string;
  updatedAt: string;
};

export type CustomerWorkorderStatus =
  | "draft"
  | "open"
  | "booked"
  | "checked_in"
  | "in_progress"
  | "waiting_for_parts"
  | "ready"
  | "collected"
  | "cancelled"
  | "unknown";

export type CustomerWorkorder = {
  id: string;
  customerId: string;
  bikeId: string | null;
  reference: string | null;
  title: string;
  status: CustomerWorkorderStatus;
  bookedAt: string | null;
  promisedAt: string | null;
  completedAt: string | null;
  total: number | null;
  summary: string | null;
  source: string;
  sourceId: string | null;
  updatedAt: string;
};

export type CustomerEventKind =
  | "purchase"
  | "workorder"
  | "email"
  | "sms"
  | "call"
  | "enquiry"
  | "note"
  | "lifecycle"
  | "programme"
  | "consent"
  | "bike"
  | "task"
  | "other";

export type CustomerEvent = {
  id: string;
  customerId: string;
  kind: CustomerEventKind;
  title: string;
  summary: string | null;
  occurredAt: string;
  source: string;
  sourceId: string | null;
  actorLabel: string | null;
  channel: ConsentChannel | null;
  metadata: Record<string, JsonValue>;
};

export type TaskPriority = "urgent" | "high" | "normal" | "low";
export type TaskStatus =
  | "open"
  | "in_progress"
  | "completed"
  | "dismissed"
  | "snoozed"
  | "cancelled";

export type CustomerTask = {
  id: string;
  customerId: string | null;
  kind: string;
  title: string;
  summary: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  snoozedUntil: string | null;
  source: string;
  sourceId: string | null;
  actionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentRiskTier = "low" | "approval" | "restricted";
export type AgentActionStatus =
  | "draft"
  | "proposed"
  | "awaiting_approval"
  | "approved"
  | "executing"
  | "completed"
  | "dismissed"
  | "snoozed"
  | "failed"
  | "cancelled"
  | "expired";

export type AgentActionSource = "agent" | "task" | "lifecycle" | "domestique" | "enquiry";

export type AgentAction = {
  id: string;
  customerId: string | null;
  taskId: string | null;
  source: AgentActionSource;
  sourceId: string;
  actionType: string;
  title: string;
  summary: string | null;
  status: AgentActionStatus;
  riskTier: AgentRiskTier;
  channel: ConsentChannel | null;
  proposal: Record<string, JsonValue>;
  decisionReason: string | null;
  dueAt: string | null;
  snoozedUntil: string | null;
  executedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerSummary = {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  lightspeedCustomerId: string | null;
  totalSpend: number;
  saleCount: number;
  lastPurchaseAt: string | null;
  lifecycleStage: CustomerLifecycleStage;
  lifecycleLabel: string;
  lastInteractionAt: string | null;
  dataFreshnessAt: string | null;
  bikeCount: number;
  openTaskCount: number;
  nextActionAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerProfile = CustomerSummary & {
  identities: CustomerIdentity[];
  consents: CustomerConsent[];
  bikes: CustomerBike[];
  workorders: CustomerWorkorder[];
  openTasks: CustomerTask[];
  pendingActions: AgentAction[];
};

export type CustomerSearchSort =
  | "name_asc"
  | "updated_desc"
  | "last_purchase_desc"
  | "spend_desc";

export type CustomerSearchFilters = {
  query?: string;
  lifecycleStage?: CustomerLifecycleStage;
  specialFilter?: "opted_in" | "no_email";
  hasOpenTask?: boolean;
  sort?: CustomerSearchSort;
  limit?: number;
  cursor?: string | null;
};

export type KeysetCursor = {
  value: string | number | null;
  id: string;
  sort: CustomerSearchSort;
};

export type TimelineCursor = {
  occurredAt: string;
  id: string;
};

export type PaginatedResponse<T> = {
  items: T[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
};

export type TodayGroupKey =
  | "overdue"
  | "due_today"
  | "awaiting_approval"
  | "enquiries"
  | "upcoming";

export const TODAY_GROUP_LABELS: Record<TodayGroupKey, string> = {
  overdue: "Overdue",
  due_today: "Due today",
  awaiting_approval: "Awaiting approval",
  enquiries: "Customer enquiries",
  upcoming: "Coming up",
};

export type TodayItem = {
  id: string;
  source: AgentActionSource;
  sourceId: string;
  customerId: string | null;
  customerName: string | null;
  title: string;
  summary: string | null;
  priority: TaskPriority;
  status: TaskStatus | AgentActionStatus;
  riskTier: AgentRiskTier;
  dueAt: string | null;
  createdAt: string;
  proposal?: Record<string, JsonValue>;
  decisionReason?: string | null;
  availableDecisions: Array<"approve" | "dismiss" | "snooze">;
};

export type TodayGroup = {
  key: TodayGroupKey;
  label: string;
  count: number;
  items: TodayItem[];
};

export type TodayQueue = {
  generatedAt: string;
  groups: TodayGroup[];
  totalCount: number;
};

export type AutomationState = "active" | "paused" | "review" | "unavailable";

export type AutomationSummary = {
  id: string;
  source: "programme_registry" | "lifecycle" | "domestique";
  key: string;
  name: string;
  description: string;
  state: AutomationState;
  channelLabel: string;
  riskTier: AgentRiskTier;
  lastRunAt: string | null;
  pendingCount: number;
  completedCount: number;
  attributedRevenue: number;
  mechanics: string[];
};

export type AutomationRunSummary = {
  id: string;
  name: string;
  automationName: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  summary: string | null;
};

export type AutomationSummaryResponse = {
  generatedAt: string;
  automations: AutomationSummary[];
  approvals: Array<TodayItem | AgentAction>;
  runs: AutomationRunSummary[];
};

export type CustomerListResponse = PaginatedResponse<CustomerSummary> & {
  total?: number;
};
export type CustomerProfileResponse = { customer: CustomerProfile };
export type CustomerTimelineResponse = PaginatedResponse<CustomerEvent>;
export type TodayQueueResponse = { today: TodayQueue };
export type ActionDecision = "approve" | "dismiss" | "snooze";
export type ActionMutationRequest = {
  decision: ActionDecision;
  source?: AgentActionSource;
  snoozeUntil?: string;
};
export type ActionMutationResponse = {
  action: AgentAction | TodayItem;
  executed: boolean;
};

export type ApiErrorCode =
  | "UNAUTHORISED"
  | "STORE_ACCESS_REQUIRED"
  | "CRM_NOT_AVAILABLE"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "CONFLICT"
  | "CONSENT_REQUIRED"
  | "APPROVAL_REQUIRED"
  | "DATABASE_ERROR";

export type ApiErrorResponse = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, JsonValue>;
  };
};
