"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { AlertCircle, ExternalLink, Loader2, Mail } from "lucide-react";
import { GmailLogo } from "@/components/genie/gmail-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GmailConnectPayload } from "@/lib/types/genie-agent";

const CARD_EASE = [0.04, 0.62, 0.23, 0.98] as const;

function reasonCopy(
  reason: GmailConnectPayload["reason"] | undefined,
  hasAccounts: boolean,
): { title: string; description: string } {
  if (hasAccounts || reason === "add_account") {
    return {
      title: "Add another Gmail account",
      description:
        "Connect an additional mailbox so Genie can search sales, support, and shared inboxes together.",
    };
  }
  if (reason === "send") {
    return {
      title: "Connect Gmail to send emails",
      description:
        "Genie can search your inbox and stage emails for you, but sending requires connecting your Gmail account first.",
    };
  }
  if (reason === "search") {
    return {
      title: "Connect Gmail to search your inbox",
      description:
        "Link your Gmail account so Genie can read recent emails and help you reply from the store home page.",
    };
  }
  return {
    title: "Connect your Gmail account?",
    description:
      "Authorise Gmail via Composio so Genie can search your inbox and send emails after you tap Allow on each message.",
  };
}

export function GmailConnectCard({
  payload,
  onConnected,
}: {
  payload: GmailConnectPayload;
  onConnected?: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [status, setStatus] = React.useState<"idle" | "opening" | "error">("idle");
  const [errorMsg, setErrorMsg] = React.useState("");
  const connectedAccounts = payload.accounts?.filter((account) => account.status === "ACTIVE") ?? [];
  const hasAccounts = connectedAccounts.length > 0;
  const copy = reasonCopy(payload.reason, hasAccounts);

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setExpanded(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const openConnect = async () => {
    setStatus("opening");
    setErrorMsg("");
    try {
      let url = payload.url?.trim();
      if (!url) {
        const res = await fetch("/api/composio/connect", { method: "POST" });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.url) {
          setStatus("error");
          setErrorMsg(data?.error || "Could not start Gmail connection.");
          return;
        }
        url = data.url as string;
      }
      window.open(url, "_blank", "noopener,noreferrer");
      setStatus("idle");
      onConnected?.();
    } catch {
      setStatus("error");
      setErrorMsg("Connection error. Please try again.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: CARD_EASE }}
      className="w-full max-w-md"
    >
      <div className="relative overflow-hidden rounded-xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.04]">
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/[0.06]">
              <GmailLogo />
            </span>
            <p className="text-sm font-semibold tracking-tight text-gray-900">Gmail</p>
          </div>

          <h3 className="mt-3 text-base font-semibold leading-snug text-gray-900">{copy.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">{copy.description}</p>

          {hasAccounts ? (
            <div className="mt-4 rounded-md border border-gray-200 bg-white p-3">
              <p className="text-xs font-medium text-gray-500">Connected mailboxes</p>
              <ul className="mt-2 space-y-2">
                {connectedAccounts.map((account) => (
                  <li key={account.id} className="flex items-center gap-2 text-sm text-gray-800">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span className="truncate">{account.email_address ?? account.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-4">
            <p className="text-xs text-gray-500">Sharing data includes:</p>
            <div className="mt-1.5 space-y-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-gray-500">Access</span>
                <span className="font-medium text-gray-900">Read &amp; send email</span>
              </div>
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
            <div className="flex items-center justify-end gap-2">
              <Button
                onClick={openConnect}
                disabled={status === "opening"}
                className={cn(
                  "h-9 rounded-full bg-gray-200 px-4 text-sm font-medium text-gray-900",
                  "hover:bg-gray-300",
                )}
              >
                {status === "opening" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Opening…
                  </>
                ) : (
                  <>
                    {hasAccounts ? "Add another Gmail" : "Connect Gmail"}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </div>

            {status === "error" ? (
              <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-destructive">
                <AlertCircle className="h-3 w-3 shrink-0" />
                {errorMsg}
              </div>
            ) : null}
          </div>
        </motion.div>
      </div>

      <p className="mt-3 text-center text-[11px] text-gray-400">
        Using tools comes with risks.{" "}
        <a
          href="https://composio.dev"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-gray-500"
        >
          Learn more
        </a>
      </p>
    </motion.div>
  );
}
