"use client";

import * as React from "react";
import { Loader2, Plus, Trash2, Users } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CrmContact, CrmContactGroup } from "@/lib/crm/types";

export function ContactGroupsPanel(props: {
  selectedContactIds: string[];
  onGroupsChange?: () => void;
}) {
  const [groups, setGroups] = React.useState<CrmContactGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
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

  const createGroup = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/store/crm/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          contactIds: props.selectedContactIds,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setNewName("");
      await load();
      props.onGroupsChange?.();
    } finally {
      setCreating(false);
    }
  };

  const deleteGroup = async (groupId: string) => {
    if (!window.confirm("Delete this group? Members are not deleted.")) return;
    setBusyId(groupId);
    try {
      await fetch(`/api/store/crm/groups/${groupId}`, { method: "DELETE" });
      await load();
      props.onGroupsChange?.();
    } finally {
      setBusyId(null);
    }
  };

  const addSelectedToGroup = async (groupId: string) => {
    if (props.selectedContactIds.length === 0) return;
    setBusyId(groupId);
    try {
      await fetch(`/api/store/crm/groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addContactIds: props.selectedContactIds }),
      });
      await load();
      props.onGroupsChange?.();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border/60 px-5 py-4">
        <h3 className="text-sm font-semibold text-foreground">Customer groups</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Save segments for targeted campaigns — VIPs, service due, lapsed customers, and more.
        </p>
        <div className="mt-3 flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New group name"
            className="h-9 max-w-xs rounded-md"
          />
          <Button size="sm" onClick={() => void createGroup()} disabled={creating || !newName.trim()}>
            {creating ? <Loader2 className="mr-1 size-4" /> : <Plus className="mr-1 size-4" />}
            Create
          </Button>
        </div>
        {props.selectedContactIds.length > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {props.selectedContactIds.length} contact
            {props.selectedContactIds.length === 1 ? "" : "s"} selected — new groups include them
            automatically, or add to an existing group below.
          </p>
        ) : null}
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-md bg-zinc-100">
            <Users className="size-5 text-zinc-500" />
          </div>
          <p className="text-sm text-muted-foreground">No groups yet. Create one to get started.</p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {groups.map((group) => (
            <li
              key={group.id}
              className="flex items-center gap-3 border-b border-border/40 px-5 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{group.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(group.member_count ?? 0).toLocaleString()} member
                  {(group.member_count ?? 0) === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {props.selectedContactIds.length > 0 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === group.id}
                    onClick={() => void addSelectedToGroup(group.id)}
                  >
                    Add selected
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId === group.id}
                  onClick={() => void deleteGroup(group.id)}
                  aria-label="Delete group"
                >
                  <Trash2 className="size-4 text-muted-foreground" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
