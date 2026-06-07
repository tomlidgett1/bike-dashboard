"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { Bike, Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { RentalAvailabilityCalendar } from "@/components/rentals/rental-availability-calendar";
import { cn } from "@/lib/utils";
import {
  isRangeAvailable,
  mergeBookedDates,
  normaliseDateRange,
} from "@/lib/rentals/availability";
import type { StoreRental, StoreRentalBooking } from "@/lib/types/store";

interface RentalRow extends StoreRental {
  product_id: string;
}

interface StoreRentalBookingsPanelProps {
  rentals: RentalRow[];
}

interface BookingForm {
  start_date: string | null;
  end_date: string | null;
  customer_name: string;
  customer_phone: string;
  notes: string;
}

const EMPTY_FORM: BookingForm = {
  start_date: null,
  end_date: null,
  customer_name: "",
  customer_phone: "",
  notes: "",
};

function formatRange(start: string, end: string) {
  const startLabel = format(parseISO(start), "d MMM yyyy");
  const endLabel = format(parseISO(end), "d MMM yyyy");
  return start === end ? startLabel : `${startLabel} – ${endLabel}`;
}

export function StoreRentalBookingsPanel({ rentals }: StoreRentalBookingsPanelProps) {
  const [bookings, setBookings] = React.useState<StoreRentalBooking[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [selectedRentalId, setSelectedRentalId] = React.useState<string>("");
  const [form, setForm] = React.useState<BookingForm>(EMPTY_FORM);

  const rentalById = React.useMemo(
    () => new Map(rentals.map((rental) => [rental.id, rental])),
    [rentals],
  );

  React.useEffect(() => {
    if (rentals.length > 0 && !selectedRentalId) {
      setSelectedRentalId(rentals[0].id);
    }
  }, [rentals, selectedRentalId]);

  const fetchBookings = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/store/rental-bookings");
      if (!res.ok) {
        setError("Failed to load bookings");
        return;
      }
      const data = await res.json();
      setBookings(data.bookings ?? []);
    } catch (err) {
      console.error(err);
      setError("Failed to load bookings");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const pendingRequests = React.useMemo(
    () => bookings.filter((booking) => booking.status === "pending"),
    [bookings],
  );

  const selectedBookings = React.useMemo(
    () =>
      bookings.filter(
        (booking) => booking.rental_id === selectedRentalId && booking.status !== "cancelled",
      ),
    [bookings, selectedRentalId],
  );

  const bookedDates = React.useMemo(
    () => mergeBookedDates(selectedBookings),
    [selectedBookings],
  );

  const selectedRental = selectedRentalId ? rentalById.get(selectedRentalId) : undefined;

  const handleSelectDate = (dateKey: string) => {
    if (!selectedRentalId) return;
    setError(null);
    if (!form.start_date || (form.start_date && form.end_date)) {
      setForm((prev) => ({ ...prev, start_date: dateKey, end_date: null }));
      return;
    }

    const { start, end } = normaliseDateRange(form.start_date, dateKey);
    if (
      !isRangeAvailable(
        start,
        end,
        selectedBookings.map((booking) => ({
          id: booking.id,
          start_date: booking.start_date,
          end_date: booking.end_date,
          status: booking.status,
        })),
      )
    ) {
      setError("That range overlaps an existing booking");
      setForm((prev) => ({ ...prev, start_date: dateKey, end_date: null }));
      return;
    }

    setForm((prev) => ({ ...prev, start_date: start, end_date: end }));
  };

  const handleCreateBooking = async () => {
    if (!selectedRentalId || !form.start_date || !form.end_date) {
      setError("Select a start and end date on the calendar");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/store/rental-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rental_id: selectedRentalId,
          start_date: form.start_date,
          end_date: form.end_date,
          customer_name: form.customer_name.trim() || null,
          customer_phone: form.customer_phone.trim() || null,
          notes: form.notes.trim() || null,
          status: "confirmed",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to save booking");
        return;
      }

      setForm(EMPTY_FORM);
      await fetchBookings();
    } catch (err) {
      console.error(err);
      setError("Failed to save booking");
    } finally {
      setSaving(false);
    }
  };

  const updateBookingStatus = async (
    id: string,
    status: "confirmed" | "cancelled",
  ) => {
    setUpdatingId(id);
    try {
      const res = await fetch("/api/store/rental-bookings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) await fetchBookings();
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/store/rental-bookings?id=${id}`, { method: "DELETE" });
      if (res.ok) await fetchBookings();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteId(null);
    }
  };

  if (rentals.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-2">
          <Bike className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Add a rental product first</p>
          <p className="text-xs text-muted-foreground">
            Switch to the Add product tab to list items before managing bookings.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {pendingRequests.length > 0 && (
        <div className="rounded-md border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Booking requests</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Customer requests waiting for your response
              </p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-amber-50 text-amber-700">
              {pendingRequests.length} pending
            </span>
          </div>

          <div className="space-y-2">
            {pendingRequests.map((booking) => {
              const rental = rentalById.get(booking.rental_id);
              return (
                <div
                  key={booking.id}
                  className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 rounded-md border border-gray-200 bg-white p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {formatRange(booking.start_date, booking.end_date)}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {rental?.name ?? "Unknown product"}
                    </p>
                    {(booking.customer_name || booking.customer_phone || booking.customer_email) && (
                      <p className="text-xs text-gray-500 mt-1">
                        {[booking.customer_name, booking.customer_phone, booking.customer_email]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => updateBookingStatus(booking.id, "confirmed")}
                      disabled={updatingId === booking.id}
                    >
                      {updatingId === booking.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="h-4 w-4" />
                          Confirm
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateBookingStatus(booking.id, "cancelled")}
                      disabled={updatingId === booking.id}
                    >
                      <X className="h-4 w-4" />
                      Decline
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <Label htmlFor="rental-bookings-product">Rental product</Label>
          <select
            id="rental-bookings-product"
            value={selectedRentalId}
            onChange={(e) => {
              setSelectedRentalId(e.target.value);
              setForm(EMPTY_FORM);
              setError(null);
            }}
            className="mt-1.5 flex h-9 w-full max-w-md rounded-md border border-input bg-white px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            {rentals.map((rental) => (
              <option key={rental.id} value={rental.id}>
                {rental.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-6">
          <div className="space-y-4">
            <RentalAvailabilityCalendar
              bookedDates={bookedDates}
              selectedStart={form.start_date}
              selectedEnd={form.end_date}
              onSelectDate={handleSelectDate}
            />

            <div className="rounded-md bg-white border border-gray-200 p-3 text-xs text-gray-600">
              {form.start_date && form.end_date ? (
                <p>
                  Selected:{" "}
                  <span className="font-medium text-gray-900">
                    {formatRange(form.start_date, form.end_date)}
                  </span>
                </p>
              ) : form.start_date ? (
                <p>Select an end date to complete the range.</p>
              ) : (
                <p>Click an available date to block out a booking range.</p>
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="panel-booking-customer">Customer name (optional)</Label>
                <Input
                  id="panel-booking-customer"
                  value={form.customer_name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, customer_name: e.target.value }))
                  }
                  placeholder="e.g. Alex Morgan"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="panel-booking-phone">Phone (optional)</Label>
                <Input
                  id="panel-booking-phone"
                  value={form.customer_phone}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, customer_phone: e.target.value }))
                  }
                  placeholder="e.g. 0412 345 678"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="panel-booking-notes">Notes (optional)</Label>
                <Textarea
                  id="panel-booking-notes"
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                />
              </div>

              {error && (
                <div className="rounded-md bg-white border border-red-200 p-3 text-xs text-red-700">
                  {error}
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleCreateBooking}
                disabled={saving || !form.start_date || !form.end_date}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Block dates
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Booked out</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {selectedRental
                  ? `All active bookings for ${selectedRental.name}`
                  : "Select a rental product"}
              </p>
            </div>

            {selectedBookings.length === 0 ? (
              <div className="rounded-md bg-white border border-gray-200 p-6 text-center text-sm text-gray-500">
                No bookings for this product yet. All dates are available.
              </div>
            ) : (
              <div className="space-y-2">
                {selectedBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-start justify-between gap-3 rounded-md border border-gray-200 bg-white p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {formatRange(booking.start_date, booking.end_date)}
                      </p>
                      {(booking.customer_name || booking.customer_phone || booking.customer_email) && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {[booking.customer_name, booking.customer_phone, booking.customer_email]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      {booking.notes && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{booking.notes}</p>
                      )}
                      <span
                        className={cn(
                          "inline-flex mt-2 text-xs px-2 py-0.5 rounded-md font-medium",
                          booking.status === "confirmed"
                            ? "bg-gray-100 text-gray-700"
                            : "bg-amber-50 text-amber-700",
                        )}
                      >
                        {booking.status === "confirmed" ? "Confirmed" : "Pending"}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleteId(booking.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              Those dates will become available again on your storefront calendar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
