"use client";

import * as React from "react";
import { X, CheckCircle2, AlertCircle, Upload, Sparkles, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useUpload } from "@/components/providers/upload-provider";
import { cn } from "@/lib/utils";
import Image from "next/image";

// ============================================================
// Floating Upload Bar
// ============================================================
// A compact, persistent status bar that shows upload progress
// while allowing users to continue browsing the app.
// On mobile, shows a larger initial banner that can be minimised.
// ============================================================

export function FloatingUploadBar() {
  const { isUploading, stage, currentMessage, error, cancelUpload } = useUpload();
  const [isMinimised, setIsMinimised] = React.useState(false);
  const [uploadStartTime, setUploadStartTime] = React.useState<number | null>(null);

  // Track when upload starts to show expanded view initially
  React.useEffect(() => {
    if (isUploading && stage !== "idle" && !uploadStartTime) {
      setUploadStartTime(Date.now());
      setIsMinimised(false);
    }
    
    // Reset when upload finishes
    if (stage === "idle" || stage === "success" || stage === "error") {
      setUploadStartTime(null);
    }
  }, [isUploading, stage, uploadStartTime]);

  // Don't render if not uploading
  if (!isUploading && stage === "idle") {
    return null;
  }

  const isProcessing = stage !== "idle" && stage !== "success" && stage !== "error";
  const isSuccess = stage === "success";
  const isError = stage === "error";
  
  // Check if current message is about Uber delivery
  const isUberMessage = currentMessage.includes("1 hour delivery");

  // On mobile, show expanded view when not minimised
  const showExpandedMobile = isProcessing && !isMinimised;

  return (
    <AnimatePresence>
      {(isProcessing || isSuccess || isError) && (
        <>
          {/* Mobile Expanded Banner - Full width top banner */}
          <AnimatePresence>
            {showExpandedMobile && (
              <motion.div
                initial={{ y: -100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -100, opacity: 0 }}
                transition={{ 
                  duration: 0.4, 
                  ease: [0.04, 0.62, 0.23, 0.98] 
                }}
                className="fixed top-0 left-0 right-0 z-[100] sm:hidden"
              >
                <div className="bg-gray-900 text-white shadow-xl">
                  {/* Animated progress bar at top */}
                  <div className="h-1 bg-gray-800 overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-[#FFC72C] via-yellow-300 to-[#FFC72C]"
                      initial={{ x: "-100%" }}
                      animate={{ x: "100%" }}
                      transition={{ 
                        duration: 1.5, 
                        ease: "linear",
                        repeat: Infinity,
                      }}
                      style={{ width: "50%" }}
                    />
                  </div>

                  <div className="px-4 py-4">
                    {/* Header with icon */}
                    <div className="flex items-start gap-3">
                      {/* Animated upload icon */}
                      <div className="flex-shrink-0">
                        <div className="relative">
                          <div className="h-12 w-12 rounded-xl bg-[#FFC72C]/20 flex items-center justify-center">
                            <motion.div
                              animate={{ 
                                scale: [1, 1.1, 1],
                              }}
                              transition={{
                                duration: 2,
                                repeat: Infinity,
                                ease: "easeInOut",
                              }}
                            >
                              <Sparkles className="h-6 w-6 text-[#FFC72C]" />
                            </motion.div>
                          </div>
                          {/* Pulse ring */}
                          <motion.div
                            className="absolute inset-0 rounded-xl border-2 border-[#FFC72C]"
                            animate={{
                              scale: [1, 1.3],
                              opacity: [0.5, 0],
                            }}
                            transition={{
                              duration: 1.5,
                              repeat: Infinity,
                              ease: "easeOut",
                            }}
                          />
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-white mb-1">
                          Uploading your product...
                        </h3>
                        <div className="flex items-center gap-2 min-h-[20px]">
                          <AnimatePresence mode="wait">
                            <motion.p
                              key={currentMessage}
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              transition={{
                                duration: 0.3,
                                ease: [0.04, 0.62, 0.23, 0.98],
                              }}
                              className="text-sm text-gray-300"
                            >
                              {currentMessage}
                            </motion.p>
                          </AnimatePresence>
                          {isUberMessage && (
                            <Image 
                              src="/delivery.png" 
                              alt="Uber" 
                              width={48}
                              height={16}
                              className="flex-shrink-0 brightness-0 invert opacity-70"
                            />
                          )}
                        </div>
                      </div>

                      {/* Minimise button */}
                      <button
                        onClick={() => setIsMinimised(true)}
                        className="p-2 rounded-md hover:bg-white/10 active:bg-white/20 transition-colors flex-shrink-0"
                        aria-label="Minimise"
                      >
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      </button>
                    </div>

                    {/* Animated dots row */}
                    <div className="mt-3 flex items-center justify-center gap-1.5">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <motion.div
                          key={i}
                          animate={{
                            scale: [1, 1.5, 1],
                            opacity: [0.3, 1, 0.3],
                          }}
                          transition={{
                            duration: 1.2,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: i * 0.15,
                          }}
                          className="h-1.5 w-1.5 bg-[#FFC72C] rounded-full"
                        />
                      ))}
                    </div>

                    {/* Subtle message */}
                    <p className="mt-3 text-xs text-gray-500 text-center">
                      Feel free to continue browsing while we process your listing
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Compact Toast - Desktop always, Mobile when minimised */}
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
              "sm:w-[320px]",
              // Hide on mobile when expanded banner is showing
              showExpandedMobile && "hidden sm:block"
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

                {/* Expand button on mobile (when minimised) */}
                {isProcessing && isMinimised && (
                  <button
                    onClick={() => setIsMinimised(false)}
                    className="p-1.5 rounded-md hover:bg-gray-100 transition-colors flex-shrink-0 sm:hidden"
                    aria-label="Expand"
                  >
                    <Upload className="h-4 w-4 text-gray-500" />
                  </button>
                )}

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
        </>
      )}
    </AnimatePresence>
  );
}

