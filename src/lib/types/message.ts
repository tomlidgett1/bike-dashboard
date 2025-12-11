// ============================================================
// MESSAGING SYSTEM TYPES
// ============================================================
// TypeScript interfaces for the messaging system

export type ConversationStatus = 'active' | 'archived' | 'closed';
export type ParticipantRole = 'buyer' | 'seller' | 'participant';
export type NotificationPreference = 'all' | 'none';
export type MessageType = 'user' | 'system';
export type NotificationType = 
  | 'new_message' 
  | 'new_conversation'
  | 'offer_received'
  | 'offer_accepted'
  | 'offer_rejected'
  | 'offer_countered'
  | 'offer_expired'
  | 'purchase_complete'
  | 'listing_sold';

export type NotificationCategory = 'message' | 'offer' | 'transaction' | 'system';
export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';
export type EmailDeliveryStatus = 'pending' | 'scheduled' | 'sent' | 'skipped' | 'failed';
export type EmailFrequency = 'instant' | 'smart' | 'digest' | 'critical_only';

// ============================================================
// DATABASE ENTITIES
// ============================================================

export interface Conversation {
  id: string;
  product_id: string | null;
  subject: string;
  status: ConversationStatus;
  last_message_at: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  role: ParticipantRole;
  last_read_at: string | null;
  unread_count: number;
  is_archived: boolean;
  notification_preference: NotificationPreference;
  joined_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  content: string;
  message_type: MessageType;
  is_deleted: boolean;
  created_at: string;
  edited_at: string | null;
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  conversation_id: string;
  message_id: string | null;
  offer_id: string | null;
  notification_category: NotificationCategory;
  priority: NotificationPriority;
  is_read: boolean;
  is_emailed: boolean;
  email_sent_at: string | null;
  email_scheduled_for: string | null;
  email_delivery_status: EmailDeliveryStatus;
  batch_key: string | null;
  created_at: string;
  read_at: string | null;
}

export interface NotificationPreferences {
  id: string;
  user_id: string;
  email_enabled: boolean;
  email_frequency: EmailFrequency;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  created_at: string;
  updated_at: string;
}

// ============================================================
// ENRICHED TYPES WITH RELATIONS
// ============================================================

export interface MessageWithAttachments extends Message {
  attachments: MessageAttachment[];
  sender?: {
    user_id: string;
    name: string;
    business_name: string;
    logo_url: string | null;
  };
}

export interface ConversationWithParticipants extends Conversation {
  participants: ConversationParticipant[];
  product?: {
    id: string;
    description: string;
    display_name: string | null;
    price: number;
    primary_image_url: string | null;
  };
  last_message?: Message;
}

export interface ConversationWithMessages extends ConversationWithParticipants {
  messages: MessageWithAttachments[];
}

export interface NotificationWithDetails extends Notification {
  conversation?: {
    id: string;
    subject: string;
    product_id: string | null;
  };
  message?: {
    id: string;
    content: string;
    sender_id: string | null;
  };
  sender?: {
    user_id: string;
    name: string;
    business_name: string;
  };
}

// ============================================================
// API REQUEST/RESPONSE TYPES
// ============================================================

export interface CreateConversationRequest {
  productId?: string;
  recipientUserId: string;
  subject?: string;
  initialMessage: string;
}

export interface CreateConversationResponse {
  conversation: ConversationWithParticipants;
  message: Message;
}

export interface SendMessageRequest {
  content: string;
  attachments?: File[];
}

export interface SendMessageResponse {
  message: MessageWithAttachments;
}

export interface GetConversationsRequest {
  page?: number;
  limit?: number;
  status?: ConversationStatus;
  archived?: boolean;
}

export interface GetConversationsResponse {
  conversations: ConversationListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface GetConversationResponse {
  conversation: ConversationWithMessages;
}

export interface GetNotificationsRequest {
  limit?: number;
  unreadOnly?: boolean;
}

export interface GetNotificationsResponse {
  notifications: NotificationWithDetails[];
  total: number;
  unread: number;
}

export interface UnreadCountResponse {
  count: number;
}

// ============================================================
// UI COMPONENT TYPES
// ============================================================

export interface ConversationListItem {
  id: string;
  subject: string;
  status: ConversationStatus;
  last_message_at: string;
  message_count: number;
  unread_count: number;
  is_archived: boolean;
  
  // Participants (excluding current user)
  other_participants: {
    user_id: string;
    name: string;
    business_name: string;
    logo_url: string | null;
  }[];
  
  // Product info (if product conversation)
  product?: {
    id: string;
    description: string;
    display_name: string | null;
    primary_image_url: string | null;
  };
  
  // Last message preview
  last_message?: {
    content: string;
    sender_id: string | null;
    created_at: string;
  };
}

export interface MessageBubbleProps {
  message: MessageWithAttachments;
  isCurrentUser: boolean;
  showAvatar?: boolean;
}

export interface ConversationHeaderProps {
  conversation: ConversationWithParticipants;
  onArchive?: () => void;
  onClose?: () => void;
}

export interface MessageComposerProps {
  conversationId: string;
  onSend: (message: Message) => void;
  disabled?: boolean;
}

// ============================================================
// UTILITY TYPES
// ============================================================

export interface AttachmentUploadProgress {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  url?: string;
}

export interface ConversationFilter {
  status?: ConversationStatus;
  archived?: boolean;
  search?: string;
  productId?: string;
}

export interface MessagePagination {
  page: number;
  limit: number;
  hasMore: boolean;
  total: number;
}

