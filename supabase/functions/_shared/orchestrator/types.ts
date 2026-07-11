import type {
  ExtractedMedia,
  MessageEffect,
  MessageService,
  Reaction,
} from "../linq.ts";
import type {
  ConnectedAccount,
  ConversationSummary,
  Entity,
  MemoryItem,
  NestUser,
  PendingEmailSendAction,
  StoredMessage,
  ToolTrace,
  UserProfile,
} from "../state.ts";
import type {
  InputContentPart,
  InputMessage,
  ModelTier,
} from "../ai/models.ts";
import type { BrandPromptContext } from "../brand-chat-types.ts";

// ═══════════════════════════════════════════════════════════════
// Agent taxonomy
// ═══════════════════════════════════════════════════════════════

export type AgentName =
  | "casual"
  | "productivity"
  | "research"
  | "recall"
  | "operator"
  | "onboard"
  | "meeting_prep"
  | "chat"
  | "smart";

// ═══════════════════════════════════════════════════════════════
// Tool namespaces & side-effect classification
// ═══════════════════════════════════════════════════════════════

export type ToolNamespace =
  | "memory.read"
  | "memory.write"
  | "composio.read"
  | "composio.write"
  | "email.read"
  | "email.write"
  | "calendar.read"
  | "calendar.write"
  | "contacts.read"
  | "granola.read"
  | "web.search"
  | "knowledge.search"
  | "messaging.react"
  | "messaging.effect"
  | "media.generate"
  | "travel.search"
  | "weather.search"
  | "reminders.manage"
  | "notifications.watch"
  | "youtube.search"
  | "brand.lightspeed.customer.read"
  | "brand.lightspeed.inventory.read"
  | "brand.lightspeed.workorders.read"
  | "brand.lightspeed.sales.read"
  | "brand.booking.read"
  | "brand.booking.write"
  | "brand.booking.create"
  | "brand.deputy.read"
  | "brand.deputy.write"
  | "admin.internal";

export type SideEffect = "read" | "draft" | "commit";

// ═══════════════════════════════════════════════════════════════
// Option A: Domain classification & capability-based routing
// ═══════════════════════════════════════════════════════════════

export type DomainTag =
  | "email"
  | "calendar"
  | "meeting_prep"
  | "research"
  | "recall"
  | "contacts"
  | "reminders"
  | "brand"
  | "general";

export type Capability =
  | "composio.read"
  | "composio.write"
  | "email.read"
  | "email.write"
  | "calendar.read"
  | "calendar.write"
  | "contacts.read"
  | "granola.read"
  | "web.search"
  | "knowledge.search"
  | "memory.read"
  | "memory.write"
  | "travel.search"
  | "weather.search"
  | "reminders.manage"
  | "notifications.watch"
  | "youtube.search"
  | "brand.lightspeed.customer.read"
  | "brand.lightspeed.inventory.read"
  | "brand.lightspeed.workorders.read"
  | "brand.lightspeed.sales.read"
  | "brand.booking.read"
  | "brand.booking.write"
  | "brand.booking.create"
  | "brand.deputy.read"
  | "brand.deputy.write"
  | "deep_profile";

export type MemoryDepth = "none" | "light" | "full";

export interface ClassifierResult {
  mode: "chat" | "smart";
  primaryDomain: DomainTag;
  secondaryDomains?: DomainTag[];
  confidence: number;
  requiredCapabilities: Capability[];
  preferredCapabilities?: Capability[];
  memoryDepth: MemoryDepth;
  requiresToolUse: boolean;
  isConfirmation: boolean;
  pendingActionId?: string | null;
  style: UserStyle;
}

// ═══════════════════════════════════════════════════════════════
// Prompt composition
// ═══════════════════════════════════════════════════════════════

export type PromptLayer =
  | "identity"
  | "conversation_behavior"
  | "memory_continuity"
  | "message_shaping"
  | "agent"
  | "context"
  | "turn";

// ═══════════════════════════════════════════════════════════════
// Routing
// ═══════════════════════════════════════════════════════════════

export type RouteMode = "direct" | "single_agent" | "onboard";

export type UserStyle = "brief" | "normal" | "deep";

