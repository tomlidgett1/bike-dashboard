"use client";

import * as React from "react";
import { Loader2, Mail, Send } from "@/components/layout/app-sidebar/dashboard-icons";
import { GmailLogo } from "@/components/genie/gmail-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useInquiriesController } from "./use-inquiries-controller";
import { DesignTabbed } from "./design-tabbed";
import { DesignThreePane } from "./design-three-pane";
import { DesignComposerRail } from "./design-composer-rail";
import { DesignThread } from "./design-thread";

type ConceptId = "tabbed" | "three" | "rail" | "thread";

const CONCEPTS: Array<{ id: ConceptId; label: string; blurb: string }> = [
  { id: "tabbed", label: "1 · Tabbed", blurb: "Reply-first, tabs for message & context" },
  { id: "three", label: "2 · Three-pane", blurb: "List · context · reply, all visible" },
  { id: "rail", label: "3 · Composer", blurb: "Big reply, context rail on the right" },
  { id: "thread", label: "4 · Thread", blurb: "Conversation with a chat composer" },
];

function InquiriesGmailStatusLoading() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-[#f6f6f4] p-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading enquiries…
      </div>
    </div>
  );
}

export function CustomerInquiriesConcepts() {
  const c = useInquiriesController();
  const [concept, setConcept] = React.useState<ConceptId>("tabbed");

  const active = CONCEPTS.find((x) => x.id === concept) ?? CONCEPTS[0];

  if (!c.gmailStatusReady) {
    if (c.loading) {
      return <InquiriesGmailStatusLoading />;
    }
    if (c.error) {
      return (
        <div className="flex h-full min-h-0 items-center justify-center bg-[#f6f6f4] p-6">
          <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
            {c.error}
          </div>
        </div>
      );
    }
    return <InquiriesGmailStatusLoading />;
  }

  if (c.gmailConfigured && !c.gmailConnected) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-[#f6f6f4] p-6">
        <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 ring-1 ring-black/[0.06]">
            <GmailLogo />
          </span>
          <p className="mt-4 text-base font-medium text-gray-900">Connect your store inbox</p>
          <p className="mx-auto mt-1 text-sm text-gray-500">
            Sync customer enquiries and draft replies in your shop voice.
          </p>
          {c.error ? <p className="mt-3 text-xs text-gray-500">{c.error}</p> : null}
          <Button
            type="button"
            className="mt-5 rounded-md"
            onClick={() => void c.handleConnectGmail()}
            disabled={c.connecting}
          >
            {c.connecting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-1.5 h-4 w-4" />
            )}
            Connect Gmail
          </Button>
        </div>
      </div>
    );
  }

  if (!c.gmailConfigured) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-[#f6f6f4] p-6">
        <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
          Gmail integration is not configured for this environment.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-2.5 lg:px-6">
        <div className="flex items-center gap-1 overflow-x-auto rounded-md bg-gray-100 p-0.5">
          {CONCEPTS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setConcept(item.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                concept === item.id
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="hidden text-[12px] text-gray-400 sm:block">{active.blurb}</p>
      </div>

      <div className="min-h-0 flex-1">
        {concept === "tabbed" ? <DesignTabbed c={c} /> : null}
        {concept === "three" ? <DesignThreePane c={c} /> : null}
        {concept === "rail" ? <DesignComposerRail c={c} /> : null}
        {concept === "thread" ? <DesignThread c={c} /> : null}
      </div>

      {c.sendConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
            onClick={() => !c.sending && c.setSendConfirmOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white p-5 animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out sm:mx-4"
          >
            <h3 className="text-base font-semibold text-gray-900">Send this reply?</h3>
            <p className="mt-2 text-sm text-gray-600">
              This sends your edited draft to {c.detail?.sender_email}. Nothing goes out until you
              confirm.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-md"
                onClick={() => c.setSendConfirmOpen(false)}
                disabled={c.sending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-md"
                onClick={() => void c.handleSend()}
                disabled={c.sending || !c.draft.trim()}
              >
                {c.sending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-4 w-4" />
                )}
                Send now
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
