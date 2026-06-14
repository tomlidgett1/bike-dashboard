"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InquiriesController } from "./use-inquiries-controller";

export function InquiryStyleSettings({ c }: { c: InquiriesController }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="shrink-0 border-b border-gray-100 px-4 pb-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-left text-[12px] font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        <span>Reply style settings</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-gray-400 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 rounded-md border border-gray-200 bg-white p-3">
              {c.styleLoading ? (
                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading settings…
                </div>
              ) : (
                <>
                  <div>
                    <label htmlFor="inquiry-greeting" className="text-[11px] font-medium text-gray-600">
                      Greeting
                    </label>
                    <input
                      id="inquiry-greeting"
                      value={c.greetingStyle}
                      onChange={(event) => c.setGreetingStyle(event.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2.5 py-2 text-[12px] text-gray-800 outline-none transition-colors focus:border-gray-300"
                      placeholder="Hi {first_name},"
                    />
                  </div>
                  <div>
                    <label htmlFor="inquiry-signoff" className="text-[11px] font-medium text-gray-600">
                      Sign-off
                    </label>
                    <textarea
                      id="inquiry-signoff"
                      value={c.signoffStyle}
                      onChange={(event) => c.setSignoffStyle(event.target.value)}
                      rows={3}
                      className="mt-1 w-full resize-none rounded-md border border-gray-200 bg-white px-2.5 py-2 text-[12px] leading-relaxed text-gray-800 outline-none transition-colors focus:border-gray-300"
                      placeholder={"Regards,\nYour shop name"}
                    />
                  </div>
                  {c.styleMessage ? (
                    <p className="text-[11px] text-gray-600">{c.styleMessage}</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void c.handleSaveStyleProfile()}
                    disabled={c.styleSaving}
                    className="w-full rounded-md bg-gray-900 px-3 py-2 text-[12px] font-medium text-white transition-opacity disabled:opacity-40"
                  >
                    {c.styleSaving ? "Saving…" : "Save reply style"}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
