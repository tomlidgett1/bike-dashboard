"use client";

import * as React from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, EyeOff, Loader2 } from "@/components/layout/app-sidebar/dashboard-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NEST_OVERLAY_INNER_RADIUS_CLASS,
  NEST_OVERLAY_RADIUS_CLASS,
  NestPickupConfirmDialog,
  NestPickupSuggestionLabel,
} from "@/components/settings/nest-pickup-suggestion-ui";
import type { NestPickupSuggestion } from "@/lib/nest/pickup-suggestions";
import { hideNestPickupSuggestion } from "@/lib/nest/pickup-suggestions-client";
import {
  findNewWorkorderSuggestionIds,
  parseWorkorderSuggestionsResponse,
  readCachedWorkorderSuggestionsEntry,
  suggestionKey,
  writeCachedWorkorderSuggestions,
} from "@/lib/nest/workorder-suggestions-cache";
import { cn } from "@/lib/utils";

const SUGGESTION_MOTION_TRANSITION = {
  duration: 0.4,
  ease: [0.04, 0.62, 0.23, 0.98] as const,
};

async function fetchSuggestions() {
  const res = await fetch("/api/store/homev2-suggestions", { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      typeof json?.error === "string" ? json.error : "Could not load suggestions.",
    );
  }
  return parseWorkorderSuggestionsResponse(json);
}

