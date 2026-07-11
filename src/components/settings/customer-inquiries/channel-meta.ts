import type * as React from "react";
import {
  Globe,
  Instagram,
  Mail,
  PhoneMissed,
  Send,
  Star,
} from "@/components/layout/app-sidebar/dashboard-icons";
import type { NestChannel } from "@/lib/nest/types";

/** Every way an enquiry can reach the store, across Gmail, Instagram, Nest and Google. */
export type InboxChannel = "email" | "instagram" | "google_review" | NestChannel;

export type ChannelMeta = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Tinted chip shown in the conversation list and pane header. */
  chipClass: string;
  /** One-line explanation of how the conversation started, shown in the pane. */
  origin: string;
};

export const CHANNEL_META: Record<InboxChannel, ChannelMeta> = {
  email: {
    label: "Email",
    icon: Mail,
    chipClass: "border-gray-200 bg-gray-50 text-gray-600",
    origin: "This customer emailed your store inbox.",
  },
  instagram: {
    label: "Instagram",
    icon: Instagram,
    chipClass: "border-gray-200 bg-gray-50 text-gray-600",
    origin: "This customer sent your store a direct message on Instagram.",
  },
  google_review: {
    label: "Google review",
    icon: Star,
    chipClass: "border-gray-200 bg-gray-50 text-gray-600",
    origin: "This customer left a review on your Google Business Profile.",
  },
  website_chat: {
    label: "Website chat",
    icon: Globe,
    chipClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    origin:
      "Started from “Chat with store” on your website — the customer is texting from their phone.",
  },
  missed_call: {
    label: "Missed call",
    icon: PhoneMissed,
    chipClass: "border-amber-200 bg-amber-50 text-amber-700",
    origin:
      "This customer called and no one could answer, so Nest texted them back automatically.",
  },
  store_outreach: {
    label: "Store message",
    icon: Send,
    chipClass: "border-blue-200 bg-blue-50 text-blue-700",
    origin: "You started this conversation from Yellow Jersey.",
  },
};
