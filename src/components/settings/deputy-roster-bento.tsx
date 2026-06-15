"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, Minus, Plus, RefreshCw } from "lucide-react";
import { DeputyLogo } from "@/components/genie/deputy-logo";
import { getBentoShellStyles, bentoCardShellClassName, bentoOuterWrapClassName, type BentoShellVariant } from "@/components/settings/bento-variant-styles";
import { cn } from "@/lib/utils";

type RosterShift = {
  id: string;
  employee: string;
  initials: string;
  time: string;
  hours: number | null;
  area: string | null;
  open: boolean;
  published: boolean;
};

type RosterEmployee = {
  id: number;
  name: string;
  initials: string;
};

type RosterDay = {
  date: string;
  label: string;
  weekday: string;
  is_today: boolean;
  shift_count: number;
  shifts: RosterShift[];
};

type RosterOverviewResponse = {
  configured: boolean;
  connected: boolean;
  account_name?: string | null;
  schedule_url?: string | null;
  range?: { from: string; to: string };
  total_shifts?: number;
  employees?: RosterEmployee[];
  days?: RosterDay[];
  message?: string;
  error?: string;
};

type DeputyRosterBentoVariant = BentoShellVariant;
type StaffPanelMode = "add" | "remove";

type ShiftEditorState =
  | { kind: "add"; employee: RosterEmployee }
  | { kind: "edit"; shift: RosterShift };

const SLIDE_TRANSITION = { duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] as const };
const DEFAULT_SHIFT_START = "09:00";
const DEFAULT_SHIFT_END = "17:00";
const CARD_RADIUS = "rounded-[14px]";

function buildMarketingRosterOverview(): RosterOverviewResponse {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const days: RosterDay[] = [];

  for (let index = 0; index < 7; index += 1) {
    const dateObj = new Date(start);
    dateObj.setDate(start.getDate() + index);
    const date = dateObj.toISOString().slice(0, 10);
    const shifts: RosterShift[] =
      index === 0
        ? [
            {
              id: "mk-shift-1",
              employee: "Sarah Chen",
              initials: "SC",
              time: "09:00–17:00",
              hours: 8,
              area: "Workshop",
              open: false,
              published: true,
            },
            {
              id: "mk-shift-2",
              employee: "Mike Torres",
              initials: "MT",
              time: "10:00–18:00",
              hours: 8,
              area: "Sales",
              open: false,
              published: true,
            },
          ]
        : index === 1
          ? [
              {
                id: "mk-shift-3",
                employee: "Sarah Chen",
                initials: "SC",
                time: "09:00–15:00",
                hours: 6,
                area: "Workshop",
                open: false,
                published: true,
              },
            ]
          : [];

    days.push({
      date,
      label: dateObj.toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
      weekday: dateObj.toLocaleDateString("en-AU", { weekday: "short" }),
      is_today: index === 0,
      shift_count: shifts.length,
      shifts,
    });
  }

  return {
    configured: true,
    connected: true,
    account_name: "Acme Bikes",
    range: { from: days[0]?.date ?? "", to: days[6]?.date ?? "" },
    total_shifts: days.reduce((sum, day) => sum + day.shift_count, 0),
    employees: [
      { id: 1, name: "Sarah Chen", initials: "SC" },
      { id: 2, name: "Mike Torres", initials: "MT" },
      { id: 3, name: "Jess Park", initials: "JP" },
    ],
    days,
  };
}

const MARKETING_ROSTER_OVERVIEW = buildMarketingRosterOverview();

function parseShiftTime(time: string): { start: string; end: string } | null {
  const match = time.match(/^(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})/);
  if (!match) return null;
  return { start: match[1], end: match[2] };
}

function formatShiftTime(start: string, end: string): string {
  return `${start}–${end}`;
}

function computeShiftHours(start: string, end: string): number | null {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  if ([startHour, startMinute, endHour, endMinute].some((value) => Number.isNaN(value))) return null;
  const minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes <= 0) return null;
  return Math.round((minutes / 60) * 100) / 100;
}

function shiftSortKey(time: string): string {
  return parseShiftTime(time)?.start ?? time;
}

