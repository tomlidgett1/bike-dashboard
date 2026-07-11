import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { BrandApiDebugCollector } from './brand-api-debug.ts';
import {
  LIGHTSPEED_API_ORIGIN,
  ensureValidLightspeedAccessToken,
  lightspeedGetJson,
  normaliseRelationArray,
  parseNumberLoose,
  type LightspeedPortalConnection,
} from './lightspeed-client.ts';
import {
  fetchLightspeedItemSalesByWeekday,
  fetchLightspeedItemSalesSummary,
  fetchLightspeedSalesByWeekday,
  fetchLightspeedSalesSummary,
  fetchLightspeedTopItems,
  searchLightspeedInventory,
  type LightspeedSalesWeekdayRow,
  type LightspeedTopItemRow,
} from './lightspeed-sql.ts';

const LIGHTSPEED_PROVIDER = 'lightspeed';

/** Triggers a read from mirrored sale / sale_line tables. */
export const SALES_QUERY_RE =
  /(\bsales?\b|\bsold\b|\bsell\b|\brevenue\b|\bturnover\b|\btakings?\b|\btaken\b|\btransactions?\b|\btill\b|\breceipt\b|\blayaway\b|\blay\s*away\b|\bbest\s*sell(?:ing|er)\b|\btop\s*sell(?:ing|er)\b|\bhow\s+much\s+.*\bwe\s+(?:sell|sold|make|made|take|taken|do|done)\b|\bwhat\s+(?:did|have)\s+we\s+(?:sell|sold|make|made|take|taken)\b|\baverage\s+(?:sale|transaction|order)\b|\btotal\s+(?:sales?|revenue|takings?)\b|\bsale\s+value\b|\bdaily\s+(?:sales?|take|revenue)\b|\bweekly\s+(?:sales?|take|revenue)\b|\bmonthly\s+(?:sales?|take|revenue)\b|\bprofit\b|\bprofitab(?:le|ility)\b|\bmargin\b|\bcost\s+of\s+(?:goods|sales?)\b|\bcogs\b|\bgross\s+(?:profit|margin)\b|\bnet\s+(?:profit|revenue|margin)\b|\btax(?:es|able)?\b|\bdiscount(?:s|ed)?\b|\bmake\b|\bmade\b|\bearned?\b|\btakings?\b|\bincome\b|\bfinancials?\b|\bperformance\b|\bprofits?\b|\bmarkup\b|\bbreak\s*even\b)/i;

export function messageSuggestsSalesQuery(message: string): boolean {
  return SALES_QUERY_RE.test(message.trim());
}

function melbourneYmd(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function melbourneWeekday(d: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    weekday: 'long',
  }).format(d);
}

