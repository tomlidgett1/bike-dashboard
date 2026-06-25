export const OPEN_ACTIONS_CHANGED_EVENT = "open-actions-changed";

export function notifyOpenActionsChanged(count?: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(OPEN_ACTIONS_CHANGED_EVENT, {
      detail: typeof count === "number" ? { count } : undefined,
    }),
  );
}
