"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Check, Loader2, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";
import { isStoreDashboardPath } from "@/lib/routes/store-dashboard";
import { cn } from "@/lib/utils";

const MIN_FEEDBACK_LENGTH = 30;

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

export function FloatingTomFeedbackButton() {
  const pathname = usePathname() ?? "/";
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [open, setOpen] = React.useState(false);
  const [feedback, setFeedback] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
    }
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
      window.setTimeout(() => setOpen(false), 1200);
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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "pointer-events-auto inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-md transition-colors hover:bg-gray-50",
        )}
        aria-label="Tom feedback"
      >
        <MessageSquarePlus className="h-4 w-4 text-gray-600" />
        Tom feedback
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          overlayClassName="animate-in fade-in duration-200"
          className="max-h-[min(40rem,90vh)] overflow-y-auto rounded-md bg-white sm:max-w-lg animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out"
        >
          <DialogHeader>
            <DialogTitle>Tom feedback</DialogTitle>
            <DialogDescription>
              Share detailed feedback about what is broken, confusing, or missing.
              Include steps to reproduce, what you expected, and what happened instead.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
              <p>
                <span className="font-medium text-gray-800">Page:</span> {pathname}
                {pageSearch ? pageSearch : ""}
              </p>
              <p className="mt-1">
                <span className="font-medium text-gray-800">Title:</span> {pageTitle}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tom-feedback-text">Your feedback</Label>
              <Textarea
                id="tom-feedback-text"
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder="Describe the issue or idea in detail. What were you trying to do? What went wrong? What would good look like?"
                rows={8}
                className="rounded-md resize-y min-h-[10rem]"
              />
              <p
                className={cn(
                  "text-xs",
                  trimmedLength < MIN_FEEDBACK_LENGTH
                    ? "text-gray-500"
                    : "text-gray-700",
                )}
              >
                {trimmedLength}/{MIN_FEEDBACK_LENGTH} minimum characters
              </p>
            </div>

            {error ? (
              <div className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {submitted ? (
              <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800">
                <Check className="h-4 w-4 text-gray-700" />
                Thanks — your feedback was logged for review.
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-md"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-md min-w-[120px]"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : submitted ? (
                <>
                  <Check className="h-4 w-4" />
                  Sent
                </>
              ) : (
                "Send feedback"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
