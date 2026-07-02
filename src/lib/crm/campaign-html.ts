// Agent-authored campaign HTML — stored and edited directly (not block templates).

import type { CampaignContent, CampaignDesign } from "./types";
import { DEFAULT_DESIGN_COLORS, LAYOUT_PRESETS, type CampaignLayout } from "./design";

const UNSUBSCRIBE_PLACEHOLDER = "{{UNSUBSCRIBE_URL}}";

export function campaignHtmlUnsubscribePlaceholder(): string {
  return UNSUBSCRIBE_PLACEHOLDER;
}

/** Strip dangerous tags/attrs from model HTML before storage. */
export function sanitizeCampaignHtml(html: string): string {
  let out = String(html ?? "").trim();
  if (!out) return "";

  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/javascript:/gi, "");

  return out;
}

export function wrapEmailDocument(html: string, title: string): string {
  const trimmed = sanitizeCampaignHtml(html);
  if (!trimmed) return "";
  if (/<!doctype/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) {
    return trimmed;
  }
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;">
${trimmed}
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function ensureUnsubscribeInHtml(html: string, unsubscribeUrl: string): string {
  const safe = sanitizeCampaignHtml(html);
  if (!safe) return safe;

  if (safe.includes(UNSUBSCRIBE_PLACEHOLDER)) {
    return safe.replaceAll(UNSUBSCRIBE_PLACEHOLDER, unsubscribeUrl);
  }

  const link = `<a href="${escapeHtml(unsubscribeUrl)}" target="_blank" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>`;
  if (/<\/body>/i.test(safe)) {
    return safe.replace(
      /<\/body>/i,
      `<p style="margin:24px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:#6b7280;text-align:center;">${link}</p></body>`,
    );
  }

  return `${safe}\n<p style="margin:24px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:#6b7280;text-align:center;">${link}</p>`;
}

export function injectOpenPixel(html: string, openTrackingUrl: string): string {
  const pixel = `<img src="${escapeHtml(openTrackingUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return `${html}${pixel}`;
}

export function htmlToPlainText(html: string): string {
  return sanitizeCampaignHtml(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildHtmlCampaignDesign(html: string, layout: CampaignLayout = "classic"): CampaignDesign {
  const preset = LAYOUT_PRESETS[layout];
  return {
    mode: "html",
    layout,
    colors: { ...DEFAULT_DESIGN_COLORS, ...preset.colors },
    html: wrapEmailDocument(html, "Campaign"),
  };
}

export function buildHtmlCampaignContent(args: {
  title: string;
  body: string;
  html: string;
  footerText?: string;
  ctaText?: string;
  ctaUrl?: string;
  layout?: CampaignLayout;
  items?: CampaignContent["items"];
}): CampaignContent {
  const wrapped = wrapEmailDocument(args.html, args.title);
  const withUnsub = ensureUnsubscribeInHtml(wrapped, UNSUBSCRIBE_PLACEHOLDER);

  return {
    title: args.title,
    body: args.body,
    ctaText: args.ctaText,
    ctaUrl: args.ctaUrl,
    footerText: args.footerText,
    items: args.items,
    design: buildHtmlCampaignDesign(withUnsub, args.layout ?? "classic"),
  };
}

export function getStoredCampaignHtml(content: CampaignContent): string | null {
  const design = content.design;
  if (design?.mode === "html" && design.html?.trim()) {
    return design.html;
  }
  return null;
}

export function renderStoredHtmlCampaign(args: {
  content: CampaignContent;
  unsubscribeUrl: string;
  openTrackingUrl?: string;
}): { html: string; text: string } {
  const raw = getStoredCampaignHtml(args.content);
  if (!raw) {
    throw new Error("Campaign has no stored HTML");
  }

  let html = ensureUnsubscribeInHtml(raw, args.unsubscribeUrl);
  if (args.openTrackingUrl) {
    html = injectOpenPixel(html, args.openTrackingUrl);
  }

  return { html, text: htmlToPlainText(html) };
}
