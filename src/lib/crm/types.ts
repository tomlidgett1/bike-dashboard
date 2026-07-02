// Shared types for the CRM email engine.

export type CrmContact = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  lightspeed_customer_id: string | null;
  source: string;
  opted_out: boolean;
  opted_out_at: string | null;
  opt_out_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmCampaignStatus = "draft" | "sending" | "sent" | "failed";

export type CrmCampaign = {
  id: string;
  subject: string;
  template_key: string;
  content: CampaignContent;
  sender_email: string | null;
  status: CrmCampaignStatus;
  intended_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  sent_at: string | null;
};

export type CampaignItem = {
  title: string;
  subtitle?: string;
  price?: string;
  imageUrl?: string;
  url?: string;
};

export type CampaignContent = {
  /** Header/title shown at the top of the email. */
  title: string;
  /** Intro/body copy. Blank lines split paragraphs. */
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  heroImageUrl?: string;
  footerText?: string;
  /** Optional featured item sections (new arrivals / featured bikes). */
  items?: CampaignItem[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Lowercase + trim; returns null when the result isn't a sendable address. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!email || email.length > 320 || !EMAIL_RE.test(email)) return null;
  return email;
}
