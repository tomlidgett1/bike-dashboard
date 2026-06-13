export type SellerIntentReason =
  | "negotiation"
  | "pickup"
  | "availability"
  | "history"
  | "viewing"
  | "inclusions"
  | "seller_motivation"
  | "warranty"
  | "shipping"
  | "general";

export type SellerIntentConfidence = "high" | "medium" | "low";

export interface SellerIntentResult {
  needsSeller: boolean;
  reason: SellerIntentReason | null;
  confidence: SellerIntentConfidence;
  suggestedMessage: string;
}

const SELLER_INTENT_LABELS: Record<SellerIntentReason, string> = {
  negotiation: "Price and offers are handled directly with the seller.",
  pickup: "Pickup times and location need to be arranged with the seller.",
  availability: "Availability is best confirmed with the seller.",
  history: "History and condition details only the seller can confirm.",
  viewing: "Viewings and inspections are arranged with the seller.",
  inclusions: "What's included beyond the listing is something to check with the seller.",
  seller_motivation: "That's a personal detail only the seller can answer.",
  warranty: "Warranty and returns depend on the seller's policy.",
  shipping: "Delivery options and costs need to be confirmed with the seller.",
  general: "This one's best answered by the seller directly.",
};

export function getSellerIntentLabel(reason: SellerIntentReason): string {
  return SELLER_INTENT_LABELS[reason];
}

function normaliseQuestion(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function withQuestionMark(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed.endsWith("?") ? trimmed : `${trimmed}?`;
}

export function looksLikeSellerOnlyQuestion(question: string): boolean {
  return classifySellerQuestion(question).needsSeller;
}

export function classifySellerQuestion(question: string): SellerIntentResult {
  const text = normaliseQuestion(question);
  const lower = text.toLowerCase();

  if (!text) {
    return {
      needsSeller: false,
      reason: null,
      confidence: "low",
      suggestedMessage: "",
    };
  }

  const match = (
    reason: SellerIntentReason,
    confidence: SellerIntentConfidence,
    patterns: RegExp[],
  ): SellerIntentResult | null => {
    if (!patterns.some((pattern) => pattern.test(lower))) return null;
    return {
      needsSeller: true,
      reason,
      confidence,
      suggestedMessage: withQuestionMark(text),
    };
  };

  const high = (
    reason: SellerIntentReason,
    patterns: RegExp[],
  ): SellerIntentResult | null => match(reason, "high", patterns);

  const medium = (
    reason: SellerIntentReason,
    patterns: RegExp[],
  ): SellerIntentResult | null => match(reason, "medium", patterns);

  return (
    high("negotiation", [
      /\b(negotiat|best price|lowest price|drop the price|lower the price|discount|offer less|will you take|take \$\d|come down on price)\b/,
      /\b(firm on price|lowest you.?ll accept|best you can do)\b/,
    ]) ??
    high("pickup", [
      /\b(pick up|pickup|collect) (this|next|on|at|tomorrow|weekend|today|saturday|sunday|monday|tuesday|wednesday|thursday|friday)\b/,
      /\b(where (can|do) i pick up|pickup (time|location|address|spot))\b/,
      /\b(can i collect)\b/,
    ]) ??
    high("availability", [
      /\b(still available|is this available|available still|hold it for me|can you hold)\b/,
      /\b(sold yet|already sold|anyone bought)\b/,
    ]) ??
    high("history", [
      /\b(been (in a )?crash|accident|dropped it|ever crashed|crash damage)\b/,
      /\b(service history|receipts? for service|proof of purchase)\b/,
      /\b(any issues i should know|hidden damage|frame damage)\b/,
    ]) ??
    high("viewing", [
      /\b(meet (in person|up)|available (to )?view|come (see|look at)|inspect (it|the bike)|test ride|test-ride)\b/,
      /\b(can i (see|view|look at) it)\b/,
    ]) ??
    high("inclusions", [
      /\b(throw in|include (pedals|extras)|can (they|you) include|comes with (pedals|charger|extras))\b/,
      /\b(what(?:'s| is) included|anything else included|extras included)\b/,
    ]) ??
    high("seller_motivation", [
      /\b(why (are you|is the seller|did they) sell|reason for selling|getting rid of)\b/,
      /\b(why selling|motivation for selling)\b/,
    ]) ??
    high("warranty", [
      /\b(return policy|refund if|money back|warranty from (the )?seller|seller warranty)\b/,
    ]) ??
    high("shipping", [
      /\b(ship to|postage|shipping cost|deliver to|can you deliver|delivery to)\b/,
    ]) ??
    medium("negotiation", [
      /\b(make an offer|counter offer|open to offers)\b/,
    ]) ??
    medium("availability", [
      /\b(reserve|put aside|hold until)\b/,
    ]) ??
    medium("viewing", [
      /\b(where are you (based|located)|suburb|postcode for pickup)\b/,
    ]) ??
    medium("general", [
      /\b(contact (the )?seller|ask the seller|message the seller|talk to the seller)\b/,
      /\b(can (they|you) send more photos|more photos|additional photos)\b/,
    ]) ?? {
      needsSeller: false,
      reason: null,
      confidence: "low",
      suggestedMessage: withQuestionMark(text),
    }
  );
}

export function assistantSuggestsContactingSeller(answer: string): boolean {
  const lower = answer.toLowerCase();
  if (!lower.trim()) return false;

  return (
    /\b(contact|message|ask|check with|confirm with) (the )?seller\b/.test(lower) ||
    /\b(seller (can|could|would|should|may))\b/.test(lower) ||
    /\b(only the seller|best to ask the seller|seller directly)\b/.test(lower) ||
    /\b(i don.?t have (their|the seller.?s) (schedule|availability|pickup))\b/.test(lower) ||
    /\b(not in the listing.{0,40}seller)\b/.test(lower) ||
    /\b(arrange(d)? (with|directly with) the seller)\b/.test(lower)
  );
}

export function resolveSellerCta(
  userQuestion: string,
  assistantAnswer: string,
): SellerIntentResult | null {
  const userIntent = classifySellerQuestion(userQuestion);

  if (userIntent.needsSeller && userIntent.confidence !== "low") {
    return userIntent;
  }

  if (assistantSuggestsContactingSeller(assistantAnswer)) {
    return {
      needsSeller: true,
      reason: userIntent.reason ?? "general",
      confidence: userIntent.needsSeller ? userIntent.confidence : "medium",
      suggestedMessage: userIntent.suggestedMessage || withQuestionMark(userQuestion),
    };
  }

  return null;
}
