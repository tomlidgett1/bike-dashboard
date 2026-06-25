"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, MagicStick3 } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import {
  SPECIALS_STRATEGY_DESCRIPTIONS,
  SPECIALS_STRATEGY_LABELS,
  type SpecialsConfig,
  type SpecialsConfigUpdate,
  type SpecialsStrategy,
} from "@/lib/types/specials";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const COUNT_PRESETS = [5, 10, 15];
const STRATEGY_ORDER: SpecialsStrategy[] = [
  "random",
  "single_category",
  "one_per_category",
  "clearance",
];

function hourLabel(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:00 ${period}`;
}

function appetiteFromValue(v: number): "gentle" | "balanced" | "aggressive" {
  if (v <= 0.34) return "gentle";
  if (v <= 0.67) return "balanced";
  return "aggressive";
}
const APPETITE_VALUE: Record<string, number> = { gentle: 0.25, balanced: 0.5, aggressive: 0.85 };

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center bg-gray-100 p-0.5 rounded-md">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
            value === opt.value
              ? "text-gray-800 bg-white shadow-sm"
              : "text-gray-600 hover:bg-gray-200/70",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-foreground">{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function SpecialsSchedulePanel({
  config,
  aiAvailable,
  saving,
  onSave,
}: {
  config: SpecialsConfig;
  aiAvailable: boolean;
  saving: boolean;
  onSave: (update: SpecialsConfigUpdate) => Promise<void>;
}) {
  const [draft, setDraft] = React.useState<SpecialsConfig>(config);
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  React.useEffect(() => setDraft(config), [config]);

  const set = <K extends keyof SpecialsConfig>(key: K, value: SpecialsConfig[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const dirty = React.useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(config),
    [draft, config],
  );

  const countIsPreset = COUNT_PRESETS.includes(draft.products_per_cycle);

  const handleSave = async () => {
    const update: SpecialsConfigUpdate = {
      is_enabled: draft.is_enabled,
      cadence: draft.cadence,
      rotation_hour: draft.rotation_hour,
      rotation_weekday: draft.rotation_weekday,
      strategy: draft.strategy,
      selection_mode: draft.selection_mode,
      products_per_cycle: draft.products_per_cycle,
      category_count: draft.category_count,
      min_discount_percent: draft.min_discount_percent,
      max_discount_percent: draft.max_discount_percent,
      min_margin_floor_percent: draft.min_margin_floor_percent,
      discount_aggressiveness: draft.discount_aggressiveness,
      stale_days_threshold: draft.stale_days_threshold,
      min_cooldown_cycles: draft.min_cooldown_cycles,
      ai_enabled: draft.ai_enabled,
      carousel_title: draft.carousel_title,
      carousel_subtitle: draft.carousel_subtitle,
    };
    await onSave(update);
  };

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Master switch */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Specials carousel</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {draft.is_enabled
              ? "Live — rotating automatically on your storefront."
              : "Off — turn on to start auto-rotating specials."}
          </p>
        </div>
        <Switch
          checked={draft.is_enabled}
          onCheckedChange={(v) => set("is_enabled", v)}
        />
      </div>

      {!aiAvailable && draft.ai_enabled ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          AI curation key not configured — specials will use the built-in pricing engine
          (still fully automatic).
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
        <Field label="Carousel title">
          <Input
            value={draft.carousel_title}
            maxLength={80}
            onChange={(e) => set("carousel_title", e.target.value)}
            placeholder="Today's specials"
          />
        </Field>
        <Field label="Subtitle (optional)">
          <Input
            value={draft.carousel_subtitle ?? ""}
            maxLength={160}
            onChange={(e) => set("carousel_subtitle", e.target.value || null)}
            placeholder="Fresh deals, updated automatically"
          />
        </Field>

        {/* Cadence */}
        <Field label="Rotation" hint="How often the carousel swaps in a fresh set.">
          <Segmented
            value={draft.cadence}
            onChange={(v) => set("cadence", v)}
            options={[
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
            ]}
          />
        </Field>

        <Field label="Changeover time" hint="Store local time (Melbourne).">
          <div className="flex items-center gap-2">
            {draft.cadence === "weekly" ? (
              <Select
                value={String(draft.rotation_weekday)}
                onValueChange={(v) => set("rotation_weekday", Number(v))}
              >
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((day, i) => (
                    <SelectItem key={day} value={String(i)}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Select
              value={String(draft.rotation_hour)}
              onValueChange={(v) => set("rotation_hour", Number(v))}
            >
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, h) => (
                  <SelectItem key={h} value={String(h)}>
                    {hourLabel(h)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Field>
      </div>

      {/* Strategy */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-foreground">How products are grouped</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            The AI curates each cycle to fit this shape.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STRATEGY_ORDER.map((strategy) => (
            <button
              key={strategy}
              type="button"
              onClick={() => set("strategy", strategy)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                draft.strategy === strategy
                  ? "border-foreground/60 bg-accent/40 ring-1 ring-foreground/10"
                  : "border-border hover:bg-accent/30",
              )}
            >
              <p className="text-sm font-medium text-foreground">
                {SPECIALS_STRATEGY_LABELS[strategy]}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {SPECIALS_STRATEGY_DESCRIPTIONS[strategy]}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Count + selection mode */}
      <div className="grid grid-cols-1 gap-5 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
        <Field
          label="Products per cycle"
          hint={
            draft.strategy === "one_per_category"
              ? "Picks one product from this many categories."
              : "How many products appear each rotation."
          }
        >
          <div className="flex items-center gap-2">
            <Segmented
              value={countIsPreset ? draft.products_per_cycle : -1}
              onChange={(v) => v !== -1 && set("products_per_cycle", v as number)}
              options={[
                ...COUNT_PRESETS.map((n) => ({ value: n, label: String(n) })),
                { value: -1, label: "Custom" },
              ]}
            />
            {!countIsPreset ? (
              <Input
                type="number"
                min={1}
                max={60}
                className="w-20"
                value={draft.products_per_cycle}
                onChange={(e) =>
                  set("products_per_cycle", Math.max(1, Math.min(60, Number(e.target.value) || 1)))
                }
              />
            ) : null}
          </div>
        </Field>

        <Field
          label="Who picks the products"
          hint={
            draft.selection_mode === "manual"
              ? "You hand-pick every product. Discounts are still suggested."
              : "AI fills each cycle automatically; you can still tweak."
          }
        >
          <Segmented
            value={draft.selection_mode}
            onChange={(v) => set("selection_mode", v)}
            options={[
              { value: "auto", label: "Automatic (AI)" },
              { value: "manual", label: "Manual" },
            ]}
          />
        </Field>
      </div>

      {/* Discount appetite */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <MagicStick3 size={16} className="text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Discount appetite</p>
        </div>
        <p className="text-xs text-muted-foreground">
          How hard to discount slow, stale and overstocked lines. Margins are always
          protected by your floor below.
        </p>
        <Segmented
          value={appetiteFromValue(draft.discount_aggressiveness)}
          onChange={(v) => set("discount_aggressiveness", APPETITE_VALUE[v])}
          options={[
            { value: "gentle", label: "Gentle" },
            { value: "balanced", label: "Balanced" },
            { value: "aggressive", label: "Aggressive" },
          ]}
        />
      </div>

      {/* Advanced */}
      <div className="rounded-xl border border-border bg-card">
        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          className="flex w-full items-center justify-between p-4 text-sm font-medium text-foreground"
        >
          <span>Advanced pricing &amp; rotation rules</span>
          <span className="text-muted-foreground">{showAdvanced ? "Hide" : "Show"}</span>
        </button>
        {showAdvanced ? (
          <div className="grid grid-cols-1 gap-5 border-t border-border p-4 sm:grid-cols-2">
            <Field label="Minimum discount" hint="Don't bother showing a special below this %.">
              <Input
                type="number"
                min={0}
                max={100}
                value={draft.min_discount_percent}
                onChange={(e) => set("min_discount_percent", Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="Maximum discount" hint="Never discount more than this %.">
              <Input
                type="number"
                min={0}
                max={100}
                value={draft.max_discount_percent}
                onChange={(e) => set("max_discount_percent", Number(e.target.value) || 0)}
              />
            </Field>
            <Field
              label="Minimum margin floor"
              hint="Sale price always keeps at least this margin %."
            >
              <Input
                type="number"
                min={0}
                max={95}
                value={draft.min_margin_floor_percent}
                onChange={(e) => set("min_margin_floor_percent", Number(e.target.value) || 0)}
              />
            </Field>
            <Field
              label="Stale after (days)"
              hint="Products unsold this long are prime clearance picks."
            >
              <Input
                type="number"
                min={1}
                max={1000}
                value={draft.stale_days_threshold}
                onChange={(e) => set("stale_days_threshold", Number(e.target.value) || 1)}
              />
            </Field>
            <Field
              label="No-repeat window (cycles)"
              hint="A product can't reappear for this many cycles."
            >
              <Input
                type="number"
                min={0}
                max={52}
                value={draft.min_cooldown_cycles}
                onChange={(e) => set("min_cooldown_cycles", Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="AI curation" hint="Let AI choose & justify each set.">
              <div className="flex items-center gap-2 pt-1.5">
                <Switch
                  checked={draft.ai_enabled}
                  onCheckedChange={(v) => set("ai_enabled", v)}
                />
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Sparkles size={14} /> {draft.ai_enabled ? "On" : "Off"}
                </span>
              </div>
            </Field>
          </div>
        ) : null}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving || !dirty} className="rounded-md">
          {saving ? "Saving…" : "Save settings"}
        </Button>
        {dirty ? (
          <span className="text-xs text-muted-foreground">Unsaved changes</span>
        ) : (
          <span className="text-xs text-muted-foreground">All changes saved</span>
        )}
      </div>
    </div>
  );
}
