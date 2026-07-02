// Shared HTML for product cards in CRM emails — sale badges + strikethrough pricing.

import type { CampaignItem } from "./types";

type EmailColors = {
  text: string;
  muted: string;
  accent?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderCampaignItemPriceHtml(item: CampaignItem, colors: EmailColors): string {
  const sale = String(item.price ?? "").trim();
  const original = String(item.originalPrice ?? "").trim();
  if (!sale && !original) return "";

  if (item.onSale && original && sale) {
    return `<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-align:right;">
      <span style="display:block;font-size:13px;color:${colors.muted};text-decoration:line-through;">${escapeHtml(original)}</span>
      <span style="display:block;font-size:18px;font-weight:900;color:${colors.text};letter-spacing:-0.5px;">${escapeHtml(sale)}</span>
    </p>`;
  }

  if (sale) {
    return `<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:18px;font-weight:900;color:${colors.text};">${escapeHtml(sale)}</p>`;
  }

  return "";
}

export function renderCampaignItemBadgeHtml(item: CampaignItem): string {
  const badge = String(item.badge ?? "").trim();
  if (!badge || !item.onSale) return "";
  return `<span style="display:inline-block;margin-bottom:8px;border-radius:6px;background:#dc2626;padding:4px 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#ffffff;">${escapeHtml(badge)}</span>`;
}

export function renderCampaignItemImageBlock(args: {
  imageUrl: string;
  title: string;
  linkUrl?: string | null;
  item: CampaignItem;
  maxHeight?: number;
}): string {
  const img = escapeHtml(args.imageUrl);
  const title = escapeHtml(args.title);
  const maxH = args.maxHeight ?? 320;
  const badge = renderCampaignItemBadgeHtml(args.item);
  const inner = `<div style="position:relative;display:inline-block;width:100%;">
    <img src="${img}" width="520" alt="${title}" style="display:block;width:100%;max-height:${maxH}px;object-fit:cover;border-radius:4px;background:#f3f4f6;" />
    ${badge ? `<div style="position:absolute;left:12px;bottom:12px;">${badge}</div>` : ""}
  </div>`;
  const link = args.linkUrl ? escapeHtml(args.linkUrl) : null;
  return link ? `<a href="${link}" target="_blank" style="text-decoration:none;">${inner}</a>` : inner;
}
