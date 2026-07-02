"use client";

// CRM 2.0 — scheduled campaign automation.

import * as React from "react";
import { Calendar, Loader2, Trash2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CrmAudiencePreset, CrmScheduledCampaign } from "@/lib/crm/agent/types";
import {
  formatMelbourneTime,
  melbourneLocalDateTimeToIso,
  MELBOURNE_TIME_ZONE,
} from "@/lib/blog/melbourne-time";

export function CrmAutomationPanel() {
  const [schedules, setSchedules] = React.useState<CrmScheduledCampaign[]>([]);
  const [presets, setPresets] = React.useState<CrmAudiencePreset[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState("");
  const [prompt, setPrompt] = React.useState("");
  const [presetId, setPresetId] = React.useState("");
  const [scheduledAt, setScheduledAt] = React.useState("");
  const [scheduleType, setScheduleType] = React.useState<"once" | "weekly" | "monthly">("once");
  const [autoSend, setAutoSend] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [schedRes, presetRes] = await Promise.all([
        fetch("/api/store/crm/schedules", { cache: "no-store" }),
        fetch("/api/store/crm/audience-presets", { cache: "no-store" }),
      ]);
      if (schedRes.ok) {
        const data = await schedRes.json();
        setSchedules(data.schedules ?? []);
      }
      if (presetRes.ok) {
        const data = await presetRes.json();
        setPresets(data.presets ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const createSchedule = async () => {
    if (!name.trim() || !scheduledAt) return;
    if (!prompt.trim() && !presetId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/store/crm/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          prompt: prompt.trim() || undefined,
          presetId: presetId || undefined,
          scheduleType,
          scheduledAt: melbourneLocalDateTimeToIso(scheduledAt),
          autoSend,
        }),
      });
      if (!res.ok) throw new Error("Failed to create schedule");
      setName("");
      setPrompt("");
      setPresetId("");
      setScheduledAt("");
      setAutoSend(false);
      await load();
    } catch {
      alert("Could not create schedule");
    } finally {
      setSaving(false);
    }
  };

  const toggleSchedule = async (id: string, enabled: boolean) => {
    await fetch(`/api/store/crm/schedules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    await load();
  };

  const deleteSchedule = async (id: string) => {
    if (!window.confirm("Delete this scheduled campaign?")) return;
    await fetch(`/api/store/crm/schedules/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="rounded-md border border-border/60 bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <Calendar className="size-4 text-gray-600" />
          <h3 className="text-sm font-semibold">Scheduled campaigns</h3>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Schedule the AI agent to build campaigns automatically. By default it creates a draft for
          review; enable auto-send to deliver without manual approval.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Monthly gravel promo" />
          </div>
          <div>
            <Label className="text-xs">Run at (Melbourne time)</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              Times are scheduled in Melbourne time ({MELBOURNE_TIME_ZONE}).
            </p>
          </div>
        </div>

        <div className="mt-3">
          <Label className="text-xs">Repeat</Label>
          <div className="mt-1 flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
            {(["once", "weekly", "monthly"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setScheduleType(type)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors capitalize",
                  scheduleType === type
                    ? "text-gray-800 bg-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70",
                )}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <Label className="text-xs">Prompt</Label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            placeholder="Campaign brief for the agent…"
            className="mt-1 resize-none"
          />
        </div>

        {presets.length > 0 ? (
          <div className="mt-3">
            <Label className="text-xs">Or use preset</Label>
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
              className="mt-1 w-full rounded-md border border-border/60 bg-white px-3 py-2 text-sm"
            >
              <option value="">None</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <label className="mt-3 flex items-center gap-2 text-sm">
          <Checkbox checked={autoSend} onCheckedChange={(v) => setAutoSend(v === true)} />
          Auto-send without manual review
        </label>

        <Button className="mt-4" onClick={() => void createSchedule()} disabled={saving}>
          {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
          Schedule campaign
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : schedules.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">No scheduled campaigns yet.</p>
      ) : (
        <ul className="space-y-2">
          {schedules.map((schedule) => (
            <li
              key={schedule.id}
              className="flex items-center justify-between rounded-md border border-border/60 bg-white px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{schedule.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatMelbourneTime(new Date(schedule.scheduled_at))}
                  {" · "}
                  {schedule.schedule_type}
                  {schedule.auto_send ? " · auto-send" : " · draft only"}
                </p>
                {schedule.last_run_at ? (
                  <p className="text-xs text-muted-foreground">
                    Last run {formatMelbourneTime(new Date(schedule.last_run_at))}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={cn(
                    "rounded-md text-xs",
                    schedule.enabled ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600",
                  )}
                >
                  {schedule.enabled ? "Active" : "Paused"}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void toggleSchedule(schedule.id, !schedule.enabled)}
                >
                  {schedule.enabled ? "Pause" : "Resume"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void deleteSchedule(schedule.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
