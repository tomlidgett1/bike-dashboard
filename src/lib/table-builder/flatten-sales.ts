/**
 * Flatten Lightspeed Sale API responses into table rows for the builder.
 */

import type {
  LightspeedCustomer,
  LightspeedItem,
  LightspeedSale,
  LightspeedSaleLine,
  LightspeedSalePayment,
} from "@/lib/services/lightspeed/types";
import {
  calculatedColumnDependencies,
  evaluateCalculatedFormula,
  orderCalculatedColumns,
  getCalculatedColumn,
  isCalculatedColumnKey,
  normaliseCalculatedColumns,
} from "./calculated-columns";
import { getSalesField } from "./sales-fields";
import type {
  CalculatedColumn,
  TableBuilderGrain,
  TableBuilderPreviewRow,
} from "./types";

type FlatRecord = Record<string, unknown>;

function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function emptyToNull(value: unknown): unknown {
  if (value === undefined || value === null || value === "") return null;
  if (value === "0" && typeof value === "string") {
    // Keep zero IDs as "0" for now — callers coerce booleans/numbers separately.
    return value;
  }
  return value;
}

function toBool(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  const s = String(value).toLowerCase();
  if (s === "true" || s === "1") return true;
  if (s === "false" || s === "0") return false;
  return null;
}

function toNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function getByPath(obj: FlatRecord, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return null;
    current = (current as FlatRecord)[part];
  }
  return current ?? null;
}

function primaryEmail(customer?: LightspeedCustomer): string | null {
  const emails = ensureArray(customer?.Contact?.Emails?.ContactEmail);
  const first = emails[0];
  if (!first) return null;
  const address = (first as { address?: string }).address;
  return address?.trim() || null;
}

