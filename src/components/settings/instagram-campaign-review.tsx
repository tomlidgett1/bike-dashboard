"use client";

import { motion } from "framer-motion";
import { CalendarClock, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InstagramCampaign } from "@/lib/instagram/campaign-types";
import { cn } from "@/lib/utils";

function formatCampaignDate(iso: string | null) {
  if (!iso) return "Not scheduled";
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function InstagramCampaignReview({
  campaign,
  captions,
  generatingDay,
  scheduling,
  onCaptionChange,
  onRegenerateDay,
  onStartOver,
  onSchedule,
}: {
  campaign: InstagramCampaign;
  captions: Record<number, string>;
  generatingDay: number | null;
  scheduling: boolean;
  onCaptionChange: (dayIndex: number, caption: string) => void;
  onRegenerateDay: (dayIndex: number) => void;
  onStartOver: () => void;
  onSchedule: () => void;
}) {
  const complete = campaign.days.every(
    (day) => Boolean(day.imageUrl) && Boolean((captions[day.dayIndex] || "").trim()),
  );

  return (
    <div className="w-full space-y-5">
      <div className="text-center">
        <h1 className="text-xl font-medium tracking-tight text-gray-800 sm:text-[1.375rem]">
          Review your campaign
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-gray-500">
          {campaign.objective}. Check each day, edit captions or regenerate a
          single image before scheduling the series.
        </p>
      </div>

      <div className="space-y-4">
        {campaign.days.map((day, index) => {
          const isGenerating = generatingDay === day.dayIndex;
          return (
            <motion.section
              key={day.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.24) }}
              className="overflow-hidden rounded-md border border-gray-200 bg-white"
            >
              <div className="grid min-w-0 md:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]">
                <div
                  className={cn(
                    "relative overflow-hidden bg-gray-100",
                    campaign.aspect === "portrait" ? "aspect-[4/5]" : "aspect-square",
                  )}
                >
                  {day.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={day.imageUrl}
                      alt={`Campaign day ${day.dayIndex}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-100 via-white to-gray-100">
                      {isGenerating ? (
                        <div className="text-center">
                          <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-500" />
                          <p className="mt-2 text-xs text-gray-500">
                            Creating day {day.dayIndex} of {campaign.durationDays}
                          </p>
                        </div>
                      ) : (
                        <p className="px-6 text-center text-xs text-gray-500">
                          Waiting to generate
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex min-w-0 flex-col p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">
                        Day {day.dayIndex}
                      </p>
                      <h2 className="mt-1 text-base font-medium text-gray-900">
                        {day.title}
                      </h2>
                      {day.narrativeRole ? (
                        <p className="mt-1 text-xs text-gray-500">
                          {day.narrativeRole}
                        </p>
                      ) : null}
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {formatCampaignDate(
                        day.scheduledAt ||
                          new Date(
                            new Date(campaign.startAt).getTime() +
                              (day.dayIndex - 1) * 86_400_000,
                          ).toISOString(),
                      )}
                    </span>
                  </div>

                  <label className="mt-4 block flex-1">
                    <span className="mb-1.5 block text-xs font-medium text-gray-700">
                      Caption
                    </span>
                    <textarea
                      value={captions[day.dayIndex] ?? day.caption}
                      onChange={(event) =>
                        onCaptionChange(day.dayIndex, event.target.value)
                      }
                      disabled={scheduling}
                      rows={7}
                      className="h-full min-h-36 w-full resize-y rounded-md border border-gray-200 bg-white px-3.5 py-3 text-sm leading-relaxed text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-300 disabled:opacity-60"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => onRegenerateDay(day.dayIndex)}
                    disabled={Boolean(generatingDay) || scheduling}
                    className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    {day.imageUrl ? "Regenerate image" : "Generate image"}
                  </button>
                </div>
              </div>
            </motion.section>
          );
        })}
      </div>

      <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-200 bg-white p-3 shadow-sm">
        <button
          type="button"
          onClick={onStartOver}
          disabled={Boolean(generatingDay) || scheduling}
          className="rounded-md border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          Start over
        </button>
        <Button
          type="button"
          onClick={onSchedule}
          disabled={!complete || Boolean(generatingDay) || scheduling}
          className="rounded-md bg-gray-900 px-4 text-white hover:bg-gray-800"
        >
          {scheduling ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CalendarClock className="mr-2 h-4 w-4" />
          )}
          {scheduling ? "Scheduling…" : "Schedule campaign"}
        </Button>
      </div>
    </div>
  );
}
