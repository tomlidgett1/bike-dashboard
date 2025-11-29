"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Sparkles, FileText } from "lucide-react";
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
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-gray-900">Create Your Listing</h2>
        <p className="text-gray-600">
          Choose how you'd like to create your listing
        </p>
      </div>

      {/* Choice Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Smart Upload */}
        <motion.button
          type="button"
          onClick={onSelectSmart}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="text-left"
        >
          <Card className="h-full p-8 rounded-md border-2 border-gray-900 bg-gradient-to-br from-gray-50 to-white hover:shadow-xl transition-all">
            <div className="space-y-6">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-gray-900 text-white text-xs font-semibold rounded-full">
                <Sparkles className="h-3 w-3" />
                RECOMMENDED
              </div>

              {/* Icon */}
              <div className="w-16 h-16 rounded-full bg-gray-900 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-white" />
              </div>

              {/* Title */}
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  Smart Upload
                </h3>
                <p className="text-lg text-gray-600 mb-4">
                  AI-Powered ⚡
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  Upload photos and let AI analyze your product. Brand, model, condition,
                  and specs are automatically detected in seconds.
                </p>
              </div>

              {/* Benefits */}
              <div className="space-y-2 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="text-green-600">✓</span>
                  <span>10x faster than manual entry</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="text-green-600">✓</span>
                  <span>95% accurate product detection</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="text-green-600">✓</span>
                  <span>Professional condition assessment</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="text-green-600">✓</span>
                  <span>Smart price suggestions</span>
                </div>
              </div>

              {/* Time estimate */}
              <div className="pt-2">
                <p className="text-sm font-semibold text-gray-900">
                  ⏱️ Takes ~2 minutes
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
          <Card className="h-full p-8 rounded-md border-2 border-gray-200 bg-white hover:border-gray-300 hover:shadow-lg transition-all">
            <div className="space-y-6">
              {/* Icon */}
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                <FileText className="h-8 w-8 text-gray-600" />
              </div>

              {/* Title */}
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  Manual Entry
                </h3>
                <p className="text-lg text-gray-600 mb-4">
                  Traditional Method
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  Fill out the detailed form yourself with complete control over every
                  field and description.
                </p>
              </div>

              {/* Benefits */}
              <div className="space-y-2 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="text-gray-400">✓</span>
                  <span>Full control over details</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="text-gray-400">✓</span>
                  <span>Perfect for unique items</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="text-gray-400">✓</span>
                  <span>No AI analysis needed</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="text-gray-400">✓</span>
                  <span>Comprehensive form wizard</span>
                </div>
              </div>

              {/* Time estimate */}
              <div className="pt-2">
                <p className="text-sm font-semibold text-gray-600">
                  ⏱️ Takes ~10 minutes
                </p>
              </div>
            </div>
          </Card>
        </motion.button>
      </div>

      {/* Info Box */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
        <p className="text-sm text-gray-700">
          <span className="font-semibold">💡 New!</span> Try our AI Smart Upload powered by
          advanced computer vision. It analyzes your photos like a professional bike mechanic.
        </p>
      </div>
    </div>
  );
}

