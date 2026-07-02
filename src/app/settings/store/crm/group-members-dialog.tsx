"use client";

import * as React from "react";
import { Eye, Loader2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CrmContactGroup } from "@/lib/crm/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

type GroupMember = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  opted_out: boolean;
};

function memberName(member: GroupMember): string {
  return [member.first_name, member.last_name].filter(Boolean).join(" ") || member.email;
}

export function GroupMembersDialog(props: {
  group: CrmContactGroup | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [members, setMembers] = React.useState<GroupMember[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadPage = React.useCallback(
    async (offset: number, append: boolean, groupId: string, query: string) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          offset: String(offset),
          limit: String(PAGE_SIZE),
        });
        if (query) params.set("search", query);

        const res = await fetch(`/api/store/crm/groups/${groupId}?${params}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Failed to load customers");

        setTotal(Number(data.total ?? 0));
        setMembers((current) =>
          append ? [...current, ...((data.members ?? []) as GroupMember[])] : ((data.members ?? []) as GroupMember[]),
        );
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load customers");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    if (!props.open || !props.group) {
      setMembers([]);
      setTotal(0);
      setSearch("");
      setDebouncedSearch("");
      setError(null);
      return;
    }
    void loadPage(0, false, props.group.id, debouncedSearch);
  }, [props.open, props.group, debouncedSearch, loadPage]);

  const hasMore = members.length < total;
  const subscribedCount = members.filter((member) => !member.opted_out).length;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        overlayClassName="animate-in fade-in duration-200 bg-black/40"
        className="!flex h-[min(680px,85vh)] w-[min(720px,calc(100%-2rem))] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-md p-0 animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out sm:max-w-[720px]"
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4">
          <DialogTitle className="text-base font-semibold">
            {props.group?.name ?? "Group members"}
          </DialogTitle>
          <DialogDescription>
            {total.toLocaleString()} customer{total === 1 ? "" : "s"} in this group.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b border-border/60 px-5 py-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or email"
            className="h-9 rounded-md"
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-3">
          {loading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading customers…
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-center text-sm text-muted-foreground">
                {debouncedSearch ? "No customers match your search." : "No customers in this group."}
              </p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border/60 bg-white">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-gray-50 text-xs text-muted-foreground shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Customer</th>
                      <th className="px-3 py-2 font-medium">Email</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member.id} className="border-t border-border/40 align-top">
                        <td className="px-3 py-2.5 font-medium text-foreground">{memberName(member)}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{member.email}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                              member.opted_out
                                ? "border-gray-200 bg-white text-muted-foreground"
                                : "border-gray-200 bg-white text-foreground",
                            )}
                          >
                            {member.opted_out ? "Opted out" : "Subscribed"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 px-5 py-3">
          <p className="text-xs text-muted-foreground">
            Showing {members.length.toLocaleString()} of {total.toLocaleString()}
            {subscribedCount !== members.length
              ? ` · ${subscribedCount.toLocaleString()} subscribed in view`
              : ""}
          </p>
          <div className="flex items-center gap-2">
            {hasMore ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-md"
                disabled={loadingMore || !props.group}
                onClick={() => props.group && void loadPage(members.length, true, props.group.id, debouncedSearch)}
              >
                {loadingMore ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                Load more
              </Button>
            ) : null}
            <Button type="button" size="sm" className="rounded-md" onClick={() => props.onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ViewGroupMembersButton(props: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label="View group members"
      title="View members"
      className="rounded-md p-1.5 text-muted-foreground hover:bg-gray-100 hover:text-foreground disabled:opacity-40"
    >
      <Eye className="size-3.5" />
    </button>
  );
}
