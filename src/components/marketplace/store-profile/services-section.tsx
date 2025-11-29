"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { StoreService } from "@/lib/types/store";

// ============================================================
// Services Section
// Displays services offered by the bike store
// ============================================================

interface ServicesSectionProps {
  services: StoreService[];
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.04, 0.62, 0.23, 0.98],
    },
  },
};

export function ServicesSection({ services }: ServicesSectionProps) {
  if (!services || services.length === 0) {
    return null;
  }

  return (
    <section className="py-4">
      {/* Section Header */}
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Services We Offer</h2>
        <p className="text-sm text-gray-600">Professional bike services and repairs</p>
      </div>

      {/* Services Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {services.map((service) => (
          <motion.div key={service.id} variants={itemVariants}>
            <Card className="h-full border-gray-200 hover:border-gray-300 hover:shadow-md transition-all duration-200">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <Wrench className="h-5 w-5 text-gray-600" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 mb-1 line-clamp-2">
                      {service.name}
                    </h3>
                    {service.description && (
                      <p className="text-xs text-gray-600 line-clamp-3">
                        {service.description}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

