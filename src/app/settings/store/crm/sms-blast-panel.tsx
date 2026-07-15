"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Link2,
  Loader2,
  Phone,
  Search,
  Send,
  Tag,
  Users,
} from "@/components/layout/app-sidebar/dashboard-icons";
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
import { Textarea } from "@/components/ui/textarea";
import { SettingsNavTabs } from "@/components/settings/settings-nav-tabs";
import { cn } from "@/lib/utils";
import { isValidSmsPhone, cleanSmsPhone, appendSmsBroadcastOptOut, messageIncludesSmsOptOut } from "@/lib/sms/smsbroadcast";
import type { CrmContact, CrmContactGroup } from "@/lib/crm/types";
import type { SmsBlastSearchResult } from "@/app/api/store/crm/sms-blast/search/route";
import { crmFilterPillClass, crmFilterPillsClass } from "./crm-page-button-styles";
import { formatShortDate } from "./lifecycle/lifecycle-shared";

type RecipientMode = "all" | "group" | "selected";
type ContactFilter = "all" | "opted_in" | "opted_out";

const CONTACT_FILTERS: { id: ContactFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "opted_in", label: "Sendable" },
  { id: "opted_out", label: "SMS opted out" },
];

type SmsOptOutEntry = {
  phone: string;
  name: string;
  contactId: string | null;
  optedOutAt: string;
  reason: string | null;
  source: string;
};

type SmsPick = {
  key: string;
  contactId: string | null;
  phone: string;
  name: string;
  source: "crm" | "lightspeed";
  optedOut: boolean;
};

type SmsListRow = {
  key: string;
  name: string;
  phone: string | null;
  optedOut: boolean;
  source: "crm" | "lightspeed";
  selectable: boolean;
  pick: SmsPick | null;
  lastSmsSentAt: string | null;
};

function lastSmsSentForPhone(
  phone: string | null | undefined,
  lastSentByPhone: Map<string, string>,
): string | null {
  if (!phone || !isValidSmsPhone(phone)) return null;
  return lastSentByPhone.get(cleanSmsPhone(phone)) ?? null;
}

const RECIPIENT_MODES = [
  { id: "all" as const, label: "All", icon: Users },
  { id: "group" as const, label: "Cohort", icon: Tag },
  { id: "selected" as const, label: "Individuals", icon: Users },
] as const;

const PAGE_SIZE = 50;
const SMS_MAX_LENGTH = 160;

function contactName(contact: CrmContact): string {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ");
}

function pickInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function toSmsPick(result: SmsBlastSearchResult): SmsPick | null {
  if (!isValidSmsPhone(result.phone)) return null;
  return {
    key: result.key,
    contactId: result.contactId,
    phone: result.phone,
    name: result.name,
    source: result.source,
    optedOut: result.optedOut,
  };
}

function toSmsListRowFromSearch(
  result: SmsBlastSearchResult,
  lastSentByPhone: Map<string, string>,
): SmsListRow {
  const hasPhone = isValidSmsPhone(result.phone);
  const pick = hasPhone && !result.optedOut ? toSmsPick(result) : null;
  return {
    key: result.key,
    name: result.name,
    phone: hasPhone ? result.phone : null,
    optedOut: result.optedOut,
    source: result.source,
    selectable: hasPhone && !result.optedOut,
    pick,
    lastSmsSentAt: lastSmsSentForPhone(result.phone, lastSentByPhone),
  };
}

function toSmsListRowFromContact(
  contact: CrmContact,
  smsOptedOutPhones: Set<string>,
  lastSentByPhone: Map<string, string>,
): SmsListRow {
  const hasPhone = isValidSmsPhone(contact.phone);
  const optedOut = hasPhone ? smsOptedOutPhones.has(cleanSmsPhone(contact.phone!)) : false;
  const pick =
    hasPhone && !optedOut
      ? {
          key: `crm:${contact.id}`,
          contactId: contact.id,
          phone: contact.phone!,
          name: contactName(contact) || contact.email,
          source: "crm" as const,
          optedOut: false,
        }
      : null;
  return {
    key: `crm:${contact.id}`,
    name: contactName(contact) || contact.email,
    phone: hasPhone ? contact.phone : null,
    optedOut,
    source: "crm",
    selectable: hasPhone && !optedOut,
    pick,
    lastSmsSentAt: lastSmsSentForPhone(contact.phone, lastSentByPhone),
  };
}

