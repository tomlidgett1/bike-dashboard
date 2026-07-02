// Deterministic post-compose verification for agent-authored campaign HTML.
//
// The agent must not ship an email with invented imagery, a missing
// unsubscribe link, or broken pricing claims. These checks run server-side on
// every set_campaign_email call; failures go back to the model so it can
// self-correct, and the final report renders in the specs panel.

import type { CampaignVerification, CampaignVerificationCheck } from "./chat-types";
import type { AgentProductPick } from "./types";

const UNSUBSCRIBE_PLACEHOLDER = "{{UNSUBSCRIBE_URL}}";
const MAX_SUBJECT_LENGTH = 78;
const MAX_HTML_BYTES = 150_000;

export function extractImageUrls(html: string): string[] {
  const urls = new Set<string>();
  const re = /<img[^>]*\ssrc\s*=\s*("([^"]+)"|'([^']+)')/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const url = (match[2] ?? match[3] ?? "").trim();
    if (url) urls.add(url);
  }
  return [...urls];
}

export function verifyCampaignEmail(args: {
  subject: string;
  html: string;
  knownImageUrls: Set<string>;
  featuredProducts: AgentProductPick[];
}): CampaignVerification {
  const checks: CampaignVerificationCheck[] = [];
  const html = args.html;

  // Subject
  const subjectLength = args.subject.trim().length;
  checks.push({
    label: "Subject line length",
    ok: subjectLength > 0 && subjectLength <= MAX_SUBJECT_LENGTH,
    detail:
      subjectLength === 0
        ? "Subject is empty"
        : subjectLength > MAX_SUBJECT_LENGTH
          ? `${subjectLength} chars — keep under ${MAX_SUBJECT_LENGTH} so it doesn't truncate in inboxes`
          : `${subjectLength} chars`,
  });

  // Unsubscribe
  checks.push({
    label: "Unsubscribe link",
    ok: html.includes(UNSUBSCRIBE_PLACEHOLDER),
    detail: html.includes(UNSUBSCRIBE_PLACEHOLDER)
      ? "{{UNSUBSCRIBE_URL}} placeholder present"
      : "Placeholder missing — a fallback link will be appended automatically",
  });

  // Images must come from verified sources (catalogue lookups, store logo,
  // loaded templates) — never invented by the model.
  const imageUrls = extractImageUrls(html);
  const unknown = imageUrls.filter((url) => {
    if (args.knownImageUrls.has(url)) return false;
    // Allow tracking-pixel/spacer data URIs and same-known-host Cloudinary variants.
    if (url.startsWith("data:image/")) return false;
    return true;
  });
  checks.push({
    label: "Image sources verified",
    ok: unknown.length === 0,
    detail:
      unknown.length === 0
        ? imageUrls.length > 0
          ? `${imageUrls.length} image${imageUrls.length === 1 ? "" : "s"}, all from verified store data`
          : "No images used"
        : `${unknown.length} image URL${unknown.length === 1 ? "" : "s"} not from store data: ${unknown
            .slice(0, 3)
            .map((u) => u.slice(0, 80))
            .join(", ")}`,
  });

  // Featured products should render with their real image + price.
  const missingImages = args.featuredProducts.filter((p) => p.imageUrl && !html.includes(p.imageUrl));
  const missingPrices = args.featuredProducts.filter((p) => p.price && !html.includes(p.price));
  if (args.featuredProducts.length > 0) {
    checks.push({
      label: "Featured products rendered",
      ok: missingImages.length === 0 && missingPrices.length === 0,
      detail:
        missingImages.length === 0 && missingPrices.length === 0
          ? `${args.featuredProducts.length} product${args.featuredProducts.length === 1 ? "" : "s"} with verified image + price`
          : [
              missingImages.length > 0
                ? `${missingImages.length} missing catalogue image (${missingImages.map((p) => p.title).slice(0, 2).join(", ")})`
                : null,
              missingPrices.length > 0
                ? `${missingPrices.length} missing exact price (${missingPrices.map((p) => p.title).slice(0, 2).join(", ")})`
                : null,
            ]
              .filter(Boolean)
              .join("; "),
    });
  }

  // Email-client safety
  const hasScript = /<script/i.test(html);
  const hasExternalCss = /<link[^>]+stylesheet/i.test(html);
  checks.push({
    label: "Email-safe HTML",
    ok: !hasScript && !hasExternalCss,
    detail:
      !hasScript && !hasExternalCss
        ? "Inline CSS only, no scripts"
        : [hasScript ? "contains <script>" : null, hasExternalCss ? "external stylesheet" : null]
            .filter(Boolean)
            .join(", "),
  });

  const bytes = Buffer.byteLength(html, "utf8");
  checks.push({
    label: "Email size",
    ok: bytes <= MAX_HTML_BYTES,
    detail: bytes <= MAX_HTML_BYTES
      ? `${Math.round(bytes / 1024)} KB (Gmail clips ~102 KB)`
      : `${Math.round(bytes / 1024)} KB — too large, Gmail will clip; simplify the layout`,
  });

  return { checks };
}

export function verificationProblems(verification: CampaignVerification): string[] {
  return verification.checks.filter((c) => !c.ok).map((c) => `${c.label}: ${c.detail ?? "failed"}`);
}
