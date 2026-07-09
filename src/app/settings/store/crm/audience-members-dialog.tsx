"use client";

import * as React from "react";
import { Loader2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AudienceMemberWithReason, AudienceRule } from "@/lib/crm/agent/types";
import { formatAud } from "@/lib/crm/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

function memberName(member: AudienceMemberWithReason): string {
  return [member.first_name, member.last_name].filter(Boolean).join(" ") || member.email;
}

export function AudienceMembersDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audienceName?: string | null;
  totalCount: number;
  selectedCount: number;
  excludedContactIds: Set<string>;
  onToggleContact: (contactId: string, included: boolean) => void;
  rules: AudienceRule[];
}) {
  const [members, setMembers] = React.useState<AudienceMemberWithReason[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  const loadPage = React.useCallback(
    async (offset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/store/crm/agent/audience-members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rules: props.rules,
            offset,
            limit: PAGE_SIZE,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Failed to load customers");

        setTotal(Number(data.total ?? 0));
        setMembers((current) =>
          append ? [...current, ...(data.members ?? [])] : (data.members ?? []),
        );
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load customers");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [props.rules],
  );

  React.useEffect(() => {
    if (!props.open) {
      setMembers([]);
      setTotal(0);
      setSearch("");
      setError(null);
      return;
    }
    void loadPage(0, false);
  }, [props.open, loadPage]);

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return members;
    return members.filter((member) => {
      const haystack = [
        member.first_name,
        member.last_name,
        member.email,
        member.reason,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [members, search]);

  const hasMore = members.length < total;
  const excludedCount = props.totalCount - props.selectedCount;

  const toggleLoaded = (included: boolean) => {
    for (const member of filtered) {
      props.onToggleContact(member.id, included);
    }
  };

  const allLoadedSelected =
    filtered.length > 0 && filtered.every((member) => !props.excludedContactIds.has(member.id));
  const someLoadedSelected =
    filtered.some((member) => !props.excludedContactIds.has(member.id)) && !allLoadedSelected;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        overlayClassName="animate-in fade-in duration-200 bg-black/40"
        className="!flex h-[min(680px,85vh)] w-[min(720px,calc(100%-2rem))] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out sm:max-w-[720px]"
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4">
          <DialogTitle className="text-base font-semibold">
            {props.audienceName?.trim() || "Audience customers"}
          </DialogTitle>
          <DialogDescription>
            {props.selectedCount.toLocaleString()} of {props.totalCount.toLocaleString()} selected.
            Untick anyone you want to leave out of this send.
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-5 py-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search loaded customers"
            className="h-9 rounded-full"
          />
          {excludedCount > 0 ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {excludedCount.toLocaleString()} excluded
            </span>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-3">
          {loading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading customers…
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-center text-sm text-muted-foreground">
                {search.trim() ? "No loaded customers match your search." : "No customers in this audience."}
              </p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border/60 bg-white">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-gray-50 text-xs text-muted-foreground shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]">
                    <tr>
                      <th className="w-10 px-3 py-2">
                        <Checkbox
                          checked={allLoadedSelected ? true : someLoadedSelected ? "indeterminate" : false}
                          onCheckedChange={(checked) => toggleLoaded(checked === true)}
                          aria-label="Select all loaded customers"
                        />
                      </th>
                      <th className="px-3 py-2 font-medium">Customer</th>
                      <th className="hidden px-3 py-2 font-medium sm:table-cell">Spend</th>
                      <th className="px-3 py-2 font-medium">Why included</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((member) => {
                      const included = !props.excludedContactIds.has(member.id);
                      return (
                        <tr
                          key={member.id}
                          className={cn(
                            "border-t border-border/40 align-top",
                            !included && "bg-gray-50/80 opacity-70",
                          )}
                        >
                          <td className="px-3 py-2.5">
                            <Checkbox
                              checked={included}
                              onCheckedChange={(checked) =>
                                props.onToggleContact(member.id, checked === true)
                              }
                              aria-label={`Include ${memberName(member)}`}
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-foreground">{memberName(member)}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{member.email}</p>
                          </td>
                          <td className="hidden px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">
                            {formatAud(member.total_spend)}
                            <span className="block">
                              {member.sale_count} visit{member.sale_count === 1 ? "" : "s"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-xs leading-relaxed text-foreground">
                            {member.reason}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {props.selectedCount.toLocaleString()} selected · loaded {members.length.toLocaleString()} of{" "}
            {total.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            {hasMore ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingMore}
                onClick={() => void loadPage(members.length, true)}
              >
                {loadingMore ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                Load more
              </Button>
            ) : null}
            <Button type="button" size="sm" onClick={() => props.onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SeeAllCustomersButton(props: {
  count: number;
  excludedCount?: number;
  className?: string;
  onClick: () => void;
}) {
  if (props.count <= 0) return null;

  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        "mt-2 text-xs font-medium text-foreground underline-offset-2 hover:underline",
        props.className,
      )}
    >
      See all {props.count.toLocaleString()} customer{props.count === 1 ? "" : "s"}
      {props.excludedCount ? ` (${props.excludedCount.toLocaleString()} excluded)` : ""}
    </button>
  );
}
