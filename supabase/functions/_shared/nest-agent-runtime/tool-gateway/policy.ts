export type ToolRisk = "read" | "write";

export function inferRiskFromSlug(slug: string, description = ""): ToolRisk {
  const s = slug.toUpperCase();
  const d = description.toLowerCase();
  const writeSlug =
    /(CREATE|UPDATE|DELETE|SEND|POST|WRITE|PATCH|UPSERT|REMOVE|CANCEL|ARCHIVE|REPLY|COMMENT|BOOK|SCHEDULE|INVITE)/.test(s);
  const writeDescription =
    /\b(create|update|delete|send|post|write|patch|upsert|remove|cancel|archive|reply|comment|book|schedule|invite)\b/.test(d);
  return writeSlug || writeDescription ? "write" : "read";
}

export function writeApproved(args: {
  toolName: string;
  approvals: Record<string, string>;
  dryRun: boolean;
}): boolean {
  if (args.dryRun) return false;
  if (args.toolName === "create_agent_spec" || args.toolName === "create_automation") {
    return args.approvals.automation_creation === "explicitly_requested";
  }
  return args.approvals[args.toolName] === "explicitly_requested" ||
    args.approvals[args.toolName] === "approved_by_user_request" ||
    args.approvals[args.toolName] === "approved_by_agent_spec";
}
