// Premade CRM email templates.
//
// Templates are code, not database rows: each is a config over one shared,
// hand-tuned renderer so every campaign gets the same polished, responsive
// 600px layout. Campaigns store the template_key + customised content JSON.

import type { CampaignContent, CampaignItem } from "./types";

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
  /** Centre the header block (announcement-style templates). */
  centered: boolean;
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
    centered: false,
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
    centered: false,
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
    centered: true,
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
    centered: false,
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
    centered: false,
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
// ============================================================

const COLORS = {
  page: "#f4f4f5",
  card: "#ffffff",
  accent: "#ffde59",
  ink: "#18181b",
  bodyText: "#52525b",
  faint: "#a1a1aa",
  divider: "#f0f0f1",
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

function paragraphs(body: string, centered: boolean): string {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${COLORS.bodyText};${centered ? "text-align:center;" : ""}">${escapeHtml(block).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");
}

function renderCta(content: CampaignContent, centered: boolean): string {
  const url = safeUrl(content.ctaUrl);
  const text = String(content.ctaText ?? "").trim();
  if (!url || !text) return "";
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${centered ? "center" : "left"}" style="margin:8px 0 8px;">
      <tr>
        <td style="border-radius:9999px;background:${COLORS.ink};">
          <a href="${url}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:${FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9999px;">${escapeHtml(text)}</a>
        </td>
      </tr>
    </table>`;
}

function renderItemsRow(items: CampaignItem[]): string {
  const rows = items
    .map((item, index) => {
      const title = String(item.title ?? "").trim();
      if (!title) return "";
      const img = safeUrl(item.imageUrl);
      const url = safeUrl(item.url);
      const subtitle = String(item.subtitle ?? "").trim();
      const price = String(item.price ?? "").trim();
      const titleHtml = url
        ? `<a href="${url}" target="_blank" style="color:${COLORS.ink};text-decoration:none;">${escapeHtml(title)}</a>`
        : escapeHtml(title);
      return `
        <tr>
          <td style="padding:16px 0;${index > 0 ? `border-top:1px solid ${COLORS.divider};` : ""}">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                ${
                  img
                    ? `<td width="92" valign="top" style="padding-right:16px;">
                        ${url ? `<a href="${url}" target="_blank">` : ""}<img src="${img}" width="92" height="92" alt="${escapeHtml(title)}" style="display:block;width:92px;height:92px;object-fit:cover;border-radius:12px;background:${COLORS.page};"/>${url ? "</a>" : ""}
                      </td>`
                    : ""
                }
                <td valign="middle">
                  <p style="margin:0 0 3px;font-family:${FONT};font-size:15px;font-weight:600;color:${COLORS.ink};line-height:1.4;">${titleHtml}</p>
                  ${subtitle ? `<p style="margin:0 0 3px;font-family:${FONT};font-size:13px;color:${COLORS.bodyText};line-height:1.5;">${escapeHtml(subtitle)}</p>` : ""}
                  ${price ? `<p style="margin:0;font-family:${FONT};font-size:14px;font-weight:600;color:${COLORS.ink};">${escapeHtml(price)}</p>` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join("");
  if (!rows) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 12px;">${rows}</table>`;
}

function renderItemsCard(items: CampaignItem[]): string {
  const cards = items
    .map((item) => {
      const title = String(item.title ?? "").trim();
      if (!title) return "";
      const img = safeUrl(item.imageUrl);
      const url = safeUrl(item.url);
      const subtitle = String(item.subtitle ?? "").trim();
      const price = String(item.price ?? "").trim();
      const titleHtml = url
        ? `<a href="${url}" target="_blank" style="color:${COLORS.ink};text-decoration:none;">${escapeHtml(title)}</a>`
        : escapeHtml(title);
      return `
        <tr>
          <td style="padding:0 0 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${COLORS.divider};border-radius:16px;">
              ${
                img
                  ? `<tr><td>${url ? `<a href="${url}" target="_blank">` : ""}<img src="${img}" width="518" alt="${escapeHtml(title)}" style="display:block;width:100%;height:auto;border-radius:15px 15px 0 0;background:${COLORS.page};"/>${url ? "</a>" : ""}</td></tr>`
                  : ""
              }
              <tr>
                <td style="padding:16px 20px 18px;">
                  <p style="margin:0 0 3px;font-family:${FONT};font-size:16px;font-weight:600;color:${COLORS.ink};line-height:1.4;">${titleHtml}</p>
                  ${subtitle ? `<p style="margin:0 0 5px;font-family:${FONT};font-size:13px;color:${COLORS.bodyText};line-height:1.5;">${escapeHtml(subtitle)}</p>` : ""}
                  ${price ? `<p style="margin:0;font-family:${FONT};font-size:15px;font-weight:700;color:${COLORS.ink};">${escapeHtml(price)}</p>` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join("");
  if (!cards) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;">${cards}</table>`;
}

export function renderCampaignEmail(args: {
  templateKey: string;
  content: CampaignContent;
  /** Per-recipient unsubscribe link. Pass a placeholder for previews. */
  unsubscribeUrl: string;
}): { html: string; text: string } {
  const template = getCrmTemplate(args.templateKey) ?? CRM_TEMPLATES[4];
  const { content } = args;
  const centered = template.centered;
  const align = centered ? "center" : "left";

  const title = String(content.title ?? "").trim();
  const hero = safeUrl(content.heroImageUrl);
  const footerText = String(content.footerText ?? "").trim();
  const items = template.supportsItems ? content.items ?? [] : [];
  const itemsHtml =
    template.itemLayout === "card" ? renderItemsCard(items) : renderItemsRow(items);
  const unsubscribeHref = escapeHtml(args.unsubscribeUrl);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="color-scheme" content="light"/>
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.page};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(String(content.body ?? "").slice(0, 140))}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.page};">
    <tr>
      <td align="center" style="padding:32px 16px 40px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${COLORS.card};border-radius:20px;overflow:hidden;">
          <tr><td style="height:6px;background:${COLORS.accent};font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr>
            <td align="${align}" style="padding:32px 40px 0;">
              <p style="margin:0;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:4px;color:${COLORS.ink};">YELLOW JERSEY</p>
            </td>
          </tr>
          ${
            hero
              ? `<tr><td style="padding:24px 40px 0;"><img src="${hero}" width="520" alt="" style="display:block;width:100%;height:auto;border-radius:14px;background:${COLORS.page};"/></td></tr>`
              : ""
          }
          <tr>
            <td align="${align}" style="padding:28px 40px 0;">
              <p style="margin:0 0 10px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:${COLORS.faint};">${escapeHtml(template.eyebrow)}</p>
              <h1 style="margin:0 0 14px;font-family:${FONT};font-size:28px;line-height:1.25;font-weight:700;color:${COLORS.ink};letter-spacing:-0.02em;">${escapeHtml(title)}</h1>
              <div style="font-family:${FONT};">${paragraphs(String(content.body ?? ""), centered)}</div>
              ${renderCta(content, centered)}
            </td>
          </tr>
          ${itemsHtml ? `<tr><td style="padding:8px 40px 0;">${itemsHtml}</td></tr>` : ""}
          <tr><td style="padding:28px 40px 0;"><div style="border-top:1px solid ${COLORS.divider};font-size:0;line-height:0;">&nbsp;</div></td></tr>
          <tr>
            <td align="center" style="padding:4px 40px 32px;">
              ${footerText ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:1.6;color:${COLORS.faint};">${escapeHtml(footerText)}</p>` : ""}
              <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${COLORS.faint};">
                <a href="${unsubscribeHref}" target="_blank" style="color:${COLORS.faint};text-decoration:underline;">Unsubscribe</a>
                &nbsp;·&nbsp; Sent by Yellow Jersey
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines = [
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
  ].filter((line) => line !== null);

  return { html, text: textLines.join("\n") };
}
