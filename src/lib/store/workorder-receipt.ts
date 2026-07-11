import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadPhoneContactsFromDb,
  normalizePhoneForDirectory,
  sanitizePhoneForLookup,
  upsertPhoneContactToDb,
} from "@/lib/customer-inquiries/lightspeed-phone-directory";
import { uploadLinqAttachmentBytes } from "@/lib/nest/linq-outbound-media";
import { createLightspeedClient } from "@/lib/services/lightspeed";
import {
  findCustomerByPhone,
} from "@/lib/services/lightspeed/customer-search";
import { normalizeLightspeedId } from "@/lib/services/lightspeed/normalize-lightspeed-id";
import { resolveWorkorderReceiptSaleId } from "@/lib/services/lightspeed/resolve-workorder-receipt-sale";
import { renderHtmlReceiptPdf } from "@/lib/services/lightspeed/sale-receipt-pdf";
import {
  getGenieWorkorder,
  type GenieWorkorderDetail,
} from "@/lib/services/lightspeed/workorder-queries";
import type { LightspeedWorkorderWithRelations } from "@/lib/services/lightspeed/types";

export type WorkorderReceiptOption = {
  workorder_id: string;
  status_name: string;
  updated_at: string;
  note_preview: string;
  sale_id: string | null;
  can_send_receipt: boolean;
};

const RECEIPT_OPTIONS_CACHE_TTL_MS = 45_000;
const receiptOptionsCache = new Map<
  string,
  { expiresAt: number; workorders: WorkorderReceiptOption[] }
>();

function receiptOptionsCacheKey(userId: string, customerId: string): string {
  return `${userId}:${customerId}`;
}

function customerDisplayName(customer: {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  customerID?: string | number | null;
}): string {
  const name = [customer.firstName, customer.lastName]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return (
    name ||
    String(customer.company ?? "").trim() ||
    `Customer ${String(customer.customerID ?? "").trim()}`
  );
}

function parseTimestamp(value: string | null | undefined): number {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapReceiptOption(workorder: LightspeedWorkorderWithRelations): WorkorderReceiptOption {
  const note = String(workorder.note ?? "").trim();
  const internal = String(workorder.internalNote ?? "").trim();
  const notePreview =
    note.split("\n").filter(Boolean).slice(-1)[0]?.trim() ||
    internal.split("\n").filter(Boolean).slice(-1)[0]?.trim() ||
    "No notes yet";

  return {
    workorder_id: String(workorder.workorderID),
    status_name: String(workorder.WorkorderStatus?.name ?? "Unknown").trim() || "Unknown",
    updated_at: String(workorder.timeStamp ?? workorder.etaOut ?? workorder.timeIn ?? ""),
    note_preview: notePreview,
    sale_id: normalizeLightspeedId(workorder.saleID),
    can_send_receipt: true,
  };
}

export async function resolveNestChatPhone(
  supabase: SupabaseClient,
  userId: string,
  chatId: string,
): Promise<{ phone: string; customerName: string | null } | null> {
  const { data: conversation, error } = await supabase
    .from("store_nest_conversations")
    .select("chat_id, title, display_name, participant_handle")
    .eq("user_id", userId)
    .eq("chat_id", chatId)
    .maybeSingle();

  if (error || !conversation) return null;

  const phone =
    sanitizePhoneForLookup(conversation.participant_handle) ??
    sanitizePhoneForLookup(conversation.title);
  if (!phone) return null;

  return {
    phone,
    customerName: conversation.display_name?.trim() || conversation.title?.trim() || null,
  };
}

/**
 * Lean receipt picker list — only the latest few workorders for one customer.
 * Avoids listGenieWorkorders (status catalogue + 25-row pages + enrichment).
 */
export async function listWorkorderReceiptOptions(
  userId: string,
  customerId: string,
): Promise<WorkorderReceiptOption[]> {
  const cacheKey = receiptOptionsCacheKey(userId, customerId);
  const cached = receiptOptionsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.workorders;
  }

  const client = createLightspeedClient(userId);
  const params = {
    customerID: customerId,
    sort: "-timeStamp" as const,
    // Status name only — skip Customer / lines / items for the picker.
    load_relations: '["WorkorderStatus"]',
  };
  const page = { targetCount: 3, limit: 3, maxPages: 1 };

  const [active, archived] = await Promise.all([
    client.getRecentWorkorders({ ...params, archived: "false" }, page),
    client.getRecentWorkorders({ ...params, archived: "true" }, page).catch(() => []),
  ]);

  const byId = new Map<string, LightspeedWorkorderWithRelations>();
  for (const workorder of [...active, ...archived]) {
    byId.set(String(workorder.workorderID), workorder);
  }

  const workorders = [...byId.values()]
    .sort((a, b) => parseTimestamp(b.timeStamp) - parseTimestamp(a.timeStamp))
    .slice(0, 3)
    .map(mapReceiptOption);

  receiptOptionsCache.set(cacheKey, {
    expiresAt: Date.now() + RECEIPT_OPTIONS_CACHE_TTL_MS,
    workorders,
  });

  return workorders;
}