function melbourneLongDate(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

function previousMonthEnd(ymd: string): string {
  const [year, month] = ymd.split('-').map(Number);
  const prevMonthDate = new Date(Date.UTC(year, month - 1, 0, 12, 0, 0));
  return [
    prevMonthDate.getUTCFullYear(),
    String(prevMonthDate.getUTCMonth() + 1).padStart(2, '0'),
    String(prevMonthDate.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function formatAud(n: number): string {
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

type DateWindow = { label: string; fromYmd: string; toYmd: string };

export function resolveSalesDateWindow(message: string): DateWindow | null {
  const now = new Date();
  const todayYmd = melbourneYmd(now);
  const lower = message.toLowerCase();

  const yesterdayDate = new Date(now.getTime() - 86_400_000);
  const yesterdayYmd = melbourneYmd(yesterdayDate);
  const tomorrowDate = new Date(now.getTime() + 86_400_000);
  const tomorrowYmd = melbourneYmd(tomorrowDate);

  if (/\byesterday\b/.test(lower)) {
    return { label: `Yesterday (${melbourneLongDate(yesterdayYmd)})`, fromYmd: yesterdayYmd, toYmd: yesterdayYmd };
  }
  if (/\btoday\b/.test(lower)) {
    return { label: `Today (${melbourneLongDate(todayYmd)})`, fromYmd: todayYmd, toYmd: todayYmd };
  }
  if (/\btomorrow\b/.test(lower)) {
    return { label: `Tomorrow (${melbourneLongDate(tomorrowYmd)})`, fromYmd: tomorrowYmd, toYmd: tomorrowYmd };
  }

  const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (const dayName of dayNames) {
    if (new RegExp(`\\b${dayName}\\b`, 'i').test(lower)) {
      for (let offset = -7; offset <= 7; offset++) {
        const candidate = new Date(now.getTime() + offset * 86_400_000);
        const candidateDay = new Intl.DateTimeFormat('en-AU', {
          timeZone: 'Australia/Melbourne',
          weekday: 'long',
        }).format(candidate).toLowerCase();
        if (candidateDay === dayName) {
          const ymd = melbourneYmd(candidate);
          const isPast = offset < 0 || (offset === 0);
          if (/\blast\b/.test(lower) && offset < 0) {
            return { label: `Last ${dayName.charAt(0).toUpperCase() + dayName.slice(1)} (${melbourneLongDate(ymd)})`, fromYmd: ymd, toYmd: ymd };
          }
          if (!isPast && !/\blast\b/.test(lower)) continue;
          if (isPast) {
            return { label: `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} (${melbourneLongDate(ymd)})`, fromYmd: ymd, toYmd: ymd };
          }
        }
      }
    }
  }

  if (/\bthis\s+week\b/.test(lower)) {
    const dayOfWeek = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'long' }).format(now).toLowerCase();
    const dayIdx = dayNames.indexOf(dayOfWeek);
    const mondayOffset = dayIdx >= 0 ? -dayIdx : 0;
    const mondayDate = new Date(now.getTime() + mondayOffset * 86_400_000);
    return { label: 'This week', fromYmd: melbourneYmd(mondayDate), toYmd: todayYmd };
  }

  if (/\blast\s+week\b/.test(lower)) {
    const dayOfWeek = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'long' }).format(now).toLowerCase();
    const dayIdx = dayNames.indexOf(dayOfWeek);
    const thisMonOffset = dayIdx >= 0 ? -dayIdx : 0;
    const lastMonDate = new Date(now.getTime() + (thisMonOffset - 7) * 86_400_000);
    const lastSunDate = new Date(lastMonDate.getTime() + 6 * 86_400_000);
    return { label: 'Last week', fromYmd: melbourneYmd(lastMonDate), toYmd: melbourneYmd(lastSunDate) };
  }

  if (/\bthis\s+month\b/.test(lower)) {
    const parts = todayYmd.split('-');
    const firstOfMonth = `${parts[0]}-${parts[1]}-01`;
    return { label: 'This month', fromYmd: firstOfMonth, toYmd: todayYmd };
  }

  if (/\blast\s+month\b/.test(lower)) {
    const d = new Date(now.getTime());
    const melbMonth = Number(todayYmd.split('-')[1]);
    const melbYear = Number(todayYmd.split('-')[0]);
    const prevMonth = melbMonth === 1 ? 12 : melbMonth - 1;
    const prevYear = melbMonth === 1 ? melbYear - 1 : melbYear;
    const firstDay = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
    const lastDay = `${melbYear}-${String(melbMonth).padStart(2, '0')}-01`;
    const lastOfPrev = new Date(new Date(lastDay + 'T12:00:00Z').getTime() - 86_400_000);
    return { label: 'Last month', fromYmd: firstDay, toYmd: melbourneYmd(lastOfPrev) };
  }

  const nDaysMatch = lower.match(/\b(?:last|past)\s+(\d+)\s+days?\b/);
  if (nDaysMatch) {
    const n = Math.min(Number(nDaysMatch[1]), 365);
    const from = new Date(now.getTime() - n * 86_400_000);
    return { label: `Last ${n} days`, fromYmd: melbourneYmd(from), toYmd: todayYmd };
  }

  const nWeeksMatch = lower.match(/\b(?:last|past)\s+(\d+)\s+weeks?\b/);
  if (nWeeksMatch) {
    const n = Math.min(Number(nWeeksMatch[1]), 52);
    const from = new Date(now.getTime() - n * 7 * 86_400_000);
    return { label: `Last ${n} weeks`, fromYmd: melbourneYmd(from), toYmd: todayYmd };
  }

  const nMonthsMatch = lower.match(/\b(?:last|past|previous)\s+(\d+)\s+months?\b/);
  if (nMonthsMatch) {
    const n = Math.min(Number(nMonthsMatch[1]), 24);
    const from = new Date(now.getTime() - n * 30 * 86_400_000);
    return { label: `Last ${n} months`, fromYmd: melbourneYmd(from), toYmd: todayYmd };
  }

  if (/\b(?:last|past)\s+(?:quarter|90\s*days)\b/.test(lower)) {
    const from = new Date(now.getTime() - 90 * 86_400_000);
    return { label: 'Last quarter', fromYmd: melbourneYmd(from), toYmd: todayYmd };
  }

  if (/\b(?:this\s+year|year\s+to\s+date|ytd)\b/.test(lower)) {
    const ymd = todayYmd.split('-');
    return { label: 'Year to date', fromYmd: `${ymd[0]}-01-01`, toYmd: todayYmd };
  }

  // ── Last N years ─────────────────────────────────────────────────────────
  const nYearsMatch = lower.match(/\b(?:(?:last|past)\s+(\d+)\s+years?|(\d+)\s+years?\s+(?:back|ago))\b/);
  if (nYearsMatch) {
    const n = Math.min(Number(nYearsMatch[1] ?? nYearsMatch[2]), 10);
    if (n >= 1) {
      const from = new Date(now.getTime() - n * 365 * 86_400_000);
      return { label: `Last ${n} years`, fromYmd: melbourneYmd(from), toYmd: todayYmd };
    }
  }

  const MONTH_NAMES: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };
  const monthPattern = Object.keys(MONTH_NAMES).join('|');

  // ── Specific exact dates ───────────────────────────────────────────────────
  // Covers:
  // - "10th Jan 2024"
  // - "10 Jan 2024"
  // - "Jan 10 2024"
  // - "2024-01-10"
  // - "10/01/2024" (Australian day/month/year)
  const exactIso = lower.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (exactIso) {
    const ymd = `${exactIso[1]}-${exactIso[2]}-${exactIso[3]}`;
    return { label: melbourneLongDate(ymd), fromYmd: ymd, toYmd: ymd };
  }

  const exactSlash = lower.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (exactSlash) {
    const day = Number(exactSlash[1]);
    const month = Number(exactSlash[2]);
    const year = Number(exactSlash[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { label: melbourneLongDate(ymd), fromYmd: ymd, toYmd: ymd };
    }
  }

  const exactDayMonthYear = lower.match(
    new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})(?:\\.)?\\s+(20\\d{2})\\b`, 'i'),
  );
  if (exactDayMonthYear) {
    const day = Number(exactDayMonthYear[1]);
    const month = MONTH_NAMES[exactDayMonthYear[2].toLowerCase().replace('.', '')];
    const year = Number(exactDayMonthYear[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { label: melbourneLongDate(ymd), fromYmd: ymd, toYmd: ymd };
    }
  }

  const exactMonthDayYear = lower.match(
    new RegExp(`\\b(${monthPattern})(?:\\.)?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s+(20\\d{2})\\b`, 'i'),
  );
  if (exactMonthDayYear) {
    const month = MONTH_NAMES[exactMonthDayYear[1].toLowerCase().replace('.', '')];
    const day = Number(exactMonthDayYear[2]);
    const year = Number(exactMonthDayYear[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { label: melbourneLongDate(ymd), fromYmd: ymd, toYmd: ymd };
    }
  }

  // ── Specific month names (full or abbreviated) ───────────────────────────
  // Covers: "jan", "january", "feb 2025", "march totals", "last december", etc.
  const monthRe = new RegExp(
    `\\b(${monthPattern})(?:\\.)?(?:\\s+(\\d{4}))?\\b`,
    'i',
  );
  const monthMatch = lower.match(monthRe);
  if (monthMatch) {
    const monthNum = MONTH_NAMES[monthMatch[1].toLowerCase().replace('.', '')];
    const todayParts = todayYmd.split('-').map(Number);
    const todayYear = todayParts[0];
    const todayMonth = todayParts[1];

    let targetYear: number;
    if (monthMatch[2]) {
      // Explicit year provided by the user
      targetYear = Number(monthMatch[2]);
    } else {
      // No year given — use most recent past occurrence of this month
      if (monthNum < todayMonth) {
        targetYear = todayYear; // earlier this year
      } else if (monthNum === todayMonth) {
        targetYear = todayYear; // current month
      } else {
        targetYear = todayYear - 1; // month hasn't come yet this year, so last year
      }
    }

    const mm = String(monthNum).padStart(2, '0');
    const fromYmd = `${targetYear}-${mm}-01`;

    // Last day of the target month
    const lastDayDate = new Date(Date.UTC(targetYear, monthNum, 0)); // day 0 of next month = last day of this month
    const lastDayNum = lastDayDate.getUTCDate();
    const toYmd = `${targetYear}-${mm}-${String(lastDayNum).padStart(2, '0')}`;

    const monthLabel = new Intl.DateTimeFormat('en-AU', { month: 'long' }).format(
      new Date(Date.UTC(targetYear, monthNum - 1, 1)),
    );
    return {
      label: `${monthLabel} ${targetYear}`,
      fromYmd,
      // Don't exceed today for the current or future end date
      toYmd: toYmd > todayYmd ? todayYmd : toYmd,
    };
  }

  // ── Specific year (e.g. "2024 sales", "sales in 2023") ───────────────────
  const yearRe = /\b(20\d{2})\b/;
  const yearMatch = lower.match(yearRe);
  if (yearMatch) {
    const yr = Number(yearMatch[1]);
    const fromYmd = `${yr}-01-01`;
    const toYmd = `${yr}-12-31`;
    return {
      label: `Year ${yr}`,
      fromYmd,
      toYmd: toYmd > todayYmd ? todayYmd : toYmd,
    };
  }

  return null;
}

type SaleRow = {
  sale_id: number;
  completed: boolean | null;
  voided: boolean | null;
  archived: boolean | null;
  total: number | null;
  calc_total: number | null;
  create_time_melbourne: string | null;
  complete_time_melbourne: string | null;
  time_stamp_melbourne: string | null;
  /** Full Lightspeed Sale JSON (minus SaleLines/SalePayments/Customer). Contains
   *  calcAvgCost, calcFIFOCost, calcDiscount, calcTax1, calcTax2, calcSubtotal, etc. */
  raw: Record<string, unknown> | null;
};

/** Extract a numeric field from the sale's raw JSON (camelCase Lightspeed field names). */
function rawNum(sale: SaleRow, key: string): number {
  if (!sale.raw) return 0;
  const v = sale.raw[key];
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

type SaleLineRow = {
  sale_line_id: number;
  sale_id: number;
  item_id: number | null;
  unit_quantity: number | null;
  unit_price: number | null;
  calc_line_total: number | null;
  is_layaway: boolean | null;
  note: string | null;
  /** Full Lightspeed SaleLine JSON — contains avgCost, fifoCost, calcTransactionDiscount, etc. */
  raw: Record<string, unknown> | null;
};

type ItemLookup = { description: string | null; custom_sku: string | null };

async function lookupItemDescriptions(
  supabase: SupabaseClient,
  brandKey: string,
  itemIds: number[],
): Promise<Map<number, ItemLookup>> {
  const map = new Map<number, ItemLookup>();
  const unique = [...new Set(itemIds)].filter((n) => n > 0);
  const chunkSize = 100;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data } = await supabase
      .from('nest_brand_lightspeed_item')
      .select('item_id, description, custom_sku')
      .eq('brand_key', brandKey)
      .in('item_id', chunk);
    for (const row of data ?? []) {
      map.set(Number(row.item_id), {
        description: typeof row.description === 'string' ? row.description : null,
        custom_sku: typeof row.custom_sku === 'string' ? row.custom_sku : null,
      });
    }
  }
  return map;
}

function saleTotal(s: SaleRow): number {
  const t = s.total ?? s.calc_total ?? 0;
  return typeof t === 'number' && Number.isFinite(t) ? t : 0;
}

function lineTotal(l: SaleLineRow): number {
  if (typeof l.calc_line_total === 'number' && Number.isFinite(l.calc_line_total)) return l.calc_line_total;
  const qty = l.unit_quantity ?? 1;
  const price = l.unit_price ?? 0;
  return qty * price;
}

function buildTopItemsSummary(
  lines: SaleLineRow[],
  itemMap: Map<number, ItemLookup>,
  maxItems = 15,
): string {
  const byItem = new Map<number, { desc: string; qty: number; rev: number; cost: number }>();
  for (const l of lines) {
    const id = l.item_id;
    if (!id || id <= 0) continue;
    const existing = byItem.get(id);
    const desc = itemMap.get(id)?.description ?? `Item #${id}`;
    const qty = l.unit_quantity ?? 1;
    const rev = lineTotal(l);
    // avgCost per unit × quantity = line cost
    const avgCostRaw = l.raw?.avgCost ?? l.raw?.avg_cost;
    const avgCostPerUnit = avgCostRaw != null ? parseFloat(String(avgCostRaw)) : 0;
    const lineCost = Number.isFinite(avgCostPerUnit) ? avgCostPerUnit * Math.abs(qty) : 0;
    if (existing) {
      existing.qty += qty;
      existing.rev += rev;
      existing.cost += lineCost;
    } else {
      byItem.set(id, { desc, qty, rev, cost: lineCost });
    }
  }

  const sorted = [...byItem.values()]
    .filter((r) => r.rev > 0)
    .sort((a, b) => b.rev - a.rev)
    .slice(0, maxItems);

  if (sorted.length === 0) return '';

  const itemLines = sorted.map((r) => {
    const profitStr = r.cost > 0
      ? ` | margin ${((( r.rev - r.cost) / r.rev) * 100).toFixed(0)}%`
      : '';
    return `  - ${r.desc} — ${r.qty} sold — ${formatAud(r.rev)}${profitStr}`;
  });
  return ['', '**Top items by revenue**', ...itemLines].join('\n');
}

function buildTopItemsSummaryFromSql(rows: LightspeedTopItemRow[]): string {
  if (rows.length === 0) return '';
  const itemLines = rows.map((row) => {
    const desc = row.item_description?.trim() || `Item #${row.item_id ?? '?'}`;
    const marginStr = row.total_cost > 0 ? ` | margin ${row.margin_pct.toFixed(0)}%` : '';
    return `  - ${desc} — ${row.qty_sold} sold — ${formatAud(row.total_revenue)}${marginStr}`;
  });
  return ['', '**Top items by revenue**', ...itemLines].join('\n');
}

function buildWeekdaySummaryFromSql(rows: LightspeedSalesWeekdayRow[]): string {
  if (rows.length < 3) return '';
  const ordered = [...rows].sort((a, b) => a.isodow - b.isodow);
  const sortedByRevenue = [...rows].sort((a, b) => b.avg_revenue - a.avg_revenue);
  const sortedByMargin = [...rows].sort((a, b) => b.margin_pct - a.margin_pct);
  const best = sortedByRevenue[0];
  const worst = sortedByRevenue[sortedByRevenue.length - 1];
  const bestMargin = sortedByMargin[0];

  const lines = ['', '**Sales by day of week**'];
  for (const row of ordered) {
    const marginStr = row.total_profit > 0 ? ` | ${row.margin_pct.toFixed(0)}% margin` : '';
    lines.push(`  - ${row.day_name}: avg ${formatAud(row.avg_revenue)}/day${marginStr} (${row.trading_days} trading day${row.trading_days === 1 ? '' : 's'})`);
  }
  lines.push('');
  lines.push(`Best revenue day: ${best.day_name} (avg ${formatAud(best.avg_revenue)})`);
  if (worst.day_name !== best.day_name) {
    lines.push(`Lowest revenue day: ${worst.day_name} (avg ${formatAud(worst.avg_revenue)})`);
  }
  if (bestMargin.day_name !== best.day_name && bestMargin.margin_pct > 0) {
    lines.push(`Best margin day: ${bestMargin.day_name} (${bestMargin.margin_pct.toFixed(0)}%)`);
  }
  return lines.join('\n');
}

