"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Gift } from "@/components/layout/app-sidebar/dashboard-icons";
import { BundleOfferCard } from "@/components/marketplace/store-profile/bundle-offer-card";
import type { StoreBundleOffer } from "@/lib/types/store";

interface OffersSectionProps {
  offers: StoreBundleOffer[];
  accent?: string;
  accentText?: string;
  storePhone?: string;
  onClaim?: (offer: StoreBundleOffer) => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] as const },
  },
};

export function OffersSection({
  offers,
  accent = "#ffde59",
  accentText = "#0a0a0a",
  storePhone,
  onClaim,
}: OffersSectionProps) {
  const handleClaim = React.useCallback(
    (offer: StoreBundleOffer) => {
      if (onClaim) {
        onClaim(offer);
        return;
      }
      if (storePhone) {
        window.location.href = `tel:${storePhone.replace(/\s/g, "")}`;
      }
    },
    [onClaim, storePhone],
  );

  if (!offers?.length) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-md border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-gray-100">
          <Gift className="h-5 w-5 text-gray-400" />
        </div>
        <h3 className="text-base font-semibold text-gray-900">No offers right now</h3>
        <p className="mt-1 max-w-sm text-sm text-gray-500">
          Check back soon — this store hasn&apos;t published any bundle offers yet.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-6 py-2">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Offers</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Buy one, get extras free — limited-time bundles from the shop floor.
        </p>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {offers.map((offer, index) => (
          <motion.div key={offer.id} variants={itemVariants} className="flex h-full min-h-0">
            <BundleOfferCard
              offer={offer}
              accent={accent}
              accentText={accentText}
              backgroundIndex={index}
              className="h-full w-full"
              onClaim={handleClaim}
            />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
