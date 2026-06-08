"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GmailLogo } from "@/components/genie/gmail-logo";
import type { ApplyResult, GmailEmailActionProposal } from "@/lib/types/genie-agent";

const CARD_EASE = [0.04, 0.62, 0.23, 0.98] as const;

function actionTitle(proposal: GmailEmailActionProposal): string {
  if (proposal.action === "draft") {
    return "Create Gmail draft?";
  }
  return "Send Gmail email?";
}

function recipientLine(values: string[] | undefined): string | null {
  const clean = values?.map((value) => value.trim()).filter(Boolean) ?? [];
  return clean.length ? clean.join(", ") : null;
}

export function GmailEmailActionCard({ proposal }: { proposal: GmailEmailActionProposal }) {
  const [expanded, setExpanded] = React.useState(false);
  const [status, setStatus] = React.useState<"idle" | "applying" | "applied" | "denied" | "error">("idle");
  const [resultMsg, setResultMsg] = React.useState("");

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setExpanded(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const runAction = async (decision: "allow" | "deny") => {
    if (decision === "deny") {
      setStatus("denied");
      setResultMsg("Email action cancelled.");
      return;
    }

    setStatus("applying");
    setResultMsg("");
    try {
      const res = await fetch("/api/genie/agent/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setStatus("error");
        setResultMsg(data?.error || "Could not complete the Gmail action.");
        return;
      }
      setStatus("applied");
      setResultMsg((data as ApplyResult).message);
    } catch {
      setStatus("error");
      setResultMsg("Connection error. Please try again.");
    }
  };

  const ccLine = recipientLine(proposal.cc);
  const bccLine = recipientLine(proposal.bcc);
  const subject = proposal.subject.trim() || "(No subject)";
  const body = proposal.body.trim() || "(Empty body)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: CARD_EASE }}
      className="w-full max-w-xl"
    >
      <div className="relative overflow-hidden rounded-xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.04]">
        <AnimatePresence>
          {status === "applied" ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.25, ease: CARD_EASE }}
              className="absolute right-3 top-3 z-10"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Gmail action completed" />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="px-4 pt-4">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/[0.06]">
              <GmailLogo />
            </span>
            <p className="text-sm font-semibold tracking-tight text-gray-900">Gmail</p>
          </div>

          <h3 className="mt-3 text-base font-semibold leading-snug text-gray-900">
            {actionTitle(proposal)}
          </h3>

          <div className="mt-3 space-y-1.5 text-sm">
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
              <span className="text-gray-500">To</span>
              <span className="break-words font-medium text-gray-900">{proposal.recipient_email}</span>
            </div>
            {ccLine ? (
              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                <span className="text-gray-500">Cc</span>
                <span className="break-words font-medium text-gray-900">{ccLine}</span>
              </div>
            ) : null}
            {bccLine ? (
              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                <span className="text-gray-500">Bcc</span>
                <span className="break-words font-medium text-gray-900">{bccLine}</span>
              </div>
            ) : null}
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
              <span className="text-gray-500">Subject</span>
              <span className="break-words font-medium text-gray-900">{subject}</span>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
            <div className="text-xs font-medium uppercase tracking-normal text-gray-500">Email</div>
            <div className="mt-2 max-h-[min(24rem,55vh)] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800">
              {body}
            </div>
          </div>
        </div>

        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={expanded ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
          transition={{
            height: { delay: 0.08, duration: 0.4, ease: CARD_EASE },
            opacity: { delay: 0.12, duration: 0.3, ease: CARD_EASE },
          }}
          className="overflow-hidden"
        >
          <div className="mt-4 border-t border-gray-200 px-4 py-3">
            {status === "applied" || status === "denied" ? (
              <div
                className={cn(
                  "rounded-md px-3 py-2.5 text-xs font-medium",
                  status === "applied"
                    ? "border border-emerald-200 bg-white text-emerald-700"
                    : "border border-gray-200 bg-white text-gray-600",
                )}
              >
                {resultMsg}
              </div>
            ) : (
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => runAction("deny")}
                  disabled={status === "applying"}
                  className="h-9 rounded-full border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Deny
                </Button>
                <Button
                  onClick={() => runAction("allow")}
                  disabled={status === "applying"}
                  className={cn(
                    "h-9 rounded-full bg-gray-200 px-4 text-sm font-medium text-gray-900",
                    "hover:bg-gray-300",
                  )}
                >
                  {status === "applying" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Working…
                    </>
                  ) : (
                    "Allow"
                  )}
                </Button>
              </div>
            )}

            {status === "error" ? (
              <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-destructive">
                <AlertCircle className="h-3 w-3 shrink-0" />
                {resultMsg}
              </div>
            ) : null}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
