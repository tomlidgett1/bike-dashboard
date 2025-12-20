"use client";

import * as React from "react";
import { X, CheckCircle2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useUpload } from "@/components/providers/upload-provider";
import { cn } from "@/lib/utils";
import Image from "next/image";

// ============================================================
// Floating Upload Bar
// ============================================================
// A compact, persistent status bar that shows upload progress
// while allowing users to continue browsing the app.
// Uses the same rotating text animation as the AI Research panel.
// ============================================================

export function FloatingUploadBar() {
  const { isUploading, stage, currentMessage, error, cancelUpload } = useUpload();

  // Don't render if not uploading
  if (!isUploading && stage === "idle") {
    return null;
  }

  const isProcessing = stage !== "idle" && stage !== "success" && stage !== "error";
  const isSuccess = stage === "success";
  const isError = stage === "error";
  
  // Check if current message is about Uber delivery
  const isUberMessage = currentMessage.includes("1 hour delivery");

  return (
    <AnimatePresence>
      {(isProcessing || isSuccess || isError) && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ 
            duration: 0.4, 
            ease: [0.04, 0.62, 0.23, 0.98] 
          }}
          className={cn(
            "fixed bottom-6 left-4 right-4 sm:left-auto sm:right-6 z-[90]",
            "sm:w-[320px]"
          )}
        >
          <div 
            className={cn(
              "bg-white rounded-xl shadow-lg border overflow-hidden",
              isError ? "border-red-200" : "border-gray-200"
            )}
          >
            {/* Progress bar at top */}
            {isProcessing && (
              <div className="h-0.5 bg-gray-100 overflow-hidden">
                <motion.div
                  className="h-full bg-[#FFC72C]"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ 
                    duration: 30, 
                    ease: "linear",
                    repeat: Infinity,
                  }}
                />
              </div>
            )}

            {/* Content */}
            <div className="px-4 py-3 flex items-center gap-3">
              {/* Status indicator */}
              {isProcessing && (
                <div className="flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={{
                        scale: [1, 1.3, 1],
                        opacity: [0.4, 1, 0.4],
                      }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 0.15,
                      }}
                      className="h-1.5 w-1.5 bg-[#FFC72C] rounded-full"
                    />
                  ))}
                </div>
              )}

              {isSuccess && (
                <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </div>
              )}

              {isError && (
                <div className="h-6 w-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                </div>
              )}

              {/* Message with rotating animation */}
              <div className="flex-1 min-w-0 h-5 flex items-center overflow-hidden">
                {isProcessing && (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentMessage}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{
                        duration: 0.4,
                        ease: [0.04, 0.62, 0.23, 0.98],
                      }}
                      className="flex items-center gap-2 min-w-0"
                    >
                      <p className="text-sm font-medium text-gray-700 truncate">
                        {currentMessage}
                      </p>
                      {isUberMessage && (
                        <Image 
                          src="/delivery.png" 
                          alt="Uber" 
                          width={48}
                          height={16}
                          className="flex-shrink-0"
                        />
                      )}
                    </motion.div>
                  </AnimatePresence>
                )}

                {isSuccess && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm font-medium text-gray-900"
                  >
                    Analysis complete!
                  </motion.p>
                )}

                {isError && (
                  <p className="text-sm font-medium text-red-700 truncate">
                    {error || "Something went wrong"}
                  </p>
                )}
              </div>

              {/* Cancel button (only during processing) */}
              {isProcessing && (
                <button
                  onClick={cancelUpload}
                  className="p-1.5 rounded-md hover:bg-gray-100 transition-colors flex-shrink-0"
                  aria-label="Cancel upload"
                >
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

