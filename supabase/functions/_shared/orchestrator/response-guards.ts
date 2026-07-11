const CALENDAR_CLAIM =
  /\b(added|created|booked|scheduled|put|moved|it'?s on your .{0,20}calendar|on your personal calendar|done ✓?)\b.*\b(calendar|8[:\s]?\d{2}\s?(am|pm)?|tomorrow|event)\b/i;
const EXPLICIT_CALENDAR_REFERENCE =
  /\b(calendar|on your personal calendar|it'?s on your .{0,20}calendar)\b/i;
const EMAIL_CLAIM =
  /\b(i'?ve|i have|i|nest|done,?)\s+(sent|drafted|forwarded|emailed)\b[^\n.?!]{0,120}\b(email|draft|inbox|to \w+@)\b/i;

// Past-tense send claims — anything that asserts the email has actually
// gone out. We never let these through unless email_send executed
// successfully AND its post-send verification passed.
const EMAIL_SENT_CLAIM =
  /(^\s*sent\s*[.!]?\s*$|\bdone,?\s+sent\b|\bdone\s*✓|\bsent\s*✓|\bsent it\b|\bjust sent\b|\bemail\s+sent\b|\b(i'?ve|i have|i)\s+emailed\b|\bsent the email\b|\bfired (it|that|the email) off\b|\bshot (it|that|the email) off\b|\bsent that off\b|\bgot it off\b|\bemail's\s+gone\b|\bemail has gone\b|\bgone out\b)/i;

export function applyCommitClaimHallucinationGuard(args: {
  text: string;
  availableToolNames: string[];
  executedToolNames: string[];
  /** Outcome of the email_send tool call in this turn, if it ran. */
  emailSendOutcome?: 'success' | 'error' | 'timeout' | 'blocked';
  /** Whether the post-send verification passed (SENT label / sentitems folder). */
  emailSendVerified?: boolean;
}): { text: string; overrideReason?: "calendar" | "email" | "email_unverified" } {
  const availableNames = new Set(args.availableToolNames);
  const executedNames = new Set(args.executedToolNames);
  const brandBookingCreateExecuted = executedNames.has("brand_booking_create");

  const shouldBlockCalendar =
    CALENDAR_CLAIM.test(args.text) &&
    !availableNames.has("calendar_write") &&
    !executedNames.has("calendar_write") &&
    (
      !brandBookingCreateExecuted ||
      EXPLICIT_CALENDAR_REFERENCE.test(args.text)
    );

  if (shouldBlockCalendar) {
    return {
      text: "I haven't added that yet. I need to use the calendar tool first.",
      overrideReason: "calendar",
    };
  }

  // Strict send-claim guard: a "sent" assertion is only allowed when
  // email_send ran AND verified=true. This catches:
  //   1. Model says "Done ✓" after only email_draft (no send call).
  //   2. Model says "sent" but email_send failed/blocked/timed out.
  //   3. Model says "sent" but verification failed (verified=false).
  if (EMAIL_SENT_CLAIM.test(args.text)) {
    const sendCalled = executedNames.has("email_send");
    if (!sendCalled) {
      return {
        text: "I haven't actually sent that yet — the draft is ready, just say the word and I'll send it.",
        overrideReason: "email",
      };
    }
    if (args.emailSendOutcome !== "success") {
      return {
        text: "That didn't go through — the send didn't complete on my end. Want me to try again?",
        overrideReason: "email",
      };
    }
    if (args.emailSendVerified === false) {
      return {
        text: "I tried to send it but I haven't been able to confirm it landed in your sent folder yet — please check Gmail/Outlook directly and let me know if it didn't go through.",
        overrideReason: "email_unverified",
      };
    }
  }

  const shouldBlockEmail =
    EMAIL_CLAIM.test(args.text) &&
    !availableNames.has("email_send") &&
    !availableNames.has("email_draft") &&
    !executedNames.has("email_send") &&
    !executedNames.has("email_draft");

  if (shouldBlockEmail) {
    return {
      text: "I can't actually send emails from here. Let me try again properly.",
      overrideReason: "email",
    };
  }

  return { text: args.text };
}
