import type { NestConversationMessage, NestLightspeedCustomer } from "@/lib/nest/types";

export async function searchNestCustomers(query: string): Promise<NestLightspeedCustomer[]> {
  const search = new URLSearchParams({ customerSearch: "1", q: query });
  const res = await fetch(`/api/store/nest-messages?${search.toString()}`, { cache: "no-store" });
  const data = (await res.json()) as {
    customers?: NestLightspeedCustomer[];
    error?: string;
  };

  if (!res.ok || data.error) {
    throw new Error(data.error || "Could not search Lightspeed customers.");
  }

  return Array.isArray(data.customers) ? data.customers.slice(0, 8) : [];
}

export async function startNestMessage(
  mobile: string,
  content: string,
  customerName?: string,
): Promise<{ chatId: string; message: NestConversationMessage }> {
  const res = await fetch("/api/store/nest-messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "start_message",
      mobile,
      content,
      ...(customerName ? { customerName } : {}),
    }),
  });
  const data = (await res.json()) as {
    chatId?: string;
    message?: NestConversationMessage;
    error?: string;
  };
  if (!res.ok || !data.chatId || !data.message) {
    throw new Error(data.error || "Could not start message.");
  }
  return { chatId: data.chatId, message: data.message };
}
