"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import { Bike, Clock, Loader2, Tag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RentalAvailabilityCalendar } from "@/components/rentals/rental-availability-calendar";
import {
  isRangeAvailable,
  normaliseDateRange,
} from "@/lib/rentals/availability";
import { trackStoreBehaviourEvent } from "@/lib/tracking/store-analytics";
import type { StoreRental } from "@/lib/types/store";

interface RentalsSectionProps {
  rentals?: StoreRental[];
  storeName?: string;
  storeId?: string;
  storePhone?: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] as const },
  },
};

function formatPrice(amount: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatRange(start: string, end: string) {
  const startLabel = format(parseISO(start), "d MMM yyyy");
  const endLabel = format(parseISO(end), "d MMM yyyy");
  return start === end ? startLabel : `${startLabel} – ${endLabel}`;
}

function countDays(start: string, end: string) {
  const { start: rangeStart, end: rangeEnd } = normaliseDateRange(start, end);
  const startDate = parseISO(rangeStart);
  const endDate = parseISO(rangeEnd);
  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
}

export function RentalsSection({
  rentals = [],
  storeName,
  storeId,
  storePhone,
}: RentalsSectionProps) {
  const [selectedRental, setSelectedRental] = React.useState<StoreRental | null>(null);
  const [bookedDates, setBookedDates] = React.useState<string[]>([]);
  const [bookings, setBookings] = React.useState<
    Array<{ id: string; start_date: string; end_date: string; status: string }>
  >([]);
  const [loadingAvailability, setLoadingAvailability] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [selectedStart, setSelectedStart] = React.useState<string | null>(null);
  const [selectedEnd, setSelectedEnd] = React.useState<string | null>(null);
  const [customerName, setCustomerName] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [customerEmail, setCustomerEmail] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState(false);

  const openRental = async (rental: StoreRental) => {
    if (storeId) {
      trackStoreBehaviourEvent(storeId, "rental_view", {
        action: "open_rental",
        label: rental.name,
        rentalId: rental.id,
        tab: "rentals",
      });
    }
    setSelectedRental(rental);
    setSelectedStart(null);
    setSelectedEnd(null);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setMessage(null);
    setError(null);
    setSubmitted(false);

    if (!storeId) return;

    trackStoreBehaviourEvent(storeId, "rental_availability_open", {
      action: "load_availability",
      label: rental.name,
      rentalId: rental.id,
      tab: "rentals",
    });
    setLoadingAvailability(true);
    try {
      const res = await fetch(
        `/api/marketplace/store/${storeId}/rentals/${rental.id}/availability`,
      );
      if (res.ok) {
        const data = await res.json();
        setBookedDates(data.booked_dates ?? []);
        setBookings(data.bookings ?? []);
      }
    } catch (err) {
      console.error(err);
      setError("Could not load availability");
    } finally {
      setLoadingAvailability(false);
    }
  };

  const handleSelectDate = (dateKey: string) => {
    setError(null);
    setSubmitted(false);
    if (storeId && selectedRental) {
      trackStoreBehaviourEvent(storeId, "rental_date_select", {
        action: "select_rental_date",
        label: selectedRental.name,
        rentalId: selectedRental.id,
        dateKey,
        hasStart: Boolean(selectedStart),
        tab: "rentals",
      });
    }
    if (!selectedStart || (selectedStart && selectedEnd)) {
      setSelectedStart(dateKey);
      setSelectedEnd(null);
      return;
    }

    const { start, end } = normaliseDateRange(selectedStart, dateKey);
    if (!isRangeAvailable(start, end, bookings)) {
      setError("Those dates are already booked. Please choose another range.");
      setSelectedStart(dateKey);
      setSelectedEnd(null);
      return;
    }

    setSelectedStart(start);
    setSelectedEnd(end);
  };

  const estimatedTotal = React.useMemo(() => {
    if (!selectedRental || !selectedStart || !selectedEnd) return null;
    const days = countDays(selectedStart, selectedEnd);
    if (selectedRental.price_per_day != null) {
      return selectedRental.price_per_day * days;
    }
    return null;
  }, [selectedRental, selectedStart, selectedEnd]);

  const handleSubmitRequest = async () => {
    if (!selectedRental || !storeId || !selectedStart || !selectedEnd) return;
    if (!customerName.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!customerPhone.trim() && !customerEmail.trim()) {
      setError("Please enter a phone number or email");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/marketplace/store/${storeId}/rentals/${selectedRental.id}/bookings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start_date: selectedStart,
            end_date: selectedEnd,
            customer_name: customerName.trim(),
            customer_phone: customerPhone.trim() || null,
            customer_email: customerEmail.trim() || null,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not submit booking request");
        return;
      }

      setSubmitted(true);
      trackStoreBehaviourEvent(storeId, "rental_request_submit", {
        action: "submit_rental_request",
        label: selectedRental.name,
        rentalId: selectedRental.id,
        startDate: selectedStart,
        endDate: selectedEnd,
        tab: "rentals",
      });
      setMessage(
        storePhone
          ? "Booking request sent. The store will confirm your hire — you can also call to follow up."
          : "Booking request sent. The store will confirm your hire shortly.",
      );

      const availabilityRes = await fetch(
        `/api/marketplace/store/${storeId}/rentals/${selectedRental.id}/availability`,
      );
      if (availabilityRes.ok) {
        const availabilityData = await availabilityRes.json();
        setBookedDates(availabilityData.booked_dates ?? []);
        setBookings(availabilityData.bookings ?? []);
      }
    } catch (err) {
      console.error(err);
      setError("Could not submit booking request");
    } finally {
      setSubmitting(false);
    }
  };

  if (rentals.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 sm:py-24 px-4">
        <div className="text-center max-w-sm mx-auto">
          <div className="rounded-full bg-gray-100 p-5 sm:p-6 mb-4 inline-block">
            <Bike className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400" />
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
            No rentals available
          </h3>
          <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
            {storeName
              ? `${storeName} hasn't listed any rental bikes or equipment yet.`
              : "This store hasn't listed any rental bikes or equipment yet."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="py-4">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Rentals</h2>
          <p className="text-sm text-gray-600">
            Choose a product, pick your dates, and check availability
          </p>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {rentals.map((rental) => (
            <motion.div key={rental.id} variants={itemVariants}>
              <button
                type="button"
                onClick={() => openRental(rental)}
                className="w-full text-left cursor-pointer"
              >
                <Card className="h-full border-gray-200 hover:border-gray-300 hover:shadow-md transition-all duration-200">
                  {rental.image_url && (
                    <div className="aspect-[4/3] overflow-hidden rounded-t-lg bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={rental.image_url}
                        alt={rental.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 leading-tight">
                        {rental.name}
                      </h3>
                      <span
                        className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-md font-medium ${
                          rental.is_available
                            ? "bg-green-50 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {rental.is_available ? "Available" : "Unavailable"}
                      </span>
                    </div>

                    {rental.description && (
                      <p className="text-xs text-gray-500 line-clamp-2 mb-3">{rental.description}</p>
                    )}

                    <div className="flex flex-col gap-1">
                      {rental.price_per_hour != null && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Clock className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                          <span>{formatPrice(rental.price_per_hour)} / hour</span>
                        </div>
                      )}
                      {rental.price_per_day != null && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Tag className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                          <span>{formatPrice(rental.price_per_day)} / day</span>
                        </div>
                      )}
                    </div>

                    <p className="text-xs font-medium text-gray-700 mt-3">Check dates</p>
                  </CardContent>
                </Card>
              </button>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <Dialog open={!!selectedRental} onOpenChange={(open) => !open && setSelectedRental(null)}>
        <DialogContent className="flex max-h-[min(40rem,90vh)] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
            <DialogTitle>{selectedRental?.name}</DialogTitle>
            <DialogDescription>
              Select your hire dates. Grey dates are already booked.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto px-6 py-4 space-y-4">
            {loadingAvailability ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : selectedRental && !selectedRental.is_available ? (
              <div className="rounded-md bg-white border border-gray-200 p-4 text-sm text-gray-600">
                This item is not currently available for hire. Contact the store for more information.
              </div>
            ) : (
              <>
                <RentalAvailabilityCalendar
                  bookedDates={bookedDates}
                  selectedStart={selectedStart}
                  selectedEnd={selectedEnd}
                  onSelectDate={handleSelectDate}
                />

                {selectedStart && selectedEnd && (
                  <div className="rounded-md bg-white border border-gray-200 p-4 space-y-1">
                    <p className="text-sm font-medium text-gray-900">
                      {formatRange(selectedStart, selectedEnd)}
                    </p>
                    {estimatedTotal != null && (
                      <p className="text-xs text-gray-600">
                        Estimated total: {formatPrice(estimatedTotal)} ({countDays(selectedStart, selectedEnd)} day
                        {countDays(selectedStart, selectedEnd) === 1 ? "" : "s"})
                      </p>
                    )}
                  </div>
                )}

                {!submitted && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="rental-customer-name">Your name</Label>
                      <Input
                        id="rental-customer-name"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Full name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rental-customer-phone">Phone</Label>
                      <Input
                        id="rental-customer-phone"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="0412 345 678"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rental-customer-email">Email</Label>
                      <Input
                        id="rental-customer-email"
                        type="email"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>
                )}

                {error && (
                  <div className="rounded-md bg-white border border-red-200 p-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                {message && (
                  <div className="rounded-md bg-white border border-gray-200 p-3 text-sm text-gray-700">
                    {message}
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="shrink-0 px-6 py-4 border-t border-border gap-2">
            <Button variant="outline" onClick={() => setSelectedRental(null)}>
              Close
            </Button>
            {!submitted && selectedRental?.is_available && (
              <Button
                onClick={handleSubmitRequest}
                disabled={
                  submitting ||
                  !selectedStart ||
                  !selectedEnd ||
                  !storeId ||
                  loadingAvailability
                }
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Request booking"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