export function NestPickupSuggestionsDropdown({
  disabled = false,
  onMessageSent,
  triggerClassName,
}: {
  disabled?: boolean;
  onMessageSent?: () => void;
  triggerClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<NestPickupSuggestion[]>([]);
  const [enteringIds, setEnteringIds] = React.useState<Set<string>>(() => new Set());
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [hidingWorkorderId, setHidingWorkorderId] = React.useState<string | null>(null);
  const [activeSuggestion, setActiveSuggestion] = React.useState<NestPickupSuggestion | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const lastLoadedAt = React.useRef<number | null>(null);
  const suggestionsRef = React.useRef<NestPickupSuggestion[]>([]);
  const cachedEntryRef = React.useRef<ReturnType<typeof readCachedWorkorderSuggestionsEntry>>(null);

  React.useEffect(() => {
    suggestionsRef.current = suggestions;
  }, [suggestions]);

  React.useLayoutEffect(() => {
    const entry = readCachedWorkorderSuggestionsEntry();
    cachedEntryRef.current = entry;

    if (entry?.suggestions.length) {
      setSuggestions(entry.suggestions);
      suggestionsRef.current = entry.suggestions;
      setLoading(false);
    }
  }, []);

  const applySuggestions = React.useCallback(
    (
      nextSuggestions: NestPickupSuggestion[],
      options?: { storeOwnerId?: string | null; animateNew?: boolean },
    ) => {
      const previous = suggestionsRef.current;
      const newIds =
        options?.animateNew === false
          ? []
          : findNewWorkorderSuggestionIds(previous, nextSuggestions);

      if (newIds.length > 0) {
        setEnteringIds(new Set(newIds));
        window.setTimeout(() => {
          setEnteringIds(new Set());
        }, 450);
      }

      setSuggestions(nextSuggestions);
      suggestionsRef.current = nextSuggestions;

      const storeOwnerId =
        options?.storeOwnerId ?? cachedEntryRef.current?.storeOwnerId ?? null;
      if (storeOwnerId) {
        writeCachedWorkorderSuggestions(storeOwnerId, nextSuggestions);
        cachedEntryRef.current = {
          storeOwnerId,
          suggestions: nextSuggestions,
          savedAt: new Date().toISOString(),
        };
      }
    },
    [],
  );

  const load = React.useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }

    try {
      const parsed = await fetchSuggestions();
      if (!parsed) {
        throw new Error("Could not load suggestions.");
      }

      const cacheMatchesStore =
        !parsed.storeOwnerId ||
        !cachedEntryRef.current?.storeOwnerId ||
        cachedEntryRef.current.storeOwnerId === parsed.storeOwnerId;

      applySuggestions(parsed.suggestions, {
        storeOwnerId: parsed.storeOwnerId,
        animateNew: cacheMatchesStore,
      });
      setLoadError(null);
      lastLoadedAt.current = Date.now();
    } catch (err) {
      if (!options?.silent) {
        setLoadError(err instanceof Error ? err.message : "Could not load suggestions.");
        if (!suggestionsRef.current.length) {
          setSuggestions([]);
        }
      }
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [applySuggestions]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!open) return;
    const stale = !lastLoadedAt.current || Date.now() - lastLoadedAt.current > 60_000;
    if (stale) {
      void load({ silent: suggestions.length > 0 });
    }
  }, [open, load, suggestions.length]);

  async function handleHide(suggestion: NestPickupSuggestion) {
    const workorderId = suggestionKey(suggestion);
    if (!workorderId || hidingWorkorderId) return;

    setActionError(null);
    setHidingWorkorderId(workorderId);
    const previous = suggestions;
    const next = previous.filter((item) => suggestionKey(item) !== workorderId);
    applySuggestions(next, { animateNew: false });

    try {
      await hideNestPickupSuggestion({
        ...suggestion,
        id: workorderId,
        workorderId,
      });
    } catch (err) {
      applySuggestions(previous, { animateNew: false });
      setActionError(err instanceof Error ? err.message : "Could not hide suggestion.");
    } finally {
      setHidingWorkorderId(null);
    }
  }

  async function handleSent(suggestion: NestPickupSuggestion) {
    const workorderId = suggestionKey(suggestion);
    const next = suggestions.filter((item) => suggestionKey(item) !== workorderId);
    applySuggestions(next, { animateNew: false });
    setActiveSuggestion(null);
    onMessageSent?.();

    try {
      await hideNestPickupSuggestion({
        ...suggestion,
        id: workorderId,
        workorderId,
      });
    } catch {
      // Sent successfully; hiding is best-effort.
    }
  }

  const count = suggestions.length;

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              triggerClassName ??
                "inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200/80 bg-white px-3 text-sm font-medium text-gray-950 shadow-sm transition-colors hover:bg-gray-50",
              disabled && "cursor-not-allowed opacity-50 hover:bg-white",
            )}
          >
            <span className="flex h-3.5 w-3.5 shrink-0 overflow-hidden rounded-full">
              <Image
                src="/ls.png"
                alt=""
                width={14}
                height={14}
                className="h-full w-full object-cover"
              />
            </span>
            Workorders
            {count > 0 ? (
              <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700">
                {count}
              </span>
            ) : null}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-gray-400 transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className={cn("w-[calc(100vw-2rem)] max-w-md p-2", NEST_OVERLAY_RADIUS_CLASS)}
        >
          <DropdownMenuLabel className="font-normal">
            <div className="flex items-center gap-2">
              <span className="flex h-[18px] w-[18px] shrink-0 overflow-hidden rounded-full">
                <Image
                  src="/ls.png"
                  alt=""
                  width={18}
                  height={18}
                  className="h-full w-full object-cover"
                />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Workorders</p>
                <p className="text-xs font-normal text-muted-foreground">
                  Finished work orders with draft Nest texts
                </p>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <div className="max-h-72 overflow-y-auto">
            {loading && suggestions.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading suggestions…
              </div>
            ) : loadError && suggestions.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-destructive">{loadError}</div>
            ) : suggestions.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No finished work orders ready for pickup messages right now.
              </div>
            ) : (
              <div className="space-y-1 p-1">
                {actionError ? (
                  <div
                    className={cn(
                      "mx-2 mb-2 border border-gray-200 bg-white px-3 py-2 text-xs text-destructive",
                      NEST_OVERLAY_INNER_RADIUS_CLASS,
                    )}
                  >
                    {actionError}
                  </div>
                ) : null}
                <AnimatePresence initial={false} mode="popLayout">
                  {suggestions.map((suggestion) => {
                    const key = suggestionKey(suggestion);
                    const isEntering = enteringIds.has(key);

                    return (
                      <motion.div
                        key={key}
                        layout
                        initial={
                          isEntering ? { height: 0, opacity: 0 } : false
                        }
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={SUGGESTION_MOTION_TRANSITION}
                        className="overflow-hidden"
                      >
                        <div
                          className={cn(
                            "border border-gray-100 bg-white p-2 transition-colors hover:bg-gray-50",
                            NEST_OVERLAY_INNER_RADIUS_CLASS,
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveSuggestion(suggestion);
                                setDialogOpen(true);
                                setOpen(false);
                              }}
                              className="min-w-0 flex-1 text-left"
                            >
                              <NestPickupSuggestionLabel suggestion={suggestion} />
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                {suggestion.messageDraft}
                              </p>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleHide(suggestion)}
                              disabled={hidingWorkorderId === key}
                              className={cn(
                                "inline-flex h-7 shrink-0 items-center gap-1 border border-gray-200 bg-white px-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50",
                                NEST_OVERLAY_INNER_RADIUS_CLASS,
                              )}
                              aria-label="Hide suggestion"
                            >
                              {hidingWorkorderId === key ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <EyeOff className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <NestPickupConfirmDialog
        suggestion={activeSuggestion}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSent={handleSent}
      />
    </>
  );
}
