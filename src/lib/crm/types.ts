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
  lightspeed_joined_at: string | null;
  last_purchase_at: string | null;
  total_spend: number;
  sale_count: number;
  enriched_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmContactGroup = {
  id: string;
  name: string;
  description: string | null;
  member_count?: number;
  created_at: string;
  updated_at: string;
};

export type CrmContactSort =
  | "recent"
  | "name_asc"
  | "joined_newest"
  | "joined_oldest"
  | "spend_high"
  | "spend_low"
  | "visits_high"
  | "visits_low"
  | "last_purchase";

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
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  created_at: string;
  sent_at: string | null;
};

export type CampaignItem = {
  title: string;
  subtitle?: string;
  /** Customer-facing sale price. */
  price?: string;
  /** Pre-discount price when on sale. */
  originalPrice?: string;
  /** e.g. "50% OFF" or "SALE" */
  badge?: string;
  discountPercent?: number;
  onSale?: boolean;
  imageUrl?: string;
  url?: string;
  lightspeedItemId?: string;
};

export type EmailBlock =
  | { id: string; type: "hero"; title?: string; imageUrl?: string }
  | { id: string; type: "heading"; text: string; align?: "left" | "center" }
  | { id: string; type: "text"; body: string; align?: "left" | "center" }
  | { id: string; type: "button"; text: string; url: string }
  | { id: string; type: "image"; url: string; alt?: string; linkUrl?: string }
  | { id: string; type: "products"; items: CampaignItem[]; layout: "row" | "card" }
  | { id: string; type: "spacer"; height: number }
  | { id: string; type: "divider" };

export type CampaignDesign = {
  /** template = legacy template renderer; builder = block editor; html = agent-owned HTML document */
  mode: "template" | "builder" | "html";
  layout: "classic" | "minimal" | "editorial";
  colors: {
    hero: string;
    accent: string;
    surface: string;
    text: string;
    muted: string;
    buttonText: string;
  };
  blocks?: EmailBlock[];
  /** Full email HTML document when mode is "html". Uses {{UNSUBSCRIBE_URL}} placeholder. */
  html?: string;
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
  /** Visual customisation + optional drag-drop builder blocks. */
  design?: CampaignDesign;
};

export type CrmProductOption = {
  id: string;
  name: string;
  price: number | null;
  imageUrl: string | null;
  url: string | null;
  lightspeedItemId: string | null;
  subtitle: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Lowercase + trim; returns null when the result isn't a sendable address. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!email || email.length > 320 || !EMAIL_RE.test(email)) return null;
  return email;
}

export function formatAud(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
