"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Bike, Clock, Tag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// ============================================================
// Rentals Section
// Displays rental bikes and equipment offered by the store
// ============================================================

export interface StoreRental {
  id: string;
  name: string;
  description?: string;
  price_per_hour?: number;
  price_per_day?: number;
  image_url?: string | null;
  is_available: boolean;
  category?: string;
}

interface RentalsSectionProps {
  rentals?: StoreRental[];
  storeName?: string;
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
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(amount);
}

export function RentalsSection({ rentals = [], storeName }: RentalsSectionProps) {
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
    <section className="py-4">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Rentals</h2>
        <p className="text-sm text-gray-600">Bikes and equipment available to hire</p>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
      >
        {rentals.map((rental) => (
          <motion.div key={rental.id} variants={itemVariants}>
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
                    className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                      rental.is_available
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {rental.is_available ? 'Available' : 'Unavailable'}
                  </span>
                </div>

                {rental.description && (
                  <p className="text-xs text-gray-500 line-clamp-2 mb-3">{rental.description}</p>
                )}

                <div className="flex flex-col gap-1">
                  {rental.price_per_hour !== undefined && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Clock className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      <span>{formatPrice(rental.price_per_hour)} / hour</span>
                    </div>
                  )}
                  {rental.price_per_day !== undefined && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Tag className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      <span>{formatPrice(rental.price_per_day)} / day</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