export interface RouteDecision {
  mode: RouteMode;
  agent: AgentName;
  allowedNamespaces: ToolNamespace[];
  needsMemoryRead: boolean;
  needsMemoryWriteCandidate: boolean;
  needsWebFreshness: boolean;
  userStyle: UserStyle;
  confidence: number;
  fastPathUsed: boolean;
  routerLatencyMs: number;
  modelTierOverride?: import("../ai/models.ts").ModelTier;
  confirmationState?: "confirmed" | "not_confirmation" | "not_checked";
  // Option A fields (backwards-compatible)
  primaryDomain?: DomainTag;
  secondaryDomains?: DomainTag[];
  classifierResult?: ClassifierResult;
  memoryDepth?: MemoryDepth;
  forcedToolChoice?: string;
  routeLayer?: "0A" | "0B-casual" | "0B-knowledge" | "0B-research" | "0B-recall" | "0B-group" | "0C" | "brand" | "comp" | "v3-F1" | "v3-F2" | "v3-F3" | "v3-F4" | "v3-Fcomposio" | "v3-Fcomposio-email-watch" | "v3-R1" | "v3-R2" | "v3-R3" | "v3-R4" | "v3-R5" | "v3-R6" | "v3-R7" | "v3-R8" | "v3-R9" | "v3-R10";
  routeReason?: string;
  matchedDisqualifierBucket?: string | null;
  hadPendingState?: boolean;
  reasoningEffortOverride?: import("../ai/models.ts").ReasoningEffort;
  modelOverride?: string;
}

// ═══════════════════════════════════════════════════════════════
// Working memory (Phase 2 stub)
// ═══════════════════════════════════════════════════════════════

export interface WorkingMemory {
  activeTopics: string[];
  unresolvedReferences: string[];
  pendingActions: Array<{
    type: string;
    description: string;
    createdTurnId: string;
  }>;
  lastEntityMentioned: string | null;
  awaitingConfirmation?: boolean;
  awaitingChoice?: boolean;
  awaitingMissingParameter?: boolean;
}

export function emptyWorkingMemory(): WorkingMemory {
  return {
    activeTopics: [],
    unresolvedReferences: [],
    pendingActions: [],
    lastEntityMentioned: null,
    awaitingConfirmation: false,
    awaitingChoice: false,
    awaitingMissingParameter: false,
  };
}

// ═══════════════════════════════════════════════════════════════
// Onboarding context (passed through when isOnboarding = true)
// ═══════════════════════════════════════════════════════════════

export interface OnboardingClassification {
  entryState: string;
  confidence: number;
  recommendedWedge: string;
  shouldAskName: boolean;
  includeTrustReassurance: boolean;
  needsClarification: boolean;
  emotionalLoad: "none" | "low" | "moderate" | "high";
}

export interface OnboardingContext {
  nestUser: NestUser;
  onboardUrl: string;
  experimentVariants: Record<string, string>;
  classification?: OnboardingClassification;
  detectedWedge?: string;
  pdlContext?: string;
}

// ═══════════════════════════════════════════════════════════════
// Turn input — everything the orchestrator needs from the caller
// ═══════════════════════════════════════════════════════════════

export interface TurnInput {
  chatId: string;
  userMessage: string;
  images: ExtractedMedia[];
  audio: ExtractedMedia[];
  senderHandle: string;
  isGroupChat: boolean;
  participantNames: string[];
  chatName: string | null;
  service?: MessageService;
  incomingEffect?: MessageEffect;
  authUserId: string | null;
  isOnboarding: boolean;
  onboardingContext?: OnboardingContext;
  isProactiveReply?: boolean;
  timezone?: string | null;
  /** Override the model used in the agent loop (for admin compare testing) */
  modelOverride?: string;
  /** DBG# sessions only: text appended to the composed system prompt (compare tab A/B testing). */
  comparePromptAppend?: string;
  /** DBG# sessions only: force casual compact lane vs full compose path. */
  compareRoutePreset?: "auto" | "casual_lane" | "full_compose";
  /** When true, the response will be delivered as a voice memo — write for spoken delivery. */
  voiceMode?: boolean;
  /** Persistent iMessage assistant mode override, e.g. `hey comp`. */
  assistantMode?: "default" | "composio";
  /** Brand-mode only: prompt/config/session state carried through the shared orchestrator path. */
  brandContext?: BrandPromptContext | null;
  /** LINQ provider message id for inbound turns (used to backfill attachment metadata). */
  providerMessageId?: string | null;
  /**
   * Optional callback to deliver a pre-ack message (e.g. "let me check your calendar")
   * while the main agent loop runs. Only fires when `user_profiles.new_router = true`
   * and the route predicts a tool-using action. Best-effort — failures are swallowed.
   */
  onPreAck?: (text: string) => Promise<void> | void;
}

// ═══════════════════════════════════════════════════════════════
// Turn context — hydrated state available during the turn
// ═══════════════════════════════════════════════════════════════