function buildLayawaySummary(sales: SaleRow[], lines: SaleLineRow[], itemMap: Map<number, ItemLookup>): string {
  const layawayLinesBySale = new Map<number, SaleLineRow[]>();
  for (const l of lines) {
    if (!l.is_layaway) continue;
    const list = layawayLinesBySale.get(l.sale_id) ?? [];
    list.push(l);
    layawayLinesBySale.set(l.sale_id, list);
  }

  if (layawayLinesBySale.size === 0) return '';

  const layawaySales = sales.filter((s) => layawayLinesBySale.has(s.sale_id));
  let totalLayawayValue = 0;
  const itemLines: string[] = [];

  for (const s of layawaySales.slice(0, 20)) {
    const saleLines = layawayLinesBySale.get(s.sale_id) ?? [];
    for (const l of saleLines) {
      const desc = l.item_id && l.item_id > 0
        ? (itemMap.get(l.item_id)?.description ?? `Item #${l.item_id}`)
        : '(no item)';
      const val = lineTotal(l);
      totalLayawayValue += val;
      itemLines.push(`  - ${desc} — ${formatAud(l.unit_price ?? 0)} (Sale #${s.sale_id})`);
    }
  }

  return [
    '',
    '**Layaway / on-hold orders**',
    `${layawayLinesBySale.size} sale(s), total value ${formatAud(totalLayawayValue)}`,
    ...itemLines.slice(0, 20),
    layawayLinesBySale.size > 20 ? `  (${layawayLinesBySale.size} total; showing first 20)` : '',
  ].filter(Boolean).join('\n');
}

function isoWeekLabel(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  const dayOfWeek = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d.getTime() - dayOfWeek * 86_400_000);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  const fmt = (dt: Date) => `${dt.getUTCDate()}/${dt.getUTCMonth() + 1}`;
  return `${fmt(monday)}–${fmt(sunday)}`;
}

function buildDailyAggregation(sales: SaleRow[]): string {
  const byDay = new Map<string, { count: number; revenue: number }>();
  for (const s of sales) {
    if (s.completed !== true) continue;
    const dayKey = (s.complete_time_melbourne ?? s.create_time_melbourne ?? '').slice(0, 10);
    if (!dayKey) continue;
    const existing = byDay.get(dayKey) ?? { count: 0, revenue: 0 };
    existing.count++;
    existing.revenue += saleTotal(s);
    byDay.set(dayKey, existing);
  }
  if (byDay.size === 0) return '';
  const sorted = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const lines = sorted.map(([day, d]) => `  - ${melbourneLongDate(day)}: ${d.count} sales, ${formatAud(d.revenue)}`);
  return ['', '**Daily breakdown**', ...lines].join('\n');
}

