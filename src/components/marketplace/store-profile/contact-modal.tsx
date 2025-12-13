"use client";

import * as React from "react";
import { X, Phone, MapPin, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { OpeningHours } from "@/lib/types/store";

// ============================================================
// Contact Info Modal
// Displays phone, address, and opening hours
// ============================================================

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
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export function ContactModal({
  isOpen,
  onClose,
  storeName,
  phone,
  address,
  openingHours,
}: ContactModalProps) {
  // Close on escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: [0.04, 0.62, 0.23, 0.98] }}
              className="relative w-full max-w-md bg-white rounded-lg shadow-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Contact Information</h2>
                <button
                  onClick={onClose}
                  className="p-1 rounded-md hover:bg-gray-100 transition-colors"
                  aria-label="Close"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>

              {/* Content */}
              <div className="px-6 py-5 space-y-5">
                {/* Store Name */}
                <div>
                  <h3 className="text-base font-semibold text-gray-900 mb-4">{storeName}</h3>
                </div>

                {/* Phone */}
                {phone && (
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <Phone className="h-5 w-5 text-gray-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-500 mb-1">Phone</p>
                      <a
                        href={`tel:${phone}`}
                        className="text-sm text-gray-900 hover:text-blue-600 transition-colors"
                      >
                        {phone}
                      </a>
                    </div>
                  </div>
                )}

                {/* Address */}
                {address && (
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <MapPin className="h-5 w-5 text-gray-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-500 mb-1">Address</p>
                      <p className="text-sm text-gray-900">{address}</p>
                    </div>
                  </div>
                )}

                {/* Opening Hours */}
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-gray-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-500 mb-2">Opening Hours</p>
                    <div className="space-y-1.5">
                      {DAYS.map((day) => {
                        const hours = openingHours[day];
                        return (
                          <div key={day} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600 capitalize">{DAY_LABELS[day]}</span>
                            <span className="text-gray-900 font-medium">
                              {hours.closed ? (
                                <span className="text-red-600">Closed</span>
                              ) : (
                                `${hours.open} - ${hours.close}`
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                <Button
                  onClick={onClose}
                  className="w-full rounded-md bg-gray-900 hover:bg-gray-800 text-white"
                >
                  Close
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}








