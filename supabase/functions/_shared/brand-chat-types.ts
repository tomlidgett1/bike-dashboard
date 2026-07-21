import type { BrandApiCallLog } from './brand-api-debug.ts';
import type {
  BrandChatConfigRow,
  LightspeedToolSettings,
} from './brand-chat-config.ts';
import type {
  ExtractedMedia,
  MessageEffect,
  MessageService,
} from './linq.ts';

export interface BrandChatInput {
  chatId: string;
  senderHandle: string;
  brandKey: string;
  message: string;
  sessionStartedAt?: string;
  images?: ExtractedMedia[];
  audio?: ExtractedMedia[];
  isGroupChat?: boolean;
  participantNames?: string[];
  chatName?: string | null;
  service?: MessageService;
  incomingEffect?: MessageEffect;
  voiceMode?: boolean;
  providerMessageId?: string | null;
}

export interface BrandChatImage {
  id: string;
  url: string;
}

export interface BrandImagePromptItem {
  id: string;
  url: string;
  alt: string;
  pageTitle: string;
}

export interface BrandBookingState {
  brand_key: string;
  chat_id: string;
  status: 'collecting' | 'awaiting_confirm' | 'creating' | 'created' | 'confirmed';
  sender_handle: string;
  sender_phone_e164: string | null;
  customer_name: string | null;
  bike: string | null;
  comments: string | null;
  drop_off_date: string | null;
  workorder_id: number | null;
  last_message_at: string;
  created_at: string;
}

export interface BrandPromptContext {
  brandKey: string;
  baseBrandKey: string;
  brandName: string;
  displayName: string;
  businessBaseline: string;
  isInternal: boolean;
  sessionStartedAt?: string;
  config: BrandChatConfigRow | null;
  lightspeedSettings: LightspeedToolSettings;
  bookingState: BrandBookingState | null;
  handoffPhoneE164: string | null;
  imageCatalog: BrandImagePromptItem[];
  systemPrompt: string;
  businessPrompt: string;
}

export interface BrandChatResult {
  text: string;
  brandName: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  images: BrandChatImage[];
  brandApiCalls: BrandApiCallLog[];
}
