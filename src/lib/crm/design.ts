// Email design tokens + block-based builder types for CRM campaigns.

import type { CampaignContent, CampaignItem, CampaignDesign, EmailBlock } from "./types";

export type CampaignLayout = CampaignDesign["layout"];

export type CampaignDesignColors = CampaignDesign["colors"];

export const DEFAULT_DESIGN_COLORS: CampaignDesignColors = {
  hero: "#0a0a0a",
  accent: "#F5C518",
  surface: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  buttonText: "#0a0a0a",
};

export const LAYOUT_PRESETS: Record<
  CampaignLayout,
  { label: string; description: string; colors: Partial<CampaignDesignColors> }
> = {
  classic: {
    label: "Classic",
    description: "Dark hero, yellow accent — Yellow Jersey style",
    colors: DEFAULT_DESIGN_COLORS,
  },
  minimal: {
    label: "Minimal",
    description: "Clean white layout with subtle grey accents",
    colors: {
      hero: "#ffffff",
      accent: "#111827",
      surface: "#f9fafb",
      text: "#111827",
      muted: "#6b7280",
      buttonText: "#ffffff",
    },
  },
  editorial: {
    label: "Editorial",
    description: "Warm cream tones, refined typography",
    colors: {
      hero: "#faf7f2",
      accent: "#1c1917",
      surface: "#ffffff",
      text: "#1c1917",
      muted: "#78716c",
      buttonText: "#faf7f2",
    },
  },
};

export function defaultCampaignDesign(layout: CampaignLayout = "classic"): CampaignDesign {
  const preset = LAYOUT_PRESETS[layout];
  return {
    mode: "template",
    layout,
    colors: { ...DEFAULT_DESIGN_COLORS, ...preset.colors },
    blocks: defaultBuilderBlocks(),
  };
}

export function defaultBuilderBlocks(): EmailBlock[] {
  const id = () =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `block-${Math.random().toString(36).slice(2)}`;
  return [
    { id: id(), type: "hero", title: "Your headline", imageUrl: "" },
    { id: id(), type: "text", body: "Write your message here.", align: "left" },
    { id: id(), type: "button", text: "Shop now", url: "" },
  ];
}

export function ensureCampaignDesign(content: CampaignContent): CampaignDesign {
  if (content.design) {
    return {
      ...defaultCampaignDesign(content.design.layout ?? "classic"),
      ...content.design,
      colors: {
        ...DEFAULT_DESIGN_COLORS,
        ...content.design.colors,
      },
      blocks: content.design.blocks?.length ? content.design.blocks : defaultBuilderBlocks(),
    };
  }
  return defaultCampaignDesign("classic");
}

export function mergeDesignIntoContent(
  content: CampaignContent,
  patch: Partial<CampaignDesign>,
): CampaignContent {
  const current = ensureCampaignDesign(content);
  return {
    ...content,
    design: {
      ...current,
      ...patch,
      colors: { ...current.colors, ...patch.colors },
    },
  };
}

export function campaignItemFromProduct(product: {
  name: string;
  price?: number | null;
  imageUrl?: string | null;
  url?: string | null;
  subtitle?: string | null;
  lightspeedItemId?: string | null;
}): CampaignItem {
  const price =
    product.price != null && Number.isFinite(product.price)
      ? product.price.toLocaleString("en-AU", {
          style: "currency",
          currency: "AUD",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })
      : undefined;
  return {
    title: product.name,
    subtitle: product.subtitle ?? undefined,
    price,
    imageUrl: product.imageUrl ?? undefined,
    url: product.url ?? undefined,
    lightspeedItemId: product.lightspeedItemId ?? undefined,
  };
}
