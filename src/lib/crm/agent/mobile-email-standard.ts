// Shared mobile email requirements for CRM agent prompts and verification.

export const CRM_EMAIL_MOBILE_STANDARD_PROMPT = `## Mobile optimisation (required)
The shop owner previews emails on desktop AND mobile (~390px). Desktop-only layouts are not acceptable. The mobile view must look deliberately designed, not a squashed desktop email.

Every HTML document MUST include:
- \`<meta name="viewport" content="width=device-width,initial-scale=1.0">\`
- \`<meta name="x-apple-disable-message-reformatting">\`
- Fluid wrapper table: \`width:100%; max-width:600px\` on the main content card (centred in a 100% outer table).
- A \`<style type="text/css">\` block in \`<head>\` with \`@media only screen and (max-width: 600px) { ... }\` rules (class-based overrides — keep inline styles for desktop defaults).

Inside the mobile @media block you MUST:
- **Stack columns**: any side-by-side cells (products, offer + image, text + CTA row) become single column — use classes like \`.stack-cell\` with \`display:block !important; width:100% !important\` and remove left padding on stacked siblings.
- **Scale headlines**: large hero type (34–46px desktop) must reduce on mobile (typically 28–36px) so nothing overflows or wraps awkwardly.
- **Full-width CTAs**: primary buttons \`display:block; width:100%; box-sizing:border-box; text-align:center; min-height:44px\` — never leave a narrow pill button on mobile.
- **Tighten padding consistently**: outer page padding ~8–12px; inner section padding ~20–24px on mobile; keep 12–16px padding inside cards and around buttons so nothing feels edge-to-edge or cramped.
- **Preserve vertical rhythm**: maintain 16–20px gaps between stacked blocks on mobile (margin or padded spacer rows), not zero-gap stacks.
- **Fluid images**: \`img { max-width:100% !important; height:auto !important; }\` — no fixed-width images wider than the viewport.

Desktop (600px) requirements:
- Outer wrapper padding 28–44px; module gaps 18–28px; readable line-length with 16–18px body text.
- Multi-column rows only when each column has enough width; otherwise default to single column even on desktop.

Before calling set_campaign_email, sanity-check BOTH viewports:
- **Desktop (~600px)**: balanced whitespace, aligned modules, no orphaned narrow columns, CTAs clearly separated from body copy.
- **Mobile (~390px)**: no horizontal scroll, headlines fit, CTAs are thumb-sized and full-width, product grids stack vertically with comfortable spacing (not three tiny columns), padding never zero on text blocks.

Implementation pattern (match saved premade templates):
- Add semantic classes (\`wrapper\`, \`outer-pad\`, \`pad-x\`, \`stack\`, \`stack-cell\`, \`stack-gap\`, \`btn-a\`, \`h1-lg\`, etc.) on tables/cells and override in @media. Do NOT rely on fixed pixel widths for multi-column rows alone.
- Single-column copy blocks should already read well at 320px with 16–18px body text and line-height 1.5+.`;

export function verifyMobileEmailHtml(html: string): { ok: boolean; detail: string } {
  const hasViewport = /name\s*=\s*["']viewport["']/i.test(html);
  const hasMediaQuery = /@media[^\{]*max-width\s*:\s*600px/i.test(html);
  const hasFluidWrapper =
    /max-width\s*:\s*600px/i.test(html) &&
    (/width\s*:\s*100%/i.test(html) || /width\s*=\s*["']100%["']/i.test(html));
  const stacksOnMobile =
    /display\s*:\s*block\s*!important/i.test(html) ||
    /\.stack-cell/i.test(html) ||
    /stack-cell/i.test(html);

  const missing: string[] = [];
  if (!hasViewport) missing.push("viewport meta tag");
  if (!hasMediaQuery) missing.push("@media (max-width: 600px) rules");
  if (!hasFluidWrapper) missing.push("fluid 100% wrapper with max-width 600px");
  if (!stacksOnMobile) missing.push("mobile column stacking (e.g. .stack-cell { display:block; width:100% })");

  if (missing.length === 0) {
    return { ok: true, detail: "Viewport, fluid wrapper, @media queries, and mobile stacking present" };
  }

  return {
    ok: false,
    detail: `Missing mobile layout: ${missing.join("; ")} — add head <style> @media block and stack side-by-side cells for ~390px preview`,
  };
}
