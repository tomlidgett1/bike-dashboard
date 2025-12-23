"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// AI Analysis Loading Screen
// ============================================================

interface AIAnalysisLoadingProps {
  photoCount: number;
  progress?: {
    step: string;
    completed: boolean;
  }[];
}

export function AIAnalysisLoading({ photoCount, progress }: AIAnalysisLoadingProps) {
  const defaultProgress = [
    { step: "Detecting item type", completed: true },
    { step: "Identifying brand and model", completed: false },
    { step: "Analysing specifications", completed: false },
    { step: "Assessing condition", completed: false },
    { step: "Estimating value", completed: false },
  ];

  const steps = progress || defaultProgress;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl border border-gray-200 p-8">
        <div className="space-y-6">
          {/* Animated Indicator */}
          <div className="flex justify-center">
            <div className="relative">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-12 h-12 rounded-full border-4 border-gray-200 border-t-gray-900"
              />
            </div>
          </div>

          {/* Title */}
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold text-gray-900">
              Analysing Your Photos
            </h2>
            <p className="text-sm text-gray-600">
              Processing {photoCount} photo{photoCount > 1 ? 's' : ''}
            </p>
          </div>

          {/* Progress Steps */}
          <div className="space-y-2">
            {steps.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center gap-3"
              >
                {item.completed ? (
                  <CheckCircle2 className="h-4 w-4 text-gray-600 flex-shrink-0" />
                ) : (
                  <Loader2 className="h-4 w-4 text-gray-400 animate-spin flex-shrink-0" />
                )}
                <span
                  className={cn(
                    "text-sm",
                    item.completed ? "text-gray-900 font-medium" : "text-gray-600"
                  )}
                >
                  {item.step}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Time Estimate */}
          <div className="text-center pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              This usually takes 15-30 seconds
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

