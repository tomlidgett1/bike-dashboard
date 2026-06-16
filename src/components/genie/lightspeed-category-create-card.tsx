"use client";

import * as React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { AlertCircle, Check, CheckCircle2, FolderPlus, Loader2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ApplyResult, LightspeedCategoryCreateProposal } from "@/lib/types/genie-agent";

const CARD_EASE = [0.04, 0.62, 0.23, 0.98] as const;

type CardStatus = "idle" | "applying" | "applied" | "error";

export function LightspeedCategoryCreateCard({ proposal }: { proposal: LightspeedCategoryCreateProposal }) {
  const [expanded, setExpanded] = React.useState(false);
  const [status, setStatus] = React.useState<CardStatus>("idle");
  const [resultMsg, setResultMsg] = React.useState("");

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setExpanded(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const apply = async () => {
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
        setResultMsg(data?.error || "Could not create the category. Please try again.");
        return;
      }
      const result = data as ApplyResult;
      setStatus("applied");
      setResultMsg(result.message);
    } catch {
      setStatus("error");
      setResultMsg("Connection error. Please try again.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: CARD_EASE }}
      className="w-full max-w-sm"
    >
      <div className="relative overflow-hidden rounded-xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.04]">
        {status === "applied" ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, ease: CARD_EASE }}
            className="absolute right-3 top-3 z-10"
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Category created in Lightspeed" />
          </motion.div>
        ) : null}

        <div className="flex items-center gap-2.5 px-3.5 py-3">
          <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full ring-1 ring-black/[0.06]">
            <Image src="/ls.png" alt="Lightspeed" width={32} height={32} className="h-full w-full object-cover" />
          </span>
          <div className="min-w-0 flex-1 pr-5">
            <p className="text-sm font-semibold tracking-tight text-gray-900">Lightspeed</p>
            <p className="truncate text-[11px] text-gray-500">
              New category{proposal.summary ? ` · ${proposal.summary}` : ""}
            </p>
          </div>
        </div>

        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={expanded ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
          transition={{
            height: { delay: 0.1, duration: 0.4, ease: CARD_EASE },
            opacity: { delay: 0.14, duration: 0.3, ease: CARD_EASE },
          }}
          className="overflow-hidden"
        >
          <div className="space-y-2.5 px-3.5 pb-3.5">
            <div className="rounded-md bg-gray-50 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <FolderPlus className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{proposal.name}</p>
                  <p className="mt-0.5 truncate text-xs text-gray-500">{proposal.path}</p>
                  {proposal.parent_category_name ? (
                    <p className="mt-1 text-[11px] text-gray-400">
                      Under {proposal.parent_category_name}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {status === "applied" ? (
              <div className="flex items-center gap-1.5 rounded-md bg-gray-50 px-2.5 py-2 text-[11px] text-gray-600">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                {resultMsg || "Category created in Lightspeed."}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Button
                  onClick={apply}
                  disabled={status === "applying"}
                  className={cn("w-full rounded-md")}
                >
                  {status === "applying" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Create in Lightspeed
                    </>
                  )}
                </Button>
                {status === "error" ? (
                  <div className="flex items-center gap-1.5 px-1 text-[11px] text-destructive">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {resultMsg}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
