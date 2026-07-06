// Premade CRM email templates.
//
// Templates are code, not database rows: each is a config over one shared,
// hand-tuned renderer so every campaign gets the same polished, responsive
// 600px layout. Campaigns store the template_key + customised content JSON.

import type { CampaignContent, CampaignItem } from "./types";
import { ensureCampaignDesign } from "./design";
import type { CampaignDesignColors } from "./design";
import { renderBuilderEmail } from "./email-builder-render";
import { renderStoredHtmlCampaign } from "./campaign-html";
import {
  renderCampaignItemImageBlock,
  renderCampaignItemPriceHtml,
} from "./email-product-html";

export type CrmTemplateKey =
  | "new_arrivals"
  | "featured_bikes"
  | "store_announcement"
  | "service_reminder"
  | "newsletter";

export type CrmTemplate = {
  key: CrmTemplateKey;
  name: string;
  description: string;
  eyebrow: string;
  /** Whether the customiser shows the featured-items editor. */
  supportsItems: boolean;
  /** "row" = compact thumbnail list, "card" = large stacked image cards. */
  itemLayout: "row" | "card";
  defaults: { subject: string; content: CampaignContent };
};

export const CRM_TEMPLATES: CrmTemplate[] = [
  {
    key: "new_arrivals",
    name: "New arrivals",
    description: "Fresh stock, compact product list",
    eyebrow: "Just landed",
    supportsItems: true,
    itemLayout: "row",
    defaults: {
      subject: "New arrivals in store this week",
      content: {
        title: "Fresh stock has just landed",
        body: "We've just unpacked some beautiful new gear and wanted you to see it first.\n\nCome by the store or tap below to browse everything online.",
        ctaText: "Browse new arrivals",
        ctaUrl: "",
        heroImageUrl: "",
        footerText: "You're receiving this because you're a customer of our store.",
        items: [],
      },
    },
  },
  {
    key: "featured_bikes",
    name: "Featured bikes",
    description: "Big imagery, showcase up to three bikes",
    eyebrow: "Featured bikes",
    supportsItems: true,
    itemLayout: "card",
    defaults: {
      subject: "Three bikes we think you'll love",
      content: {
        title: "Hand-picked for you",
        body: "A few standout bikes from the floor this month — each one ready for a test ride.",
        ctaText: "See all bikes",
        ctaUrl: "",
        heroImageUrl: "",
        footerText: "You're receiving this because you're a customer of our store.",
        items: [],
      },
    },
  },
  {
    key: "store_announcement",
    name: "Store announcement",
    description: "Centered, typographic — for news and events",
    eyebrow: "Store news",
    supportsItems: false,
    itemLayout: "row",
    defaults: {
      subject: "An update from the store",
      content: {
        title: "We have some news",
        body: "Write your announcement here — new opening hours, an event, a sale, or anything else your customers should know.",
        ctaText: "Learn more",
        ctaUrl: "",
        heroImageUrl: "",
        footerText: "You're receiving this because you're a customer of our store.",
      },
    },
  },
  {
    key: "service_reminder",
    name: "Service reminder",
    description: "Friendly nudge to book a bike service",
    eyebrow: "Bike service",
    supportsItems: false,
    itemLayout: "row",
    defaults: {
      subject: "Is your bike due for a service?",
      content: {
        title: "Keep your bike running like new",
        body: "Regular servicing keeps every ride smooth and safe — and catches small problems before they become expensive ones.\n\nOur workshop has openings this week. Book a time that suits you and we'll take care of the rest.",
        ctaText: "Book a service",
        ctaUrl: "",
        heroImageUrl: "",
        footerText: "You're receiving this because you're a customer of our store.",
      },
    },
  },
  {
    key: "newsletter",
    name: "General newsletter",
    description: "Flexible layout for regular updates",
    eyebrow: "Newsletter",
    supportsItems: true,
    itemLayout: "row",
    defaults: {
      subject: "News from the store",
      content: {
        title: "What's happening this month",
        body: "Your monthly update — what's new in store, what's coming up, and what we've been riding.",
        ctaText: "Visit the store",
        ctaUrl: "",
        heroImageUrl: "",
        footerText: "You're receiving this because you're a customer of our store.",
        items: [],
      },
    },
  },
];

