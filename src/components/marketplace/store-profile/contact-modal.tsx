"use client";

import * as React from "react";
import { Phone, MapPin, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { OpeningHours } from "@/lib/types/store";

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeName: string;
  phone: string;
  address: string;
  openingHours: OpeningHours;
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const DAY_LABELS: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

export function ContactModal({
  isOpen,
  onClose,
  storeName,
  phone,
  address,
  openingHours,
}: ContactModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle className="text-sm font-semibold">{storeName}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Contact information
          </DialogDescription>
        </DialogHeader>

        {phone && (
          <>
            <Separator />
            <div className="px-4 py-3">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                Phone
              </p>
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <a
                  href={`tel:${phone}`}
                  className="text-sm text-foreground hover:text-muted-foreground transition-colors"
                >
                  {phone}
                </a>
              </div>
            </div>
          </>
        )}

        {address && (
          <>
            <Separator />
            <div className="px-4 py-3">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                Address
              </p>
              <div className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-sm text-foreground">{address}</p>
              </div>
            </div>
          </>
        )}

        <Separator />

        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-2.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Opening hours
            </p>
          </div>
          <div className="space-y-1.5">
            {DAYS.map((day) => {
              const hours = openingHours[day];
              return (
                <div key={day} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground w-8">{DAY_LABELS[day]}</span>
                  <span className="text-xs text-foreground">
                    {hours.closed ? (
                      <span className="text-muted-foreground">Closed</span>
                    ) : (
                      `${hours.open} – ${hours.close}`
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
