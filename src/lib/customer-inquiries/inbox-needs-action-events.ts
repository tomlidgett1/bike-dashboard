export const INBOX_NEEDS_ACTION_CHANGED_EVENT = "inbox-needs-action-changed";

export function notifyInboxNeedsActionChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(INBOX_NEEDS_ACTION_CHANGED_EVENT));
}
