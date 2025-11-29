"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ============================================================
// Step 0: Upload Method Choice
// ============================================================

interface UploadMethodChoiceProps {
  onSelectSmart: () => void;
  onSelectManual: () => void;
}

export function UploadMethodChoice({ onSelectSmart, onSelectManual }: UploadMethodChoiceProps) {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold text-gray-900">Create Your Listing</h2>
        <p className="text-sm text-gray-600">Choose your preferred method</p>
      </div>

      {/* Choice Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Smart Upload */}
        <motion.button
          type="button"
          onClick={onSelectSmart}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="text-left"
        >
          <Card className="h-full p-6 rounded-md border-2 border-gray-900 bg-white hover:shadow-lg transition-all">
            <div className="space-y-2">
              <div>
                <h3 className="text-base font-bold text-gray-900 mb-1">
                  Smart Upload
                </h3>
                <p className="text-sm text-gray-600 mb-2">
                  AI-Powered Analysis
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  Upload photos and AI detects your product details automatically.
                </p>
              </div>
            </div>
          </Card>
        </motion.button>

        {/* Manual Entry */}
        <motion.button
          type="button"
          onClick={onSelectManual}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="text-left"
        >
          <Card className="h-full p-6 rounded-md border-2 border-gray-200 bg-white hover:border-gray-300 hover:shadow-lg transition-all">
            <div className="space-y-2">
              <div>
                <h3 className="text-base font-bold text-gray-900 mb-1">
                  Manual Entry
                </h3>
                <p className="text-sm text-gray-600 mb-2">
                  Traditional Method
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  Fill out the form yourself with full control over every detail.
                </p>
              </div>
            </div>
          </Card>
        </motion.button>
      </div>
    </div>
  );
}
