// Shared lifecycle template helpers — safe for client and server.

import { DEFAULT_DESIGN_COLORS, LAYOUT_PRESETS } from "../design";
import type { CampaignContent } from "../types";
import type {
  LifecycleEmailDraft,
  LifecycleProgram,
  LifecycleProgramAbConfig,
  LifecycleProgramCustomEmail,
  LifecycleProgramTemplateConfig,
} from "./types";

/** The store's own designed campaign for this program, when one is saved. */
export function readProgramCustomEmail(
  program: LifecycleProgram,
): LifecycleProgramCustomEmail | null {
  const raw = (program.config ?? {}) as { custom_email?: LifecycleProgramCustomEmail | null };
  const custom = raw.custom_email;
  if (!custom || typeof custom !== "object") return null;
  if (!String(custom.subject ?? "").trim() || !String(custom.templateKey ?? "").trim()) return null;
  if (!custom.content || typeof custom.content !== "object") return null;
  return custom;
}

/** Subject A/B test config for this program (off unless fully configured). */
export function readProgramAbConfig(program: LifecycleProgram): LifecycleProgramAbConfig {
  const raw = (program.config ?? {}) as { ab?: Partial<LifecycleProgramAbConfig> | null };
  const enabled = Boolean(raw.ab?.enabled) && Boolean(String(raw.ab?.subject_b ?? "").trim());
  return { enabled, subject_b: String(raw.ab?.subject_b ?? "").trim() };
}

/** Read the optional design preference from a program's config JSON. */
export function readProgramTemplateConfig(
  program: LifecycleProgram,
): LifecycleProgramTemplateConfig {
  const raw = (program.config ?? {}) as LifecycleProgramTemplateConfig;
  return {
    templateId: raw.templateId ?? null,
    templateKey: raw.templateKey ?? null,
    templateLabel: raw.templateLabel ?? null,
  };
}

/**
 * Apply a chosen design onto lifecycle copy.
 * Always keeps the program's stage content (title/body/cta) — never the
 * template's stock marketing copy or locked HTML body.
 */
export function mergeDraftOntoTemplateContent(
  draft: Pick<LifecycleEmailDraft, "title" | "body" | "ctaText" | "ctaUrl">,
  content?: CampaignContent | null,
): CampaignContent {
  // AI-designed emails carry their own full HTML document — preserve it
  // verbatim (title/body are just the CRM record's plain-text summary).
  if (content?.design?.mode === "html" && content.design.html?.trim()) {
    return {
      ...content,
      title: draft.title || content.title,
      body: draft.body || content.body,
    };
  }

  const layout = content?.design?.layout ?? "classic";
  const presetColors = LAYOUT_PRESETS[layout]?.colors ?? {};
  const colors = {
    ...DEFAULT_DESIGN_COLORS,
    ...presetColors,
    ...(content?.design?.colors ?? {}),
  };

  return {
    title: draft.title,
    body: draft.body,
    ctaText: draft.ctaText ?? content?.ctaText,
    ctaUrl: draft.ctaUrl ?? content?.ctaUrl,
    heroImageUrl: content?.heroImageUrl,
    items: content?.items,
    footerText:
      content?.footerText ?? "You're receiving this because you're a customer of our store.",
    // Force classic template rendering so lifecycle copy drives the email.
    design: {
      mode: "template",
      layout,
      colors,
    },
  };
}

/** Build the campaign content blob used for preview + send. */
export function lifecycleEmailToContent(email: LifecycleEmailDraft): CampaignContent {
  return mergeDraftOntoTemplateContent(email, email.content);
}
