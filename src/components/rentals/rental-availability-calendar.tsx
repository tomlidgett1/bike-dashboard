"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getMonthGridDays,
  isBeforeToday,
  isDateBooked,
  isDateInRange,
  isPastDate,
  shiftMonth,
  toDateKey,
} from "@/lib/rentals/availability";

interface RentalAvailabilityCalendarProps {
  bookedDates: string[];
  selectedStart: string | null;
  selectedEnd: string | null;
  onSelectDate: (dateKey: string) => void;
  disabled?: boolean;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function RentalAvailabilityCalendar({
  bookedDates,
  selectedStart,
  selectedEnd,
  onSelectDate,
  disabled = false,
}: RentalAvailabilityCalendarProps) {
  const [visibleMonth, setVisibleMonth] = React.useState(() => new Date());
  const bookedSet = React.useMemo(() => new Set(bookedDates), [bookedDates]);
  const gridDays = React.useMemo(() => getMonthGridDays(visibleMonth), [visibleMonth]);

  const handleDayClick = (day: Date) => {
    if (disabled) return;
    const key = toDateKey(day);
    if (isPastDate(key) || isDateBooked(key, bookedSet)) return;
    onSelectDate(key);
  };

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-4">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setVisibleMonth((month) => shiftMonth(month, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="text-sm font-medium text-gray-900">
          {format(visibleMonth, "MMMM yyyy")}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setVisibleMonth((month) => shiftMonth(month, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {WEEKDAYS.map((day) => (
          <div key={day} className="text-center text-[11px] font-medium text-gray-500 py-1">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {gridDays.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} className="aspect-square" />;
          }

          const dateKey = toDateKey(day);
          const booked = isDateBooked(dateKey, bookedSet);
          const past = isBeforeToday(day);
          const unavailable = booked || past;
          const selected = isDateInRange(dateKey, selectedStart, selectedEnd);
          const isStart = selectedStart === dateKey;
          const isEnd = selectedEnd === dateKey;

          return (
            <button
              key={dateKey}
              type="button"
              disabled={disabled || unavailable}
              onClick={() => handleDayClick(day)}
              className={cn(
                "aspect-square rounded-md text-xs font-medium transition-colors",
                unavailable && "bg-gray-100 text-gray-400 cursor-not-allowed",
                !unavailable && !selected && "text-gray-800 hover:bg-gray-100 cursor-pointer",
                selected && !unavailable && "bg-gray-900 text-white hover:bg-gray-800",
                isStart && "ring-2 ring-gray-900 ring-offset-1",
                isEnd && "ring-2 ring-gray-900 ring-offset-1",
              )}
              aria-label={`${format(day, "d MMMM yyyy")}${booked ? ", booked" : past ? ", past" : ", available"}`}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-md bg-white border border-gray-300" />
          Available
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-md bg-gray-100" />
          Unavailable
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-md bg-gray-900" />
          Selected
        </span>
      </div>
    </div>
  );
}
