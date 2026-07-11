"use client";

// Approvals — a short list of yes/no decisions.
//
// Each pending email is one row; Review opens a focused dialog with the
// real rendered email and two choices: send or skip. Design changes happen
// in Campaign setup, not here — approving stays a ten-second decision.

import * as React from "react";
import { Eye, Loader2, Send } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { renderCampaignEmail, type StoreBranding } from "@/lib/crm/templates";
import { applyMergeTags } from "@/lib/crm/merge-tags";
import { mergeDraftOntoTemplateContent } from "@/lib/crm/lifecycle/template-config";
import type { LifecycleAction } from "@/lib/crm/lifecycle/types";
import { STAGE_PLAIN } from "./lifecycle-shared";

const PREVIEW_UNSUBSCRIBE_PLACEHOLDER = "https://example.com/unsubscribe-preview";

type Notice = { kind: "success" | "error"; text: string };

export function LifecycleApprovals({
  actions,
  store,
  onResolved,
  onNotice,
}: {
  actions: LifecycleAction[];
  store: StoreBranding;
  onResolved: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const [reviewId, setReviewId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const reviewAction = actions.find((a) => a.id === reviewId) ?? null;

  const decide = async (action: LifecycleAction, decision: "approve" | "skip") => {
    setBusyId(action.id);
    try {
      const res = await fetch(`/api/store/crm/lifecycle/actions/${action.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Something went wrong");
      onNotice({
        kind: "success",
        text:
          decision === "approve"
            ? `Sent to ${(data.result?.emailsSent ?? action.contact_count).toLocaleString()} customers.`
            : "Skipped — no emails were sent.",
      });
      setReviewId(null);
      onResolved();
    } catch (error) {
      onNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Something went wrong",
      });
      onResolved();
    } finally {
      setBusyId(null);
    }
  };

  if (actions.length === 0) return null;

  return (
    <>
      <ul className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-white">
        {actions.map((action) => {
          const busy = busyId === action.id;
          return (
            <li key={action.id} className="flex items-center gap-4 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {applyMergeTags(action.subject, { firstName: null })}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  To {action.contact_count.toLocaleString()} customers who{" "}
                  {STAGE_PLAIN[action.stage].toLowerCase()}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  size="sm"
                  className="rounded-full"
                  disabled={busy}
                  onClick={() => setReviewId(action.id)}
                >
                  <Eye className="mr-1.5 size-3.5" />
                  Review
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full text-muted-foreground"
                  disabled={busy}
                  onClick={() => void decide(action, "skip")}
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Skip"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <ReviewDialog
        action={reviewAction}
        store={store}
        busy={reviewAction ? busyId === reviewAction.id : false}
        onClose={() => setReviewId(null)}
        onDecide={decide}
      />
    </>
  );
}

function ReviewDialog({
  action,
  store,
  busy,
  onClose,
  onDecide,
}: {
  action: LifecycleAction | null;
  store: StoreBranding;
  busy: boolean;
  onClose: () => void;
  onDecide: (action: LifecycleAction, decision: "approve" | "skip") => Promise<void>;
}) {
  const previewName = React.useMemo(() => {
    const named = (action?.payload?.targets ?? []).find((t) => !t.is_holdout && t.first_name);
    return named?.first_name ?? null;
  }, [action]);

  const previewHtml = React.useMemo(() => {
    const email = action?.payload?.email;
    if (!email) return "";
    const { html } = renderCampaignEmail({
      templateKey: email.templateKey,
      content: mergeDraftOntoTemplateContent(email, email.content),
      store,
      unsubscribeUrl: PREVIEW_UNSUBSCRIBE_PLACEHOLDER,
    });
    return applyMergeTags(html, { firstName: previewName });
  }, [action, store, previewName]);

  if (!action) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="flex h-[min(92vh,900px)] max-w-2xl flex-col gap-0 overflow-hidden rounded-md bg-white p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4">
          <DialogTitle className="pr-8 text-base leading-snug">
            {applyMergeTags(action.subject, { firstName: previewName })}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {action.reasoning}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 bg-gray-50/70 p-4">
          <div className="h-full overflow-hidden rounded-lg border border-border/60 bg-white shadow-sm">
            <iframe
              title={`Email preview: ${action.subject}`}
              sandbox=""
              srcDoc={previewHtml}
              className="h-full w-full bg-white"
            />
          </div>
        </div>

        <div className="shrink-0 border-t border-border/60 px-5 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              Want different words or design? Set it up once in Campaign setup — it applies to
              every future send.
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-muted-foreground"
                disabled={busy}
                onClick={() => void onDecide(action, "skip")}
              >
                Skip
              </Button>
              <Button
                size="sm"
                className="rounded-full"
                disabled={busy}
                onClick={() => void onDecide(action, "approve")}
              >
                {busy ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Send className="mr-1.5 size-3.5" />
                )}
                Send to {action.contact_count.toLocaleString()} customers
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
