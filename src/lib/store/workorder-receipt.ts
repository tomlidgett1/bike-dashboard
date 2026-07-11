import type { SupabaseClient } from "@supabase/supabase-js";
import { buildLightspeedContextFromPhone } from "@/lib/customer-inquiries/lightspeed-context";
import { sanitizePhoneForLookup } from "@/lib/customer-inquiries/lightspeed-phone-directory";
import { uploadLinqAttachmentBytes } from "@/lib/nest/linq-outbound-media";
import { createLightspeedClient } from "@/lib/services/lightspeed";
import { resolveWorkorderReceiptSaleId } from "@/lib/services/lightspeed/resolve-workorder-receipt-sale";
import { renderHtmlReceiptPdf } from "@/lib/services/lightspeed/sale-receipt-pdf";
import {
  getGenieWorkorder,
  listGenieWorkorders,
  type GenieWorkorderDetail,
} from "@/lib/services/lightspeed/workorder-queries";

export type WorkorderReceiptOption = {
  workorder_id: string;
  status_name: string;
  updated_at: string;
  note_preview: string;
  sale_id: string | null;
  can_send_receipt: boolean;
};

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

export async function listWorkorderReceiptOptions(
  userId: string,
  customerId: string,
): Promise<WorkorderReceiptOption[]> {
  const { workorders } = await listGenieWorkorders(userId, {
    customer_id: customerId,
    scope: "all",
    limit: 3,
    include_details: false,
    include_archived: true,
  });

  return workorders.map((workorder) => {
    const notePreview =
      workorder.note.split("\n").filter(Boolean).slice(-1)[0]?.trim() ||
      workorder.internal_note.split("\n").filter(Boolean).slice(-1)[0]?.trim() ||
      "No notes yet";
    return {
      workorder_id: workorder.workorder_id,
      status_name: workorder.status_name,
      updated_at: workorder.updated_at,
      note_preview: notePreview,
      sale_id: workorder.sale_id,
      can_send_receipt: true,
    };
  });
}

export async function resolveCustomerIdForChat(
  supabase: SupabaseClient,
  userId: string,
  chatId: string,
): Promise<{ customerId: string; customerName: string | null; phone: string } | null> {
  const chat = await resolveNestChatPhone(supabase, userId, chatId);
  if (!chat) return null;

  const context = await buildLightspeedContextFromPhone({
    userId,
    phone: chat.phone,
    supabase,
  });

  if (!context.matched || !context.customer_id) return null;

  return {
    customerId: context.customer_id,
    customerName: context.customer_name ?? chat.customerName,
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
