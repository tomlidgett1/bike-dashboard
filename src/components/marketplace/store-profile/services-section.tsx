"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ServiceCard } from "@/components/marketplace/store-profile/service-card";
import type { StoreService } from "@/lib/types/store";

// ============================================================
// Services Section (Services tab)
// Renders the store's services as "Clean Checklist" cards,
// featured services first. Booking is handled by the
// "Call to book" banner rendered beneath this section.
// ============================================================

interface ServicesSectionProps {
  services: StoreService[];
  accent?: string;
  accentText?: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.04, 0.62, 0.23, 0.98] as const } },
};

export function ServicesSection({ services, accent = "#ffde59", accentText = "#0a0a0a" }: ServicesSectionProps) {
  if (!services || services.length === 0) return null;

  const sorted = [...services].sort((a, b) => Number(b.highlight) - Number(a.highlight));

  return (
    <section className="py-2 space-y-6">
      {/* Section header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Services</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {services.length} service{services.length !== 1 ? "s" : ""} available
        </p>
      </div>

      {/* Cards */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {sorted.map((s) => (
          <motion.div key={s.id} variants={itemVariants} className="h-full">
            <ServiceCard service={s} accent={accent} accentText={accentText} />
          </motion.div>
        ))}
      </motion.div>

      {/* Price note if any service has no price */}
      {services.some((s) => s.price == null) && (
        <p className="text-xs text-gray-400">
          * Some service prices are subject to inspection — contact us for a quote.
        </p>
      )}
    </section>
  );
}
