import { allowedToolkitsForRequest, normaliseToolkitSlug } from "./toolkit-registry.ts";
import type { ToolRisk } from "./policy.ts";

export interface ToolSandboxPolicy {
  allowedToolkits: string[];
  allowedToolSlugs: string[];
  deniedToolSlugs: string[];
  maxResults: number;
}

export function buildToolSandboxPolicy(args: {
  requestedToolkits: string[];
  allowedToolSlugs?: string[];
  deniedToolSlugs?: string[];
}): ToolSandboxPolicy {
  return {
    allowedToolkits: allowedToolkitsForRequest({ requested: args.requestedToolkits }),
    allowedToolSlugs: (args.allowedToolSlugs ?? []).map((slug) => slug.trim().toUpperCase()).filter(Boolean),
    deniedToolSlugs: (args.deniedToolSlugs ?? []).map((slug) => slug.trim().toUpperCase()).filter(Boolean),
    maxResults: 12,
  };
}

export function assertToolAllowed(args: {
  slug?: string | null;
  toolkit?: string | null;
  risk: ToolRisk;
  policy: ToolSandboxPolicy;
  writeApproved: boolean;
}): { ok: true } | { ok: false; reason: string } {
  const slug = args.slug?.trim().toUpperCase() ?? "";
  if (slug && args.policy.deniedToolSlugs.includes(slug)) return { ok: false, reason: "tool_denied" };
  if (args.policy.allowedToolSlugs.length > 0 && slug && !args.policy.allowedToolSlugs.includes(slug)) {
    return { ok: false, reason: "tool_not_in_allowlist" };
  }
  const toolkit = args.toolkit ? normaliseToolkitSlug(args.toolkit) : "";
  if (toolkit && !args.policy.allowedToolkits.includes(toolkit)) {
    return { ok: false, reason: "toolkit_not_allowed" };
  }
  if (args.risk === "write" && !args.writeApproved) {
    return { ok: false, reason: "write_not_approved" };
  }
  return { ok: true };
}
