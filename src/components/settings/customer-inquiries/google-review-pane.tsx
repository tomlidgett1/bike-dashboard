"use client";

import * as React from "react";
import { Loader2, Send, Star } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import type { GoogleReviewItem } from "@/lib/customer-inquiries/google-review-types";

function formatReviewTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) {
    return <span className="text-xs text-gray-400">No rating</span>;
  }
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => {
        const filled = index < rating;
        return (
          <Star
            key={index}
            className={cn(
              "h-3.5 w-3.5",
              filled ? "text-gray-800" : "text-gray-300",
            )}
          />
        );
      })}
    </span>
  );
}

export function GoogleReviewThread({ review }: { review: GoogleReviewItem }) {
  const reviewedAt = formatReviewTime(review.create_time || review.update_time);
  const repliedAt = formatReviewTime(review.reply?.update_time ?? null);

  return (
    <div
      className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain bg-white px-5 py-5"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div className="rounded-md border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StarRating rating={review.star_rating} />
          {reviewedAt ? (
            <span className="text-[11px] tabular-nums text-gray-400">{reviewedAt}</span>
          ) : null}
        </div>
        {review.comment ? (
          <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-snug text-gray-900">
            {review.comment}
          </p>
        ) : (
          <p className="mt-3 text-sm text-gray-500">This reviewer left a star rating only.</p>
        )}
      </div>

      {review.reply ? (
        <div className="rounded-md border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-gray-600">Your reply</p>
            {repliedAt ? (
              <span className="text-[11px] tabular-nums text-gray-400">{repliedAt}</span>
            ) : null}
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-snug text-gray-900">
            {review.reply.comment}
          </p>
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-3 text-center text-xs text-gray-500">
          No public reply yet — respond below to post it on Google.
        </p>
      )}
    </div>
  );
}

export function GoogleReviewReplyComposer({
  review,
  onSend,
  sending,
}: {
  review: GoogleReviewItem;
  onSend: (review: GoogleReviewItem, text: string) => Promise<void>;
  sending: boolean;
}) {
  const [text, setText] = React.useState(review.reply?.comment ?? "");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setText(review.reply?.comment ?? "");
    setError(null);
  }, [review.review_id, review.reply?.comment]);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);
    try {
      await onSend(review, trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post Google review reply.");
    }
  };

  const hasExistingReply = Boolean(review.reply?.comment?.trim());

  return (
    <div>
      {error ? (
        <p
          className="mb-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="flex items-end gap-1.5 rounded-[22px] border border-gray-200 bg-white py-1 pl-4 pr-1 shadow-sm">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={hasExistingReply ? "Update your public reply…" : "Write a public reply…"}
          rows={2}
          maxLength={4096}
          className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-snug text-gray-900 placeholder:text-gray-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={sending || !text.trim()}
          aria-label={hasExistingReply ? "Update Google review reply" : "Post Google review reply"}
          className={cn(
            "mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
            text.trim() && !sending
              ? "bg-[#007AFF] text-white hover:bg-[#0071eb]"
              : "bg-gray-100 text-gray-400",
          )}
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-gray-400">
        Replies are public on your Google Business Profile.
      </p>
    </div>
  );
}
