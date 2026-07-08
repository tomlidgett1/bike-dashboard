"use client";

// Email CRM — contacts imported from Lightspeed + template-based campaigns.
// Flow: Contacts → New campaign → Template → Customize → Preview → Recipients
// → Review → Send. The composer lives in campaign-composer.tsx.

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cog,
  Copy,
  Eye,
  Letter,
  Loader2,
  Mailbox,
  MoreHorizontal,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Tag,
  Trash2,
  Users,
  Calendar,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { SettingsNavTabs } from "@/components/settings/settings-nav-tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getCrmTemplate, type StoreBranding } from "@/lib/crm/templates";
import type { CrmCampaign, CrmContact, CrmContactGroup, CrmContactSort } from "@/lib/crm/types";
import { formatAud } from "@/lib/crm/types";
import { CampaignComposer, type ComposerSeed } from "./campaign-composer";
import { CampaignDetailDialog } from "./campaign-detail-dialog";
import { ContactGroupFilterDropdown, ContactSortDropdown } from "./contact-sort-dropdown";
import { ContactGroupsPanel } from "./contact-groups-panel";
import { CrmAgentPanel } from "./crm-agent-panel";
import { CrmAutomationPanel } from "./crm-automation-panel";

type ContactStats = { total: number; optedOut: number; eligible: number };
type ContactFilter = "all" | "opted_in" | "opted_out";
type CrmSection = "create" | "people" | "activity";
type PeopleTab = "contacts" | "groups";
type ActivityTab = "campaigns" | "automation";

const PAGE_SIZE = 50;

const FILTERS: { id: ContactFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "opted_in", label: "Subscribed" },
  { id: "opted_out", label: "Opted out" },
];

function contactName(contact: CrmContact): string {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ");
}

