// Renders drag-drop email builder blocks to HTML for CRM campaigns.

import type { CampaignDesign, CampaignItem, EmailBlock } from "./types";
import type { StoreBranding } from "./templates";

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

function safeUrl(value: string | undefined): string | null {
  const url = String(value ?? "").trim();
  if (!/^https?:\/\//i.test(url)) return null;
  return escapeHtml(url);
}

function paragraphs(body: string, color: string): string {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.65;color:${color};">${escapeHtml(block).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");
}

function firstTextBlock(blocks: EmailBlock[]): string {
  const text = blocks.find((block) => block.type === "text")?.body ?? "";
  return text.replace(/\s+/g, " ").trim().slice(0, 140);
}

function heroTitle(blocks: EmailBlock[], fallback: string): string {
  const hero = blocks.find((block) => block.type === "hero");
  return String(hero?.title ?? fallback).trim() || fallback;
}

function renderIdentity(store: StoreBranding, design: CampaignDesign): string {
  const name = String(store.name ?? "").trim() || "Your Bike Store";
  const logo = safeUrl(store.logoUrl ?? undefined);
  const initial = escapeHtml(name.charAt(0).toUpperCase());
  const heroText = design.layout === "minimal" ? design.colors.text : "#ffffff";
  const mark = logo
    ? `<img src="${logo}" width="72" height="72" alt="${escapeHtml(name)}" style="display:block;width:72px;height:72px;border-radius:999px;background:#ffffff;object-fit:contain;" />`
    : `<table cellpadding="0" cellspacing="0"><tr><td style="width:72px;height:72px;background:${design.colors.accent};border-radius:999px;text-align:center;line-height:72px;font-family:${FONT};font-size:22px;font-weight:900;color:${design.colors.buttonText};">${initial}</td></tr></table>`;

  return `<table cellpadding="0" cellspacing="0" style="margin-bottom:34px;"><tr>
    <td style="padding-right:12px;">${mark}</td>
    <td><p style="margin:0;font-family:${FONT};font-size:12px;font-weight:900;color:${heroText};letter-spacing:2.4px;text-transform:uppercase;">${escapeHtml(name)}</p></td>
  </tr></table>`;
}

import {
  renderCampaignItemImageBlock,
  renderCampaignItemPriceHtml,
} from "./email-product-html";

