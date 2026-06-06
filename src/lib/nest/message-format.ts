export type NestMessageTemplateSettings = {
  intro: string;
  signoff: string;
};

export const DEFAULT_NEST_MESSAGE_INTRO = "Hi {name},";
export const DEFAULT_NEST_MESSAGE_SIGNOFF = "— {store}";

export const NEST_MESSAGE_PLACEHOLDER_HINT =
  "Use {name} for the customer’s first name and {store} for your business name.";

function interpolateTemplate(
  template: string,
  values: { name: string; store: string },
): string {
  return template
    .replaceAll("{name}", values.name)
    .replaceAll("{store}", values.store)
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveNestMessageTemplates(
  raw?: Partial<NestMessageTemplateSettings> | null,
): NestMessageTemplateSettings {
  const intro =
    typeof raw?.intro === "string" && raw.intro.trim()
      ? raw.intro.trim()
      : DEFAULT_NEST_MESSAGE_INTRO;
  const signoff =
    typeof raw?.signoff === "string" ? raw.signoff.trim() : DEFAULT_NEST_MESSAGE_SIGNOFF;
  return { intro, signoff };
}

export function formatNestOutboundMessage(
  body: string,
  options: {
    firstName?: string | null;
    storeName?: string | null;
    templates?: Partial<NestMessageTemplateSettings> | null;
  },
): string {
  const templates = resolveNestMessageTemplates(options.templates);
  const values = {
    name: String(options.firstName ?? "").trim() || "there",
    store: String(options.storeName ?? "").trim() || "our store",
  };

  const middle = body.trim().replace(/\s+/g, " ");
  const parts = [
    templates.intro ? interpolateTemplate(templates.intro, values) : "",
    middle,
    templates.signoff ? interpolateTemplate(templates.signoff, values) : "",
  ].filter(Boolean);

  return parts.join(" ");
}