function primaryPhone(customer?: LightspeedCustomer): string | null {
  const contact = customer?.Contact;
  if (!contact) return null;
  const candidates = [
    contact.mobile,
    contact.phoneHome,
    contact.phoneWork,
    ...ensureArray(contact.Phones?.ContactPhone).map(
      (p) => (p as { number?: string }).number,
    ),
  ];
  for (const value of candidates) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function salePayments(sale: LightspeedSale): LightspeedSalePayment[] {
  return ensureArray(sale.SalePayments?.SalePayment);
}

function saleLines(sale: LightspeedSale): LightspeedSaleLine[] {
  return ensureArray(sale.SaleLines?.SaleLine);
}

function paymentSummary(payments: LightspeedSalePayment[]): FlatRecord {
  const types = payments
    .map((p) => p.PaymentType?.name || p.paymentTypeID)
    .filter(Boolean) as string[];
  const totalAmount = payments.reduce((sum, p) => sum + (toNum(p.amount) ?? 0), 0);
  const totalTips = payments.reduce(
    (sum, p) => sum + (toNum((p as { tipAmount?: string }).tipAmount) ?? 0),
    0,
  );
  const first = payments[0];

  return {
    count: payments.length,
    totalAmount,
    totalTips,
    types: types.join(", ") || null,
    firstAmount: first ? toNum(first.amount) : null,
    firstType: first?.PaymentType?.name ?? null,
    firstPaymentTypeID: first?.paymentTypeID ?? null,
  };
}

function customerFlat(customer?: LightspeedCustomer): FlatRecord {
  if (!customer) {
    return {
      customerID: null,
      firstName: null,
      lastName: null,
      fullName: null,
      title: null,
      company: null,
      email: null,
      phone: null,
      archived: null,
      customerTypeID: null,
      creditAccountID: null,
    };
  }

  const firstName = customer.firstName?.trim() || "";
  const lastName = customer.lastName?.trim() || "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;

  return {
    customerID: emptyToNull(customer.customerID),
    firstName: firstName || null,
    lastName: lastName || null,
    fullName,
    title: emptyToNull(customer.title),
    company: emptyToNull(customer.company),
    email: primaryEmail(customer),
    phone: primaryPhone(customer),
    archived: toBool(customer.archived),
    customerTypeID: emptyToNull(customer.customerTypeID),
    creditAccountID: emptyToNull(customer.creditAccountID),
  };
}

function itemFlat(item?: LightspeedItem): FlatRecord {
  if (!item) {
    return {
      description: null,
      systemSku: null,
      customSku: null,
      manufacturerSku: null,
      upc: null,
      ean: null,
      itemType: null,
      modelYear: null,
      categoryID: null,
      manufacturerID: null,
      defaultVendorID: null,
      defaultCost: null,
      avgCost: null,
      archived: null,
      serialized: null,
      discountable: null,
      publishToEcom: null,
    };
  }

  return {
    description: emptyToNull(item.description),
    systemSku: emptyToNull(item.systemSku),
    customSku: emptyToNull(item.customSku),
    manufacturerSku: emptyToNull(item.manufacturerSku),
    upc: emptyToNull(item.upc),
    ean: emptyToNull(item.ean),
    itemType: emptyToNull(item.itemType),
    modelYear: emptyToNull(item.modelYear),
    categoryID: emptyToNull(item.categoryID),
    manufacturerID: emptyToNull(item.manufacturerID),
    defaultVendorID: emptyToNull(item.defaultVendorID),
    defaultCost: toNum(item.defaultCost),
    avgCost: toNum(item.avgCost),
    archived: toBool(item.archived),
    serialized: toBool(item.serialized),
    discountable: toBool(item.discountable),
    publishToEcom: toBool(item.publishToEcom),
  };
}

function saleFlat(sale: LightspeedSale): FlatRecord {
  const lines = saleLines(sale);
  const updateTime =
    (sale as { updateTime?: string; updatetime?: string }).updateTime ??
    (sale as { updatetime?: string }).updatetime ??
    null;

  return {
    saleID: emptyToNull(sale.saleID),
    ticketNumber: emptyToNull(sale.ticketNumber),
    referenceNumber: emptyToNull(sale.referenceNumber),
    referenceNumberSource: emptyToNull(sale.referenceNumberSource),
    completed: toBool(sale.completed),
    archived: toBool(sale.archived),
    voided: toBool(sale.voided),
    enablePromotions: toBool(sale.enablePromotions),
    isTaxInclusive: toBool(sale.isTaxInclusive),
    tipEnabled: toBool((sale as { tipEnabled?: string }).tipEnabled),
    receiptPreference: emptyToNull(sale.receiptPreference),
    createTime: emptyToNull(sale.createTime),
    updateTime: emptyToNull(updateTime),
    completeTime: emptyToNull(sale.completeTime),
    timeStamp: emptyToNull(sale.timeStamp),
    calcSubtotal: toNum(sale.calcSubtotal),
    displayableSubtotal: toNum(sale.displayableSubtotal),
    calcDiscount: toNum(sale.calcDiscount),
    discountPercent: toNum(sale.discountPercent),
    calcTotal: toNum(sale.calcTotal),
    total: toNum(sale.total),
    displayableTotal: toNum(sale.displayableTotal),
    totalDue: toNum(sale.totalDue),
    calcPayments: toNum(sale.calcPayments),
    calcTips: toNum((sale as { calcTips?: string }).calcTips),
    balance: toNum(sale.balance),
    change: toNum(sale.change),
    tax1Rate: toNum(sale.tax1Rate),
    tax2Rate: toNum(sale.tax2Rate),
    calcTax1: toNum(sale.calcTax1),
    calcTax2: toNum(sale.calcTax2),
    taxTotal: toNum((sale as { taxTotal?: string }).taxTotal),
    calcTaxable: toNum(sale.calcTaxable),
    calcNonTaxable: toNum(sale.calcNonTaxable),
    taxCategoryID: emptyToNull(sale.taxCategoryID),
    calcAvgCost: toNum(sale.calcAvgCost),
    calcFIFOCost: toNum(sale.calcFIFOCost),
    customerID: emptyToNull(sale.customerID),
    employeeID: emptyToNull(sale.employeeID),
    tipEmployeeID: emptyToNull(sale.tipEmployeeID),
    registerID: emptyToNull(sale.registerID),
    shopID: emptyToNull(sale.shopID),
    discountID: emptyToNull(sale.discountID),
    quoteID: emptyToNull(sale.quoteID),
    shipToID: emptyToNull(sale.shipToID),
    lineCount: lines.length,
  };
}

function lineFlat(line: LightspeedSaleLine, parentSaleId: string | null): FlatRecord {
  const note = (line as { Note?: { note?: string } }).Note?.note;
  const discount = (line as { Discount?: { name?: string } }).Discount;
  const itemFee = (
    line as {
      ItemFee?: { name?: string; feeValue?: string };
    }
  ).ItemFee;

  // Always bind the line to its parent sale — never trust a mismatched foreign key.
  const saleID = parentSaleId || emptyToNull(line.saleID);

  return {
    saleLineID: emptyToNull(line.saleLineID),
    saleID,
    lineType: emptyToNull((line as { lineType?: string }).lineType),
    createTime: emptyToNull(line.createTime),
    timeStamp: emptyToNull(line.timeStamp),
    unitQuantity: toNum(line.unitQuantity),
    unitPrice: toNum(line.unitPrice),
    normalUnitPrice: toNum(line.normalUnitPrice),
    displayableUnitPrice: toNum(line.displayableUnitPrice),
    displayableSubtotal: toNum(line.displayableSubtotal),
    calcSubtotal: toNum(line.calcSubtotal),
    calcTotal: toNum(line.calcTotal),
    discountAmount: toNum(line.discountAmount),
    discountPercent: toNum(line.discountPercent),
    calcLineDiscount: toNum(line.calcLineDiscount),
    calcTransactionDiscount: toNum(
      (line as { calcTransactionDiscount?: string }).calcTransactionDiscount,
    ),
    discountID: emptyToNull((line as { discountID?: string }).discountID),
    discountName: emptyToNull(discount?.name),
    tax: toBool(line.tax),
    tax1Rate: toNum(line.tax1Rate),
    tax2Rate: toNum(line.tax2Rate),
    calcTax1: toNum(line.calcTax1),
    calcTax2: toNum(line.calcTax2),
    taxClassID: emptyToNull(line.taxClassID),
    taxCategoryID: emptyToNull(line.taxCategoryID),
    avgCost: toNum(line.avgCost),
    fifoCost: toNum(line.fifoCost),
    isLayaway: toBool(line.isLayaway),
    isWorkorder: toBool(line.isWorkorder),
    isSpecialOrder: toBool(line.isSpecialOrder),
    itemID: emptyToNull(line.itemID),
    employeeID: emptyToNull(line.employeeID),
    customerID: emptyToNull((line as { customerID?: string }).customerID),
    shopID: emptyToNull(line.shopID),
    noteID: emptyToNull(line.noteID),
    parentSaleLineID: emptyToNull(line.parentSaleLineID),
    itemFeeID: emptyToNull((line as { itemFeeID?: string }).itemFeeID),
    note: emptyToNull(note),
    itemFeeName: emptyToNull(itemFee?.name),
    itemFeeValue: toNum(itemFee?.feeValue),
  };
}

function coerceCell(
  value: unknown,
  type: "text" | "number" | "date" | "boolean",
): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (type === "boolean") return toBool(value);
  if (type === "number") return toNum(value);
  if (type === "date") {
    const s = String(value).trim();
    return s || null;
  }
  return String(value);
}

