import type { MessageEffect, NormalisedIncomingMessage } from '../linq.ts';

export type ContactDelegationStatus =
  | 'draft'
  | 'awaiting_owner_approval'
  | 'awaiting_target_start'
  | 'recipient_opt_in'
  | 'active'
  | 'completed'
  | 'cancelled_by_owner'
  | 'cancelled_by_target'
  | 'blocked_unsafe'
  | 'failed_to_start'
  | 'undeliverable'
  | 'expired';

export type ContactDelegationSenderRole =
  | 'owner'
  | 'nest_to_owner'
  | 'target'
  | 'nest_to_target'
  | 'system';

export type TargetReplyIntent =
  | 'identity_clarification'
  | 'wrong_number'
  | 'opt_out'
  | 'refusal'
  | 'partial_answer'
  | 'complete_answer'
  | 'needs_owner_input'
  | 'unsafe'
  | 'unknown';

export interface ContactDelegationTask {
  id: string;
  ownerChatId: string;
  ownerHandle: string;
  ownerAuthUserId: string | null;
  ownerBotNumber: string;
  targetChatId: string | null;
  targetHandle: string;
  targetDisplayName: string | null;
  selectedContactResourceName: string | null;
  selectedContactAccount: string | null;
  selectedContactProvider: string | null;
  selectedPhoneE164: string;
  originalPhone: string | null;
  objective: string;
  objectiveType: string;
  requiredFields: string[];
  collectedFields: DelegationCollectedFields;
  fieldEvidence: Record<string, unknown>;
  status: ContactDelegationStatus;
  openerText: string | null;
  taskOpenerText: string | null;
  ownerApprovalText: string | null;
  confirmationNonce: string;
  targetFollowupCount: number;
  noResponseFollowupCount: number;
  ownerOutboundCount: number;
  openerIdempotencyKey: string | null;
  ownerReceiptSentAt: string | null;
  lastOwnerNotifiedAt: string | null;
  lastTargetMessageAt: string | null;
  nextTargetFollowupAt: string | null;
  targetResponseDeadlineAt: string | null;
  expiresAt: string;
  completedAt: string | null;
  terminalReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DelegationCollectedFields {
  date?: string;
  time?: string;
  timezone_or_context?: string;
  location?: string;
  confidence?: 'low' | 'medium' | 'high';
}

export interface ContactDelegationMessage {
  id: number;
  taskId: string;
  chatId: string;
  senderRole: ContactDelegationSenderRole;
  senderHandle: string | null;
  content: string;
  providerMessageId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface DelegationDetection {
  matched: boolean;
  contactQuery: string | null;
  directPhone: string | null;
  recipientName: string | null;
  objective: string | null;
  reasonForMessage: string | null;
  requestedTone: string | null;
  reason: string;
}

export interface DelegationContactChoice {
  targetHandle: string;
  targetDisplayName: string | null;
  selectedPhoneE164: string;
  originalPhone: string | null;
  selectedContactResourceName: string | null;
  selectedContactAccount: string | null;
  selectedContactProvider: string | null;
  ambiguityReason?: string;
  alternatives?: Array<{
    name: string | null;
    phones: string[];
    account: string | null;
    provider: string | null;
    resourceName: string | null;
  }>;
}

export interface DelegationStartResult {
  handled: boolean;
  ownerMessage?: string;
  reason: string;
}

export interface DelegationRuntime {
  dryRun: boolean;
  sendOwnerMessage: (chatId: string, text: string, effect?: MessageEffect) => Promise<string | null>;
  sendTargetMessage: (chatId: string, text: string) => Promise<string | null>;
  createTargetChat: (from: string, to: string[], text: string) => Promise<{
    chatId: string | null;
    messageId: string | null;
    deliveryStatus?: string | null;
  }>;
}

export interface DelegationTurnContext {
  message: NormalisedIncomingMessage;
  authUserId: string | null;
  eventId?: number;
}

export interface CompletionExtraction {
  intent: TargetReplyIntent;
  collectedFields: DelegationCollectedFields;
  nextMessageToTarget: string | null;
  messageToOwner: string | null;
  reason: string;
}

export interface ExpiryResult {
  processed: number;
  expired: number;
  receiptRetried: number;
  failed: number;
  taskIds: string[];
}