function buildWeeklyAggregation(sales: SaleRow[]): string {
  const byWeek = new Map<string, { count: number; revenue: number; from: string; to: string }>();
  for (const s of sales) {
    if (s.completed !== true) continue;
    const dayKey = (s.complete_time_melbourne ?? s.create_time_melbourne ?? '').slice(0, 10);
    if (!dayKey) continue;
    const wk = isoWeekLabel(dayKey);
    const existing = byWeek.get(wk) ?? { count: 0, revenue: 0, from: dayKey, to: dayKey };
    existing.count++;
    existing.revenue += saleTotal(s);
    if (dayKey < existing.from) existing.from = dayKey;
    if (dayKey > existing.to) existing.to = dayKey;
    byWeek.set(wk, existing);
  }
  if (byWeek.size === 0) return '';
  const sorted = [...byWeek.entries()].sort((a, b) => a[1].from.localeCompare(b[1].from));
  const lines = sorted.map(([wk, d]) => `  - Week of ${wk}: ${d.count} sales, ${formatAud(d.revenue)}`);
  const bestWeek = sorted.reduce((best, curr) => curr[1].revenue > best[1].revenue ? curr : best, sorted[0]);
  lines.push(`  - Best week: ${bestWeek[0]} — ${formatAud(bestWeek[1].revenue)} (${bestWeek[1].count} sales)`);
  return ['', '**Weekly breakdown**', ...lines].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Live Lightspeed sales fetch (real-time, filtered by completeTime)
// Used when the mirror doesn't cover the requested date range, or for internal
// queries where accuracy matters more than latency.
// ─────────────────────────────────────────────────────────────────────────────

type DayStats = {
  rev: number; cost: number; count: number; weeks: Set<string>;
};

type LiveSaleSummary = {
  totalRevenue: number;
  totalCogs: number;      // calcAvgCost (falls back to calcFIFOCost when 0)
  totalProfit: number;
  grossMarginPct: number;
  totalDiscount: number;
  totalTax: number;
  totalSubtotal: number;
  completedCount: number;
  avgSale: number;
  topItems: Array<{ desc: string; qty: number; rev: number; cost: number }>;
  /** Day-of-week averages: key = 'Monday' … 'Sunday', value = avg revenue per trading day */
  byDayOfWeek: Record<string, { avgRev: number; avgProfit: number; marginPct: number; tradingDays: number }>;
  pagesFetched: number;
  truncated: boolean;     // true when we hit the page cap
  source: 'live';
};

/** Convert a YYYY-MM-DD to an ISO timestamp at midnight Melbourne time.
 *  Melbourne is AEDT (UTC+11) in summer, AEST (UTC+10) in winter.
 *  We use +11 for the lower bound and +10 for the upper bound so the window
 *  is always generous (never cuts off a genuine sale on the boundary date). */
function melbourneDayStart(ymd: string): string {
  return `${ymd}T00:00:00+11:00`; // always use DST (summer) offset for start → conservative
}
function melbourneDayEnd(ymd: string): string {
  return `${ymd}T23:59:59+10:00`; // always use standard offset for end → conservative
}

async function liveLightspeedSalesFetch(opts: {
  supabase: SupabaseClient;
  brandKey: string;
  fromYmd: string;
  toYmd: string;
  brandApiDebug?: BrandApiDebugCollector;
}): Promise<LiveSaleSummary | null> {
  // Load the Lightspeed connection + refresh token if needed
  const { data: connRow, error: connErr } = await opts.supabase
    .from('nest_brand_portal_connections')
    .select('brand_key, access_token, refresh_token, api_endpoint, access_expires_at')
    .eq('provider', LIGHTSPEED_PROVIDER)
    .eq('brand_key', opts.brandKey)
    .maybeSingle();
  if (connErr || !connRow) return null;

  let accessToken: string;
  let accountId: string;
  try {
    const t = await ensureValidLightspeedAccessToken(
      opts.supabase,
      connRow as LightspeedPortalConnection,
      opts.brandApiDebug,
    );
    accessToken = t.accessToken;
    accountId = t.accountId;
  } catch (err) {
    console.warn('[live-sales] token refresh failed:', (err as Error).message);
    return null;
  }

  // Build URL with a single completeTime >= filter.
  // Lightspeed doesn't reliably support two filters on the same field, so we
  // use only the lower-bound filter and stop fetching client-side when we pass
  // the end date. Results are sorted by completeTime ascending so stopping is safe.
  const fromIso = melbourneDayStart(opts.fromYmd);
  // toIso in UTC: end of the requested date in Melbourne is start of next day in UTC.
  // Use the day AFTER toYmd at midnight Melbourne (conservative upper bound for filtering).
  const toDateUtc = new Date(`${opts.toYmd}T23:59:59+10:00`).toISOString(); // latest AEST end
  const baseUrl = `${LIGHTSPEED_API_ORIGIN}/API/V3/Account/${encodeURIComponent(accountId)}/Sale.json`;

  const params = new URLSearchParams({
    completeTime: `>=,${fromIso}`,
    completed: 'true',
    archived: 'false',
    sort: 'completeTime',
    limit: '100',
    load_relations: '["SaleLines"]',
  });
  const initialUrl = `${baseUrl}?${params.toString()}`;

  // Aggregate totals across all pages
  let totalRevenue = 0;
  let totalAvgCost = 0;
  let totalFifoCost = 0;
  let totalDiscount = 0;
  let totalTax = 0;
  let totalSubtotal = 0;
  let completedCount = 0;
  // item-level: itemID → { desc, qty, rev, cost }
  const itemAgg = new Map<number, { desc: string; qty: number; rev: number; cost: number }>();
  // day-of-week aggregation: weekday name → DayStats
  const dowAgg = new Map<string, DayStats>();
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const MAX_PAGES = 50; // cap: 5,000 sales per live fetch
  let pagesFetched = 0;
  let truncated = false;
  let nextUrl: string | null = initialUrl;

  while (nextUrl && pagesFetched < MAX_PAGES) {
    let data: Record<string, unknown>;
    try {
      data = await lightspeedGetJson(accessToken, nextUrl, {
        max429Retries: 3,
        brandApiDebug: opts.brandApiDebug,
      });
    } catch (err) {
      console.warn('[live-sales] page fetch failed:', (err as Error).message);
      break;
    }

    const attrs = data['@attributes'] as Record<string, string> | undefined;
    const rawSales = data.Sale;
    const sales: Record<string, unknown>[] = Array.isArray(rawSales)
      ? (rawSales as Record<string, unknown>[])
      : rawSales && typeof rawSales === 'object'
        ? [rawSales as Record<string, unknown>]
        : [];

    // Client-side cutoff: stop when we've passed the end date.
    // Sales are sorted by completeTime ascending, so once we see one past the
    // end, all subsequent pages will also be past it.
    let passedEndDate = false;

    for (const sale of sales) {
      // completeTime used for both end-date cutoff and day-of-week bucketing.
      const completeTime = sale.completeTime as string | undefined;
      if (completeTime && completeTime > toDateUtc) {
        passedEndDate = true;
        break; // skip this and all subsequent sales
      }
      const p = (k: string) => {
        const v = sale[k];
        if (v == null) return 0;
        const n = parseNumberLoose(v);
        return n ?? 0;
      };
      const saleRev = p('calcTotal');
      const saleAvgCost = p('calcAvgCost');
      const saleFifoCost = p('calcFIFOCost');
      totalRevenue += saleRev;
      totalAvgCost += saleAvgCost;
      totalFifoCost += saleFifoCost;
      totalDiscount += p('calcDiscount');
      totalTax += p('calcTax1') + p('calcTax2');
      totalSubtotal += p('calcSubtotal');
      completedCount++;

      // Day-of-week bucketing using Melbourne time
      const ct = completeTime;
      if (ct) {
        const saleDate = new Date(ct);
        const melb = new Intl.DateTimeFormat('en-AU', {
          timeZone: 'Australia/Melbourne',
          weekday: 'long',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(saleDate);
        const dayName = melb.find((p) => p.type === 'weekday')?.value ?? WEEKDAYS[saleDate.getDay()];
        const dateKey = `${melb.find((p) => p.type === 'year')?.value}-${melb.find((p) => p.type === 'month')?.value}-${melb.find((p) => p.type === 'day')?.value}`;
        const saleCost = saleAvgCost > 0 ? saleAvgCost : saleFifoCost;
        const existing = dowAgg.get(dayName) ?? { rev: 0, cost: 0, count: 0, weeks: new Set<string>() };
        existing.rev += saleRev;
        existing.cost += saleCost;
        existing.count++;
        existing.weeks.add(dateKey.slice(0, 10)); // unique trading days
        dowAgg.set(dayName, existing);
      }

      // Per-item aggregation from SaleLines
      const saleLines = sale.SaleLines ?? sale.SaleLine;
      const lines = normaliseRelationArray<Record<string, unknown>>(saleLines, 'SaleLine');
      for (const line of lines) {
        const lp = (k: string) => {
          const v = line[k];
          if (v == null) return 0;
          const n = parseNumberLoose(v);
          return n ?? 0;
        };
        const itemIdRaw = line.itemID;
        const itemId = itemIdRaw != null ? Math.trunc(parseNumberLoose(itemIdRaw) ?? 0) : 0;
        if (!itemId || itemId <= 0) continue;
        const qty = lp('unitQuantity');
        const lineRev = lp('calcTotal') || (lp('unitPrice') * Math.abs(qty));
        const avgCostUnit = lp('avgCost');
        const lineCost = avgCostUnit * Math.abs(qty);

        // Try to get a label from the nested Item relation
        const itemRel = line.Item as Record<string, unknown> | undefined;
        const desc = (typeof itemRel?.description === 'string' && itemRel.description.trim())
          || (typeof line.description === 'string' && line.description.trim())
          || `Item #${itemId}`;

        const existing = itemAgg.get(itemId);
        if (existing) {
          existing.qty += qty;
          existing.rev += lineRev;
          existing.cost += lineCost;
          if (existing.desc.startsWith('Item #') && !desc.startsWith('Item #')) {
            existing.desc = desc; // upgrade stub label when real name arrives
          }
        } else {
          itemAgg.set(itemId, { desc, qty, rev: lineRev, cost: lineCost });
        }
      }
    }

    pagesFetched++;

    // If we hit a sale past the end date, stop fetching more pages.
    if (passedEndDate) {
      nextUrl = null;
      break;
    }

    const next = attrs?.next?.trim();
    nextUrl = next && next.length > 0 ? next : null;

    if (nextUrl && pagesFetched < MAX_PAGES) {
      await new Promise((r) => setTimeout(r, 300)); // gentle rate-limit guard
    }
  }

  if (nextUrl && pagesFetched >= MAX_PAGES) {
    truncated = true;
    console.warn(`[live-sales] page cap hit (${MAX_PAGES} pages) for ${opts.brandKey} ${opts.fromYmd}–${opts.toYmd}`);
  }

  if (completedCount === 0) {
    return {
      totalRevenue: 0, totalCogs: 0, totalProfit: 0, grossMarginPct: 0,
      totalDiscount: 0, totalTax: 0, totalSubtotal: 0,
      completedCount: 0, avgSale: 0, topItems: [], byDayOfWeek: {},
      pagesFetched, truncated, source: 'live',
    };
  }

  const totalCogs = totalAvgCost > 0 ? totalAvgCost : totalFifoCost;
  const totalProfit = totalRevenue - totalCogs;
  const grossMarginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const topItems = [...itemAgg.values()]
    .filter((r) => r.rev > 0)
    .sort((a, b) => b.rev - a.rev)
    .slice(0, 15);

  // Build day-of-week averages: average revenue per trading day for each weekday
  const byDayOfWeek: LiveSaleSummary['byDayOfWeek'] = {};
  for (const [day, stats] of dowAgg.entries()) {
    const tradingDays = stats.weeks.size; // distinct dates with at least 1 sale
    if (tradingDays === 0) continue;
    const avgRev = stats.rev / tradingDays;
    const avgCogs = stats.cost / tradingDays;
    const avgProfit = avgRev - avgCogs;
    const marginPct = avgRev > 0 ? (avgProfit / avgRev) * 100 : 0;
    byDayOfWeek[day] = { avgRev, avgProfit, marginPct, tradingDays };
  }

  return {
    totalRevenue,
    totalCogs,
    totalProfit,
    grossMarginPct,
    totalDiscount,
    totalTax,
    totalSubtotal,
    completedCount,
    avgSale: totalRevenue / completedCount,
    topItems,
    byDayOfWeek,
    pagesFetched,
    truncated,
    source: 'live',
  };
}

/** Format a `LiveSaleSummary` into the same prefix block style as the mirror path. */
function formatLiveSalesSummary(opts: {
  summary: LiveSaleSummary;
  dateWindow: { label: string; fromYmd: string; toYmd: string };
  todayLabel: string;
  todayWeekday: string;
  message: string;
}): string {
  const { summary, dateWindow, todayLabel, todayWeekday } = opts;
  const { totalRevenue, totalCogs, totalProfit, grossMarginPct, totalDiscount,
          totalTax, totalSubtotal, completedCount, avgSale, topItems, truncated } = summary;

  const hasCostData = totalCogs > 0;

  const header = [
    '[LIVE LIGHTSPEED SALES — fetched directly from Lightspeed API in real time using completeTime filter]',
    `Today (Melbourne): ${todayLabel} (${todayWeekday}).`,
    `Filter: completed sales from ${dateWindow.label} (${dateWindow.fromYmd} to ${dateWindow.toYmd}).`,
    ...(truncated ? [`⚠ Result is partial — too many pages to fetch in one call. Totals cover the first ~5,000 sales only.`] : []),
    '**For your reply**: **Bold only topic headings** (e.g. **Sales**, **Profit**, **Tax**). Figures plain. One bullet per line.',
    '',
  ];

  if (completedCount === 0) {
    return [
      ...header,
      '**Matching sales**\nNone.',
      `No completed sales found for ${dateWindow.label}. Either the shop was closed or no sales were recorded.`,
      '---',
      '',
    ].join('\n');
  }

  const summaryLines = [
    `**Summary**`,
    `- Completed sales: ${completedCount}`,
    `- Revenue (incl. GST): ${formatAud(totalRevenue)}`,
    ...(totalSubtotal > 0 && Math.abs(totalSubtotal - totalRevenue) > 0.01
      ? [`- Revenue excl. GST: ${formatAud(totalSubtotal)}`]
      : []),
    `- Average sale: ${formatAud(avgSale)}`,
    ...(totalDiscount > 0 ? [`- Total discounts given: ${formatAud(totalDiscount)}`] : []),
    ...(totalTax > 0 ? [`- GST / tax collected: ${formatAud(totalTax)}`] : []),
    ...(hasCostData
      ? [
          `- Cost of goods sold (avg): ${formatAud(totalCogs)}`,
          `- Gross profit: ${formatAud(totalProfit)}`,
          `- Gross margin: ${grossMarginPct.toFixed(1)}%`,
        ]
      : [
          `- Cost / profit: not calculable (no avg cost on record for these items)`,
        ]),
  ];

  const topItemLines = topItems.length > 0
    ? [
        '',
        '**Top items by revenue**',
        ...topItems.map((r) => {
          const marginStr = r.cost > 0
            ? ` | margin ${(((r.rev - r.cost) / r.rev) * 100).toFixed(0)}%`
            : '';
          return `  - ${r.desc} — ${r.qty} sold — ${formatAud(r.rev)}${marginStr}`;
        }),
      ]
    : [];

  // Day-of-week breakdown — only include when there is data for multiple days
  const dowEntries = Object.entries(summary.byDayOfWeek);
  const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dowLines: string[] = [];
  if (dowEntries.length >= 3) {
    // Sort by average revenue descending for ranking
    const sortedByRev = [...dowEntries].sort((a, b) => b[1].avgRev - a[1].avgRev);
    const sortedByMargin = [...dowEntries].sort((a, b) => b[1].marginPct - a[1].marginPct);
    // Ordered Mon→Sun for the table
    const ordered = DAY_ORDER.filter((d) => summary.byDayOfWeek[d]);

    dowLines.push('', '**Sales by day of week** (avg per trading day across this period)');
    for (const day of ordered) {
      const s = summary.byDayOfWeek[day];
      const marginStr = s.avgProfit > 0 ? ` | ${s.marginPct.toFixed(0)}% margin` : '';
      dowLines.push(`  - ${day}: ${formatAud(s.avgRev)} avg revenue${marginStr} (${s.tradingDays} day${s.tradingDays === 1 ? '' : 's'})`);
    }
    const best = sortedByRev[0];
    const worst = sortedByRev[sortedByRev.length - 1];
    const bestMarginDay = sortedByMargin[0];
    dowLines.push('');
    dowLines.push(`Best revenue day: ${best[0]} (avg ${formatAud(best[1].avgRev)})`);
    if (worst[0] !== best[0]) {
      dowLines.push(`Lowest revenue day: ${worst[0]} (avg ${formatAud(worst[1].avgRev)})`);
    }
    if (bestMarginDay[0] !== best[0] && bestMarginDay[1].marginPct > 0) {
      dowLines.push(`Best margin day: ${bestMarginDay[0]} (${bestMarginDay[1].marginPct.toFixed(0)}%)`);
    }
  }

  return [
    ...header,
    ...summaryLines,
    ...dowLines,
    ...topItemLines,
    '',
    '---',
    '',
  ].join('\n');
}

/**
 * When a message relates to sales / revenue / transactions, inject a factual block
 * from the mirrored Lightspeed sale + sale_line data in Supabase.
 */
export async function buildLightspeedSalesPrefix(opts: {
  supabase: SupabaseClient;
  brandKey: string;
  message: string;
  force?: boolean;
  brandApiDebug?: BrandApiDebugCollector;
}): Promise<string> {
  if (!opts.force && !messageSuggestsSalesQuery(opts.message)) return '';

  const now = new Date();
  const todayYmd = melbourneYmd(now);

  const { data: conn } = await opts.supabase
    .from('nest_brand_portal_connections')
    .select('api_endpoint')
    .eq('brand_key', opts.brandKey)
    .eq('provider', LIGHTSPEED_PROVIDER)
    .maybeSingle();

  const { count: totalSales, error: countErr } = await opts.supabase
    .from('nest_brand_lightspeed_sale')
    .select('*', { count: 'exact', head: true })
    .eq('brand_key', opts.brandKey);

  if (countErr) {
    console.error('[brand-lightspeed-sales] count error:', countErr.message);
    return [
      '[LIVE LIGHTSPEED SALES]',
      '**Sales lookup error** — could not read the mirrored Lightspeed sales table.',
      '---',
      '',
    ].join('\n');
  }

  const n = totalSales ?? 0;
  if (n === 0 && !conn) {
    return [
      '[LIVE LIGHTSPEED SALES]',
      '**Lightspeed is not connected** and there are **no sales records** in Nest yet.',
      'Ask the business to connect Lightspeed in the portal.',
      '---',
      '',
    ].join('\n');
  }

  if (n === 0) {
    return [
      '[LIVE LIGHTSPEED SALES]',
      'Lightspeed is connected, but **no sales rows** are stored yet.',
      'The sync job may still be running — try again later or sync from the portal.',
      '---',
      '',
    ].join('\n');
  }

  let dateWindow = resolveSalesDateWindow(opts.message);
  const isLayawayQuery = /\blayaway\b|\blay\s*away\b|\bon\s*hold\b/i.test(opts.message);

  // Day-of-week analysis queries ("best day", "worst day", "shut day", "by day") need
  // a multi-week window. We use the mirror (fast) rather than live API (slow). We flag
  // this with isDayOfWeekQuery and expand the mirror window below — NOT the live path.
  const isDayOfWeekQuery = /\b(?:best|worst|busiest|quietest|slow|busy)\s+day\b|\bday\s+of\s+(?:the\s+)?week\b|\bwhich\s+day\b|\bshut\s+(?:one|1|a)\s+day\b|\bclose\s+(?:one|1|a)\s+day\b|\btypically\b.*\bday\b|\bby\s+day\b/i.test(opts.message);

  // Retention window — sync keeps ~400 days.
  const RETENTION_DAYS_SALES = 400;
  const retentionCutoffYmd = melbourneYmd(new Date(now.getTime() - RETENTION_DAYS_SALES * 86_400_000));

  // Fetch the actual earliest sale in the DB so we can show the real coverage
  // instead of the theoretical retention window (the two can differ when
  // Lightspeed's timeStamp field on older records predates the sync cutoff).
  const { data: earliestRow } = await opts.supabase
    .from('nest_brand_lightspeed_sale')
    .select('complete_time_melbourne')
    .eq('brand_key', opts.brandKey)
    .not('complete_time_melbourne', 'is', null)
    .order('complete_time_melbourne', { ascending: true })
    .limit(1)
    .maybeSingle();
  const actualEarliestYmd = typeof earliestRow?.complete_time_melbourne === 'string'
    ? earliestRow.complete_time_melbourne.slice(0, 10)
    : retentionCutoffYmd;
  const { data: backfillRow } = await opts.supabase
    .from('nest_brand_lightspeed_backfill_state')
    .select('status, phase, sales_cursor_date')
    .eq('brand_key', opts.brandKey)
    .maybeSingle();

  // ── SQL-first path ────────────────────────────────────────────────────────
  // For all standard sales analytics queries, answer from the mirror-backed SQL
  // analytics layer. This is now the default read path. The old code below is
  // retained temporarily only for layaway/incomplete-sale handling.
  if (!isLayawayQuery) {
    let effectiveWindow = dateWindow;
    if (!effectiveWindow) {
      if (isDayOfWeekQuery) {
        const from90 = new Date(now.getTime() - 90 * 86_400_000);
        const mirrorFrom = melbourneYmd(from90);
        const effectiveFrom = actualEarliestYmd > mirrorFrom ? actualEarliestYmd : mirrorFrom;
        effectiveWindow = {
          label: `Last 90 days`,
          fromYmd: effectiveFrom,
          toYmd: todayYmd,
        };
      } else {
        effectiveWindow = {
          label: `Today (${melbourneLongDate(todayYmd)})`,
          fromYmd: todayYmd,
          toYmd: todayYmd,
        };
      }
    }

    if (effectiveWindow.toYmd < actualEarliestYmd) {
      return [
        '[LIGHTSPEED SALES — SQL MIRROR]',
        `Requested period: ${effectiveWindow.label} (${effectiveWindow.fromYmd} to ${effectiveWindow.toYmd}).`,
        `This mirror currently starts on ${melbourneLongDate(actualEarliestYmd)}.`,
        `That means data before ${actualEarliestYmd} is not in Nest yet for this brand.`,
        '---',
        '',
      ].join('\n');
    }

    const fromYmd = effectiveWindow.fromYmd < actualEarliestYmd ? actualEarliestYmd : effectiveWindow.fromYmd;
    const toYmd = effectiveWindow.toYmd;
    const todayLabel = melbourneLongDate(todayYmd);

    // Historical backfill runs oldest -> newest, while the recent incremental
    // mirror covers only the last ~400 days. During the backfill there can be a
    // temporary gap between the backfill cursor and the recent mirror window.
    // If the requested date falls in that gap, do not return a false zero.
    const salesCursorDate =
      backfillRow && typeof backfillRow.sales_cursor_date === 'string'
        ? backfillRow.sales_cursor_date
        : null;
    const backfillIsCatchingUp =
      salesCursorDate &&
      (backfillRow?.status === 'running' || backfillRow?.status === 'cancelling') &&
      backfillRow?.phase === 'sales' &&
      toYmd >= salesCursorDate &&
      fromYmd < retentionCutoffYmd;
    if (backfillIsCatchingUp) {
      const completedThrough = previousMonthEnd(salesCursorDate);
      return [
        '[LIGHTSPEED SALES — SQL MIRROR]',
        `Requested period: ${effectiveWindow.label} (${fromYmd} to ${toYmd}).`,
        `Historical sales backfill is still catching up. The mirror is complete through ${completedThrough}, and your requested date range has not been mirrored yet.`,
        `Recent data from about ${retentionCutoffYmd} onward is available, and older months will appear automatically as the backfill continues.`,
        '---',
        '',
      ].join('\n');
    }

    const summary = await fetchLightspeedSalesSummary(opts.supabase, opts.brandKey, fromYmd, toYmd);
    const weekdayRows =
      isDayOfWeekQuery || (new Date(toYmd + 'T12:00:00Z').getTime() - new Date(fromYmd + 'T12:00:00Z').getTime()) / 86_400_000 > 7
        ? await fetchLightspeedSalesByWeekday(opts.supabase, opts.brandKey, fromYmd, toYmd)
        : [];
    const topItemRows = await fetchLightspeedTopItems(opts.supabase, opts.brandKey, fromYmd, toYmd, 12);

    const hasCostData = summary.total_cogs > 0;
    const coverageNote = summary.mirror_start_date && fromYmd > summary.mirror_start_date
      ? null
      : summary.mirror_start_date
        ? `Snapshot coverage currently starts on ${summary.mirror_start_date}.`
        : null;

    const header = [
      '[LIGHTSPEED SALES — from Nest SQL mirror]',
      `Today (Melbourne): ${todayLabel} (${melbourneWeekday(now)}).`,
      `Filter: completed sales for ${effectiveWindow.label} (${fromYmd} to ${toYmd}).`,
      ...(coverageNote ? [coverageNote] : []),
      '**For your reply**: **Bold only topic headings**. Dollar amounts and items plain. Blank line between major blocks; one bullet per line.',
      '',
    ];

    if (summary.completed_sales === 0) {
      return [
        ...header,
        '**Matching sales**',
        'None.',
        `No completed sales found for ${effectiveWindow.label}.`,
        '---',
        '',
      ].join('\n');
    }

    const summaryLines = [
      '**Summary**',
      `- Completed sales: ${summary.completed_sales}`,
      `- Total revenue (incl. GST): ${formatAud(summary.total_revenue)}`,
      ...(summary.total_subtotal > 0 && Math.abs(summary.total_subtotal - summary.total_revenue) > 0.01
        ? [`- Revenue excl. tax: ${formatAud(summary.total_subtotal)}`]
        : []),
      `- Average sale: ${formatAud(summary.completed_sales > 0 ? summary.total_revenue / summary.completed_sales : 0)}`,
      `- Total items sold: ${Math.round(summary.total_items_sold)}`,
      ...(summary.total_discount > 0 ? [`- Total discounts given: ${formatAud(summary.total_discount)}`] : []),
      ...(summary.total_tax > 0 ? [`- GST / tax collected: ${formatAud(summary.total_tax)}`] : []),
      ...(hasCostData
        ? [
            `- Cost of goods sold (avg): ${formatAud(summary.total_cogs)}`,
            `- Gross profit: ${formatAud(summary.gross_profit)}`,
            `- Gross margin: ${summary.gross_margin_pct.toFixed(1)}%`,
          ]
        : ['- Cost / profit: not available (no avg cost recorded for these items)']),
    ];

    let sqlWeekdayLines: string[] = [];
    if (weekdayRows.length >= 3) {
      sqlWeekdayLines = buildWeekdaySummaryFromSql(weekdayRows).split('\n');
    }

    let recommendationLines: string[] = [];
    if (/\bshut\b|\bclose\b/i.test(opts.message) && weekdayRows.length >= 3) {
      const sorted = [...weekdayRows].sort((a, b) => a.avg_revenue - b.avg_revenue);
      const weakest = sorted[0];
      recommendationLines = [
        '',
        '**Decision support**',
        `- Pure sales answer only: ${weakest.day_name} is the weakest revenue day (${formatAud(weakest.avg_revenue)}/day)`,
        '- To decide whether to shut that day, also compare workshop load, deliveries, and roster cost',
      ];
    }

    const topItemsBlock = buildTopItemsSummaryFromSql(topItemRows);

    return [
      ...header,
      ...summaryLines,
      ...sqlWeekdayLines,
      ...recommendationLines,
      topItemsBlock,
      '',
      '---',
      '',
    ].join('\n');
  }

  // ── Live API path (real-time, uses completeTime filter) ──────────────────
  // When a specific date window is requested, use the live Lightspeed API
  // so data is authoritative and covers any historical period (e.g. "Jan").
  // Exceptions: day-of-week queries and layaway queries use the mirror (faster).
  if (dateWindow && !isLayawayQuery && !isDayOfWeekQuery) {
    const liveSummary = await liveLightspeedSalesFetch({
      supabase: opts.supabase,
      brandKey: opts.brandKey,
      fromYmd: dateWindow.fromYmd,
      toYmd: dateWindow.toYmd,
      brandApiDebug: opts.brandApiDebug,
    });

    if (liveSummary === null) {
      return [
        '[LIVE LIGHTSPEED SALES]',
        `**Requested period**: ${dateWindow.label}.`,
        `**Lightspeed connection error**: Could not connect to Lightspeed to fetch live data. Check the connection in the portal.`,
        '---',
        '',
      ].join('\n');
    }

    return formatLiveSalesSummary({
      summary: liveSummary,
      dateWindow,
      todayLabel: melbourneLongDate(todayYmd),
      todayWeekday: melbourneWeekday(now),
      message: opts.message,
    });
  }

  if (!dateWindow && opts.force && !isLayawayQuery) {
    if (isDayOfWeekQuery) {
      // Day-of-week analysis: use all available mirror data (up to 90 days) to
      // compute per-weekday averages. The mirror is fast (~1s). No live API needed.
      const from90 = new Date(now.getTime() - 90 * 86_400_000);
      const mirrorFrom = melbourneYmd(from90);
      // If actualEarliestYmd is newer than 90 days ago, use that as the start.
      const effectiveFrom = actualEarliestYmd > mirrorFrom ? actualEarliestYmd : mirrorFrom;
      dateWindow = {
        label: `Last 90 days (mirror: ${effectiveFrom} to ${todayYmd})`,
        fromYmd: effectiveFrom,
        toYmd: todayYmd,
      };
      // Stay in mirror path — do NOT hit the live API for this.
      // We handle this by NOT returning from the live path below.
      // The `dateWindow` is now set, but we skip the live API for day-of-week queries.
    }
    // Otherwise (no date, not day-of-week): fall through to mirror with today-only filter.
  }

  let saleQuery = opts.supabase
    .from('nest_brand_lightspeed_sale')
    .select(
      // Include `raw` so we can extract calcAvgCost, calcFIFOCost, calcDiscount,
      // calcTax1, calcTax2 for profit / margin / tax / discount calculations.
      'sale_id, completed, voided, archived, total, calc_total, create_time_melbourne, complete_time_melbourne, time_stamp_melbourne, raw',
    )
    .eq('brand_key', opts.brandKey)
    .eq('voided', false);

  if (dateWindow) {
    saleQuery = saleQuery
      .gte('complete_time_melbourne', dateWindow.fromYmd)
      .lt('complete_time_melbourne', dateWindow.toYmd + 'z');
  } else if (!isLayawayQuery) {
    saleQuery = saleQuery
      .gte('complete_time_melbourne', todayYmd)
      .lt('complete_time_melbourne', todayYmd + 'z');
  }

  saleQuery = saleQuery.order('complete_time_melbourne', { ascending: false, nullsFirst: true });

  const queryLimit = dateWindow && dateWindow.label !== `Today (${melbourneLongDate(todayYmd)})` ? 500 : 200;
  const { data: rawSales, error: saleErr } = await saleQuery.limit(queryLimit);
  if (saleErr) {
    console.error('[brand-lightspeed-sales] sale select error:', saleErr.message);
    return [
      '[LIVE LIGHTSPEED SALES]',
      `**Query error**: ${saleErr.message}`,
      '---',
      '',
    ].join('\n');
  }

  let sales = (rawSales ?? []) as SaleRow[];

  if (isLayawayQuery && !dateWindow) {
    const { data: layawaySales } = await opts.supabase
      .from('nest_brand_lightspeed_sale')
      .select(
        'sale_id, completed, voided, archived, total, calc_total, create_time_melbourne, complete_time_melbourne, time_stamp_melbourne',
      )
      .eq('brand_key', opts.brandKey)
      .eq('voided', false)
      .eq('completed', false)
      .order('create_time_melbourne', { ascending: false, nullsFirst: true })
      .limit(100);
    sales = (layawaySales ?? []) as SaleRow[];
  }

  const saleIds = sales.map((s) => s.sale_id);

  let allLines: SaleLineRow[] = [];
  if (saleIds.length > 0) {
    const lineChunkSize = 50;
    for (let i = 0; i < saleIds.length; i += lineChunkSize) {
      const chunk = saleIds.slice(i, i + lineChunkSize);
      const { data: lineData } = await opts.supabase
        .from('nest_brand_lightspeed_sale_line')
        .select('sale_line_id, sale_id, item_id, unit_quantity, unit_price, calc_line_total, is_layaway, note, raw')
        .eq('brand_key', opts.brandKey)
        .in('sale_id', chunk);
      allLines.push(...((lineData ?? []) as SaleLineRow[]));
    }
  }

  const itemIds = allLines.map((l) => l.item_id).filter((id): id is number => id != null && id > 0);
  const itemMap = itemIds.length > 0
    ? await lookupItemDescriptions(opts.supabase, opts.brandKey, itemIds)
    : new Map<number, ItemLookup>();

  const todayLabel = melbourneLongDate(todayYmd);

  const completedSales = sales.filter((s) => s.completed === true);
  const incompleteSales = sales.filter((s) => s.completed !== true);

  const totalRevenue = completedSales.reduce((sum, s) => sum + saleTotal(s), 0);
  const completedCount = completedSales.length;
  const avgSale = completedCount > 0 ? totalRevenue / completedCount : 0;

  const totalItems = allLines.reduce((sum, l) => sum + (l.unit_quantity ?? 1), 0);

  // ── Financial metrics from the raw Lightspeed Sale JSON ──────────────────
  // calcAvgCost = total avg cost of goods sold across all lines
  // calcFIFOCost = total FIFO cost (use avg unless avg is 0)
  // Profit = Revenue − COGS; Margin % = Profit / Revenue × 100
  const totalAvgCost = completedSales.reduce((sum, s) => sum + rawNum(s, 'calcAvgCost'), 0);
  const totalFifoCost = completedSales.reduce((sum, s) => sum + rawNum(s, 'calcFIFOCost'), 0);
  const totalCogs = totalAvgCost > 0 ? totalAvgCost : totalFifoCost;
  const totalProfit = totalRevenue - totalCogs;
  const grossMarginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const totalDiscount = completedSales.reduce((sum, s) => sum + rawNum(s, 'calcDiscount'), 0);
  const totalTax = completedSales.reduce(
    (sum, s) => sum + rawNum(s, 'calcTax1') + rawNum(s, 'calcTax2'),
    0,
  );
  const totalSubtotal = completedSales.reduce((sum, s) => sum + rawNum(s, 'calcSubtotal'), 0);

  // Flag whether cost data is actually available (some items may have $0 avg cost)
  const hasCostData = totalCogs > 0;

  // ── Day-of-week aggregation from mirror data (for "best day" style queries) ─
  const DAY_ORDER_MIRROR = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dowMirror = new Map<string, { rev: number; cost: number; days: Set<string> }>();
  if (isDayOfWeekQuery) {
    for (const s of completedSales) {
      const dateStr = s.complete_time_melbourne?.slice(0, 10);
      if (!dateStr) continue;
      const dayName = new Intl.DateTimeFormat('en-AU', {
        timeZone: 'Australia/Melbourne',
        weekday: 'long',
      }).format(new Date(dateStr + 'T12:00:00Z'));
      const srev = saleTotal(s);
      const scost = rawNum(s, 'calcAvgCost') || rawNum(s, 'calcFIFOCost');
      const existing = dowMirror.get(dayName) ?? { rev: 0, cost: 0, days: new Set<string>() };
      existing.rev += srev;
      existing.cost += scost;
      existing.days.add(dateStr);
      dowMirror.set(dayName, existing);
    }
  }

  const filterLabel = dateWindow
    ? `Filter: sales completed on ${dateWindow.label}.`
    : isLayawayQuery
      ? 'Filter: incomplete / layaway sales (not yet fully paid).'
      : `Filter: sales completed today (${todayLabel}).`;

  const header = [
    "[LIVE LIGHTSPEED SALES — from Nest's latest Lightspeed snapshot in Supabase; not a live POS lookup]",
    `Today (Melbourne): ${todayLabel} (${melbourneWeekday(now)}).`,
    `Snapshot coverage: sales from **${melbourneLongDate(actualEarliestYmd)}** through today. Do NOT say coverage is "only 30 days" — the actual data starts from ${actualEarliestYmd}. Data before that date is not in the snapshot.`,
    `Available financial fields (all from Lightspeed API): revenue (calcTotal), subtotal (excl. tax), GST/tax (calcTax1+calcTax2), discounts (calcDiscount), cost of goods (calcAvgCost/calcFIFOCost), gross profit = revenue − COGS, gross margin %. All these are in the Summary below when applicable.`,
    '**For your reply**: **Bold only topic headings** (e.g. **Sales**, **Profit**, **Tax**). Dollar amounts and line items plain. Blank line between major blocks; one bullet per line. Prices are AUD (tax inclusive).',
    '',
    `Total sale rows in snapshot: ${n}.`,
    filterLabel,
    '',
  ];

  if (sales.length === 0) {
    const noDataReason = dateWindow
      ? `No completed sales found for ${dateWindow.label} (${dateWindow.fromYmd} to ${dateWindow.toYmd}). The snapshot starts from ${actualEarliestYmd} — if the requested period is before that, the data simply isn't in Nest yet. If it's within that range, the shop had no completed sales recorded.`
      : isLayawayQuery
        ? 'No layaway / incomplete sales found.'
        : 'No completed sales found for today (the shop may not have opened yet, or sync is pending).';
    return [
      ...header,
      '**Matching sales**\nNone.',
      noDataReason,
      '---',
      '',
    ].join('\n');
  }

  const summaryLines = [
    `**Summary**`,
    `- Completed sales: ${completedCount}`,
    `- Total revenue (incl. GST): ${formatAud(totalRevenue)}`,
    ...(totalSubtotal > 0 && totalSubtotal !== totalRevenue
      ? [`- Revenue excl. tax: ${formatAud(totalSubtotal)}`]
      : []),
    `- Average sale: ${formatAud(avgSale)}`,
    `- Total items sold: ${Math.round(totalItems)}`,
    ...(totalDiscount > 0 ? [`- Total discounts given: ${formatAud(totalDiscount)}`] : []),
    ...(totalTax > 0 ? [`- GST / tax collected: ${formatAud(totalTax)}`] : []),
    // Profit / margin — only include when cost data is present
    ...(hasCostData
      ? [
          `- Cost of goods sold (avg): ${formatAud(totalCogs)}`,
          `- Gross profit: ${formatAud(totalProfit)}`,
          `- Gross margin: ${grossMarginPct.toFixed(1)}%`,
        ]
      : [
          `- Cost / profit: not available (no avg cost recorded for these items — check Lightspeed item cost settings)`,
        ]),
  ];

  if (incompleteSales.length > 0) {
    summaryLines.push(`- Incomplete / layaway sales: ${incompleteSales.length}`);
  }

  const topItems = buildTopItemsSummary(allLines.filter((l) => !l.is_layaway), itemMap);
  const layaway = buildLayawaySummary(sales, allLines, itemMap);

  // Build day-of-week section for mirror path (only when isDayOfWeekQuery)
  const dowMirrorLines: string[] = [];
  if (isDayOfWeekQuery && dowMirror.size >= 3) {
    const sortedByRev = [...dowMirror.entries()]
      .sort((a, b) => (b[1].rev / b[1].days.size) - (a[1].rev / a[1].days.size));
    const sortedByMargin = [...dowMirror.entries()]
      .sort((a, b) => {
        const bMargin = b[1].cost > 0 ? (b[1].rev - b[1].cost) / b[1].rev : 0;
        const aMargin = a[1].cost > 0 ? (a[1].rev - a[1].cost) / a[1].rev : 0;
        return bMargin - aMargin;
      });
    const best = sortedByRev[0];
    const worst = sortedByRev[sortedByRev.length - 1];

    dowMirrorLines.push('', `**Sales by day of week** (mirror data: ${actualEarliestYmd} to ${todayYmd})`);
    const ordered = DAY_ORDER_MIRROR.filter((d) => dowMirror.has(d));
    for (const day of ordered) {
      const s = dowMirror.get(day)!;
      const avgRev = s.rev / s.days.size;
      const avgCost = s.cost / s.days.size;
      const profit = avgRev - avgCost;
      const marginStr = avgCost > 0 ? ` | ${((profit / avgRev) * 100).toFixed(0)}% margin` : '';
      dowMirrorLines.push(`  - ${day}: avg ${formatAud(avgRev)}/day${marginStr} (${s.days.size} trading day${s.days.size === 1 ? '' : 's'})`);
    }
    dowMirrorLines.push('');
    dowMirrorLines.push(`Best revenue day: ${best[0]} (avg ${formatAud(best[1].rev / best[1].days.size)})`);
    if (worst[0] !== best[0]) {
      dowMirrorLines.push(`Lowest revenue day: ${worst[0]} (avg ${formatAud(worst[1].rev / worst[1].days.size)}) — best candidate to close`);
    }
    if (sortedByMargin[0]?.[0] !== best[0] && (sortedByMargin[0]?.[1].cost ?? 0) > 0) {
      const bm = sortedByMargin[0];
      const bmMargin = ((bm[1].rev - bm[1].cost) / bm[1].rev * 100).toFixed(0);
      dowMirrorLines.push(`Best margin day: ${bm[0]} (${bmMargin}%)`);
    }
  }

  const windowDays = dateWindow
    ? Math.max(1, Math.round((new Date(dateWindow.toYmd + 'T12:00:00Z').getTime() - new Date(dateWindow.fromYmd + 'T12:00:00Z').getTime()) / 86_400_000) + 1)
    : 1;
  const isWideWindow = windowDays > 7;

  const aggregation = isWideWindow
    ? buildWeeklyAggregation(completedSales) + buildDailyAggregation(completedSales)
    : '';

  const saleDetails: string[] = [];
  const maxDetails = isWideWindow ? 10 : 30;
  const salesToShow = completedSales.slice(0, maxDetails);
  if (salesToShow.length > 0) {
    saleDetails.push('', `**${isWideWindow ? 'Most recent' : 'Recent'} completed sales**`);
    for (const s of salesToShow) {
      const t = saleTotal(s);
      const time = s.complete_time_melbourne ?? s.create_time_melbourne ?? '—';
      const saleLines = allLines.filter((l) => l.sale_id === s.sale_id && !l.is_layaway);
      const itemDescs = saleLines.slice(0, 5).map((l) => {
        const desc = l.item_id && l.item_id > 0
          ? (itemMap.get(l.item_id)?.description ?? `Item #${l.item_id}`)
          : l.note ?? '(item)';
        return desc;
      });
      const itemList = itemDescs.length > 0 ? ` — ${itemDescs.join(', ')}` : '';
      const more = saleLines.length > 5 ? ` (+${saleLines.length - 5} more)` : '';
      saleDetails.push(`- Sale #${s.sale_id} — ${formatAud(t)} — ${time}${itemList}${more}`);
    }
    if (completedSales.length > maxDetails) {
      saleDetails.push(`(${completedSales.length} total; showing ${maxDetails} most recent)`);
    }
  }

  return [
    ...header,
    ...summaryLines,
    ...dowMirrorLines,
    aggregation,
    topItems,
    layaway,
    ...saleDetails,
    '',
    '---',
    '',
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Item keyword sales search
// Answers questions like "how many glasses have we sold this year?" or
// "when do we sell the most general services?" by searching the item catalog
// for matching descriptions and summing sales line quantities + revenue.
// ─────────────────────────────────────────────────────────────────────────────

export async function buildLightspeedItemSalesPrefix(opts: {
  supabase: SupabaseClient;
  brandKey: string;
  keyword: string;         // free-text keyword to search in item description
  fromYmd: string;         // date range start YYYY-MM-DD
  toYmd: string;           // date range end YYYY-MM-DD
  dateLabel: string;       // human label e.g. "this year", "last 3 months"
  brandApiDebug?: BrandApiDebugCollector;
}): Promise<string> {
  const now = new Date();
  const todayLabel = melbourneLongDate(melbourneYmd(now));

  // 1. Find matching items in the mirror item catalog (case-insensitive keyword match)
  const likePattern = `%${opts.keyword}%`;
  const { data: matchingItems, error: itemErr } = await opts.supabase
    .from('nest_brand_lightspeed_item')
    .select('item_id, description, custom_sku, default_price')
    .eq('brand_key', opts.brandKey)
    .ilike('description', likePattern)
    .limit(100);

  if (itemErr) {
    return [
      '[LIVE LIGHTSPEED ITEM SALES]',
      `Item catalog search error: ${itemErr.message}`,
      '---',
      '',
    ].join('\n');
  }

  const items = (matchingItems ?? []) as Array<{
    item_id: number;
    description: string | null;
    custom_sku: string | null;
    default_price: number | null;
  }>;

  if (items.length === 0) {
    return [
      '[LIVE LIGHTSPEED ITEM SALES]',
      `No items in the catalog match "${opts.keyword}".`,
      `Try a different keyword — check Lightspeed item descriptions for the exact naming used.`,
      '---',
      '',
    ].join('\n');
  }

  const itemIds = items.map((i) => i.item_id).filter((id) => id > 0);

  // 2. Sum sale lines for those item IDs over the date range from the mirror
  // Use the live API path if needed (when from < actualEarliestYmd)
  const { data: earliestRow } = await opts.supabase
    .from('nest_brand_lightspeed_sale')
    .select('complete_time_melbourne')
    .eq('brand_key', opts.brandKey)
    .not('complete_time_melbourne', 'is', null)
    .order('complete_time_melbourne', { ascending: true })
    .limit(1)
    .maybeSingle();
  const actualEarliestYmd = typeof earliestRow?.complete_time_melbourne === 'string'
    ? earliestRow.complete_time_melbourne.slice(0, 10)
    : opts.fromYmd;

  let totalQty = 0;
  let totalRev = 0;
  let matchedCount = 0;

  // Day-of-week breakdown for "when do we sell more X" queries
  const dowQty = new Map<string, number>();
  const dowRev = new Map<string, { rev: number; days: Set<string> }>();

  // Always use mirror for item search — live API is too slow for large date ranges.
  // Note any coverage gap so the AI can tell the user what period is included.
  const coverageNote = opts.fromYmd < actualEarliestYmd
    ? `Mirror data starts from ${actualEarliestYmd} (not ${opts.fromYmd}). Count only covers ${actualEarliestYmd} to ${opts.toYmd}.`
    : '';
  // Clamp the search window to what the mirror actually has
  const searchFrom = opts.fromYmd < actualEarliestYmd ? actualEarliestYmd : opts.fromYmd;

  const chunkSize = 50;
  for (let i = 0; i < itemIds.length; i += chunkSize) {
    const chunk = itemIds.slice(i, i + chunkSize);
    const { data: lines } = await opts.supabase
      .from('nest_brand_lightspeed_sale_line')
      .select('sale_id, item_id, unit_quantity, calc_line_total')
      .eq('brand_key', opts.brandKey)
      .in('item_id', chunk);

    if (!lines?.length) continue;

    const saleIds = [...new Set(lines.map((l) => (l as Record<string, unknown>).sale_id as number))];
    const { data: salesForDate } = await opts.supabase
      .from('nest_brand_lightspeed_sale')
      .select('sale_id, complete_time_melbourne')
      .eq('brand_key', opts.brandKey)
      .eq('voided', false)
      .eq('completed', true)
      .gte('complete_time_melbourne', searchFrom)
      .lt('complete_time_melbourne', opts.toYmd + 'z')
      .in('sale_id', saleIds.slice(0, 200));

    const validSaleIds = new Set((salesForDate ?? []).map((s) => (s as Record<string, unknown>).sale_id as number));
    const saleDateMap = new Map<number, string>();
    for (const s of salesForDate ?? []) {
      const sr = s as Record<string, unknown>;
      saleDateMap.set(sr.sale_id as number, (sr.complete_time_melbourne as string)?.slice(0, 10));
    }

    for (const line of lines) {
      const l = line as Record<string, unknown>;
      const sid = l.sale_id as number;
      if (!validSaleIds.has(sid)) continue;
      const qty = typeof l.unit_quantity === 'number' ? l.unit_quantity : Number(l.unit_quantity ?? 0);
      const rev = typeof l.calc_line_total === 'number' ? l.calc_line_total : Number(l.calc_line_total ?? 0);
      totalQty += Math.abs(qty);
      totalRev += rev;
      matchedCount++;

      const dateStr = saleDateMap.get(sid);
      if (dateStr) {
        const dayOfWeek = new Intl.DateTimeFormat('en-AU', {
          timeZone: 'Australia/Melbourne', weekday: 'long',
        }).format(new Date(dateStr + 'T12:00:00Z'));
        dowQty.set(dayOfWeek, (dowQty.get(dayOfWeek) ?? 0) + Math.abs(qty));
        const existing = dowRev.get(dayOfWeek) ?? { rev: 0, days: new Set<string>() };
        existing.rev += rev;
        existing.days.add(dateStr);
        dowRev.set(dayOfWeek, existing);
      }
    }
  }

  // Build the items table
  const itemTable = items.slice(0, 20).map((item) => {
    const priceStr = item.default_price != null ? ` — ${formatAud(item.default_price)}` : '';
    return `  - ${item.description ?? '(no description)'}${priceStr}`;
  });

  // Day-of-week ranking
  const dowLines: string[] = [];
  if (dowRev.size >= 2) {
    const sorted = [...dowRev.entries()]
      .sort((a, b) => b[1].rev - a[1].rev);
    dowLines.push('', `**When we sell "${opts.keyword}" most** (by weekday)`);
    for (const [day, stats] of sorted) {
      const daysCount = stats.days.size;
      const avgRev = daysCount > 0 ? stats.rev / daysCount : 0;
      const qty = dowQty.get(day) ?? 0;
      dowLines.push(`  - ${day}: ${qty} units, avg ${formatAud(avgRev)}/day (${daysCount} trading day${daysCount === 1 ? '' : 's'})`);
    }
  }

  return [
    `[LIGHTSPEED ITEM SALES — keyword: "${opts.keyword}", period: ${opts.dateLabel}]`,
    `Today (Melbourne): ${todayLabel}.`,
    `Matched ${items.length} item${items.length === 1 ? '' : 's'} in catalog containing "${opts.keyword}".`,
    ...(coverageNote ? [`⚠ Coverage note: ${coverageNote}`] : []),
    '',
    `**Sales summary for "${opts.keyword}" (${opts.dateLabel})**`,
    `- Total units sold: ${totalQty}`,
    ...(totalRev > 0 ? [`- Total revenue: ${formatAud(totalRev)}`] : []),
    '',
    `**Matching items in catalog**`,
    ...itemTable,
    ...(items.length > 20 ? [`  (${items.length} total; showing first 20)`] : []),
    ...dowLines,
    '',
    '---',
    '',
  ].join('\n');
}

export async function buildLightspeedItemSalesPrefixSql(opts: {
  supabase: SupabaseClient;
  brandKey: string;
  keyword: string;
  fromYmd: string;
  toYmd: string;
  dateLabel: string;
}): Promise<string> {
  const now = new Date();
  const todayLabel = melbourneLongDate(melbourneYmd(now));
  const retentionCutoffYmd = melbourneYmd(new Date(now.getTime() - 400 * 86_400_000));
  const { data: backfillRow } = await opts.supabase
    .from('nest_brand_lightspeed_backfill_state')
    .select('status, phase, sales_cursor_date')
    .eq('brand_key', opts.brandKey)
    .maybeSingle();
  const salesCursorDate =
    backfillRow && typeof backfillRow.sales_cursor_date === 'string'
      ? backfillRow.sales_cursor_date
      : null;
  const backfillIsCatchingUp =
    salesCursorDate &&
    (backfillRow?.status === 'running' || backfillRow?.status === 'cancelling') &&
    backfillRow?.phase === 'sales' &&
    opts.toYmd >= salesCursorDate &&
    opts.fromYmd < retentionCutoffYmd;
  if (backfillIsCatchingUp) {
    const completedThrough = previousMonthEnd(salesCursorDate);
    return [
      '[LIGHTSPEED ITEM SALES — SQL MIRROR]',
      `Keyword: "${opts.keyword}". Period: ${opts.dateLabel} (${opts.fromYmd} to ${opts.toYmd}).`,
      `Historical sales backfill is still catching up. The mirror is complete through ${completedThrough}, so this item-sales query is not reliable for the requested date range yet.`,
      '---',
      '',
    ].join('\n');
  }

  const items = await searchLightspeedInventory(opts.supabase, opts.brandKey, opts.keyword, 100);
  if (items.length === 0) {
    return [
      '[LIGHTSPEED ITEM SALES — SQL MIRROR]',
      `No items in the mirrored catalog match "${opts.keyword}".`,
      `Try a different keyword or the exact wording used in Lightspeed.`,
      '---',
      '',
    ].join('\n');
  }

  const summary = await fetchLightspeedItemSalesSummary(
    opts.supabase,
    opts.brandKey,
    opts.fromYmd,
    opts.toYmd,
    opts.keyword,
  );
  const weekdayRows = await fetchLightspeedItemSalesByWeekday(
    opts.supabase,
    opts.brandKey,
    opts.fromYmd,
    opts.toYmd,
    opts.keyword,
  );

  const coverageNote = summary.mirror_start_date && opts.fromYmd < summary.mirror_start_date
    ? `Mirror data starts from ${summary.mirror_start_date}. Anything before that is not included in this count.`
    : null;

  const itemTable = items.slice(0, 20).map((item) => {
    const priceStr = item.default_price != null ? ` — ${formatAud(item.default_price)}` : '';
    const stockStr = item.qoh != null ? ` — ${item.qoh} in stock` : '';
    return `  - ${item.description ?? '(no description)'}${priceStr}${stockStr}`;
  });

  const dowLines: string[] = [];
  if (weekdayRows.length >= 2) {
    const sorted = [...weekdayRows].sort((a, b) => b.avg_revenue_per_day - a.avg_revenue_per_day);
    dowLines.push('', `**When we sell "${opts.keyword}" most** (by weekday)`);
    for (const row of sorted) {
      dowLines.push(`  - ${row.day_name}: ${row.total_units_sold} units, avg ${formatAud(row.avg_revenue_per_day)}/day (${row.trading_days} trading day${row.trading_days === 1 ? '' : 's'})`);
    }
  }

  return [
    '[LIGHTSPEED ITEM SALES — SQL MIRROR]',
    `Today (Melbourne): ${todayLabel}.`,
    `Keyword: "${opts.keyword}". Period: ${opts.dateLabel} (${opts.fromYmd} to ${opts.toYmd}).`,
    ...(coverageNote ? [coverageNote] : []),
    '',
    `**Sales summary for "${opts.keyword}"**`,
    `- Matching catalog items: ${summary.matched_item_count}`,
    `- Total units sold: ${summary.total_units_sold}`,
    ...(summary.total_revenue > 0 ? [`- Total revenue: ${formatAud(summary.total_revenue)}`] : []),
    '',
    '**Matching items in catalog**',
    ...itemTable,
    ...(items.length > 20 ? [`  (${items.length} total; showing first 20)`] : []),
    ...dowLines,
    '',
    '---',
    '',
  ].join('\n');
}