function toSmsListRowFromOptOut(
  entry: SmsOptOutEntry,
  lastSentByPhone: Map<string, string>,
): SmsListRow {
  const hasPhone = isValidSmsPhone(entry.phone);
  return {
    key: entry.contactId ? `crm:${entry.contactId}` : `sms-opt-out:${entry.phone}`,
    name: entry.name,
    phone: hasPhone ? entry.phone : null,
    optedOut: true,
    source: "crm",
    selectable: false,
    pick: null,
    lastSmsSentAt: lastSmsSentForPhone(entry.phone, lastSentByPhone),
  };
}

type PreviewResult = {
  recipientCount: number;
  optedOutCount: number;
  excludedNoPhone: number;
};

export function SmsBlastPanel() {
  const [recipientMode, setRecipientMode] = React.useState<RecipientMode>("all");
  const [message, setMessage] = React.useState("");
  const [groups, setGroups] = React.useState<CrmContactGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = React.useState("");
  const [contacts, setContacts] = React.useState<CrmContact[]>([]);
  const [searchResults, setSearchResults] = React.useState<SmsBlastSearchResult[]>([]);
  const [selected, setSelected] = React.useState<Map<string, SmsPick>>(new Map());
  const [search, setSearch] = React.useState("");
  const [contactFilter, setContactFilter] = React.useState<ContactFilter>("all");
  const [smsOptOutPhones, setSmsOptOutPhones] = React.useState<Set<string>>(new Set());
  const [smsOptOutEntries, setSmsOptOutEntries] = React.useState<SmsOptOutEntry[]>([]);
  const [loadingContacts, setLoadingContacts] = React.useState(false);
  const [loadingSearch, setLoadingSearch] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [lightspeedConnected, setLightspeedConnected] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [filteredCount, setFilteredCount] = React.useState(0);
  const [preview, setPreview] = React.useState<PreviewResult | null>(null);
  const [loadingPreview, setLoadingPreview] = React.useState(false);
  const [smsCredits, setSmsCredits] = React.useState<number | null>(null);
  const [loadingCredits, setLoadingCredits] = React.useState(true);
  const [creditsError, setCreditsError] = React.useState(false);
  const [optOutSnippet, setOptOutSnippet] = React.useState(" Reply STOP to opt-out");
  const [optOutUrl, setOptOutUrl] = React.useState<string | null>(null);
  const [optOutConfigured, setOptOutConfigured] = React.useState(false);
  const [lastSentByPhone, setLastSentByPhone] = React.useState<Map<string, string>>(new Map());
  const [loadingBulkSelect, setLoadingBulkSelect] = React.useState(false);
  const [bulkSelectActive, setBulkSelectActive] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [notice, setNotice] = React.useState<{ kind: "success" | "error"; text: string } | null>(
    null,
  );

  const selectedGroup = groups.find((group) => group.id === selectedGroupId);

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

  const isSearching = search.trim().length >= 2;

  const loadSmsOptOut = React.useCallback(async () => {
    try {
      const res = await fetch("/api/store/crm/sms-broadcast/opt-out", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.snippet === "string") setOptOutSnippet(data.snippet);
      setOptOutUrl(typeof data.url === "string" ? data.url : null);
      setOptOutConfigured(data.configured === true);
    } catch {
      // non-fatal
    }
  }, []);

  const loadSmsCredits = React.useCallback(async () => {
    setLoadingCredits(true);
    setCreditsError(false);
    try {
      const res = await fetch("/api/store/crm/sms-broadcast/balance", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load credits");
      setSmsCredits(typeof data.credits === "number" ? data.credits : null);
    } catch {
      setSmsCredits(null);
      setCreditsError(true);
    } finally {
      setLoadingCredits(false);
    }
  }, []);

  const loadSmsOptOuts = React.useCallback(async () => {
    try {
      const res = await fetch("/api/store/crm/sms-opt-outs", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const entries = (data.entries ?? []) as SmsOptOutEntry[];
      setSmsOptOutEntries(entries);
      setSmsOptOutPhones(new Set((data.phones ?? []).map((phone: string) => cleanSmsPhone(phone))));
    } catch {
      // non-fatal
    }
  }, []);

  const loadLastSent = React.useCallback(async () => {
    try {
      const res = await fetch("/api/store/crm/sms-blast/last-sent", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const byPhone = (data.byPhone ?? {}) as Record<string, string>;
      setLastSentByPhone(
        new Map(
          Object.entries(byPhone).map(([phone, sentAt]) => [cleanSmsPhone(phone), sentAt]),
        ),
      );
    } catch {
      // non-fatal
    }
  }, []);

  const loadContacts = React.useCallback(
    async (opts?: { append?: boolean; offset?: number }) => {
      if (recipientMode !== "selected" || isSearching) return;
      if (contactFilter === "opted_out") {
        setLoadingContacts(true);
        try {
          await loadSmsOptOuts();
        } finally {
          setLoadingContacts(false);
        }
        return;
      }

      const offset = opts?.offset ?? 0;
      if (opts?.append) setLoadingMore(true);
      else setLoadingContacts(true);
      try {
        const params = new URLSearchParams({
          search: "",
          filter: "all",
          sort: "name_asc",
          offset: String(offset),
          limit: String(PAGE_SIZE),
        });
        const res = await fetch(`/api/store/crm/contacts?${params}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load contacts");
        const data = await res.json();
        setContacts((prev) => (opts?.append ? [...prev, ...data.contacts] : data.contacts));
        setFilteredCount(data.filteredCount);
      } catch (error) {
        setNotice({
          kind: "error",
          text: error instanceof Error ? error.message : "Failed to load contacts",
        });
      } finally {
        setLoadingContacts(false);
        setLoadingMore(false);
      }
    },
    [recipientMode, isSearching, contactFilter, loadSmsOptOuts],
  );

  const loadSearch = React.useCallback(async () => {
    if (recipientMode !== "selected") return;
    const q = search.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setLoadingSearch(false);
      return;
    }
    setLoadingSearch(true);
    setSearchError(null);
    try {
      const params = new URLSearchParams({ q });
      const res = await fetch(`/api/store/crm/sms-blast/search?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to search customers");
      setSearchResults(data.results ?? []);
      setLightspeedConnected(data.lightspeedConnected !== false);
      if (data.lightspeedConnected === false) {
        setSearchError("Connect Lightspeed to search all customers.");
      }
    } catch (error) {
      setSearchResults([]);
      setSearchError(error instanceof Error ? error.message : "Failed to search customers");
    } finally {
      setLoadingSearch(false);
    }
  }, [recipientMode, search]);

  const selectedPicks = React.useMemo(() => Array.from(selected.values()), [selected]);
  const selectedContactIds = selectedPicks
    .map((pick) => pick.contactId)
    .filter((id): id is string => Boolean(id));
  const selectedPhones = selectedPicks.filter((pick) => !pick.contactId).map((pick) => pick.phone);

  const loadPreview = React.useCallback(async () => {
    const picks = Array.from(selected.values());
    const contactIds = picks
      .map((pick) => pick.contactId)
      .filter((id): id is string => Boolean(id));
    const phones = picks.filter((pick) => !pick.contactId).map((pick) => pick.phone);

    setLoadingPreview(true);
    try {
      const res = await fetch("/api/store/crm/sms-blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientMode,
          contactIds,
          phones,
          groupId: selectedGroupId,
          dryRun: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreview(null);
        return;
      }
      setPreview({
        recipientCount: data.recipientCount,
        optedOutCount: data.optedOutCount,
        excludedNoPhone: data.excludedNoPhone,
      });
    } catch {
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }, [recipientMode, selected, selectedGroupId]);

  React.useEffect(() => {
    void loadGroups();
    void loadSmsOptOuts();
    void loadSmsCredits();
    void loadSmsOptOut();
    void loadLastSent();
  }, [loadGroups, loadSmsOptOuts, loadSmsCredits, loadSmsOptOut, loadLastSent]);

  const hasOptOutInMessage = messageIncludesSmsOptOut(message, {
    snippet: optOutSnippet,
    url: optOutUrl,
    configured: optOutConfigured,
    usesReplyStop: !optOutUrl,
  });

  const insertOptOutLink = () => {
    setMessage(
      appendSmsBroadcastOptOut(message, {
        snippet: optOutSnippet,
        url: optOutUrl,
        configured: optOutConfigured,
        usesReplyStop: !optOutUrl,
      }),
    );
  };

  React.useEffect(() => {
    if (recipientMode !== "selected") return;
    if (isSearching) {
      const handle = setTimeout(() => void loadSearch(), 250);
      return () => clearTimeout(handle);
    }
    void loadContacts();
  }, [loadContacts, loadSearch, recipientMode, isSearching]);

  React.useEffect(() => {
    if (recipientMode === "group" && !selectedGroupId) {
      setPreview(null);
      return;
    }
    if (recipientMode === "selected" && selected.size === 0) {
      setPreview(null);
      return;
    }
    const handle = setTimeout(() => void loadPreview(), 300);
    return () => clearTimeout(handle);
  }, [loadPreview, recipientMode, selected.size, selectedGroupId]);

  const togglePick = (pick: SmsPick) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(pick.key)) next.delete(pick.key);
      else next.set(pick.key, pick);
      return next;
    });
  };

  React.useEffect(() => {
    setSelected(new Map());
    setBulkSelectActive(false);
  }, [contactFilter, isSearching]);

  const browseRows = React.useMemo(() => {
    if (contactFilter === "opted_out") {
      return smsOptOutEntries.map((entry) => toSmsListRowFromOptOut(entry, lastSentByPhone));
    }
    const rows = contacts.map((contact) =>
      toSmsListRowFromContact(contact, smsOptOutPhones, lastSentByPhone),
    );
    if (contactFilter === "opted_in") {
      return rows.filter((row) => row.selectable);
    }
    return rows;
  }, [contactFilter, contacts, smsOptOutEntries, smsOptOutPhones, lastSentByPhone]);

  const visibleRows = isSearching
    ? searchResults.map((result) => toSmsListRowFromSearch(result, lastSentByPhone))
    : browseRows;

  const selectableRows = visibleRows.filter((row) => row.selectable && row.pick);

  const allPageSelected =
    selectableRows.length > 0 &&
    selectableRows.every((row) => row.pick && selected.has(row.pick.key));
  const allMatchingSelected = bulkSelectActive && selected.size > 0;
  const headerCheckboxChecked = isSearching ? allPageSelected : allPageSelected || allMatchingSelected;
  const headerCheckboxIndeterminate =
    selected.size > 0 && !headerCheckboxChecked && !loadingBulkSelect;

  const selectAllBrowseMatching = React.useCallback(async () => {
    setLoadingBulkSelect(true);
    try {
      const params = new URLSearchParams({
        filter: contactFilter === "opted_in" ? "opted_in" : "all",
      });
      const res = await fetch(`/api/store/crm/sms-blast/bulk-recipients?${params}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to select all recipients");
      const next = new Map<string, SmsPick>();
      for (const recipient of data.recipients ?? []) {
        next.set(recipient.key, {
          key: recipient.key,
          contactId: recipient.contactId,
          phone: recipient.phone,
          name: recipient.name,
          source: "crm",
          optedOut: false,
        });
      }
      setSelected(next);
      setBulkSelectActive(true);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to select all recipients",
      });
    } finally {
      setLoadingBulkSelect(false);
    }
  }, [contactFilter]);

  const toggleAllLoaded = () => {
    if (loadingBulkSelect) return;
    if (headerCheckboxChecked) {
      setSelected(new Map());
      setBulkSelectActive(false);
      return;
    }
    if (!isSearching && contactFilter !== "opted_out") {
      void selectAllBrowseMatching();
      return;
    }
    setSelected((prev) => {
      const next = new Map(prev);
      for (const row of selectableRows) {
        if (row.pick) next.set(row.pick.key, row.pick);
      }
      return next;
    });
  };

  const canSend =
    message.trim().length > 0 &&
    preview &&
    preview.recipientCount > 0 &&
    (recipientMode === "all" ||
      (recipientMode === "group" && selectedGroupId) ||
      (recipientMode === "selected" && selected.size > 0));

  const handleSend = async () => {
    setSending(true);
    setConfirmOpen(false);
    try {
      const res = await fetch("/api/store/crm/sms-blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          recipientMode,
          contactIds: selectedContactIds,
          phones: selectedPhones,
          groupId: selectedGroupId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send SMS");
      setNotice({
        kind: "success",
        text:
          data.failed > 0
            ? `Sent ${data.sent} of ${data.recipientCount} messages. ${data.failed} failed.`
            : `SMS sent to ${data.sent} recipient${data.sent === 1 ? "" : "s"}.`,
      });
      setMessage("");
      setSelected(new Map());
      setBulkSelectActive(false);
      void loadSmsCredits();
      void loadLastSent();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to send SMS",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      {notice ? (
        <div
          className={cn(
            "flex items-center gap-2 border-b px-4 py-2.5 text-sm md:px-5",
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

      <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-b border-border/60 bg-gray-50 px-4 py-3 md:px-5">
        <SettingsNavTabs
          size="sm"
          items={RECIPIENT_MODES}
          value={recipientMode}
          onChange={(mode) => {
            setRecipientMode(mode);
            if (mode !== "selected") setSelected(new Map());
          }}
          layoutId="sms-blast-recipient-tabs"
        />
        {recipientMode === "group" ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-md">
                <Tag className="size-3.5" />
                {selectedGroup?.name ?? "Select cohort"}
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 w-56 overflow-y-auto rounded-md">
              {groups.length === 0 ? (
                <div className="px-2 py-3 text-sm text-muted-foreground">No cohorts yet</div>
              ) : (
                groups.map((group) => (
                  <DropdownMenuItem
                    key={group.id}
                    onClick={() => setSelectedGroupId(group.id)}
                    className={cn(selectedGroupId === group.id && "bg-gray-100")}
                  >
                    <span className="min-w-0 flex-1 truncate">{group.name}</span>
                    {group.member_count != null ? (
                      <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                        {group.member_count}
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs shadow-sm">
            <Phone className="size-3.5 text-muted-foreground" />
            {loadingCredits ? (
              <Loader2 className="size-3 h-3 animate-spin" />
            ) : creditsError ? (
              <span>Credits unavailable</span>
            ) : (
              <span>
                <span className="font-semibold tabular-nums text-foreground">
                  {(smsCredits ?? 0).toLocaleString()}
                </span>{" "}
                SMS credits
              </span>
            )}
          </span>
          {loadingPreview ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : preview ? (
            <span>
              <span className="font-semibold tabular-nums text-foreground">
                {preview.recipientCount}
              </span>{" "}
              with mobile
              {preview.optedOutCount > 0 ? (
                <span className="ml-1">· {preview.optedOutCount} SMS opted out</span>
              ) : null}
              {preview.excludedNoPhone > 0 ? (
                <span className="ml-1">· {preview.excludedNoPhone} without mobile</span>
              ) : null}
            </span>
          ) : recipientMode === "all" ? (
            <span>All contacts with a mobile, excluding SMSbroadcast opt-outs</span>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {recipientMode === "selected" ? (
          <div className="flex min-h-0 w-full min-w-0 flex-col border-r border-border/60 md:w-[340px] md:shrink-0 lg:w-[380px]">
            <div className="shrink-0 border-b border-gray-100 px-3 py-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
                <Input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, email or mobile"
                  className="h-8 rounded-full border-gray-200 bg-white pl-8 text-sm shadow-sm"
                />
              </div>
              {!isSearching ? (
                <div className="mt-2.5 flex items-center gap-2 overflow-x-auto pb-0.5">
                  <div className={crmFilterPillsClass}>
                    {CONTACT_FILTERS.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => setContactFilter(entry.id)}
                        className={crmFilterPillClass(contactFilter === entry.id)}
                      >
                        {entry.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Type 2+ characters to search all Lightspeed customers.
                </p>
              )}
            </div>

            {selected.size > 0 ? (
              <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 text-xs">
                <span>
                  <span className="font-semibold tabular-nums">
                    {selected.size.toLocaleString()}
                  </span>{" "}
                  selected
                  {!isSearching && bulkSelectActive ? (
                    <span className="text-muted-foreground"> (all matching)</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(new Map());
                    setBulkSelectActive(false);
                  }}
                  className="font-medium text-muted-foreground underline-offset-2 hover:underline"
                >
                  Clear
                </button>
              </div>
            ) : null}

            {loadingContacts || loadingSearch ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full rounded-md" />
                ))}
              </div>
            ) : searchError ? (
              <div className="flex flex-1 items-center justify-center px-4 py-12 text-center text-sm text-red-600">
                {searchError}
              </div>
            ) : visibleRows.length === 0 ? (
              <div className="flex flex-1 items-center justify-center px-4 py-12 text-center text-sm text-muted-foreground">
                {isSearching
                  ? lightspeedConnected
                    ? "No customers match your search."
                    : "No imported contacts match your search."
                  : contactFilter === "opted_out"
                    ? "No SMS opt-outs recorded yet. Configure the SMSbroadcast webhook to sync STOP replies."
                    : "No contacts found."}
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="sticky top-0 z-[1] flex items-center gap-2 border-b border-border/40 bg-white/95 px-3 py-2 backdrop-blur-sm">
                  <Checkbox
                    checked={headerCheckboxIndeterminate ? "indeterminate" : headerCheckboxChecked}
                    onCheckedChange={toggleAllLoaded}
                    disabled={
                      loadingBulkSelect ||
                      selectableRows.length === 0 ||
                      contactFilter === "opted_out"
                    }
                    aria-label={
                      isSearching
                        ? "Select all visible customers with mobile"
                        : "Select all customers with mobile"
                    }
                  />
                  <span className="min-w-0 flex-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Customer
                  </span>
                  <span className="w-16 shrink-0 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Last SMS
                  </span>
                </div>
                <ul>
                  {visibleRows.map((row) => {
                    const isSelected = row.pick ? selected.has(row.pick.key) : false;
                    return (
                      <li
                        key={row.key}
                        className={cn(
                          "flex items-center gap-2.5 border-b border-border/40 px-3 py-2.5 transition-colors",
                          row.selectable ? "hover:bg-gray-50/60" : "opacity-55",
                          isSelected && "bg-primary/5",
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={!row.selectable || !row.pick}
                          onCheckedChange={() => row.pick && togglePick(row.pick)}
                          aria-label={`Select ${row.name}`}
                        />
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                          {pickInitials(row.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
                            {row.optedOut ? (
                              <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                SMS opted out
                              </span>
                            ) : null}
                            {row.source === "lightspeed" ? (
                              <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                Lightspeed
                              </span>
                            ) : null}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {row.phone ?? "No mobile"}
                          </p>
                        </div>
                        <span
                          className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground"
                          title={row.lastSmsSentAt ? new Date(row.lastSmsSentAt).toLocaleString("en-AU") : undefined}
                        >
                          {row.lastSmsSentAt ? formatShortDate(row.lastSmsSentAt) : "—"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {!isSearching && contactFilter !== "opted_out" && contacts.length < filteredCount ? (
                  <div className="border-t border-border/40 p-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full rounded-md"
                      disabled={loadingMore}
                      onClick={() => void loadContacts({ append: true, offset: contacts.length })}
                    >
                      {loadingMore ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                      Load more
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : recipientMode === "all" ? (
          <div className="hidden min-h-0 w-[340px] shrink-0 flex-col items-center justify-center border-r border-border/60 bg-gray-50/50 p-6 text-center md:flex lg:w-[380px]">
            <div className="flex size-12 items-center justify-center rounded-md bg-white shadow-sm">
              <Users className="size-5 text-gray-500" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">All contacts with mobile</p>
            <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">
              Sends to imported contacts with a valid mobile. SMSbroadcast opt-outs are excluded automatically.
            </p>
          </div>
        ) : (
          <div className="hidden min-h-0 w-[340px] shrink-0 flex-col items-center justify-center border-r border-border/60 bg-gray-50/50 p-6 text-center md:flex lg:w-[380px]">
            <div className="flex size-12 items-center justify-center rounded-md bg-white shadow-sm">
              <Tag className="size-5 text-gray-500" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">
              {selectedGroup?.name ?? "Select a cohort"}
            </p>
            <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">
              {selectedGroup
                ? `${selectedGroup.member_count ?? 0} members in this cohort`
                : "Choose a cohort from the filter bar above."}
            </p>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col p-4 md:p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Phone className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Compose SMS</h3>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-md"
                disabled={hasOptOutInMessage}
                onClick={insertOptOutLink}
              >
                <Link2 className="mr-1.5 size-3.5" />
                {hasOptOutInMessage ? "Opt-out added" : "Add opt-out link"}
              </Button>
            </div>
            {!optOutConfigured ? (
              <p className="mb-2 text-xs text-muted-foreground">
                Set <code className="text-[11px]">SMS_BROADCAST_OPT_OUT_URL</code> to your SMSbroadcast
                account opt-out link. Until then, the button adds &quot;Reply STOP to opt-out&quot;.
              </p>
            ) : null}
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value.slice(0, SMS_MAX_LENGTH))}
              placeholder="Write your message…"
              className="min-h-[140px] flex-1 resize-none rounded-xl text-sm"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Sent via SMSbroadcast</span>
              <span
                className={cn(
                  "tabular-nums",
                  message.length >= SMS_MAX_LENGTH && "font-medium text-amber-700",
                )}
              >
                {message.length}/{SMS_MAX_LENGTH}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between border-t border-border/60 bg-gray-50 px-4 py-3 md:px-6">
            <p className="text-xs text-muted-foreground">
              {preview
                ? `Ready to send to ${preview.recipientCount} recipient${preview.recipientCount === 1 ? "" : "s"}`
                : "Select recipients to preview"}
            </p>
            <Button
              size="sm"
              className="rounded-full"
              disabled={!canSend || sending}
              onClick={() => setConfirmOpen(true)}
            >
              {sending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 size-4" />
              )}
              {sending ? "Sending…" : "Send SMS"}
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-md border border-gray-200 bg-white animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out">
          <AlertDialogHeader>
            <AlertDialogTitle>Send SMS blast?</AlertDialogTitle>
            <AlertDialogDescription>
              This will send your message to{" "}
              <span className="font-medium text-foreground">
                {preview?.recipientCount ?? 0} recipient
                {(preview?.recipientCount ?? 0) === 1 ? "" : "s"}
              </span>{" "}
              via SMSbroadcast. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-md" onClick={() => void handleSend()}>
              Send now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