function renderProductRow(items: CampaignItem[], colors: CampaignDesign["colors"]): string {
  const rows = items
    .map((item) => {
      const title = String(item.title ?? "").trim();
      if (!title) return "";
      const img = safeUrl(item.imageUrl);
      const url = safeUrl(item.url);
      const titleHtml = url
        ? `<a href="${url}" target="_blank" style="color:${colors.text};text-decoration:none;">${escapeHtml(title)}</a>`
        : escapeHtml(title);
      const priceHtml = renderCampaignItemPriceHtml(item, colors);
      return `<tr><td style="padding:12px 0;border-top:1px solid #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          ${img ? `<td width="56" valign="middle" style="padding-right:12px;"><img src="${img}" width="56" height="56" alt="${escapeHtml(title)}" style="display:block;border-radius:4px;object-fit:cover;" /></td>` : ""}
          <td valign="middle"><p style="margin:0;font-size:14px;font-weight:600;color:${colors.text};">${titleHtml}</p>
          ${item.subtitle ? `<p style="margin:2px 0 0;font-size:12px;color:${colors.muted};">${escapeHtml(item.subtitle)}</p>` : ""}</td>
          ${priceHtml ? `<td align="right" valign="middle">${priceHtml}</td>` : ""}
        </tr></table></td></tr>`;
    })
    .join("");
  if (!rows) return "";
  return `<table width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}

function renderProductCard(items: CampaignItem[], colors: CampaignDesign["colors"]): string {
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
              maxHeight: 320,
            })
          : "";
      return `<tr><td style="padding:0 0 30px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eceff3;border-radius:4px;background:#ffffff;">
          <tr><td style="padding:14px;">
        ${imageBlock}
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:${img ? "16px" : "0"};"><tr>
          <td valign="top">
            <p style="margin:0;font-family:${FONT};font-size:17px;color:${colors.text};font-weight:900;letter-spacing:-0.35px;line-height:1.2;">${titleHtml}</p>
            ${subtitle ? `<p style="margin:5px 0 0;font-family:${FONT};font-size:13px;line-height:1.45;color:${colors.muted};">${escapeHtml(subtitle)}</p>` : ""}
          </td>
          ${priceHtml ? `<td align="right" valign="top">${priceHtml}</td>` : ""}
        </tr></table>
          </td></tr>
        </table>
      </td></tr>`;
    })
    .join("");
  if (!cards) return "";
  return `<table width="100%" cellpadding="0" cellspacing="0">${cards}</table>`;
}

function renderBlock(block: EmailBlock, design: CampaignDesign): string {
  const { colors } = design;
  switch (block.type) {
    case "hero": {
      const img = safeUrl(block.imageUrl);
      const title = String(block.title ?? "").trim();
      const heroText = design.layout === "minimal" ? colors.text : "#ffffff";
      const headlineSize = title.length <= 22 ? "54px" : title.length <= 42 ? "44px" : "34px";
      return `<tr><td style="background:${colors.hero};padding:46px 40px 0;">
        ${title ? `<h1 style="margin:0;font-family:${FONT};font-size:${headlineSize};font-weight:950;color:${heroText};line-height:0.96;letter-spacing:-2.2px;text-transform:uppercase;">${escapeHtml(title)}</h1>` : ""}
        ${img ? `<img src="${img}" width="520" style="display:block;width:100%;max-height:340px;object-fit:cover;border-radius:4px;margin-top:30px;" alt="" />` : ""}
      </td></tr>
      <tr><td style="background:${colors.hero};height:38px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
    }
    case "heading": {
      const align = block.align === "center" ? "center" : "left";
      return `<tr><td style="background:${colors.surface};padding:34px 40px 8px;text-align:${align};">
        <h2 style="margin:0;font-family:${FONT};font-size:26px;line-height:1.15;font-weight:900;color:${colors.text};letter-spacing:-0.8px;">${escapeHtml(block.text)}</h2>
      </td></tr>`;
    }
    case "text":
      return `<tr><td style="background:${colors.surface};padding:10px 40px 18px;text-align:${block.align === "center" ? "center" : "left"};">
        ${paragraphs(block.body, colors.muted)}
      </td></tr>`;
    case "button": {
      const url = safeUrl(block.url);
      const text = String(block.text ?? "").trim();
      if (!url || !text) return "";
      return `<tr><td style="background:${colors.surface};padding:10px 40px 34px;">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="background:${colors.accent};border-radius:4px;">
            <a href="${url}" target="_blank" style="display:inline-block;padding:16px 38px;font-family:${FONT};font-size:13px;font-weight:900;letter-spacing:1.8px;text-transform:uppercase;color:${colors.buttonText};text-decoration:none;">${escapeHtml(text)} &#8594;</a>
          </td>
        </tr></table>
      </td></tr>`;
    }
    case "image": {
      const url = safeUrl(block.url);
      if (!url) return "";
      const link = safeUrl(block.linkUrl);
      const img = `<img src="${url}" width="520" alt="${escapeHtml(block.alt ?? "")}" style="display:block;width:100%;border-radius:4px;" />`;
      return `<tr><td style="background:${colors.surface};padding:16px 40px;">
        ${link ? `<a href="${link}" target="_blank">${img}</a>` : img}
      </td></tr>`;
    }
    case "products":
      return `<tr><td style="background:${colors.surface};padding:12px 40px 30px;">
        ${block.layout === "card" ? renderProductCard(block.items ?? [], colors) : renderProductRow(block.items ?? [], colors)}
      </td></tr>`;
    case "spacer":
      return `<tr><td style="background:${colors.surface};height:${Math.min(80, Math.max(8, block.height))}px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
    case "divider":
      return `<tr><td style="background:${colors.surface};padding:16px 40px;"><hr style="border:0;border-top:1px solid #e5e7eb;margin:0;" /></td></tr>`;
    default:
      return "";
  }
}

export function renderBuilderEmail(args: {
  design: CampaignDesign;
  store: StoreBranding;
  footerText?: string;
  unsubscribeUrl: string;
}): { html: string; text: string } {
  const { design, store, unsubscribeUrl } = args;
  const storeName = String(store.name ?? "").trim() || "Your Bike Store";
  const footerText = String(args.footerText ?? "").trim();
  const blocks = design.blocks ?? [];
  const title = heroTitle(blocks, storeName);
  const preheader = firstTextBlock(blocks);

  const firstBlock = blocks[0];
  const heroPrefix = firstBlock?.type === "hero" ? renderIdentity(store, design) : "";
  const body = blocks
    .map((block, index) => {
      if (index === 0 && block.type === "hero") {
        return renderBlock({ ...block, title: block.title }, design).replace(
          `<tr><td style="background:${design.colors.hero};padding:46px 40px 0;">`,
          `<tr><td style="background:${design.colors.hero};padding:46px 40px 0;">${heroPrefix}`,
        );
      }
      return renderBlock(block, design);
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${design.colors.surface};">
${body}
<tr><td style="background:${design.colors.hero};padding:24px 40px;">
  ${footerText ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:11px;line-height:1.6;color:${design.colors.muted};text-align:center;">${escapeHtml(footerText)}</p>` : ""}
  <p style="margin:0;font-family:${FONT};font-size:11px;color:${design.colors.muted};text-align:center;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(storeName)} &nbsp;&#183;&nbsp; <a href="${escapeHtml(unsubscribeUrl)}" style="color:${design.colors.muted};text-decoration:underline;">Unsubscribe</a></p>
  <p style="margin:8px 0 0;font-family:${FONT};font-size:10px;color:#3d3d3d;text-align:center;letter-spacing:0.5px;">Powered by Yellow Jersey</p>
</td></tr>
</table></td></tr></table>
</body></html>`;

  const text = [
    storeName,
    "",
    ...blocks.flatMap((block) => {
      if (block.type === "heading") return [block.text];
      if (block.type === "text") return [block.body];
      if (block.type === "button") return block.text && block.url ? [`${block.text}: ${block.url}`] : [];
      if (block.type === "products")
        return (block.items ?? []).map((item) =>
          [item.title, item.price, item.url].filter(Boolean).join(" — "),
        );
      return [];
    }),
    "",
    footerText,
    `Unsubscribe: ${unsubscribeUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { html, text };
}