function applyShiftOverride(shift: RosterShift, override?: { start: string; end: string }): RosterShift {
  if (!override) return shift;
  const time = formatShiftTime(override.start, override.end);
  return {
    ...shift,
    time,
    hours: computeShiftHours(override.start, override.end),
  };
}

function shiftEmployeeNames(shifts: RosterShift[]): Set<string> {
  return new Set(
    shifts
      .filter((shift) => !shift.open)
      .map((shift) => shift.employee.trim().toLowerCase()),
  );
}

function applyRosterAdjustments(
  days: RosterDay[],
  addedByDate: Record<string, RosterShift[]>,
  removedShiftIds: Set<string>,
  shiftOverrides: Record<string, { start: string; end: string }>,
): RosterDay[] {
  return days.map((day) => {
    const added = addedByDate[day.date] ?? [];
    const shifts = [...day.shifts.filter((shift) => !removedShiftIds.has(shift.id)), ...added]
      .map((shift) => applyShiftOverride(shift, shiftOverrides[shift.id]))
      .sort((a, b) => shiftSortKey(a.time).localeCompare(shiftSortKey(b.time)));
    return {
      ...day,
      shifts,
      shift_count: shifts.length,
    };
  });
}

function ShiftRow({
  shift,
  listItemBorder,
  onEdit,
}: {
  shift: RosterShift;
  listItemBorder: string;
  onEdit?: (shift: RosterShift) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onEdit?.(shift)}
      disabled={!onEdit || shift.open}
      className={cn(
        "flex w-full items-center gap-2.5 border bg-white px-2.5 py-2 text-left shadow-sm transition-colors",
        CARD_RADIUS,
        listItemBorder,
        onEdit && !shift.open && "hover:bg-gray-50/80",
        shift.open && "cursor-default",
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600 ring-1 ring-black/[0.05]">
        {shift.initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[12px] font-semibold text-gray-900">{shift.employee}</p>
          {shift.open ? (
            <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600">
              Open
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[11px] font-medium tabular-nums text-gray-950">{shift.time}</p>
        {shift.hours != null ? (
          <p className="mt-0.5 truncate text-[10px] text-gray-500">{shift.hours} hrs</p>
        ) : shift.area ? (
          <p className="mt-0.5 truncate text-[10px] text-gray-500">{shift.area}</p>
        ) : null}
      </div>
    </button>
  );
}

function DaySection({
  day,
  listItemBorder,
  onEditShift,
}: {
  day: RosterDay;
  listItemBorder: string;
  onEditShift?: (shift: RosterShift) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-gray-900">{day.label}</p>
          <p className="text-[10px] text-gray-500">
            {day.shift_count === 0
              ? "No shifts scheduled"
              : `${day.shift_count} shift${day.shift_count === 1 ? "" : "s"}`}
          </p>
        </div>
        {day.is_today ? (
          <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-700">
            Today
          </span>
        ) : null}
      </div>

      <div className="space-y-1.5">
        {day.shifts.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-gray-200 bg-white/70 px-3 py-4 text-center">
            <p className="text-[11px] font-medium text-gray-500">Nothing scheduled</p>
          </div>
        ) : (
          day.shifts.map((shift) => (
            <ShiftRow
              key={shift.id}
              shift={shift}
              listItemBorder={listItemBorder}
              onEdit={onEditShift}
            />
          ))
        )}
      </div>
    </section>
  );
}

function RosterSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-3 p-1">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="space-y-2">
          <div className="h-8 animate-pulse rounded-md bg-gray-200/70" />
          <div className="h-14 animate-pulse rounded-[14px] bg-white/80" />
        </div>
      ))}
    </div>
  );
}

function StaffPanelHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50"
        aria-label="Back to roster"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-gray-900">{title}</p>
        <p className="truncate text-[11px] text-gray-500">{subtitle}</p>
      </div>
      <DeputyLogo className="h-5 w-5 shrink-0" />
    </div>
  );
}