function initials(contact: CrmContact): string {
  const name = contactName(contact);
  if (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }
  return contact.email.slice(0, 2).toUpperCase();
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatRate(count: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((count / total) * 100)}%`;
}

function ratePercent(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((count / total) * 100));
}

type CampaignMetricTone = "default" | "muted" | "warning" | "danger";

function CampaignMetricCell({
  label,
  count,
  total,
  tone = "default",
}: {
  label: string;
  count: number;
  total: number;
  tone?: CampaignMetricTone;
}) {
  const pct = ratePercent(count, total);
  const rate = formatRate(count, total);
  const detail =
    total > 0 ? `${count.toLocaleString()} of ${total.toLocaleString()}` : undefined;
  const valueClass =
    tone === "danger"
      ? "text-red-700"
      : tone === "warning"
        ? "text-amber-800"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  const barClass =
    tone === "danger"
      ? "bg-red-500/80"
      : tone === "warning"
        ? "bg-amber-500/70"
        : "bg-foreground/50";

  return (
    <div className="min-w-[4.25rem]" title={detail}>
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 text-[15px] font-semibold tabular-nums leading-none", valueClass)}>
        {rate}
      </p>
      {total > 0 ? (
        <p className="mt-1 text-[11px] tabular-nums leading-none text-muted-foreground">
          {count.toLocaleString()}
        </p>
      ) : null}
      <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-gray-100" aria-hidden>
        <div
          className={cn("h-full rounded-full transition-[width] duration-300 ease-out", barClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function CampaignMetrics({ campaign }: { campaign: CrmCampaign }) {
  const sent = campaign.sent_count;
  const opened = campaign.opened_count ?? 0;
  const clicked = campaign.clicked_count ?? 0;
  const delivered = campaign.delivered_count ?? 0;
  const bounced = campaign.bounced_count ?? 0;

  // Opens and clicks are measured against delivered emails (the industry
  // standard, matching Resend's dashboard). Fall back to sent while delivery
  // webhooks are still arriving.
  const engagementBase = delivered > 0 ? delivered : sent;
  const bounceRate = ratePercent(bounced, sent);
  const clickTone: CampaignMetricTone =
    engagementBase > 0 && clicked === 0 ? "muted" : "default";
  const bounceTone: CampaignMetricTone =
    bounceRate >= 10 ? "danger" : bounceRate >= 5 ? "warning" : "default";

  return (
    <div className="flex items-start gap-5">
      <CampaignMetricCell label="Open" count={opened} total={engagementBase} />
      <CampaignMetricCell
        label="Click"
        count={clicked}
        total={engagementBase}
        tone={clickTone}
      />
      <CampaignMetricCell label="Inbox" count={delivered} total={sent} />
      {bounced > 0 ? (
        <CampaignMetricCell label="Bounce" count={bounced} total={sent} tone={bounceTone} />
      ) : null}
    </div>
  );
}

const CAMPAIGN_STATUS_STYLES: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600",
  sending: "bg-sky-50 text-sky-800",
  sent: "bg-emerald-50 text-emerald-800",
  failed: "bg-red-50 text-red-700",
};

const CRM_SECTIONS = [
  { id: "create", label: "Create", icon: Sparkles },
  { id: "people", label: "People", icon: Users },
  { id: "activity", label: "Activity", icon: Letter },
] as const satisfies readonly { id: CrmSection; label: string; icon: typeof Sparkles }[];

const PEOPLE_TABS = [
  { id: "contacts", label: "Contacts", icon: Users },
  { id: "groups", label: "Groups", icon: Tag },
] as const satisfies readonly { id: PeopleTab; label: string; icon: React.ComponentType<{ className?: string }> }[];

const ACTIVITY_TABS = [
  { id: "campaigns", label: "Campaigns", icon: Letter },
  { id: "automation", label: "Automation", icon: Calendar },
] as const satisfies readonly { id: ActivityTab; label: string; icon: typeof Letter }[];

export function CrmPageContent() {
  const [section, setSection] = React.useState<CrmSection>("create");
  const [peopleTab, setPeopleTab] = React.useState<PeopleTab>("contacts");
  const [activityTab, setActivityTab] = React.useState<ActivityTab>("campaigns");
  const { open, setOpen, isMobile, openMobile, setOpenMobile } = useSidebar();

  const goToCampaigns = React.useCallback(() => {
    setSection("activity");
    setActivityTab("campaigns");
  }, []);

  const handleSectionChange = React.useCallback(
    (nextSection: CrmSection) => {
      setSection(nextSection);
      if (nextSection !== "create") return;
      if (isMobile) {
        if (openMobile) setOpenMobile(false);
        return;
      }
      if (open) setOpen(false);
    },
    [isMobile, open, openMobile, setOpen, setOpenMobile],
  );

  // Contacts
  const [contacts, setContacts] = React.useState<CrmContact[]>([]);
  const [stats, setStats] = React.useState<ContactStats | null>(null);
  const [filteredCount, setFilteredCount] = React.useState(0);
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<ContactFilter>("all");
  const [sort, setSort] = React.useState<CrmContactSort>("recent");
  const [groupFilterId, setGroupFilterId] = React.useState<string>("");
  const [groups, setGroups] = React.useState<CrmContactGroup[]>([]);
  const [enriching, setEnriching] = React.useState(false);
  const [loadingContacts, setLoadingContacts] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [selected, setSelected] = React.useState<Map<string, CrmContact>>(new Map());

  // Campaigns
  const [campaigns, setCampaigns] = React.useState<CrmCampaign[]>([]);
  const [senderEmail, setSenderEmail] = React.useState<string | null>(null);
  const [replyToEmail, setReplyToEmail] = React.useState<string | null>(null);
  const [storeBranding, setStoreBranding] = React.useState<StoreBranding>({
    name: "Your Bike Store",
    logoUrl: null,
  });
  const [loadingCampaigns, setLoadingCampaigns] = React.useState(true);
  const [busyCampaignId, setBusyCampaignId] = React.useState<string | null>(null);

  // Import + notices
  const [importing, setImporting] = React.useState(false);
  const [notice, setNotice] = React.useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Composer
  const [composerSeed, setComposerSeed] = React.useState<ComposerSeed | null>(null);

  const loadContacts = React.useCallback(
    async (opts?: { append?: boolean; offset?: number }) => {
      const offset = opts?.offset ?? 0;
      if (opts?.append) setLoadingMore(true);
      else setLoadingContacts(true);
      try {
        const params = new URLSearchParams({
          search,
          filter,
          sort,
          offset: String(offset),
          limit: String(PAGE_SIZE),
        });
        if (groupFilterId) params.set("groupId", groupFilterId);
        const res = await fetch(`/api/store/crm/contacts?${params}`, { cache: "no-store" });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Failed to load contacts");
        const data = await res.json();
        setContacts((prev) => (opts?.append ? [...prev, ...data.contacts] : data.contacts));
        setStats(data.stats);
        setFilteredCount(data.filteredCount);
      } catch (error) {
        setNotice({ kind: "error", text: error instanceof Error ? error.message : "Failed to load contacts" });
      } finally {
        setLoadingContacts(false);
        setLoadingMore(false);
      }
    },
    [search, filter, sort, groupFilterId],
  );

  const loadGroups = React.useCallback(async () => {
    try {
      const res = await fetch("/api/store/crm/groups", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setGroups(data.groups ?? []);
    } catch {
      // non-fatal
    }
  }, []);

  const loadCampaigns = React.useCallback(async () => {
    setLoadingCampaigns(true);
    try {
      const res = await fetch("/api/store/crm/campaigns", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load campaigns");
      const data = await res.json();
      setCampaigns(data.campaigns ?? []);
      setSenderEmail(data.senderEmail ?? null);
      setReplyToEmail(data.replyToEmail ?? null);
      if (data.store?.name) setStoreBranding(data.store);
    } catch {
      // non-fatal; the campaigns tab shows its own empty state
    } finally {
      setLoadingCampaigns(false);
    }
  }, []);

  React.useEffect(() => {
    const handle = setTimeout(() => void loadContacts(), search ? 250 : 0);
    return () => clearTimeout(handle);
  }, [loadContacts, search]);

  React.useEffect(() => {
    void loadCampaigns();
    void loadGroups();
  }, [loadCampaigns, loadGroups]);

  const runEnrich = React.useCallback(async () => {
    setEnriching(true);
    setNotice(null);
    try {
      const res = await fetch("/api/store/crm/enrich", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Enrichment failed");
      setNotice({
        kind: "success",
        text: `Synced ${(data.statsUpdated ?? 0).toLocaleString()} contact${data.statsUpdated === 1 ? "" : "s"} from ${(data.salesReportLines ?? 0).toLocaleString()} sales lines${data.joinedUpdated ? ` · ${data.joinedUpdated} join dates` : ""}${data.skipped ? ` · ${data.skipped} with no sales on file` : ""}.`,
      });
      await loadContacts();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Enrichment failed" });
    } finally {
      setEnriching(false);
    }
  }, [loadContacts]);

  const runImport = React.useCallback(async () => {
    setImporting(true);
    setNotice(null);
    try {
      const res = await fetch("/api/store/crm/import", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Import failed");
      setNotice({
        kind: "success",
        text: `Imported ${data.imported} new contact${data.imported === 1 ? "" : "s"} (${data.scanned} customers scanned, ${data.updated} updated).`,
      });
      await loadContacts();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Import failed" });
    } finally {
      setImporting(false);
    }
  }, [loadContacts]);

  const toggleContact = (contact: CrmContact) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(contact.id)) next.delete(contact.id);
      else next.set(contact.id, contact);
      return next;
    });
  };

  const eligibleLoaded = contacts.filter((contact) => !contact.opted_out);
  const allLoadedSelected =
    eligibleLoaded.length > 0 && eligibleLoaded.every((contact) => selected.has(contact.id));

  const toggleAllLoaded = () => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (allLoadedSelected) {
        for (const contact of eligibleLoaded) next.delete(contact.id);
      } else {
        for (const contact of eligibleLoaded) next.set(contact.id, contact);
      }
      return next;
    });
  };

  const openComposer = (seed?: Partial<ComposerSeed>, agentRecipientIds?: string[]) => {
    setComposerSeed({
      templateKey: seed?.templateKey ?? null,
      subject: seed?.subject ?? null,
      content: seed?.content ?? null,
      agentRecipientIds,
      agentRecipientCount: agentRecipientIds?.length,
    });
  };

  const deleteCampaign = async (campaignId: string) => {
    setBusyCampaignId(campaignId);
    try {
      const res = await fetch(`/api/store/crm/campaigns/${campaignId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Delete failed");
      await loadCampaigns();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Delete failed" });
    } finally {
      setBusyCampaignId(null);
    }
  };

  const sendDraft = async (campaign: CrmCampaign) => {
    if (
      !window.confirm(
        `Send "${campaign.subject}" to ${campaign.intended_count} recipient${campaign.intended_count === 1 ? "" : "s"}? This can't be undone.`,
      )
    )
      return;
    setBusyCampaignId(campaign.id);
    try {
      const res = await fetch(`/api/store/crm/campaigns/${campaign.id}/send`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Send failed");
      setNotice({ kind: "success", text: `Campaign sent to ${data.sent} recipient${data.sent === 1 ? "" : "s"}.` });
      await loadCampaigns();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Send failed" });
      await loadCampaigns();
    } finally {
      setBusyCampaignId(null);
    }
  };

  const hasAnyContacts = (stats?.total ?? 0) > 0;

  return (
    <>
      <DashboardFloatingPage
        title="Outreach"
        icon={Mailbox}
        actions={
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon-sm" aria-label="Outreach settings">
                  <Cog className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-md">
                <DropdownMenuItem onClick={() => void runEnrich()} disabled={enriching}>
                  {enriching ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {enriching ? "Syncing…" : "Sync Lightspeed stats"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void runImport()} disabled={importing}>
                  {importing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {importing ? "Importing…" : "Import from Lightspeed"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => openComposer()} disabled={(stats?.eligible ?? 0) === 0 && selected.size === 0}>
              <Send className="mr-1.5 size-4" />
              New campaign
            </Button>
          </div>
        }
        toolbar={
          <div className="flex flex-col gap-2.5">
            <SettingsNavTabs
              items={CRM_SECTIONS}
              value={section}
              onChange={handleSectionChange}
              layoutId="crm-main-tabs"
            />
            {section === "people" ? (
              <SettingsNavTabs
                size="sm"
                items={PEOPLE_TABS}
                value={peopleTab}
                onChange={setPeopleTab}
                layoutId="crm-people-tabs"
              />
            ) : section === "activity" ? (
              <SettingsNavTabs
                size="sm"
                items={ACTIVITY_TABS}
                value={activityTab}
                onChange={setActivityTab}
                layoutId="crm-activity-tabs"
              />
            ) : null}
          </div>
        }
        flush
        scrollClassName={
          section === "create" ? "flex min-h-0 flex-1 flex-col overflow-hidden" : undefined
        }
      >
        <div className={cn("flex min-h-0 flex-1 flex-col", section === "create" && "h-full")}>
          {notice ? (
            <div
              className={cn(
                "flex items-center gap-2 border-b px-5 py-2.5 text-sm",
                notice.kind === "success"
                  ? "border-emerald-100 bg-emerald-50 text-emerald-800"
                  : "border-red-100 bg-red-50 text-red-800",
              )}
            >
              {notice.kind === "success" ? (
                <CheckCircle2 className="size-4 shrink-0" />
              ) : (
                <AlertTriangle className="size-4 shrink-0" />
              )}
              <span className="min-w-0 flex-1">{notice.text}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="text-xs font-medium underline-offset-2 hover:underline"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          {section === "people" && peopleTab === "contacts" ? (
            <ContactsView
              contacts={contacts}
              stats={stats}
              loading={loadingContacts}
              loadingMore={loadingMore}
              filteredCount={filteredCount}
              hasAnyContacts={hasAnyContacts}
              importing={importing}
              onImport={() => void runImport()}
              search={search}
              onSearch={setSearch}
              filter={filter}
              onFilter={setFilter}
              sort={sort}
              onSort={setSort}
              groups={groups}
              groupFilterId={groupFilterId}
              onGroupFilter={setGroupFilterId}
              selected={selected}
              onToggle={toggleContact}
              allLoadedSelected={allLoadedSelected}
              onToggleAll={toggleAllLoaded}
              onClearSelection={() => setSelected(new Map())}
              onLoadMore={() => void loadContacts({ append: true, offset: contacts.length })}
              onCreateCampaign={() => openComposer()}
            />
          ) : section === "people" && peopleTab === "groups" ? (
            <ContactGroupsPanel
              selectedContactIds={Array.from(selected.keys())}
              onGroupsChange={() => {
                void loadGroups();
                void loadContacts();
              }}
              onEmailGroup={(contactIds) => openComposer(undefined, contactIds)}
            />
          ) : section === "create" ? (
            <CrmAgentPanel
              store={storeBranding}
              onOpenComposer={(seed, contactIds) => openComposer(seed, contactIds)}
              onCampaignCreated={() => {
                goToCampaigns();
                void loadCampaigns();
              }}
            />
          ) : section === "activity" && activityTab === "automation" ? (
            <CrmAutomationPanel />
          ) : section === "activity" ? (
            <CampaignsView
              campaigns={campaigns}
              loading={loadingCampaigns}
              busyCampaignId={busyCampaignId}
              store={storeBranding}
              onNewCampaign={() => openComposer()}
              onDuplicate={(campaign) =>
                openComposer({
                  templateKey: campaign.template_key,
                  subject: campaign.subject,
                  content: campaign.content,
                })
              }
              onDelete={(campaignId) => void deleteCampaign(campaignId)}
              onSendDraft={(campaign) => void sendDraft(campaign)}
            />
          ) : null}
        </div>
      </DashboardFloatingPage>

      {composerSeed ? (
        <CampaignComposer
          seed={composerSeed}
          senderEmail={senderEmail}
          replyToEmail={replyToEmail}
          store={storeBranding}
          eligibleCount={stats?.eligible ?? 0}
          selectedContacts={Array.from(selected.values())}
          onClose={() => setComposerSeed(null)}
          onSent={() => {
            setComposerSeed(null);
            setSelected(new Map());
            goToCampaigns();
            void loadCampaigns();
          }}
        />
      ) : null}
    </>
  );
}

// ============================================================
// Contacts
// ============================================================

const AVATAR_PALETTE = [
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
  "bg-indigo-100 text-indigo-700",
  "bg-orange-100 text-orange-700",
] as const;

function avatarPalette(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function ContactsView(props: {
  contacts: CrmContact[];
  stats: ContactStats | null;
  loading: boolean;
  loadingMore: boolean;
  filteredCount: number;
  hasAnyContacts: boolean;
  importing: boolean;
  onImport: () => void;
  search: string;
  onSearch: (value: string) => void;
  filter: ContactFilter;
  onFilter: (value: ContactFilter) => void;
  sort: CrmContactSort;
  onSort: (value: CrmContactSort) => void;
  groups: CrmContactGroup[];
  groupFilterId: string;
  onGroupFilter: (value: string) => void;
  selected: Map<string, CrmContact>;
  onToggle: (contact: CrmContact) => void;
  allLoadedSelected: boolean;
  onToggleAll: () => void;
  onClearSelection: () => void;
  onLoadMore: () => void;
  onCreateCampaign: () => void;
}) {
  const {
    contacts,
    stats,
    loading,
    loadingMore,
    filteredCount,
    hasAnyContacts,
    importing,
    onImport,
    search,
    onSearch,
    filter,
    onFilter,
    sort,
    onSort,
    groups,
    groupFilterId,
    onGroupFilter,
    selected,
    onToggle,
    allLoadedSelected,
    onToggleAll,
    onClearSelection,
    onLoadMore,
    onCreateCampaign,
  } = props;

  if (!loading && !hasAnyContacts && !search && filter === "all") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-20 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-gray-100">
          <Users className="size-6 text-gray-400" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">No contacts yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Import your Lightspeed customers to start building your email list. Contacts are
            deduplicated by email automatically.
          </p>
        </div>
        <Button onClick={onImport} disabled={importing}>
          {importing ? <Loader2 className="mr-1.5 size-4" /> : <RefreshCw className="mr-1.5 size-4" />}
          {importing ? "Importing…" : "Import from Lightspeed"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar */}
      <div className="space-y-2.5 border-b border-border/60 px-4 py-3 md:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search by name or email"
              className="h-9 w-full rounded-full pl-9"
            />
          </div>
          {stats ? (
            <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
              {[
                { value: stats.total, label: "contacts" },
                { value: stats.eligible, label: "subscribed" },
                { value: stats.optedOut, label: "opted out" },
              ].map((item) => (
                <span
                  key={item.label}
                  className="inline-flex items-baseline gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs"
                >
                  <span className="font-semibold tabular-nums text-foreground">
                    {item.value.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground">{item.label}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex shrink-0 items-center rounded-lg bg-gray-100 p-0.5">
            {FILTERS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onFilter(entry.id)}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  filter === entry.id
                    ? "bg-white text-gray-800 shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <ContactSortDropdown value={sort} onChange={onSort} />
          {groups.length > 0 ? (
            <ContactGroupFilterDropdown
              groups={groups}
              value={groupFilterId}
              onChange={onGroupFilter}
            />
          ) : null}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground lg:hidden">
            {filteredCount.toLocaleString()} contact{filteredCount === 1 ? "" : "s"}
          </span>
        </div>

        {selected.size > 0 ? (
          <div className="flex flex-col gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-white sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm">
                <span className="font-semibold tabular-nums">{selected.size}</span> selected
              </span>
              <button
                type="button"
                onClick={onClearSelection}
                className="text-xs font-medium text-white/70 underline-offset-2 hover:text-white hover:underline"
              >
                Clear
              </button>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="w-full bg-white text-zinc-900 hover:bg-white/90 sm:w-auto"
              onClick={onCreateCampaign}
            >
              <Send className="mr-1.5 size-3.5" />
              Email selected
            </Button>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 py-16 text-sm text-muted-foreground">
          No contacts match your search.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Column header */}
          <div className="sticky top-0 z-[1] flex items-center gap-3 border-b border-border/40 bg-white/95 px-4 py-2 backdrop-blur-sm md:px-5">
            <Checkbox
              checked={allLoadedSelected}
              onCheckedChange={onToggleAll}
              aria-label="Select all eligible contacts on this page"
            />
            <span className="min-w-0 flex-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Customer
            </span>
            <span className="hidden w-20 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:block">
              Spend
            </span>
            <span className="hidden w-14 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:block">
              Visits
            </span>
            <span className="hidden w-24 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground lg:block">
              Last purchase
            </span>
          </div>
          <ul>
            {contacts.map((contact) => {
              const name = contactName(contact);
              const isSelected = selected.has(contact.id);
              return (
                <li
                  key={contact.id}
                  className={cn(
                    "flex items-center gap-3 border-b border-border/40 px-4 py-2.5 transition-colors hover:bg-gray-50/60 md:px-5",
                    isSelected && "bg-primary/5 hover:bg-primary/5",
                    contact.opted_out && "opacity-55",
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    disabled={contact.opted_out}
                    onCheckedChange={() => onToggle(contact)}
                    aria-label={`Select ${contact.email}`}
                  />
                  <div
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      avatarPalette(contact.email),
                    )}
                  >
                    {initials(contact)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {name || contact.email}
                      </p>
                      {contact.opted_out ? (
                        <Badge
                          variant="secondary"
                          className="shrink-0 bg-zinc-100 px-1.5 py-0 text-[10px] text-zinc-500"
                        >
                          Opted out
                        </Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {name ? contact.email : contact.phone ?? ""}
                      {name && contact.phone ? ` · ${contact.phone}` : ""}
                    </p>
                    {/* Mobile metrics */}
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80 md:hidden">
                      {[
                        contact.total_spend > 0 ? formatAud(contact.total_spend) : null,
                        contact.sale_count > 0
                          ? `${contact.sale_count} visit${contact.sale_count === 1 ? "" : "s"}`
                          : null,
                        contact.last_purchase_at
                          ? `Last ${formatDateTime(contact.last_purchase_at)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="hidden w-20 text-right text-sm tabular-nums text-foreground md:block">
                    {contact.total_spend > 0 ? formatAud(contact.total_spend) : "—"}
                  </span>
                  <span className="hidden w-14 text-right text-sm tabular-nums text-muted-foreground md:block">
                    {contact.sale_count > 0 ? contact.sale_count : "—"}
                  </span>
                  <span className="hidden w-24 text-right text-xs text-muted-foreground lg:block">
                    {contact.last_purchase_at ? formatDateTime(contact.last_purchase_at) : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
          {contacts.length < filteredCount ? (
            <div className="flex justify-center py-4">
              <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="mr-1.5 size-4" /> : null}
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Campaigns
// ============================================================

function CampaignsView(props: {
  campaigns: CrmCampaign[];
  loading: boolean;
  busyCampaignId: string | null;
  store: StoreBranding;
  onNewCampaign: () => void;
  onDuplicate: (campaign: CrmCampaign) => void;
  onDelete: (campaignId: string) => void;
  onSendDraft: (campaign: CrmCampaign) => void;
}) {
  const { campaigns, loading, busyCampaignId, store, onNewCampaign, onDuplicate, onDelete, onSendDraft } = props;
  const [detailCampaign, setDetailCampaign] = React.useState<CrmCampaign | null>(null);
  const [detailTab, setDetailTab] = React.useState<"email" | "recipients">("email");
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<CrmCampaign | null>(null);

  const openDetail = (campaign: CrmCampaign, tab: "email" | "recipients") => {
    setDetailCampaign(campaign);
    setDetailTab(tab);
    setDetailOpen(true);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    onDelete(id);
  };

  if (loading) {
    return (
      <div className="space-y-0 p-0">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="border-b border-border/40 px-5 py-4">
            <div className="flex items-start gap-6">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-64 rounded-md" />
                <Skeleton className="h-3 w-40 rounded-md" />
              </div>
              <div className="hidden gap-5 sm:flex">
                <Skeleton className="h-10 w-14 rounded-md" />
                <Skeleton className="h-10 w-14 rounded-md" />
                <Skeleton className="h-10 w-14 rounded-md" />
              </div>
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-20 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary">
          <Letter className="size-6 text-primary-foreground" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">No campaigns yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Pick a template, make it yours, and send it to your customers in a couple of minutes.
          </p>
        </div>
        <Button onClick={onNewCampaign}>
          <Send className="mr-1.5 size-4" />
          Create your first campaign
        </Button>
      </div>
    );
  }

  const deleteBusy = pendingDelete ? busyCampaignId === pendingDelete.id : false;
  const deleteIsDraft = pendingDelete?.status === "draft";

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ul>
            {campaigns.map((campaign) => {
              const template = getCrmTemplate(campaign.template_key);
              const busy = busyCampaignId === campaign.id;
              const isDraft = campaign.status === "draft";
              const isSending = campaign.status === "sending";
              const isSentLike =
                campaign.status === "sent" ||
                campaign.status === "failed" ||
                campaign.status === "sending";
              const showMetrics =
                (campaign.status === "sent" || campaign.status === "failed") &&
                campaign.sent_count > 0;
              const templateName = template?.name ?? campaign.template_key;
              const dateLabel = formatDateTime(campaign.sent_at ?? campaign.created_at);
              const volumeLabel =
                campaign.status === "sent" || campaign.status === "failed"
                  ? `${campaign.sent_count.toLocaleString()} sent`
                  : `${campaign.intended_count.toLocaleString()} recipient${
                      campaign.intended_count === 1 ? "" : "s"
                    }`;
              const failedCount =
                campaign.status === "sent" || campaign.status === "failed"
                  ? campaign.failed_count
                  : 0;

              return (
                <li
                  key={campaign.id}
                  className="border-b border-border/40 px-5 py-4 transition-colors hover:bg-gray-50/70"
                >
                  <div className="flex items-center gap-4 lg:gap-8">
                    {/* Identity */}
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openDetail(campaign, "email")}
                          className="min-w-0 truncate text-left text-sm font-semibold tracking-tight text-foreground transition-colors hover:text-foreground/75"
                        >
                          {campaign.subject}
                        </button>
                        <span
                          className={cn(
                            "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium capitalize",
                            CAMPAIGN_STATUS_STYLES[campaign.status] ??
                              CAMPAIGN_STATUS_STYLES.draft,
                          )}
                        >
                          {campaign.status}
                        </span>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="truncate">{templateName}</span>
                        <span className="text-border" aria-hidden>
                          ·
                        </span>
                        <span className="shrink-0 tabular-nums">{dateLabel}</span>
                        <span className="text-border" aria-hidden>
                          ·
                        </span>
                        <span className="shrink-0 tabular-nums">{volumeLabel}</span>
                        {failedCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
                            <AlertTriangle className="size-3" />
                            {failedCount.toLocaleString()} failed
                          </span>
                        ) : null}
                      </div>

                      {showMetrics ? (
                        <div className="mt-3.5 lg:hidden">
                          <CampaignMetrics campaign={campaign} />
                        </div>
                      ) : null}
                    </div>

                    {/* Metrics */}
                    {showMetrics ? (
                      <div className="hidden shrink-0 lg:block">
                        <CampaignMetrics campaign={campaign} />
                      </div>
                    ) : null}

                    {/* Actions */}
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      {isDraft ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => onSendDraft(campaign)}
                            disabled={busy}
                          >
                            {busy ? (
                              <Loader2 className="mr-1.5 size-3.5" />
                            ) : (
                              <Send className="mr-1.5 size-3.5" />
                            )}
                            Send
                          </Button>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="px-2"
                                onClick={() => openDetail(campaign, "email")}
                                aria-label="Preview campaign"
                              >
                                <Eye className="size-3.5 text-muted-foreground" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Preview</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="px-2"
                                onClick={() => setPendingDelete(campaign)}
                                disabled={busy}
                                aria-label="Delete draft"
                              >
                                <Trash2 className="size-3.5 text-muted-foreground" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete draft</TooltipContent>
                          </Tooltip>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openDetail(campaign, "email")}
                          >
                            <Eye className="mr-1.5 size-3.5" />
                            View
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="px-2"
                                aria-label="More campaign actions"
                              >
                                <MoreHorizontal className="size-4 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44 rounded-md">
                              {isSentLike ? (
                                <DropdownMenuItem
                                  onClick={() => openDetail(campaign, "recipients")}
                                >
                                  <Users className="mr-2 size-3.5" />
                                  Recipients
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem onClick={() => onDuplicate(campaign)}>
                                <Copy className="mr-2 size-3.5" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isSending || busy}
                                className="text-red-700 focus:text-red-700"
                                onClick={() => setPendingDelete(campaign)}
                              >
                                <Trash2 className="mr-2 size-3.5" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </TooltipProvider>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setPendingDelete(null);
        }}
      >
        <AlertDialogContent className="rounded-md bg-white animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteIsDraft ? "Delete this draft?" : "Delete this campaign?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteIsDraft ? (
                <>
                  “{pendingDelete?.subject}” will be removed. This can’t be undone.
                </>
              ) : (
                <>
                  “{pendingDelete?.subject}” and its send history will be permanently
                  removed. This can’t be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md" disabled={deleteBusy}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="rounded-md"
              disabled={deleteBusy}
              onClick={(event) => {
                event.preventDefault();
                confirmDelete();
              }}
            >
              {deleteBusy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CampaignDetailDialog
        campaign={detailCampaign}
        store={store}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        initialTab={detailTab}
      />
    </>
  );
}
