/**
 * GET /api/deputy/roster-overview
 *
 * Returns scheduled Deputy rosters grouped by day for the next 7 days
 * (store timezone, inclusive from today).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  DEPUTY_TIME_ZONE,
  DeputyNotConnectedError,
  getDeputyConnection,
  getDeputyRosters,
  isDeputyConfigured,
  listDeputyEmployees,
} from "@/lib/services/deputy";
import type { DeputyRosterRow } from "@/lib/services/deputy/types";

export const dynamic = "force-dynamic";

const ROSTER_DAYS = 7;

function storeDateFromInstant(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DEPUTY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getStoreToday(): string {
  return storeDateFromInstant(new Date());
}

function addStoreDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return storeDateFromInstant(anchor);
}

function dayOffsetFromToday(date: string, today: string): number {
  const [ty, tm, td] = today.split("-").map(Number);
  const [dy, dm, dd] = date.split("-").map(Number);
  const t = Date.UTC(ty, tm - 1, td);
  const d = Date.UTC(dy, dm - 1, dd);
  return Math.round((d - t) / 86_400_000);
}

function formatDayLabel(date: string, today: string): string {
  const offset = dayOffsetFromToday(date, today);
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: DEPUTY_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T12:00:00+10:00`));
}

function formatShortWeekday(date: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: DEPUTY_TIME_ZONE,
    weekday: "short",
  }).format(new Date(`${date}T12:00:00+10:00`));
}

function formatShiftTime(start: string | null, end: string | null): string {
  if (start && end) return `${start}–${end}`;
  if (start) return `${start} onwards`;
  if (end) return `Until ${end}`;
  return "All day";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    if (!isDeputyConfigured()) {
      return NextResponse.json({
        configured: false,
        connected: false,
        days: [],
        total_shifts: 0,
      });
    }

    const connection = await getDeputyConnection(user.id);
    if (connection?.status !== "connected") {
      return NextResponse.json({
        configured: true,
        connected: false,
        account_name: connection?.company_name ?? connection?.account_name ?? null,
        days: [],
        total_shifts: 0,
      });
    }

    const today = getStoreToday();
    const toDate = addStoreDays(today, ROSTER_DAYS - 1);
    const [roster, team] = await Promise.all([
      getDeputyRosters(user.id, { fromDate: today, toDate }),
      listDeputyEmployees(user.id, { activeOnly: true }),
    ]);

    const shiftsByDate = new Map<string, DeputyRosterRow[]>();
    for (const shift of roster.rosters) {
      const dayKey = shift.date?.slice(0, 10) ?? null;
      if (!dayKey) continue;
      const bucket = shiftsByDate.get(dayKey) ?? [];
      bucket.push(shift);
      shiftsByDate.set(dayKey, bucket);
    }

    const dayDates = Array.from({ length: ROSTER_DAYS }, (_, index) => addStoreDays(today, index));

    const days = dayDates.map((date) => {
      const shifts = (shiftsByDate.get(date) ?? [])
        .slice()
        .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));

      return {
        date,
        label: formatDayLabel(date, today),
        weekday: formatShortWeekday(date),
        is_today: date === today,
        shift_count: shifts.length,
        shifts: shifts.map((shift, index) => ({
          id: `${date}-${shift.employee}-${shift.start ?? "open"}-${index}`,
          employee: shift.employee,
          initials: initials(shift.employee),
          time: formatShiftTime(shift.start, shift.end),
          hours: shift.hours,
          area: shift.area,
          open: shift.open,
          published: shift.published,
        })),
      };
    });

    const scheduleUrl = connection.endpoint
      ? `https://${connection.endpoint.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}/#scheduling`
      : null;

    return NextResponse.json({
      configured: true,
      connected: true,
      account_name: connection.company_name ?? connection.account_name ?? connection.install_name ?? null,
      schedule_url: scheduleUrl,
      range: { from: today, to: toDate },
      total_shifts: roster.total_shifts,
      employees: team.employees.map((employee) => ({
        id: employee.id,
        name: employee.name,
        initials: initials(employee.name),
      })),
      days,
    });
  } catch (error) {
    if (error instanceof DeputyNotConnectedError) {
      return NextResponse.json({
        configured: true,
        connected: false,
        message: error.message,
        days: [],
        total_shifts: 0,
      });
    }

    console.error("[Deputy Roster Overview] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load roster" },
      { status: 500 },
    );
  }
}