/**
 * Keys always stamped onto every materialised row so Analytics joins stay valid
 * even when the user did not pick them as visible columns.
 */
export const RELATIONSHIP_COLUMN_KEYS = [
  "sale.saleID",
  "line.saleLineID",
  "line.saleID",
  "sale.completeTime",
  "customer.customerID",
] as const;

export function flattenSalesForTable(
  sales: LightspeedSale[],
  grain: TableBuilderGrain,
): FlatRecord[] {
  const rows: FlatRecord[] = [];

  for (const sale of sales) {
    const salePart = saleFlat(sale);
    const parentSaleId =
      typeof salePart.saleID === "string" || typeof salePart.saleID === "number"
        ? String(salePart.saleID)
        : null;
    // Customer on the row is always the sale's customer (same saleID).
    const customerPart = customerFlat(sale.Customer);
    if (parentSaleId && !customerPart.customerID) {
      customerPart.customerID = emptyToNull(sale.customerID);
    }
    // Payments are sale-level and shared by every line of that sale.
    const payments = salePayments(sale);
    const paymentPart = paymentSummary(payments);
    const lines = saleLines(sale);

    if (grain === "sale") {
      rows.push({
        sale: salePart,
        customer: customerPart,
        payment: paymentPart,
        line: { saleID: parentSaleId },
        item: {},
      });
      continue;
    }

    if (lines.length === 0) {
      rows.push({
        sale: salePart,
        customer: customerPart,
        payment: paymentPart,
        line: { saleID: parentSaleId },
        item: {},
      });
      continue;
    }

    for (const line of lines) {
      rows.push({
        sale: salePart,
        customer: customerPart,
        payment: paymentPart,
        line: lineFlat(line, parentSaleId),
        item: itemFlat(line.Item),
      });
    }
  }

  return rows;
}

