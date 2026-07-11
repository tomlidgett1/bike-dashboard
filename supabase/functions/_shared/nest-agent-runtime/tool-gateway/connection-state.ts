import { listComposioConnectedAccounts } from "../../composio-tools.ts";
import type { RuntimeContext } from "../types.ts";
import { upsertConnectedAccount } from "../persistence/records.ts";
import { getAdminClient } from "../../supabase.ts";
import { NESTV3_TABLES } from "../constants.ts";
import { normaliseComposioToolkitSlug, normaliseEmailProvider, toolkitForEmailProvider, type EmailProvider } from "./provider-bindings.ts";

export interface ConnectedToolkit {
  toolkit: string;
  connectedAccountId: string;
  composioUserId: string;
  status: string;
  label: string;
}

function connectedToolkitFromParts(toolkit: string, label: string): string {
  const normalisedToolkit = normaliseComposioToolkitSlug(toolkit);
  const normalisedLabel = normaliseComposioToolkitSlug(label);
  const emailProvider = normaliseEmailProvider(normalisedToolkit) ?? normaliseEmailProvider(label);
  if (emailProvider) return toolkitForEmailProvider(emailProvider);
  if (normalisedLabel.includes("google_calendar")) return "googlecalendar";
  if (normalisedLabel.includes("google_drive")) return "googledrive";
  if (normalisedLabel.includes("google_sheets")) return "googlesheets";
  if (normalisedLabel.includes("notion")) return "notion";
  if (normalisedLabel.includes("strava")) return "strava";
  return normalisedToolkit;
}

async function loadCachedConnectedAccounts(ctx: RuntimeContext): Promise<ConnectedToolkit[]> {
  const composioUserIds = ctx.composioUserIds.length ? ctx.composioUserIds : [ctx.composioUserId];
  const { data, error } = await getAdminClient()
    .from(NESTV3_TABLES.userConnectedAccounts)
    .select("toolkit_slug, connected_account_id, composio_user_id, status, label")
    .in("composio_user_id", composioUserIds)
    .eq("status", "active");

  if (error) throw new Error(`Failed to load cached connected accounts: ${error.message}`);
  return (data ?? []).map((account) => {
    const toolkit = String(account.toolkit_slug ?? "");
    const label = String(account.label ?? toolkit);
    return {
      toolkit: connectedToolkitFromParts(toolkit, label),
      connectedAccountId: String(account.connected_account_id ?? ""),
      composioUserId: String(account.composio_user_id ?? ctx.composioUserId),
      status: "active",
      label,
    };
  });
}

export function emailProviderToolkitsToConnect(args: {
  selectedEmailApp: string | null;
  candidateEmailApps?: string[];
}): string[] {
  const selected = normaliseEmailProvider(args.selectedEmailApp);
  const providers = selected
    ? [selected]
    : (args.candidateEmailApps ?? [])
      .map((app) => normaliseEmailProvider(app))
      .filter((provider): provider is EmailProvider => Boolean(provider));
  const unique = [...new Set(providers.length ? providers : ["gmail", "outlook"] as EmailProvider[])];
  return unique.map(toolkitForEmailProvider);
}

export async function refreshConnectedAccounts(ctx: RuntimeContext): Promise<ConnectedToolkit[]> {
  const all = await Promise.all(
    (ctx.composioUserIds.length ? ctx.composioUserIds : [ctx.composioUserId]).map(async (composioUserId) => {
      const accounts = await listComposioConnectedAccounts(composioUserId).catch(() => []);
      return accounts
        .filter((account) => account.status === "ACTIVE" || account.status === "active")
        .map((account) => ({
          toolkit: connectedToolkitFromParts(account.toolkit, account.label),
          connectedAccountId: account.id,
          composioUserId,
          status: "active",
          label: account.label,
        }));
    }),
  );
  const active = all.flat().filter((account, index, arr) =>
    arr.findIndex((candidate) =>
      candidate.toolkit === account.toolkit &&
      candidate.connectedAccountId === account.connectedAccountId
    ) === index
  );
  const cached = await loadCachedConnectedAccounts(ctx).catch(() => []);

  const merged = [...active, ...cached].filter((account, index, arr) =>
    arr.findIndex((candidate) =>
      candidate.toolkit === account.toolkit &&
      candidate.composioUserId === account.composioUserId &&
      candidate.connectedAccountId === account.connectedAccountId
    ) === index
  );

  await Promise.all(active.map((account) =>
    upsertConnectedAccount({
      authUserId: ctx.authUserId,
      senderHandle: ctx.senderHandle,
      composioUserId: account.composioUserId,
      toolkitSlug: account.toolkit,
      connectedAccountId: account.connectedAccountId,
      status: "active",
      label: account.label,
    })
  ));

  return merged;
}

export function resolveEmailProvider(args: {
  connected: ConnectedToolkit[];
  selectedEmailApp: string | null;
}): { provider: string | null; ambiguous: boolean; missing: boolean; account?: ConnectedToolkit } {
  const selected = normaliseEmailProvider(args.selectedEmailApp);
  const emailAccounts = args.connected.filter((account) => normaliseEmailProvider(account.toolkit) ?? normaliseEmailProvider(account.label));
  if (selected) {
    const account = emailAccounts.find((candidate) =>
      (normaliseEmailProvider(candidate.toolkit) ?? normaliseEmailProvider(candidate.label)) === selected
    );
    return { provider: selected, ambiguous: false, missing: !account, account };
  }
  if (emailAccounts.length === 1) {
    const provider = normaliseEmailProvider(emailAccounts[0].toolkit) ?? normaliseEmailProvider(emailAccounts[0].label);
    return { provider, ambiguous: false, missing: false, account: emailAccounts[0] };
  }
  if (emailAccounts.length > 1) return { provider: null, ambiguous: true, missing: false };
  return { provider: null, ambiguous: false, missing: true };
}

export function hasToolkit(connected: ConnectedToolkit[], toolkit: string): ConnectedToolkit | null {
  const wanted = normaliseComposioToolkitSlug(toolkit);
  return connected.find((account) => normaliseComposioToolkitSlug(account.toolkit) === wanted) ?? null;
}