export function getCrmTemplate(key: string): CrmTemplate | null {
  return CRM_TEMPLATES.find((template) => template.key === key) ?? null;
}

// ============================================================
// Rendering
//
// Matches the design system of the transactional emails in
// supabase/functions/_shared/email-templates/ (purchase confirmation, offers):
// dark #0a0a0a hero with a 900-weight uppercase headline, #F5C518 yellow
// accents, white content section with hairline list rows, square yellow CTA,
// dark footer. Branding is the STORE's (logo + name); Yellow Jersey appears
// only as "Powered by Yellow Jersey" in the footer.
// ============================================================

export type StoreBranding = {
  name: string;
  logoUrl?: string | null;
};

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s) URLs make it into href/src attributes. */
function safeUrl(value: string | undefined): string | null {
  const url = String(value ?? "").trim();
  if (!/^https?:\/\//i.test(url)) return null;
  return escapeHtml(url);
}

function paragraphs(body: string, colors: CampaignDesignColors): string {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.65;color:${colors.muted};">${escapeHtml(block).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");
}

/** Square CTA — identical idiom to the transactional emails. */
function renderCta(content: CampaignContent, colors: CampaignDesignColors): string {
  const url = safeUrl(content.ctaUrl);
  const text = String(content.ctaText ?? "").trim();
  if (!url || !text) return "";
  return `
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="background:${colors.accent};">
            <a href="${url}" target="_blank" style="display:inline-block;font-family:${FONT};color:${colors.buttonText};text-decoration:none;padding:15px 40px;font-size:14px;font-weight:900;letter-spacing:2px;text-transform:uppercase;">${escapeHtml(text)} &#8594;</a>
          </td>
        </tr></table>`;
}

/** Hairline list rows — same idiom as "Items in this order". */
function renderItemsRow(
  items: CampaignItem[],
  sectionLabel: string,
  colors: CampaignDesignColors,
): string {
  const rows = items
    .map((item) => {
      const title = String(item.title ?? "").trim();
      if (!title) return "";
      const img = safeUrl(item.imageUrl);
      const url = safeUrl(item.url);
      const subtitle = String(item.subtitle ?? "").trim();
      const titleHtml = url
        ? `<a href="${url}" target="_blank" style="color:${colors.text};text-decoration:none;">${escapeHtml(title)}</a>`
        : escapeHtml(title);
      const priceHtml = renderCampaignItemPriceHtml(item, colors);
      return `
          <tr><td style="padding:12px 0;border-top:1px solid #f3f4f6;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              ${
                img
                  ? `<td width="48" valign="middle" style="padding-right:14px;">${url ? `<a href="${url}" target="_blank">` : ""}<img src="${img}" width="48" height="48" alt="${escapeHtml(title)}" style="display:block;width:48px;height:48px;object-fit:cover;border-radius:4px;background:#f3f4f6;"/>${url ? "</a>" : ""}</td>`
                  : ""
              }
              <td valign="middle">
                <p style="margin:0;font-family:${FONT};font-size:14px;color:${colors.text};font-weight:600;">${titleHtml}</p>
                ${subtitle ? `<p style="margin:2px 0 0;font-family:${FONT};font-size:12px;color:${colors.muted};">${escapeHtml(subtitle)}</p>` : ""}
              </td>
              ${priceHtml ? `<td align="right" valign="middle">${priceHtml}</td>` : ""}
            </tr></table>
          </td></tr>`;
    })
    .join("");
  if (!rows) return "";
  return `
        <p style="margin:0 0 14px;font-family:${FONT};font-size:11px;font-weight:800;color:${colors.text};text-transform:uppercase;letter-spacing:1.5px;">${escapeHtml(sectionLabel)}</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">${rows}
        </table>`;
}

