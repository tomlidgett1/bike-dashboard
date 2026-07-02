// Convert model block output into EmailBlock[] for the builder.

import type { CampaignContent, CampaignDesign, EmailBlock, CampaignItem } from "../types";
import { defaultCampaignDesign } from "../design";

type ModelBlock = {
  type: string;
  title?: string;
  text?: string;
  body?: string;
  align?: "left" | "center";
  button_text?: string;
  url?: string;
  image_url?: string;
  alt?: string;
  height?: number;
};

function blockId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `block-${Math.random().toString(36).slice(2)}`;
}

export function modelBlocksToEmailBlocks(
  modelBlocks: ModelBlock[],
  products: CampaignItem[],
  heroImageUrl?: string,
): EmailBlock[] {
  const blocks: EmailBlock[] = [];

  for (const mb of modelBlocks) {
    switch (mb.type) {
      case "hero":
        blocks.push({
          id: blockId(),
          type: "hero",
          title: mb.title ?? "",
          imageUrl: mb.image_url ?? heroImageUrl ?? "",
        });
        break;
      case "heading":
        blocks.push({
          id: blockId(),
          type: "heading",
          text: mb.text ?? mb.title ?? "",
          align: mb.align ?? "left",
        });
        break;
      case "text":
        blocks.push({
          id: blockId(),
          type: "text",
          body: mb.body ?? mb.text ?? "",
          align: mb.align ?? "left",
        });
        break;
      case "button":
        blocks.push({
          id: blockId(),
          type: "button",
          text: mb.button_text ?? mb.text ?? "Shop now",
          url: mb.url ?? "",
        });
        break;
      case "image":
        if (mb.image_url) {
          blocks.push({
            id: blockId(),
            type: "image",
            url: mb.image_url,
            alt: mb.alt,
            linkUrl: mb.url,
          });
        }
        break;
      case "products":
        if (products.length > 0) {
          blocks.push({
            id: blockId(),
            type: "products",
            items: products,
            layout: "card",
          });
        }
        break;
      case "spacer":
        blocks.push({ id: blockId(), type: "spacer", height: mb.height ?? 24 });
        break;
      case "divider":
        blocks.push({ id: blockId(), type: "divider" });
        break;
      default:
        break;
    }
  }

  if (blocks.length === 0) {
    return defaultCampaignDesign().blocks ?? [];
  }

  return blocks;
}

export function buildDesignFromBrief(
  layout: CampaignDesign["layout"],
  blocks: EmailBlock[],
): CampaignDesign {
  const design = defaultCampaignDesign(layout);
  return {
    ...design,
    mode: "builder",
    blocks,
  };
}

export function buildCampaignContent(args: {
  title: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
  footerText: string;
  layout: CampaignDesign["layout"];
  blocks: EmailBlock[];
  products: CampaignItem[];
  heroImageUrl?: string;
}): CampaignContent {
  const blocks = normaliseCampaignBlocks(args);
  const design = buildDesignFromBrief(args.layout, blocks);
  return {
    title: args.title,
    body: args.body,
    ctaText: args.ctaText,
    ctaUrl: args.ctaUrl,
    footerText: args.footerText,
    heroImageUrl: args.heroImageUrl ?? productsHero(args.products),
    items: args.products.length > 0 ? args.products : undefined,
    design,
  };
}

function productsHero(products: CampaignItem[]): string | undefined {
  return products.find((p) => p.imageUrl)?.imageUrl;
}

function normaliseCampaignBlocks(args: {
  title: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
  blocks: EmailBlock[];
  products: CampaignItem[];
  heroImageUrl?: string;
}): EmailBlock[] {
  const blocks = args.blocks.filter((block) => {
    if (block.type === "heading") return block.text.trim().length > 0;
    if (block.type === "text") return block.body.trim().length > 0;
    if (block.type === "button") return block.text.trim().length > 0 && block.url.trim().length > 0;
    if (block.type === "products") return (block.items ?? []).length > 0;
    if (block.type === "spacer") return block.height > 0;
    return true;
  });

  const heroIndex = blocks.findIndex((block) => block.type === "hero");
  const hero: EmailBlock = {
    id: blockId(),
    type: "hero",
    title: args.title,
    imageUrl: args.heroImageUrl ?? productsHero(args.products) ?? "",
  };

  const withoutHero = heroIndex >= 0
    ? blocks.filter((_, index) => index !== heroIndex)
    : blocks;
  const existingHero = heroIndex >= 0 ? blocks[heroIndex] : null;
  const finalBlocks: EmailBlock[] = [
    existingHero?.type === "hero"
      ? {
          ...existingHero,
          title: existingHero.title?.trim() || args.title,
          imageUrl: existingHero.imageUrl?.trim() || hero.imageUrl,
        }
      : hero,
  ];

  const hasText = withoutHero.some((block) => block.type === "text");
  if (!hasText && args.body.trim()) {
    finalBlocks.push({
      id: blockId(),
      type: "text",
      body: args.body,
      align: "left",
    });
  }

  finalBlocks.push(...withoutHero);

  const hasProducts = finalBlocks.some((block) => block.type === "products");
  if (args.products.length > 0 && !hasProducts) {
    finalBlocks.push({
      id: blockId(),
      type: "products",
      items: args.products,
      layout: "card",
    });
  }

  const hasButton = finalBlocks.some((block) => block.type === "button");
  if (!hasButton && args.ctaText.trim() && args.ctaUrl.trim()) {
    finalBlocks.push({
      id: blockId(),
      type: "button",
      text: args.ctaText,
      url: args.ctaUrl,
    });
  }

  return finalBlocks;
}
