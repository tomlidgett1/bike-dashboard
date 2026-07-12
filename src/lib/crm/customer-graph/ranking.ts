import type {
  CustomerSearchSort,
  KeysetCursor,
  TaskPriority,
  TodayItem,
} from "./types";

export type CustomerSortRecord = {
  id: string;
  displayName: string;
  totalSpend: number;
  lastPurchaseAt: string | null;
  updatedAt: string;
};

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  urgent: 400,
  high: 300,
  normal: 200,
  low: 100,
};

function dateWeight(value: string | null, nowMs: number): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 0;
  const hoursUntilDue = (timestamp - nowMs) / 3_600_000;
  if (hoursUntilDue < 0) return Math.min(200, 100 + Math.abs(hoursUntilDue));
  if (hoursUntilDue <= 24) return 80 - hoursUntilDue;
  return Math.max(0, 30 - hoursUntilDue / 24);
}

export function todayItemRank(item: TodayItem, now = new Date()): number {
  const sourceWeight = item.source === "enquiry" ? 60 : item.source === "task" ? 30 : 40;
  const approvalWeight = item.riskTier === "approval" || item.riskTier === "restricted" ? 25 : 0;
  return PRIORITY_WEIGHT[item.priority] + sourceWeight + approvalWeight + dateWeight(item.dueAt, now.getTime());
}

export function rankTodayItems(items: TodayItem[], now = new Date()): TodayItem[] {
  return [...items].sort((left, right) => {
    const rankDifference = todayItemRank(right, now) - todayItemRank(left, now);
    if (rankDifference !== 0) return rankDifference;
    const dueDifference = String(left.dueAt ?? "9999").localeCompare(String(right.dueAt ?? "9999"));
    if (dueDifference !== 0) return dueDifference;
    const createdDifference = right.createdAt.localeCompare(left.createdAt);
    return createdDifference !== 0 ? createdDifference : left.id.localeCompare(right.id);
  });
}

function fnv1a(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function actionIdempotencyKey(parts: {
  storeId: string;
  source: string;
  sourceId: string;
  actionType: string;
  customerId?: string | null;
}): string {
  const canonical = [
    parts.storeId.trim(),
    parts.source.trim().toLowerCase(),
    parts.sourceId.trim(),
    parts.actionType.trim().toLowerCase(),
    parts.customerId?.trim() ?? "",
  ].join("|");
  return `crm_${fnv1a(canonical)}`;
}

function sortValue(record: CustomerSortRecord, sort: CustomerSearchSort): string | number | null {
  if (sort === "name_asc") return record.displayName.toLocaleLowerCase("en-AU");
  if (sort === "spend_desc") return record.totalSpend;
  if (sort === "last_purchase_desc") return record.lastPurchaseAt;
  return record.updatedAt;
}

export function compareCustomerRecords(
  left: CustomerSortRecord,
  right: CustomerSortRecord,
  sort: CustomerSearchSort,
): number {
  const leftValue = sortValue(left, sort);
  const rightValue = sortValue(right, sort);
  const tieBreak = () =>
    sort === "name_asc"
      ? left.id.localeCompare(right.id)
      : right.id.localeCompare(left.id);
  if (leftValue === rightValue) return tieBreak();
  if (leftValue === null) return 1;
  if (rightValue === null) return -1;
  if (sort === "name_asc") {
    const comparison = String(leftValue).localeCompare(String(rightValue), "en-AU");
    return comparison !== 0 ? comparison : tieBreak();
  }
  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return rightValue - leftValue || tieBreak();
  }
  const comparison = String(rightValue).localeCompare(String(leftValue));
  return comparison !== 0 ? comparison : tieBreak();
}

export function encodeKeysetCursor(cursor: KeysetCursor): string {
  return encodeURIComponent(JSON.stringify(cursor));
}

export function decodeKeysetCursor(value: string | null | undefined): KeysetCursor | null {
  if (!value || value.length > 1_024) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<KeysetCursor>;
    if (
      typeof parsed.id !== "string" ||
      !["name_asc", "updated_desc", "last_purchase_desc", "spend_desc"].includes(String(parsed.sort)) ||
      !(
        parsed.value === null ||
        typeof parsed.value === "string" ||
        (typeof parsed.value === "number" && Number.isFinite(parsed.value))
      )
    ) {
      return null;
    }
    return {
      id: parsed.id,
      sort: parsed.sort as CustomerSearchSort,
      value: parsed.value,
    };
  } catch {
    return null;
  }
}

export function paginateCustomerRecordsInMemory<T extends CustomerSortRecord>(
  records: T[],
  sort: CustomerSearchSort,
  limit: number,
  cursor: KeysetCursor | null = null,
): { items: T[]; nextCursor: KeysetCursor | null } {
  const ordered = [...records].sort((left, right) => compareCustomerRecords(left, right, sort));
  let candidates = ordered;
  if (cursor) {
    const cursorRecord: CustomerSortRecord = {
      id: cursor.id,
      displayName: sort === "name_asc" ? String(cursor.value ?? "") : "",
      totalSpend: sort === "spend_desc" ? Number(cursor.value ?? 0) : 0,
      lastPurchaseAt:
        sort === "last_purchase_desc" && typeof cursor.value === "string"
          ? cursor.value
          : null,
      updatedAt:
        sort === "updated_desc" && typeof cursor.value === "string" ? cursor.value : "",
    };
    candidates = ordered.filter(
      (record) => compareCustomerRecords(record, cursorRecord, sort) > 0,
    );
  }
  const items = candidates.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      last && items.length < candidates.length
        ? { id: last.id, sort, value: sortValue(last, sort) }
        : null,
  };
}