/** Large image showcase — product-image idiom (full width, 4px radius). */
function renderItemsCard(
  items: CampaignItem[],
  sectionLabel: string,
  colors: CampaignDesignColors,
): string {
  const cards = items
    .map((item) => {
      const title = String(item.title ?? "").trim();
      if (!title) return "";
      const img = safeUrl(item.imageUrl);
      const url = safeUrl(item.url);
      const subtitle = String(item.subtitle ?? "").trim();
      const titleHtml = url
        ? `<a href="${url}" target="_blank" style="color:${colors.text};text-decoration:none;">${escapeHtml(title)}</a>`
        : escapeHtml(title);
      const priceHtml = renderCampaignItemPriceHtml(item, colors);
      const imageBlock =
        item.imageUrl && /^https?:\/\//i.test(item.imageUrl)
          ? renderCampaignItemImageBlock({
              imageUrl: item.imageUrl,
              title,
              linkUrl: item.url,
              item,
              maxHeight: 340,
            })
          : "";
      return `
          <tr><td style="padding:0 0 32px;">
            ${imageBlock}
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;"><tr>
              <td valign="top">
                <p style="margin:0;font-family:${FONT};font-size:16px;color:${colors.text};font-weight:800;letter-spacing:-0.3px;">${titleHtml}</p>
                ${subtitle ? `<p style="margin:3px 0 0;font-family:${FONT};font-size:13px;color:${colors.muted};">${escapeHtml(subtitle)}</p>` : ""}
              </td>
              ${priceHtml ? `<td align="right" valign="top">${priceHtml}</td>` : ""}
            </tr></table>
          </td></tr>`;
    })
    .join("");
  if (!cards) return "";
  return `
        <p style="margin:0 0 18px;font-family:${FONT};font-size:11px;font-weight:800;color:${colors.text};text-transform:uppercase;letter-spacing:1.5px;">${escapeHtml(sectionLabel)}</p>
        <table width="100%" cellpadding="0" cellspacing="0">${cards}
        </table>`;
}

/** Store identity for the dark hero: logo (white circle) or initial + name. */
function renderStoreIdentity(store: StoreBranding, colors: CampaignDesignColors, layout: string): string {
  const name = String(store.name ?? "").trim() || "Your Bike Store";
  const logo = safeUrl(store.logoUrl ?? undefined);
  const initial = escapeHtml(name.charAt(0).toUpperCase());
  const heroTextColor = layout === "minimal" ? colors.text : "#ffffff";
  const mark = logo
    ? `<img src="${logo}" width="72" height="72" alt="${escapeHtml(name)}" style="display:block;width:72px;height:72px;border-radius:50%;background:#ffffff;object-fit:contain;" />`
    : `<table cellpadding="0" cellspacing="0"><tr><td style="width:72px;height:72px;background:${colors.accent};border-radius:50%;text-align:center;line-height:72px;font-family:${FONT};font-size:24px;font-weight:900;color:${colors.buttonText};">${initial}</td></tr></table>`;
  return `
        <table cellpadding="0" cellspacing="0" style="margin-bottom:40px;"><tr>
          <td style="padding-right:12px;">${mark}</td>
          <td><p style="margin:0;font-family:${FONT};font-size:14px;font-weight:800;color:${heroTextColor};letter-spacing:2px;text-transform:uppercase;">${escapeHtml(name)}</p></td>
        </tr></table>`;
}

export function renderCampaignEmail(args: {
  templateKey: string;
  content: CampaignContent;
  /** Store branding shown in the hero + footer. */
  store: StoreBranding;
  /** Per-recipient unsubscribe link. Pass a placeholder for previews. */
  unsubscribeUrl: string;
  /** First-party open tracking pixel — omit for previews. */
  openTrackingUrl?: string;
}): { html: string; text: string } {
  const design = ensureCampaignDesign(args.content);
  if (design.mode === "html") {
    return renderStoredHtmlCampaign({
      content: args.content,
      unsubscribeUrl: args.unsubscribeUrl,
      openTrackingUrl: args.openTrackingUrl,
    });
  }
  if (design.mode === "builder") {
    const built = renderBuilderEmail({
      design,
      store: args.store,
      footerText: args.content.footerText,
      unsubscribeUrl: args.unsubscribeUrl,
    });
    if (args.openTrackingUrl) {
      built.html = built.html.replace(
        "</body>",
        `<img src="${escapeHtml(args.openTrackingUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" /></body>`,
      );
    }
    return built;
  }

  const template = getCrmTemplate(args.templateKey) ?? CRM_TEMPLATES[4];
  const { content, store } = args;

  const storeName = String(store.name ?? "").trim() || "Your Bike Store";
  const title = String(content.title ?? "").trim();
  const hero = safeUrl(content.heroImageUrl);
  const footerText = String(content.footerText ?? "").trim();
  const items = template.supportsItems ? content.items ?? [] : [];
  const itemsHtml =
    template.itemLayout === "card"
      ? renderItemsCard(items, template.eyebrow, design.colors)
      : renderItemsRow(items, template.eyebrow, design.colors);
  const unsubscribeHref = escapeHtml(args.unsubscribeUrl);
  const openPixel = args.openTrackingUrl
    ? `<img src="${escapeHtml(args.openTrackingUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;margin:0;padding:0;" />`
    : "";

  // The transactional heroes use short 3-word headlines at 64px; campaign
  // titles are free text, so scale down as they get longer.
  const headlineSize = title.length <= 18 ? "56px" : title.length <= 34 ? "44px" : "34px";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${design.colors.hero};font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(String(content.body ?? "").slice(0, 140))}</div>
