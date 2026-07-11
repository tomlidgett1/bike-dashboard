"use client";

// Compact design picker for lifecycle emails — classic CRM layouts,
// the store's saved templates, and (optionally) premade designs.

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Layers } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import { CRM_TEMPLATES } from "@/lib/crm/templates";
import type { CampaignContent } from "@/lib/crm/types";
import type { CrmEmailTemplateRecord } from "@/lib/crm/agent/chat-types";

export type LifecycleTemplateChoice = {
  source: "layout" | "saved" | "premade";
  id: string;
  templateKey: string;
  templateLabel: string;
  /** Present for saved / premade designs; absent for classic layouts. */
  content?: CampaignContent;
};

type TabId = "layouts" | "saved" | "premade";

export function LifecycleTemplatePicker({
  label = "Design",
  currentLabel,
  currentKey,
  selectedId,
  savedTemplates,
  premadeTemplates = [],
  showPremade = true,
  disabled,
  onSelect,
}: {
  label?: string;
  currentLabel?: string | null;
  currentKey?: string | null;
  /** Layout key, saved template id, or premade id currently applied. */
  selectedId?: string | null;
  savedTemplates: CrmEmailTemplateRecord[];
  premadeTemplates?: CrmEmailTemplateRecord[];
  showPremade?: boolean;
  disabled?: boolean;
  onSelect: (choice: LifecycleTemplateChoice) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<TabId>("layouts");
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const display = currentLabel?.trim() || CRM_TEMPLATES.find((t) => t.key === currentKey)?.name || "Default layout";

  const tabs: { id: TabId; label: string; hidden?: boolean }[] = [
    { id: "layouts", label: "Layouts" },
    { id: "saved", label: "Yours" },
    { id: "premade", label: "Premade", hidden: !showPremade },
  ];

  const pick = (choice: LifecycleTemplateChoice) => {
    onSelect(choice);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/60 bg-white px-2.5 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-gray-50 disabled:opacity-50",
        )}
      >
        <Layers className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">
          <span className="text-muted-foreground">{label}: </span>
          {display}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-gray-400 transition-transform duration-200",
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
            className="absolute left-0 top-full z-30 mt-1 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-md border border-border/60 bg-white shadow-lg"
          >
            <div className="border-b border-border/40 px-2.5 py-2">
              <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
                {tabs
                  .filter((t) => !t.hidden)
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTab(t.id)}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                        tab === t.id
                          ? "text-gray-800 bg-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-200/70",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto py-1">
              {tab === "layouts"
                ? CRM_TEMPLATES.map((template) => {
                    const selected = (selectedId ?? currentKey) === template.key;
                    return (
                      <button
                        key={template.key}
                        type="button"
                        onClick={() =>
                          pick({
                            source: "layout",
                            id: template.key,
                            templateKey: template.key,
                            templateLabel: template.name,
                          })
                        }
                        className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-gray-50"
                      >
                        <span className="mt-0.5 size-3.5 shrink-0">
                          {selected ? <Check className="size-3.5 text-foreground" /> : null}
                        </span>
                        <span className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{template.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{template.description}</p>
                        </span>
                      </button>
                    );
                  })
                : null}

              {tab === "saved" ? (
                savedTemplates.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">
                    No saved templates yet. Save one from Create, then pick it here.
                  </p>
                ) : (
                  savedTemplates.map((template) => {
                    const selected =
                      selectedId === template.id || currentLabel === template.name;
                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() =>
                          pick({
                            source: "saved",
                            id: template.id,
                            templateKey: template.template_key,
                            templateLabel: template.name,
                            content: template.content,
                          })
                        }
                        className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-gray-50"
                      >
                        <span className="mt-0.5 size-3.5 shrink-0">
                          {selected ? <Check className="size-3.5 text-foreground" /> : null}
                        </span>
                        <span className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{template.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {template.description || template.subject}
                          </p>
                        </span>
                      </button>
                    );
                  })
                )
              ) : null}

              {tab === "premade"
                ? premadeTemplates.map((template) => {
                    const selected =
                      selectedId === template.id || currentLabel === template.name;
                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() =>
                          pick({
                            source: "premade",
                            id: template.id,
                            templateKey: template.template_key,
                            templateLabel: template.name,
                            content: template.content,
                          })
                        }
                        className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-gray-50"
                      >
                        <span className="mt-0.5 size-3.5 shrink-0">
                          {selected ? <Check className="size-3.5 text-foreground" /> : null}
                        </span>
                        <span className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{template.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{template.description}</p>
                        </span>
                      </button>
                    );
                  })
                : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
