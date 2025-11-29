"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Bike, CheckCircle2, Loader2 } from "lucide-react";
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
    { step: "Analyzing specifications", completed: false },
    { step: "Assessing condition", completed: false },
    { step: "Estimating value", completed: false },
  ];

  const steps = progress || defaultProgress;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl border border-gray-200 p-12">
        <div className="space-y-8">
          {/* Animated Icon */}
          <div className="flex justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-24 h-24 rounded-full bg-gray-900 flex items-center justify-center"
            >
              <Bike className="h-12 w-12 text-white" />
            </motion.div>
          </div>

          {/* Title */}
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-gray-900">
              AI Analysis in Progress
            </h2>
            <p className="text-gray-600">
              Our cycling expert AI is examining your {photoCount} photo{photoCount > 1 ? 's' : ''}...
            </p>
          </div>

          {/* Progress Steps */}
          <div className="space-y-3">
            {steps.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center gap-3"
              >
                {item.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                ) : (
                  <Loader2 className="h-5 w-5 text-gray-400 animate-spin flex-shrink-0" />
                )}
                <span
                  className={cn(
                    "text-sm font-medium",
                    item.completed ? "text-gray-900" : "text-gray-600"
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

          {/* Fun Fact */}
          <div className="bg-gray-50 rounded-md p-4 border border-gray-200">
            <p className="text-xs text-gray-700">
              <span className="font-semibold">💡 Did you know?</span> Our AI has been trained on
              thousands of cycling products and can identify components down to the model year
              with professional-grade accuracy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