function EditShiftHoursPanel({
  title,
  subtitle,
  initialStart,
  initialEnd,
  listItemBorder,
  saveLabel,
  onBack,
  onSave,
}: {
  title: string;
  subtitle: string;
  initialStart: string;
  initialEnd: string;
  listItemBorder: string;
  saveLabel: string;
  onBack: () => void;
  onSave: (start: string, end: string) => void;
}) {
  const [start, setStart] = React.useState(initialStart);
  const [end, setEnd] = React.useState(initialEnd);
  const hours = computeShiftHours(start, end);
  const invalid = !hours;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StaffPanelHeader title={title} subtitle={subtitle} onBack={onBack} />
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden border bg-white shadow-sm",
          CARD_RADIUS,
          listItemBorder,
        )}
      >
        <div className="space-y-3 px-3 py-3">
          <div>
            <label htmlFor="shift-start" className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
              Start
            </label>
            <input
              id="shift-start"
              type="time"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className="mt-1.5 w-full rounded-md border border-gray-200 bg-gray-50/80 px-2.5 py-2 text-[12px] tabular-nums text-gray-800 outline-none transition-colors focus:border-gray-300 focus:bg-white"
            />
          </div>
          <div>
            <label htmlFor="shift-end" className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
              End
            </label>
            <input
              id="shift-end"
              type="time"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              className="mt-1.5 w-full rounded-md border border-gray-200 bg-gray-50/80 px-2.5 py-2 text-[12px] tabular-nums text-gray-800 outline-none transition-colors focus:border-gray-300 focus:bg-white"
            />
          </div>
          <div className="rounded-md bg-gray-50 px-2.5 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Shift length</p>
            <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-gray-800">
              {invalid ? "End must be after start" : `${hours} hrs · ${formatShiftTime(start, end)}`}
            </p>
          </div>
        </div>
        <div className="mt-auto border-t border-gray-100 p-3">
          <button
            type="button"
            disabled={invalid}
            onClick={() => onSave(start, end)}
            className={cn(
              "flex w-full items-center justify-center border border-gray-200 bg-white px-2.5 py-2.5 text-[11px] font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-40",
              CARD_RADIUS,
            )}
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddStaffPanel({
  day,
  employees,
  listItemBorder,
  onBack,
  onPickEmployee,
}: {
  day: RosterDay;
  employees: RosterEmployee[];
  listItemBorder: string;
  onBack: () => void;
  onPickEmployee: (employee: RosterEmployee) => void;
}) {
  const scheduled = shiftEmployeeNames(day.shifts);
  const available = employees.filter((employee) => !scheduled.has(employee.name.trim().toLowerCase()));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StaffPanelHeader title="Add staff" subtitle={`${day.label} · pick someone to roster on`} onBack={onBack} />
      <div className="-mx-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-0">
        {available.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-gray-200 bg-white/70 px-3 py-6 text-center">
            <p className="text-[11px] font-medium text-gray-500">Everyone active is already on this day.</p>
          </div>
        ) : (
          available.map((employee) => (
            <div
              key={employee.id}
              className={cn(
                "flex items-center gap-2.5 rounded-[14px] border bg-white px-2.5 py-2 shadow-sm",
                listItemBorder,
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600 ring-1 ring-black/[0.05]">
                {employee.initials}
              </span>
              <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-gray-900">{employee.name}</p>
              <button
                type="button"
                onClick={() => onPickEmployee(employee)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50",
                  CARD_RADIUS,
                )}
              >
                <Plus className="h-3 w-3" />
                Add
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RemoveStaffPanel({
  day,
  listItemBorder,
  onBack,
  onRemove,
}: {
  day: RosterDay;
  listItemBorder: string;
  onBack: () => void;
  onRemove: (shift: RosterShift) => void;
}) {
  const removable = day.shifts.filter((shift) => !shift.open);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StaffPanelHeader title="Remove staff" subtitle={`${day.label} · remove someone from the roster`} onBack={onBack} />
      <div className="-mx-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-0">
        {removable.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-gray-200 bg-white/70 px-3 py-6 text-center">
            <p className="text-[11px] font-medium text-gray-500">No assigned shifts to remove on this day.</p>
          </div>
        ) : (
          removable.map((shift) => (
            <div
              key={shift.id}
              className={cn(
                "flex items-center gap-2.5 rounded-[14px] border bg-white px-2.5 py-2 shadow-sm",
                listItemBorder,
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600 ring-1 ring-black/[0.05]">
                {shift.initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-gray-900">{shift.employee}</p>
                <p className="mt-0.5 truncate text-[11px] font-medium tabular-nums text-gray-950">{shift.time}</p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(shift)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50",
                  CARD_RADIUS,
                )}
              >
                <Minus className="h-3 w-3" />
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Footy-card bento — next 7 days of Deputy roster, live from the connected store.
 */
export function DeputyRosterBento({
  className,
  variant = "default",
  marketingPreview = false,
}: {
  className?: string;
  variant?: DeputyRosterBentoVariant;
  marketingPreview?: boolean;
}) {
  const shell = getBentoShellStyles(variant);
  const [data, setData] = React.useState<RosterOverviewResponse | null>(
    marketingPreview ? MARKETING_ROSTER_OVERVIEW : null,
  );
  const [loading, setLoading] = React.useState(!marketingPreview);
  const [error, setError] = React.useState<string | null>(null);
  const [activeDate, setActiveDate] = React.useState<string | null>(
    marketingPreview ? (MARKETING_ROSTER_OVERVIEW.days?.find((day) => day.is_today)?.date ?? null) : null,
  );
  const [staffPanel, setStaffPanel] = React.useState<StaffPanelMode | null>(null);
  const [shiftEditor, setShiftEditor] = React.useState<ShiftEditorState | null>(null);
  const [addedByDate, setAddedByDate] = React.useState<Record<string, RosterShift[]>>({});
  const [removedShiftIds, setRemovedShiftIds] = React.useState<Set<string>>(() => new Set());
  const [shiftOverrides, setShiftOverrides] = React.useState<Record<string, { start: string; end: string }>>({});

  const load = React.useCallback(async () => {
    if (marketingPreview) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/deputy/roster-overview", { cache: "no-store" });
      const json = (await response.json()) as RosterOverviewResponse;
      if (!response.ok) {
        throw new Error(json.error || "Failed to load roster");
      }
      setData(json);
      setAddedByDate({});
      setRemovedShiftIds(new Set());
      setShiftOverrides({});
      setStaffPanel(null);
      setShiftEditor(null);
      const today = json.days?.find((day) => day.is_today)?.date ?? json.days?.[0]?.date ?? null;
      setActiveDate((current) => {
        if (current && json.days?.some((day) => day.date === current)) return current;
        return today;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load roster");
    } finally {
      setLoading(false);
    }
  }, [marketingPreview]);

  React.useEffect(() => {
    if (marketingPreview) return;
    void load();
  }, [load, marketingPreview]);

  const panelClassName = cn("flex min-h-0 flex-1 flex-col", shell.panelClassName);
  const baseDays = data?.days ?? [];
  const days = applyRosterAdjustments(baseDays, addedByDate, removedShiftIds, shiftOverrides);
  const activeDay = days.find((day) => day.date === activeDate) ?? days[0] ?? null;
  const employees = data?.employees ?? [];
  const displayShiftTotal = days.reduce((sum, day) => sum + day.shift_count, 0);

  function saveShiftHours(shiftId: string, start: string, end: string) {
    setShiftOverrides((current) => ({
      ...current,
      [shiftId]: { start, end },
    }));
  }

  function handleConfirmAddStaff(employee: RosterEmployee, start: string, end: string) {
    if (!activeDay) return;
    const shiftId = `added-${activeDay.date}-${employee.id}-${Date.now()}`;
    const time = formatShiftTime(start, end);
    const shift: RosterShift = {
      id: shiftId,
      employee: employee.name,
      initials: employee.initials,
      time,
      hours: computeShiftHours(start, end),
      area: null,
      open: false,
      published: false,
    };
    setAddedByDate((current) => ({
      ...current,
      [activeDay.date]: [...(current[activeDay.date] ?? []), shift],
    }));
    setShiftOverrides((current) => ({
      ...current,
      [shiftId]: { start, end },
    }));
    setShiftEditor(null);
    setStaffPanel(null);
  }

  function handleConfirmEditShift(shift: RosterShift, start: string, end: string) {
    if (shift.id.startsWith("added-")) {
      const time = formatShiftTime(start, end);
      setAddedByDate((current) => {
        const next = { ...current };
        for (const [date, shifts] of Object.entries(next)) {
          next[date] = shifts.map((entry) =>
            entry.id === shift.id
              ? { ...entry, time, hours: computeShiftHours(start, end) }
              : entry,
          );
        }
        return next;
      });
    } else {
      saveShiftHours(shift.id, start, end);
    }
    setShiftEditor(null);
  }

  function handleRemoveStaff(shift: RosterShift) {
    if (shift.id.startsWith("added-")) {
      setAddedByDate((current) => {
        const next = { ...current };
        for (const [date, shifts] of Object.entries(next)) {
          const filtered = shifts.filter((entry) => entry.id !== shift.id);
          if (filtered.length > 0) next[date] = filtered;
          else delete next[date];
        }
        return next;
      });
    } else {
      setRemovedShiftIds((current) => {
        const next = new Set(current);
        next.add(shift.id);
        return next;
      });
    }
    setStaffPanel(null);
  }

  return (
    <div className={bentoCardShellClassName(className)}>
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-1 pt-5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-gray-900">Roster</h2>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {data?.connected && data.range
              ? `Next 7 days · ${displayShiftTotal} shift${displayShiftTotal === 1 ? "" : "s"}`
              : "Staff schedule from Deputy"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh roster"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
          <DeputyLogo className="mt-0.5 h-5 w-5 shrink-0" />
        </div>
      </div>

      <div className={bentoOuterWrapClassName(variant)}>
          <div className={cn("relative flex h-full min-h-0 flex-col", panelClassName)}>
            {loading && !data ? (
              <RosterSkeleton />
            ) : error ? (
              <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
                <p className="text-[12px] font-medium text-gray-600">{error}</p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="mt-3 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Try again
                </button>
              </div>
            ) : !data?.configured ? (
              <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
                <p className="text-[12px] font-medium text-gray-500">Deputy is not configured here.</p>
              </div>
            ) : !data.connected ? (
              <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
                <DeputyLogo className="mb-3 h-5 w-5 opacity-90" />
                <p className="text-[12px] font-medium text-gray-700">
                  {data.message ?? "Connect Deputy to see your roster"}
                </p>
                {!data.message ? (
                  <p className="mt-1 text-[11px] text-gray-500">Scheduled shifts for the next week will appear here.</p>
                ) : null}
                <Link
                  href="/api/deputy/auth/initiate"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                >
                  {data.message ? "Reconnect Deputy" : "Connect Deputy"}
                </Link>
              </div>
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                {shiftEditor && activeDay ? (
                  <motion.div
                    key={
                      shiftEditor.kind === "add"
                        ? `shift-editor-add-${shiftEditor.employee.id}`
                        : `shift-editor-edit-${shiftEditor.shift.id}`
                    }
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={SLIDE_TRANSITION}
                    className="flex min-h-0 flex-1 flex-col"
                  >
                    <EditShiftHoursPanel
                      title={shiftEditor.kind === "add" ? "Set shift hours" : "Edit shift hours"}
                      subtitle={
                        shiftEditor.kind === "add"
                          ? `${shiftEditor.employee.name} · ${activeDay.label}`
                          : `${shiftEditor.shift.employee} · ${activeDay.label}`
                      }
                      initialStart={
                        shiftEditor.kind === "edit"
                          ? (parseShiftTime(shiftEditor.shift.time)?.start ??
                            shiftOverrides[shiftEditor.shift.id]?.start ??
                            DEFAULT_SHIFT_START)
                          : DEFAULT_SHIFT_START
                      }
                      initialEnd={
                        shiftEditor.kind === "edit"
                          ? (parseShiftTime(shiftEditor.shift.time)?.end ??
                            shiftOverrides[shiftEditor.shift.id]?.end ??
                            DEFAULT_SHIFT_END)
                          : DEFAULT_SHIFT_END
                      }
                      listItemBorder={shell.listItemBorder}
                      saveLabel={shiftEditor.kind === "add" ? "Add to roster" : "Save hours"}
                      onBack={() => setShiftEditor(null)}
                      onSave={(start, end) => {
                        if (shiftEditor.kind === "add") {
                          handleConfirmAddStaff(shiftEditor.employee, start, end);
                        } else {
                          handleConfirmEditShift(shiftEditor.shift, start, end);
                        }
                      }}
                    />
                  </motion.div>
                ) : staffPanel && activeDay ? (
                  <motion.div
                    key={staffPanel}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={SLIDE_TRANSITION}
                    className="flex min-h-0 flex-1 flex-col"
                  >
                    {staffPanel === "add" ? (
                      <AddStaffPanel
                        day={activeDay}
                        employees={employees}
                        listItemBorder={shell.listItemBorder}
                        onBack={() => setStaffPanel(null)}
                        onPickEmployee={(employee) => setShiftEditor({ kind: "add", employee })}
                      />
                    ) : (
                      <RemoveStaffPanel
                        day={activeDay}
                        listItemBorder={shell.listItemBorder}
                        onBack={() => setStaffPanel(null)}
                        onRemove={handleRemoveStaff}
                      />
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="roster"
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    transition={SLIDE_TRANSITION}
                    className="flex min-h-0 flex-1 flex-col"
                  >
                    <div className="mb-3 flex gap-1 overflow-x-auto pb-0.5">
                      {days.map((day) => (
                        <button
                          key={day.date}
                          type="button"
                          onClick={() => setActiveDate(day.date)}
                          className={cn(
                            "flex shrink-0 flex-col items-center rounded-md px-2 py-1.5 text-center transition-colors",
                            activeDate === day.date
                              ? "bg-white text-gray-900 shadow-sm ring-1 ring-black/[0.06]"
                              : "text-gray-500 hover:bg-white/60 hover:text-gray-700",
                          )}
                        >
                          <span className="text-[10px] font-medium uppercase tracking-wide">{day.weekday}</span>
                          <span className="mt-0.5 text-[11px] font-semibold tabular-nums">
                            {day.date.slice(8)}
                          </span>
                          {day.shift_count > 0 ? (
                            <span className="mt-1 rounded-md bg-gray-100 px-1 py-0.5 text-[9px] font-medium text-gray-600">
                              {day.shift_count}
                            </span>
                          ) : (
                            <span className="mt-1 h-[18px]" />
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="-mx-3 min-h-0 flex-1 overflow-y-auto px-3 pb-0">
                      {activeDay ? (
                        <DaySection
                          day={activeDay}
                          listItemBorder={shell.listItemBorder}
                          onEditShift={(shift) => setShiftEditor({ kind: "edit", shift })}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-4 text-center">
                          <p className="text-[12px] text-gray-500">No roster data for this week.</p>
                        </div>
                      )}
                    </div>

                    <div className="-mx-3 mt-auto flex shrink-0 gap-2 border-t border-gray-100 px-3 pt-3 pb-3">
                      <button
                        type="button"
                        onClick={() => setStaffPanel("add")}
                        disabled={!activeDay}
                        className={cn(
                          "flex flex-1 items-center justify-center gap-1 border border-gray-200 bg-white px-2.5 py-2.5 text-[11px] font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-40",
                          CARD_RADIUS,
                          shell.listItemBorder,
                        )}
                      >
                        <Plus className="h-3 w-3" />
                        Add staff
                      </button>
                      <button
                        type="button"
                        onClick={() => setStaffPanel("remove")}
                        disabled={!activeDay}
                        className={cn(
                          "flex flex-1 items-center justify-center gap-1 border border-gray-200 bg-white px-2.5 py-2.5 text-[11px] font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-40",
                          CARD_RADIUS,
                          shell.listItemBorder,
                        )}
                      >
                        <Minus className="h-3 w-3" />
                        Remove staff
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
      </div>
    </div>
  );
}