export interface TurnContext {
  history: StoredMessage[];
  formattedHistory: InputMessage[];
  messageContent: InputContentPart[];
  recentTurns: Array<{ role: string; content: string }>;
  memoryItems: MemoryItem[];
  entities: Entity[];
  summaries: ConversationSummary[];
  toolTraces: ToolTrace[];
  ragEvidence: string;
  ragEvidenceBlockCount: number;
  senderProfile: UserProfile | null;
  connectedAccounts: ConnectedAccount[];
  /** Minted per turn in handle-turn when the user has no Granola link; full prompt uses this for granola-auth?link_state=… */
  granolaConnectionUrl?: string | null;
  transcriptions: string[];
  transcriptionFailed: boolean;
  workingMemory: WorkingMemory;
  pendingEmailSend: PendingEmailSendAction | null;
  pendingEmailSends: PendingEmailSendAction[];
  resolvedUserContext: ResolvedUserContext | null;
  /** Real-time user situation snapshot (live calendar tz, current location,
   *  travel state). Resolved once per turn in handle-turn and threaded into
   *  every system prompt that reasons about the user. Optional so legacy
   *  TurnContext constructions don't need updating. */
  userSituation?: import('../user-situation.ts').UserSituation | null;
}

export type LocationConfidence = "none" | "low" | "medium" | "high";
export type LocationPrecision =
  | "unknown"
  | "timezone_region"
  | "country"
  | "state"
  | "city"
  | "suburb"
  | "address";
export type LocationRole = "home" | "current" | "frequent" | "regional";
export type AssumptionPolicy = "direct" | "soft_assumption" | "clarify";

export interface ResolvedLocationContext {
  label: string;
  role: LocationRole;
  precision: LocationPrecision;
  confidence: LocationConfidence;
  source: "memory" | "profile" | "timezone";
  explicitness: "explicit" | "inferred" | "fallback";
  memoryId: number | null;
  lastUpdatedAt: string | null;
}

export interface ResolvedUserContext {
  homeLocation: ResolvedLocationContext | null;
  currentLocation: ResolvedLocationContext | null;
  workLocation: ResolvedLocationContext | null;
  assumedLocation: ResolvedLocationContext | null;
  assumptionPolicy: AssumptionPolicy;
  dietaryPreferences: string[];
  reasons: string[];
}

// ═══════════════════════════════════════════════════════════════
// Agent configuration
// ═══════════════════════════════════════════════════════════════

export interface ToolPolicy {
  allowedNamespaces: ToolNamespace[];
  blockedNamespaces: ToolNamespace[];
  maxToolRounds: number;
}

export interface AgentConfig {
  name: AgentName;
  instructions: string;
  toolPolicy: ToolPolicy;
  modelTier: ModelTier;
  maxOutputTokens: number;
}

// ═══════════════════════════════════════════════════════════════
// Agent loop result
// ═══════════════════════════════════════════════════════════════

export interface RememberedUser {
  name?: string;
  fact?: string;
  isForSender?: boolean;
}

export interface GeneratedImage {
  url: string;
  prompt: string;
  /** When true, this is an image edit (Nano Banana Pro 2) — requires user-supplied image URLs */
  isEdit?: boolean;
}

export interface RoundTrace {
  round: number;
  apiLatencyMs: number;
  toolExecLatencyMs: number;
  totalRoundMs: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  status: string;
  functionCallCount: number;
  webSearchCalled: boolean;
  textLength: number;
  wasRetry: boolean;
  retryReason?: string;
  maxOutputTokens: number;
  reasoningEffort?: string;
}

export interface AgentLoopResult {
  text: string | null;
  reaction: Reaction | null;
  effect: MessageEffect | null;
  rememberedUser: RememberedUser | null;
  generatedImage: GeneratedImage | null;
  toolCallTraces: ToolCallTrace[];
  toolCallsBlocked: ToolCallBlockedTrace[];
  rounds: number;
  toolsUsed: Array<{ tool: string; detail?: string }>;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  systemPromptLength: number;
  systemPrompt: string;
  initialMessages: Array<{ role: string; content: unknown }>;
  availableToolNames: string[];
  effectiveModel: string;
  roundTraces: RoundTrace[];
  promptComposeMs: number;
  toolFilterMs: number;
}

// ═══════════════════════════════════════════════════════════════
// Turn trace — structured observability for every turn
// ═══════════════════════════════════════════════════════════════

export interface ToolCallTrace {
  name: string;
  namespace: ToolNamespace;
  sideEffect: SideEffect;
  latencyMs: number;
  outcome: "success" | "error" | "timeout";
  inputSummary?: string;
  approvalGranted?: boolean;
  approvalMethod?: "explicit" | "implicit" | "exempt";
  pendingActionId?: number;
  sendResolutionSource?:
    | "model_input"
    | "pending_action"
    | "pending_action_validated"
    | "none";
  pendingActionFailureReason?: string;
}

