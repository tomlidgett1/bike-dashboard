"use client";

// Customer groups — smart (AI-recommended, rule-backed, refreshable) and manual.
//
// "Recommend groups" scans real Lightspeed sales/inventory data, verifies
// exact member counts with the same audience engine campaigns use, and returns
// curated proposals the owner can add in one click. Smart groups store their
// rules so membership can be refreshed against live data at any time.

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  genieProgressShimmerClassName,
  genieProgressShimmerStyle,
} from "@/lib/genie/shimmer";
import type { CrmContactGroup } from "@/lib/crm/types";
import type { AudiencePreviewContact, AudienceRule } from "@/lib/crm/agent/types";
import { GroupMembersDialog, ViewGroupMembersButton } from "./group-members-dialog";

type SmartGroupProposal = {
  key: string;
  name: string;
  description: string;
  reason: string;
  rules: AudienceRule[];
  count: number;
  sample: AudiencePreviewContact[];
};

const RECOMMEND_STAGES = [
  "Scanning your Lightspeed sales history…",
  "Counting brand and category buyers…",
  "Cutting spend, recency, and loyalty segments…",
  "Verifying exact group sizes against your contacts…",
  "Curating and naming the best groups…",
];

function relativeTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function ContactGroupsPanel(props: {
  selectedContactIds: string[];
  onGroupsChange?: () => void;
  onEmailGroup?: (contactIds: string[], groupName: string) => void;
}) {
  const { selectedContactIds, onGroupsChange, onEmailGroup } = props;

  const [groups, setGroups] = React.useState<CrmContactGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Manual create
  const [showCreate, setShowCreate] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  // Recommendations
  const [recommending, setRecommending] = React.useState(false);
  const [recommendStage, setRecommendStage] = React.useState(0);
  const [proposals, setProposals] = React.useState<SmartGroupProposal[] | null>(null);
  const [selectedProposals, setSelectedProposals] = React.useState<Set<string>>(new Set());
  const [accepting, setAccepting] = React.useState(false);

  // Refresh
  const [refreshingAll, setRefreshingAll] = React.useState(false);
  const [viewingGroup, setViewingGroup] = React.useState<CrmContactGroup | null>(null);

  const smartGroupCount = groups.filter((group) => group.is_smart).length;

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/store/crm/groups", { cache: "no-store" });
      const data = await res.json();
      setGroups(data.groups ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!recommending) return;
    setRecommendStage(0);
    const handle = setInterval(() => {
      setRecommendStage((stage) => Math.min(stage + 1, RECOMMEND_STAGES.length - 1));
    }, 3500);
    return () => clearInterval(handle);
  }, [recommending]);

  const runRecommend = async () => {
    if (recommending) return;
    setRecommending(true);
    setNotice(null);
    setProposals(null);
    try {
      const res = await fetch("/api/store/crm/groups/recommend", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to build recommendations");
      const found = (data.proposals ?? []) as SmartGroupProposal[];
      if (found.length === 0) {
        setNotice({
          kind: "error",
          text: "No new groups to recommend right now — every strong segment already exists or is too small.",
        });
      } else {
        setProposals(found);
        setSelectedProposals(new Set(found.map((proposal) => proposal.key)));
      }
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to build recommendations",
      });
    } finally {
      setRecommending(false);
    }
  };

  const acceptProposals = async () => {
    if (!proposals || accepting) return;
    const chosen = proposals.filter((proposal) => selectedProposals.has(proposal.key));
    if (chosen.length === 0) return;
    setAccepting(true);
    setNotice(null);
    try {
      const res = await fetch("/api/store/crm/groups/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposals: chosen }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to create groups");
      const created = (data.created ?? []) as Array<{ name: string; count: number }>;
      setProposals(null);
      setNotice({
        kind: "success",
        text: `Added ${created.length} smart group${created.length === 1 ? "" : "s"} — they'll stay fresh with one tap of Refresh.`,
      });
      await load();
      onGroupsChange?.();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to create groups",
      });
    } finally {
      setAccepting(false);
    }
  };

  const refreshGroups = async (groupId?: string) => {
    if (groupId) setBusyId(groupId);
    else setRefreshingAll(true);
    setNotice(null);
    try {
      const res = await fetch("/api/store/crm/groups/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(groupId ? { groupId } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Refresh failed");
      const results = (data.results ?? []) as Array<{ name: string; count: number; added: number; removed: number }>;
      const changed = results.reduce((sum, result) => sum + result.added + result.removed, 0);
      setNotice({
        kind: "success",
        text:
          results.length === 1
            ? `“${results[0].name}” refreshed — ${results[0].count.toLocaleString()} members (${results[0].added} in, ${results[0].removed} out).`
            : `${results.length} smart groups refreshed — ${changed} membership change${changed === 1 ? "" : "s"}.`,
      });
      await load();
      onGroupsChange?.();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Refresh failed" });
    } finally {
      setBusyId(null);
      setRefreshingAll(false);
    }
  };

  const createGroup = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/store/crm/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, contactIds: selectedContactIds }),
      });
      if (!res.ok) throw new Error("Failed to create group");
      setNewName("");
      setShowCreate(false);
      await load();
      onGroupsChange?.();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Failed to create group" });
    } finally {
      setCreating(false);
    }
  };

  const deleteGroup = async (group: CrmContactGroup) => {
    if (!window.confirm(`Delete “${group.name}”? Contacts themselves are not deleted.`)) return;
    setBusyId(group.id);
    try {
      await fetch(`/api/store/crm/groups/${group.id}`, { method: "DELETE" });
      await load();
      onGroupsChange?.();
    } finally {
      setBusyId(null);
    }
  };

  const addSelectedToGroup = async (group: CrmContactGroup) => {
    if (selectedContactIds.length === 0) return;
    setBusyId(group.id);
    try {
      await fetch(`/api/store/crm/groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addContactIds: selectedContactIds }),
      });
      setNotice({
        kind: "success",
        text: `Added ${selectedContactIds.length} contact${selectedContactIds.length === 1 ? "" : "s"} to “${group.name}”.`,
      });
      await load();
      onGroupsChange?.();
    } finally {
      setBusyId(null);
    }
  };

  const emailGroup = async (group: CrmContactGroup) => {
    if (!onEmailGroup) return;
    setBusyId(group.id);
    try {
      const res = await fetch(`/api/store/crm/groups/${group.id}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const members = (data.members ?? []) as Array<{ id: string; opted_out: boolean }>;
      const ids = members.filter((member) => !member.opted_out).map((member) => member.id);
      if (ids.length === 0) {
        setNotice({ kind: "error", text: `“${group.name}” has no subscribed members to email.` });
        return;
      }
      onEmailGroup(ids, group.name);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="border-b border-border/60 px-4 py-3.5 md:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Customer groups</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Living segments built from your real sales data — email any group in two clicks.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {smartGroupCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void refreshGroups()}
                disabled={refreshingAll || recommending}
              >
                {refreshingAll ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 size-4" />
                )}
                Refresh all
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => setShowCreate((prev) => !prev)}>
              <Plus className="mr-1.5 size-4" />
              New group
            </Button>
            <Button size="sm" onClick={() => void runRecommend()} disabled={recommending || accepting}>
              {recommending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 size-4" />
              )}
              Recommend groups
            </Button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {showCreate ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-3 flex items-center gap-2">
                <Input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void createGroup();
                    if (e.key === "Escape") setShowCreate(false);
                  }}
                  placeholder="Group name, e.g. Race day crew"
                  className="h-9 max-w-xs"
                />
                <Button size="sm" onClick={() => void createGroup()} disabled={creating || !newName.trim()}>
                  {creating ? <Loader2 className="size-4 animate-spin" /> : "Create"}
                </Button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Cancel"
                >
                  <X className="size-4" />
                </button>
                {selectedContactIds.length > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    Includes the {selectedContactIds.length.toLocaleString()} selected contact
                    {selectedContactIds.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {notice ? (
        <div
          className={cn(
            "flex items-center gap-2 border-b px-4 py-2.5 text-sm md:px-5",
            notice.kind === "success"
              ? "border-emerald-100 bg-emerald-50 text-emerald-800"
              : "border-amber-100 bg-amber-50 text-amber-800",
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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
        {/* Recommending progress */}
        {recommending ? (
          <div className="mb-5 rounded-xl border border-border/50 bg-gray-50/60 px-4 py-4">
            <div className="flex items-center gap-2.5">
              <Sparkles className="size-4 shrink-0 text-gray-400" />
              <span
                className={cn("text-sm font-medium", genieProgressShimmerClassName)}
                style={genieProgressShimmerStyle}
              >
                {RECOMMEND_STAGES[recommendStage]}
              </span>
            </div>
            <div className="mt-2.5 space-y-1">
              {RECOMMEND_STAGES.slice(0, recommendStage).map((stage) => (
                <p key={stage} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Check className="size-3 text-emerald-500" />
                  {stage.replace(/…$/, "")}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        {/* Proposals */}
        {proposals && proposals.length > 0 ? (
          <div className="mb-6 rounded-2xl border border-border/60 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Sparkles className="size-4 text-amber-500" />
                  Recommended for you
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Built from your Lightspeed data — every count is the exact number of subscribed
                  members today.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProposals(null)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Dismiss recommendations"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {proposals.map((proposal) => {
                const checked = selectedProposals.has(proposal.key);
                return (
                  <button
                    key={proposal.key}
                    type="button"
                    onClick={() =>
                      setSelectedProposals((prev) => {
                        const next = new Set(prev);
                        if (next.has(proposal.key)) next.delete(proposal.key);
                        else next.add(proposal.key);
                        return next;
                      })
                    }
                    className={cn(
                      "rounded-xl border p-3 text-left transition-colors",
                      checked
                        ? "border-zinc-900 bg-zinc-50/60"
                        : "border-border/50 opacity-70 hover:opacity-100",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{proposal.name}</p>
                      <span
                        className={cn(
                          "flex size-4.5 shrink-0 items-center justify-center rounded-full border",
                          checked
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-border bg-white",
                        )}
                      >
                        {checked ? <Check className="size-3" /> : null}
                      </span>
                    </div>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
                      {proposal.count.toLocaleString()}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">members</span>
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {proposal.description}
                    </p>
                    {proposal.reason ? (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/80">
                        {proposal.reason}
                      </p>
                    ) : null}
                    {proposal.sample.length > 0 ? (
                      <p className="mt-1.5 truncate text-[11px] text-muted-foreground/70">
                        e.g.{" "}
                        {proposal.sample
                          .slice(0, 3)
                          .map((contact) =>
                            [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email,
                          )
                          .join(", ")}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="mt-3.5 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {selectedProposals.size} of {proposals.length} selected
              </p>
              <Button
                size="sm"
                onClick={() => void acceptProposals()}
                disabled={accepting || selectedProposals.size === 0}
              >
                {accepting ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <Plus className="mr-1.5 size-4" />
                )}
                Add {selectedProposals.size} group{selectedProposals.size === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        ) : null}

        {/* Groups grid */}
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-36 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : groups.length === 0 && !recommending && !proposals ? (
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-gray-100">
              <Users className="size-6 text-gray-400" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">No groups yet</h4>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Let the AI scan your sales data and suggest ready-made segments — VIPs, lapsed
                customers, brand fans and more — with exact member counts.
              </p>
            </div>
            <Button onClick={() => void runRecommend()} disabled={recommending}>
              <Sparkles className="mr-1.5 size-4" />
              Recommend groups
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {groups.map((group) => {
              const busy = busyId === group.id;
              const refreshed = relativeTime(group.last_refreshed_at);
              return (
                <div
                  key={group.id}
                  className="group/card flex flex-col rounded-2xl border border-border/50 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold text-foreground">{group.name}</p>
                  </div>

                  <p className="mt-1.5 text-2xl font-semibold tabular-nums leading-none text-foreground">
                    {(group.member_count ?? 0) === 0 ? (
                      <>
                        0
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">members</span>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setViewingGroup(group)}
                        className="group/members inline-flex items-baseline rounded-md text-left transition-colors hover:text-foreground/80"
                      >
                        {(group.member_count ?? 0).toLocaleString()}
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground group-hover/members:underline">
                          member{(group.member_count ?? 0) === 1 ? "" : "s"}
                        </span>
                      </button>
                    )}
                  </p>

                  {group.description ? (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {group.description}
                    </p>
                  ) : null}

                  <div className="mt-auto pt-3">
                    <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2.5">
                      <span className="text-[11px] text-muted-foreground/80">
                        {group.is_smart
                          ? refreshed
                            ? `Refreshed ${refreshed}`
                            : "Live rules"
                          : "Manual group"}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <ViewGroupMembersButton
                          disabled={busy || (group.member_count ?? 0) === 0}
                          onClick={() => setViewingGroup(group)}
                        />
                        {selectedContactIds.length > 0 && !group.is_smart ? (
                          <button
                            type="button"
                            onClick={() => void addSelectedToGroup(group)}
                            disabled={busy}
                            title={`Add ${selectedContactIds.length} selected`}
                            className="rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-gray-100 hover:text-foreground"
                          >
                            +{selectedContactIds.length}
                          </button>
                        ) : null}
                        {group.is_smart ? (
                          <button
                            type="button"
                            onClick={() => void refreshGroups(group.id)}
                            disabled={busy || refreshingAll}
                            aria-label={`Refresh ${group.name}`}
                            title="Refresh members from live data"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-gray-100 hover:text-foreground"
                          >
                            {busy ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="size-3.5" />
                            )}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void emailGroup(group)}
                          disabled={busy || (group.member_count ?? 0) === 0}
                          aria-label={`Email ${group.name}`}
                          title="Email this group"
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-gray-100 hover:text-foreground disabled:opacity-40"
                        >
                          <Send className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteGroup(group)}
                          disabled={busy}
                          aria-label={`Delete ${group.name}`}
                          title="Delete group"
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <GroupMembersDialog
        group={viewingGroup}
        open={viewingGroup != null}
        onOpenChange={(open) => {
          if (!open) setViewingGroup(null);
        }}
      />
    </div>
  );
}