/**
 * Resolve Lightspeed customer id for a Nest chat — id only, no bikes/sales/workorders.
 * Prefers the phone-directory cache, then a direct phone lookup.
 */
export async function resolveCustomerIdForChat(
  supabase: SupabaseClient,
  userId: string,
  chatId: string,
): Promise<{ customerId: string; customerName: string | null; phone: string } | null> {
  const chat = await resolveNestChatPhone(supabase, userId, chatId);
  if (!chat) return null;

  const directory = await loadPhoneContactsFromDb(supabase, userId, [chat.phone]);
  const cached = directory.get(chat.phone);
  if (cached?.lightspeedCustomerId) {
    return {
      customerId: cached.lightspeedCustomerId,
      customerName: cached.displayName?.trim() || chat.customerName,
      phone: chat.phone,
    };
  }

  const customer = await findCustomerByPhone(userId, chat.phone, {
    allowScan: true,
    maxScanPages: 5,
  });
  if (!customer?.customerID) return null;

  const customerId = String(customer.customerID);
  const customerName = customerDisplayName(customer);
  const phoneNormalized = normalizePhoneForDirectory(chat.phone) ?? chat.phone;

  void upsertPhoneContactToDb(supabase, userId, chat.phone, {
    phoneNormalized,
    firstName: customer.firstName ?? null,
    lastName: customer.lastName ?? null,
    displayName: customerName,
    lightspeedCustomerId: customerId,
  });

  return {
    customerId,
    customerName: customerName || chat.customerName,
    phone: chat.phone,
  };
}

export async function prepareWorkorderReceiptAttachment(args: {
  userId: string;
  workorderId: string;
  customerId: string;
}): Promise<{
  attachmentId: string;
  filename: string;
  draftMessage: string;
  workorder: GenieWorkorderDetail;
}> {
  const workorder = await getGenieWorkorder(args.userId, args.workorderId);
  if (!workorder) {
    throw new Error("Workorder not found.");
  }
  if (workorder.customer_id !== args.customerId) {
    throw new Error("This workorder does not belong to the customer in this conversation.");
  }
  const client = createLightspeedClient(args.userId);
  const saleId = await resolveWorkorderReceiptSaleId(client, workorder);

  const html = saleId
    ? await client.renderSaleReceiptHtml(saleId, { template: "SaleReceipt", print: true })
    : await client.renderWorkorderReceiptHtml(workorder.workorder_id, {
        template: "WorkorderReceipt",
        print: true,
      });

  const pdfBytes = await renderHtmlReceiptPdf(html);
  const filename = `receipt-workorder-${workorder.workorder_id}.pdf`;
  const attachmentId = await uploadLinqAttachmentBytes(pdfBytes, filename, "application/pdf");

  const draftMessage = `Here's your receipt for work order #${workorder.workorder_id}.`;

  return {
    attachmentId,
    filename,
    draftMessage,
    workorder,
  };
}