export function projectTableRows(
  flatRows: FlatRecord[],
  columnKeys: string[],
  calculatedColumns: CalculatedColumn[] = [],
  grain: TableBuilderGrain = "sale_line",
): TableBuilderPreviewRow[] {
  const calcs = normaliseCalculatedColumns(calculatedColumns);
  const ordered = orderCalculatedColumns(calcs, grain);
  const evalOrder = ordered.ok ? ordered.columns : calcs;
  const dependencyKeys = calculatedColumnDependencies(calcs, grain);
  const baseKeys = new Set<string>();
  for (const key of columnKeys) {
    if (!isCalculatedColumnKey(key) && getSalesField(key)) baseKeys.add(key);
  }
  for (const key of dependencyKeys) {
    if (!isCalculatedColumnKey(key) && getSalesField(key)) baseKeys.add(key);
  }

  return flatRows.map((row) => {
    const base: Record<string, string | number | boolean | null> = {};
    for (const key of baseKeys) {
      const field = getSalesField(key);
      if (!field) {
        base[key] = null;
        continue;
      }
      base[key] = coerceCell(getByPath(row, field.path), field.type);
    }

    const numericValues: Record<string, number | null> = {};
    for (const [key, value] of Object.entries(base)) {
      numericValues[key] = typeof value === "number" ? value : null;
    }

    for (const calc of evalOrder) {
      if (!calc.expression.trim()) {
        base[calc.key] = null;
        numericValues[calc.key] = null;
        continue;
      }
      const result = evaluateCalculatedFormula(
        calc.expression,
        grain,
        numericValues,
        calc.format,
        { calculatedColumns: calcs, selfKey: calc.key },
      );
      const value = result.ok ? result.value : null;
      base[calc.key] = value;
      numericValues[calc.key] = value;
    }

    const projected: TableBuilderPreviewRow = {};
    for (const key of columnKeys) {
      if (key in base) {
        projected[key] = base[key] ?? null;
        continue;
      }
      if (isCalculatedColumnKey(key) || getCalculatedColumn(key, calcs)) {
        projected[key] = null;
        continue;
      }
      const field = getSalesField(key);
      if (!field) {
        projected[key] = null;
        continue;
      }
      projected[key] = coerceCell(getByPath(row, field.path), field.type);
    }
    return projected;
  });
}

/** Relations needed to populate the sales field catalog. */
export const SALES_TABLE_LOAD_RELATIONS = JSON.stringify([
  "SaleLines",
  "SaleLines.Item",
  "SaleLines.Note",
  "SaleLines.Discount",
  "SaleLines.ItemFee",
  "SalePayments",
  "SalePayments.PaymentType",
  "Customer",
]);
