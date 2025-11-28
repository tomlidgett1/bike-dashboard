"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import type { OpeningHours, DayHours } from "@/components/providers/profile-provider";

interface OpeningHoursEditorProps {
  value: OpeningHours;
  onChange: (hours: OpeningHours) => void;
}

const DAYS = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
] as const;

const DEFAULT_HOURS: DayHours = {
  open: "09:00",
  close: "17:00",
  closed: false,
};

export function OpeningHoursEditor({ value, onChange }: OpeningHoursEditorProps) {
  const handleDayChange = (
    day: keyof OpeningHours,
    field: keyof DayHours,
    newValue: string | boolean
  ) => {
    onChange({
      ...value,
      [day]: {
        ...value[day],
        [field]: newValue,
      },
    });
  };

  const handleCopyToAll = (sourceDay: keyof OpeningHours) => {
    const sourceHours = value[sourceDay];
    const newHours = { ...value };
    
    DAYS.forEach(({ key }) => {
      if (key !== sourceDay) {
        newHours[key] = { ...sourceHours };
      }
    });
    
    onChange(newHours);
  };

  return (
    <div className="space-y-2">
      {DAYS.map(({ key, label }) => {
        const dayHours = value[key] || DEFAULT_HOURS;
        
        return (
          <div
            key={key}
            className="flex items-center gap-4 py-2 px-3 rounded-md border border-border bg-secondary/20 hover:bg-secondary/30 transition-colors"
          >
            {/* Day Label */}
            <div className="w-24 flex-shrink-0">
              <Label className="text-sm font-medium">{label}</Label>
            </div>

            {/* Open/Close Toggle */}
            <div className="flex items-center gap-2 w-20 flex-shrink-0">
              <Switch
                checked={!dayHours.closed}
                onCheckedChange={(checked) =>
                  handleDayChange(key, "closed", !checked)
                }
              />
              <span className="text-xs text-muted-foreground">
                {dayHours.closed ? "Closed" : "Open"}
              </span>
            </div>

            {/* Time Inputs */}
            {!dayHours.closed ? (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  id={`${key}-open`}
                  type="time"
                  value={dayHours.open}
                  onChange={(e) => handleDayChange(key, "open", e.target.value)}
                  className="w-[110px] h-9 rounded-md"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  id={`${key}-close`}
                  type="time"
                  value={dayHours.close}
                  onChange={(e) => handleDayChange(key, "close", e.target.value)}
                  className="w-[110px] h-9 rounded-md"
                />
              </div>
            ) : (
              <div className="text-xs text-muted-foreground flex-1">
                Closed
              </div>
            )}

            {/* Copy to All Button */}
            {!dayHours.closed && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleCopyToAll(key)}
                className="h-8 px-2 text-xs flex-shrink-0"
              >
                <Copy className="h-3 w-3" />
              </Button>
            )}
          </div>
        );
      })}

      <p className="text-xs text-muted-foreground mt-3">
        Set your store's opening hours for each day. Toggle the switch to mark days as closed, or click the copy icon to apply one day's hours to all days.
      </p>
    </div>
  );
}

