"use client";

// Email CRM — contacts imported from Lightspeed + template-based campaigns.
// Flow: Contacts → New campaign → Template → Customize → Preview → Recipients
// → Review → Send. The composer lives in campaign-composer.tsx.

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Letter,
  Loader2,
  Mailbox,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  Users,
  Calendar,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getCrmTemplate, type StoreBranding } from "@/lib/crm/templates";
import type { CrmCampaign, CrmContact, CrmContactGroup, CrmContactSort } from "@/lib/crm/types";
import { formatAud } from "@/lib/crm/types";
import { CampaignComposer, type ComposerSeed } from "./campaign-composer";
import { ContactGroupFilterDropdown, ContactSortDropdown } from "./contact-sort-dropdown";
import { ContactGroupsPanel } from "./contact-groups-panel";
import { CrmAgentPanel } from "./crm-agent-panel";
import { CrmAutomationPanel } from "./crm-automation-panel";

type ContactStats = { total: number; optedOut: number; eligible: number };
type ContactFilter = "all" | "opted_in" | "opted_out";
type CrmTab = "contacts" | "groups" | "campaigns" | "ai" | "automation";

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

function CampaignMetrics({ campaign }: { campaign: CrmCampaign }) {
  const sent = campaign.sent_count;
  const opened = campaign.opened_count ?? 0;
  const clicked = campaign.clicked_count ?? 0;
  const delivered = campaign.delivered_count ?? 0;
  const bounced = campaign.bounced_count ?? 0;

  const metrics = [
    { label: "Opened", count: opened },
    { label: "Clicked", count: clicked },
    { label: "Delivered", count: delivered },
    ...(bounced > 0 ? [{ label: "Bounced", count: bounced }] : []),
  ];

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {metrics.map((metric) => (
        <span
          key={metric.label}
          className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-white px-2 py-0.5 text-[11px] leading-tight"
        >
          <span className="text-muted-foreground">{metric.label}</span>
          <span className="font-semibold tabular-nums text-foreground">
            {formatRate(metric.count, sent)}
          </span>
          {sent > 1 ? (
            <span className="text-muted-foreground/60">
              ({metric.count}/{sent})
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

const CAMPAIGN_STATUS_STYLES: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600",
  sending: "bg-blue-50 text-blue-700",
  sent: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

export function CrmPageContent() {
  const [tab, setTab] = React.useState<CrmTab>("contacts");

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

  const deleteDraft = async (campaignId: string) => {
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
        title="Email CRM"
        icon={Mailbox}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void runEnrich()} disabled={enriching}>
              {enriching ? <Loader2 className="mr-1.5 size-4" /> : <RefreshCw className="mr-1.5 size-4" />}
              {enriching ? "Syncing…" : "Sync Lightspeed stats"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void runImport()} disabled={importing}>
              {importing ? <Loader2 className="mr-1.5 size-4" /> : <RefreshCw className="mr-1.5 size-4" />}
              {importing ? "Importing…" : "Import from Lightspeed"}
            </Button>
            <Button size="sm" onClick={() => openComposer()} disabled={(stats?.eligible ?? 0) === 0 && selected.size === 0}>
              <Send className="mr-1.5 size-4" />
              New campaign
            </Button>
          </div>
        }
        toolbar={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-border/60">
              {(
                [
                  { id: "contacts", label: "Contacts", icon: Users },
                  { id: "groups", label: "Groups", icon: Users },
                  { id: "ai", label: "AI Campaign", icon: Sparkles },
                  { id: "automation", label: "Automation", icon: Calendar },
                  { id: "campaigns", label: "Campaigns", icon: Letter },
                ] as const
              ).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                    tab === entry.id
                      ? "bg-zinc-900 text-white"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <entry.icon className="size-3.5" />
                  {entry.label}
                </button>
              ))}
            </div>
            {stats ? (
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>
                  <span className="font-semibold text-foreground">{stats.total.toLocaleString()}</span> contacts
                </span>
                <span>
                  <span className="font-semibold text-foreground">{stats.eligible.toLocaleString()}</span> subscribed
                </span>
                <span>
                  <span className="font-semibold text-foreground">{stats.optedOut.toLocaleString()}</span> opted out
                </span>
              </div>
            ) : null}
          </div>
        }
        flush
        scrollClassName={tab === "ai" ? "flex min-h-0 flex-1 flex-col overflow-hidden" : undefined}
      >
        <div className={cn("flex min-h-0 flex-1 flex-col", tab === "ai" && "h-full")}>
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

          {tab === "contacts" ? (
            <ContactsView
              contacts={contacts}
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
          ) : tab === "groups" ? (
            <ContactGroupsPanel
              selectedContactIds={Array.from(selected.keys())}
              onGroupsChange={() => {
                void loadGroups();
                void loadContacts();
              }}
            />
          ) : tab === "ai" ? (
            <CrmAgentPanel
              store={storeBranding}
              onOpenComposer={(seed, contactIds) => openComposer(seed, contactIds)}
              onCampaignCreated={() => {
                setTab("campaigns");
                void loadCampaigns();
              }}
            />
          ) : tab === "automation" ? (
            <CrmAutomationPanel />
          ) : (
            <CampaignsView
              campaigns={campaigns}
              loading={loadingCampaigns}
              busyCampaignId={busyCampaignId}
              onNewCampaign={() => openComposer()}
              onDuplicate={(campaign) =>
                openComposer({
                  templateKey: campaign.template_key,
                  subject: campaign.subject,
                  content: campaign.content,
                })
              }
              onDeleteDraft={(campaignId) => void deleteDraft(campaignId)}
              onSendDraft={(campaign) => void sendDraft(campaign)}
            />
          )}
        </div>
      </DashboardFloatingPage>

      {composerSeed ? (
        <CampaignComposer
          seed={composerSeed}
          senderEmail={senderEmail}
          store={storeBranding}
          eligibleCount={stats?.eligible ?? 0}
          selectedContacts={Array.from(selected.values())}
          onClose={() => setComposerSeed(null)}
          onSent={() => {
            setComposerSeed(null);
            setSelected(new Map());
            setTab("campaigns");
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

function ContactsView(props: {
  contacts: CrmContact[];
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
        <div className="flex size-14 items-center justify-center rounded-full bg-primary">
          <Users className="size-6 text-primary-foreground" />
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
      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-5 py-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search by name or email"
            className="h-9 rounded-full pl-9"
          />
        </div>
        <div className="flex items-center gap-1">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onFilter(entry.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === entry.id
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-muted-foreground hover:text-foreground",
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
        <div className="ml-auto flex items-center gap-3">
          {selected.size > 0 ? (
            <>
              <span className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{selected.size}</span> selected
              </span>
              <button
                type="button"
                onClick={onClearSelection}
                className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
              >
                Clear
              </button>
              <Button size="sm" onClick={onCreateCampaign}>
                <Send className="mr-1.5 size-3.5" />
                Email selected
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              {filteredCount.toLocaleString()} contact{filteredCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
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
          <div className="flex items-center gap-3 border-b border-border/40 px-5 py-2">
            <Checkbox
              checked={allLoadedSelected}
              onCheckedChange={onToggleAll}
              aria-label="Select all eligible contacts on this page"
            />
            <span className="text-xs text-muted-foreground">
              Select all eligible on this page
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
                    "flex items-center gap-3 border-b border-border/40 px-5 py-3 transition-colors",
                    isSelected && "bg-primary/5",
                    contact.opted_out && "opacity-60",
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    disabled={contact.opted_out}
                    onCheckedChange={() => onToggle(contact)}
                    aria-label={`Select ${contact.email}`}
                  />
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
                    {initials(contact)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {name || contact.email}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {name ? contact.email : contact.phone ?? ""}
                      {name && contact.phone ? ` · ${contact.phone}` : ""}
                    </p>
                    {(contact.sale_count > 0 ||
                      contact.total_spend > 0 ||
                      contact.lightspeed_joined_at) && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
                        {[
                          contact.sale_count > 0
                            ? `${contact.sale_count} visit${contact.sale_count === 1 ? "" : "s"}`
                            : null,
                          contact.total_spend > 0 ? formatAud(contact.total_spend) : null,
                          contact.lightspeed_joined_at
                            ? `Joined ${formatDateTime(contact.lightspeed_joined_at)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                  {contact.opted_out ? (
                    <Badge variant="secondary" className="shrink-0 bg-zinc-100 text-zinc-500">
                      Opted out
                      {contact.opted_out_at ? ` · ${formatDateTime(contact.opted_out_at)}` : ""}
                    </Badge>
                  ) : null}
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
  onNewCampaign: () => void;
  onDuplicate: (campaign: CrmCampaign) => void;
  onDeleteDraft: (campaignId: string) => void;
  onSendDraft: (campaign: CrmCampaign) => void;
}) {
  const { campaigns, loading, busyCampaignId, onNewCampaign, onDuplicate, onDeleteDraft, onSendDraft } = props;

  if (loading) {
    return (
      <div className="space-y-2 p-5">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-xl" />
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

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ul>
        {campaigns.map((campaign) => {
          const template = getCrmTemplate(campaign.template_key);
          const busy = busyCampaignId === campaign.id;
          return (
            <li
              key={campaign.id}
              className="border-b border-border/40 px-5 py-4"
            >
              <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">{campaign.subject}</p>
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium capitalize",
                      CAMPAIGN_STATUS_STYLES[campaign.status] ?? CAMPAIGN_STATUS_STYLES.draft,
                    )}
                  >
                    {campaign.status}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {template?.name ?? campaign.template_key} · {formatDateTime(campaign.sent_at ?? campaign.created_at)}
                  {campaign.status === "sent" || campaign.status === "failed"
                    ? ` · ${campaign.sent_count.toLocaleString()} sent${campaign.failed_count > 0 ? `, ${campaign.failed_count} failed` : ""}`
                    : ` · ${campaign.intended_count.toLocaleString()} recipient${campaign.intended_count === 1 ? "" : "s"}`}
                </p>
                {(campaign.status === "sent" || campaign.status === "failed") && campaign.sent_count > 0 ? (
                  <CampaignMetrics campaign={campaign} />
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                {campaign.status === "draft" ? (
                  <>
                    <Button size="sm" onClick={() => onSendDraft(campaign)} disabled={busy}>
                      {busy ? <Loader2 className="mr-1.5 size-3.5" /> : <Send className="mr-1.5 size-3.5" />}
                      Send
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteDraft(campaign.id)}
                      disabled={busy}
                      aria-label="Delete draft"
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => onDuplicate(campaign)}>
                    <Copy className="mr-1.5 size-3.5" />
                    Duplicate
                  </Button>
                )}
              </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