<table width="100%" cellpadding="0" cellspacing="0" style="background:${design.colors.hero};padding:0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Hero -->
      <tr><td style="background:${design.colors.hero};padding:48px 40px 0;">
        ${renderStoreIdentity(store, design.colors, design.layout)}
        <p style="margin:0 0 12px;font-family:${FONT};font-size:11px;color:${design.colors.accent};letter-spacing:5px;text-transform:uppercase;font-weight:700;">${escapeHtml(template.eyebrow)}</p>
        <h1 style="margin:0;font-family:${FONT};font-size:${headlineSize};font-weight:900;color:${design.layout === "minimal" ? design.colors.text : "#ffffff"};line-height:0.98;letter-spacing:-2px;text-transform:uppercase;">${escapeHtml(title)}</h1>
      </td></tr>

      <!-- Hero image -->
      ${
        hero
          ? `<tr><td style="background:${design.colors.hero};padding:32px 40px 0;line-height:0;font-size:0;">
        <img src="${hero}" width="520" style="display:block;width:100%;max-height:340px;object-fit:cover;border-radius:4px;" alt="" />
      </td></tr>`
          : ""
      }
      <tr><td style="background:${design.colors.hero};height:40px;font-size:0;line-height:0;">&nbsp;</td></tr>

      <!-- White content -->
      <tr><td style="background:${design.colors.surface};padding:36px 40px;">
        ${paragraphs(String(content.body ?? ""), design.colors)}
        ${itemsHtml ? `<div style="margin-top:16px;">${itemsHtml}</div>` : ""}
        <div style="margin-top:16px;">${renderCta(content, design.colors)}</div>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:${design.colors.hero};padding:24px 40px;">
        ${footerText ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:11px;color:${design.colors.muted};text-align:center;line-height:1.6;">${escapeHtml(footerText)}</p>` : ""}
        <p style="margin:0;font-family:${FONT};font-size:11px;color:${design.colors.muted};text-align:center;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(storeName)} &nbsp;&#183;&nbsp; <a href="${unsubscribeHref}" target="_blank" style="color:${design.colors.muted};text-decoration:underline;">Unsubscribe</a></p>
        <p style="margin:8px 0 0;font-family:${FONT};font-size:10px;color:#3d3d3d;text-align:center;letter-spacing:0.5px;">Powered by Yellow Jersey</p>
      </td></tr>

    </table>
  </td></tr>
</table>
${openPixel}
</body></html>`;

  const textLines = [
    storeName,
    title,
    "",
    String(content.body ?? "").trim(),
    "",
    ...(items ?? [])
      .filter((item) => String(item.title ?? "").trim())
      .map((item) =>
        [item.title, item.price, item.url].filter(Boolean).join(" — "),
      ),
    content.ctaText && content.ctaUrl ? `${content.ctaText}: ${content.ctaUrl}` : "",
    "",
    footerText,
    `Unsubscribe: ${args.unsubscribeUrl}`,
    "Powered by Yellow Jersey",
  ].filter((line) => line !== null);

  return { html, text: textLines.join("\n") };
}