export interface ToolCallBlockedTrace {
  name: string;
  namespace: ToolNamespace;
  reason: "namespace_denied" | "side_effect_denied" | "rate_limited";
  detail?: string;
  pendingActionId?: number;
}

export interface PendingActionDebug {
  pendingEmailSendCount: number;
  pendingEmailSendId: number | null;
  pendingEmailSendStatus: string | null;
  draftIdPresent: boolean;
  accountPresent: boolean;
  confirmationResult: "confirmed" | "not_confirmation" | "not_checked";
  [key: string]: unknown;
}

export interface ContextSubTimings {
  historyMs: number;
  memoryMs: number;
  summariesMs: number;
  toolTracesMs: number;
  profileMs: number;
  accountsMs: number;
  messageContentMs: number;
  ragMs: number;
  workingMemoryMs: number;
  formatHistoryMs: number;
  memoryActiveItemsMs?: number;
  memorySemanticLookupMs?: number;
  memoryEmbeddingMs?: number;
  memoryVectorSearchMs?: number;
  memoryScoringMs?: number;
  memorySemanticSkipped?: boolean;
  entitiesMs?: number;
  entitiesCoreMs?: number;
  entitiesMentionMs?: number;
  entitiesSemanticMs?: number;
  entitiesEmbeddingMs?: number;
  entitiesVectorSearchMs?: number;
  entitiesHydrateMs?: number;
  entitiesSemanticSkipped?: boolean;
  entitiesLoaded?: number;
}

export interface TurnTrace {
  turnId: string;
  chatId: string;
  senderHandle: string;
  timestamp: string;

  // Input
  userMessage: string;
  timezoneResolved: string | null;

  // Routing
  routeDecision: RouteDecision;
  // Option A observability
  classifierResult?: ClassifierResult;
  routeLayer?: "0A" | "0B-casual" | "0B-knowledge" | "0B-research" | "0B-recall" | "0B-group" | "0C" | "brand" | "v3-F1" | "v3-F2" | "v3-F3" | "v3-F4" | "v3-Fcomposio" | "v3-Fcomposio-email-watch" | "v3-R1" | "v3-R2" | "v3-R3" | "v3-R4" | "v3-R5" | "v3-R6" | "v3-R7" | "v3-R8" | "v3-R9" | "v3-R10";
  routeReason?: string;
  matchedDisqualifierBucket?: string | null;
  hadPendingState?: boolean;
  classifierLatencyMs?: number;

  // Context
  systemPromptLength: number;
  systemPromptHash: string;
  memoryItemsLoaded: number;
  ragEvidenceBlocks: number;
  summariesLoaded: number;
  connectedAccountsCount: number;
  historyMessagesCount: number;
  contextBuildLatencyMs: number;
  contextSubTimings: ContextSubTimings | null;
  resolvedUserContext: ResolvedUserContext | null;

  // Agent
  agentName: AgentName;
  modelUsed: string;
  agentLoopRounds: number;
  agentLoopLatencyMs: number;

  // Per-round detail
  roundTraces: RoundTrace[];
  promptComposeMs: number;
  toolFilterMs: number;

  // Tools
  toolCalls: ToolCallTrace[];
  toolCallsBlocked: ToolCallBlockedTrace[];
  toolCallCount: number;
  toolTotalLatencyMs: number;

  // Model usage
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;

  // Response
  responseText: string | null;
  responseLength: number;

  // Overall
  totalLatencyMs: number;
  routerContextMs: number;
  contextPath: "full" | "light" | "memory-light" | "minimal" | "group" | "brand";
  pendingActionDebug: PendingActionDebug;

  // Full prompt context (for debug dashboard)
  systemPrompt: string | null;
  initialMessages: Array<{ role: string; content: unknown }> | null;
  availableToolNames: string[];

  // Error
  errorMessage?: string;
  errorStage?: string;
}

// ═══════════════════════════════════════════════════════════════
// Turn result — final output from handleTurn()
// ═══════════════════════════════════════════════════════════════

export interface TurnResult {
  text: string | null;
  reaction: Reaction | null;
  effect: MessageEffect | null;
  rememberedUser: RememberedUser | null;
  generatedImage: GeneratedImage | null;
  trace: TurnTrace;
}

// Re-export commonly used types from dependencies
export type { ExtractedMedia, MessageEffect, MessageService, Reaction };
export type {
  ConnectedAccount,
  ConversationSummary,
  Entity,
  MemoryItem,
  NestUser,
  StoredMessage,
  ToolTrace,
  UserProfile,
};
