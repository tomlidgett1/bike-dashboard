"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { CheckCircle, Refresh } from "@/components/layout/app-sidebar/sidebar-icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";
import { isStoreDashboardPath } from "@/lib/routes/store-dashboard";
import { cn } from "@/lib/utils";

const MIN_FEEDBACK_LENGTH = 10;

function pageTitleFromPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "Dashboard";
  return last
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildFeedbackContext({
  pathname,
  search,
  profile,
}: {
  pathname: string;
  search: string;
  profile: ReturnType<typeof useUserProfile>["profile"];
}) {
  if (typeof window === "undefined") return {};

  return {
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    screen: {
      width: window.screen.width,
      height: window.screen.height,
    },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    referrer: document.referrer || null,
    visibility: document.visibilityState,
    profile: profile
      ? {
          account_type: profile.account_type,
          bicycle_store: profile.bicycle_store,
          business_name: profile.business_name ?? null,
          seller_display_name: profile.seller_display_name ?? null,
        }
      : null,
    captured_at: new Date().toISOString(),
    search,
    hash: window.location.hash || null,
  };
}

export function FloatingTomFeedbackButton({
  placement = "floating",
}: {
  placement?: "floating" | "header";
}) {
  const pathname = usePathname() ?? "/";
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [open, setOpen] = React.useState(false);
  const [feedback, setFeedback] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const visible = isStoreDashboardPath(pathname) && !!user;
  const trimmedLength = feedback.trim().length;
  const canSubmit = trimmedLength >= MIN_FEEDBACK_LENGTH && !submitting;

  React.useEffect(() => {
    if (!open) {
      setError(null);
      if (submitted) {
        setFeedback("");
        setSubmitted(false);
      }
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, submitted]);

  if (!visible) return null;

  const pageSearch =
    typeof window !== "undefined" ? window.location.search : "";
  const pageTitle =
    typeof document !== "undefined" && document.title
      ? document.title
      : pageTitleFromPath(pathname);

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const pageUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}${pathname}${pageSearch}${window.location.hash}`
          : null;

      const response = await fetch("/api/feedback/tom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackText: feedback.trim(),
          pagePath: pathname,
          pageTitle,
          pageUrl,
          pageSearch: pageSearch || null,
          context: buildFeedbackContext({
            pathname,
            search: pageSearch,
            profile,
          }),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Could not send feedback");
      }

      setSubmitted(true);
      window.setTimeout(() => setOpen(false), 900);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not send feedback",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          placement === "header"
            ? "inline-flex h-8 items-center justify-center rounded-[28px] border px-3.5 text-xs font-medium transition-colors !bg-[var(--dashboard-header-control-bg)] !border-[color:var(--dashboard-header-control-border)] !text-[color:var(--dashboard-header-control-fg)] hover:!bg-[var(--dashboard-header-control-hover-bg)] hover:!text-[color:var(--dashboard-header-control-hover-fg)]"
            : "pointer-events-auto inline-flex items-center gap-2 rounded-[28px] border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-md transition-colors hover:bg-gray-50",
        )}
        aria-label="Feedback"
        aria-expanded={open}
      >
        {placement === "header" ? "Feedback" : "Tom feedback"}
      </button>

      {open ? (
        <div
          className={cn(
            "absolute z-50 w-[min(calc(100vw-2rem),18rem)] rounded-md border border-gray-200 bg-white p-3 shadow-xl",
            "animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out",
            placement === "header" ? "right-0 top-[calc(100%+8px)]" : "right-0 top-[calc(100%+8px)]",
          )}
        >
          {submitted ? (
            <div className="flex items-center gap-2 py-2 text-sm text-gray-800">
              <CheckCircle className="h-4 w-4 shrink-0 text-gray-700" />
              Thanks — feedback sent.
            </div>
          ) : (
            <>
              <Textarea
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void handleSubmit();
                  }
                }}
                placeholder="What's on your mind?"
                rows={4}
                autoFocus
                className="min-h-[5.5rem] resize-none rounded-md border-gray-200 text-sm"
              />

              {error ? (
                <p className="mt-2 text-xs text-red-600">{error}</p>
              ) : null}

              <div className="mt-2 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  className="rounded-md min-w-[72px]"
                  onClick={() => void handleSubmit()}
                  disabled={!canSubmit}
                >
                  {submitting ? (
                    <>
                      <Refresh className="h-3.5 w-3.5 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    "Send"
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
