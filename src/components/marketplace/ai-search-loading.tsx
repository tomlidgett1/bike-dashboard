"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";

// ============================================================
// AI Search Animated Loading Component
// Shows rotating messages with smooth animations
// ============================================================

const LOADING_MESSAGES = [
  "Thinking...",
  "Searching the web...",
  "Analysing cycling websites...",
  "Gathering expert insights...",
  "Compiling information...",
];

export function AISearchLoading() {
  const [messageIndex, setMessageIndex] = React.useState(0);

  // Rotate messages every 2.5 seconds
  React.useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="p-6 bg-white border-b border-gray-200"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-[#FFC72C] animate-pulse" />
        <span className="text-sm font-semibold text-gray-800">Cycling Expert</span>
        <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-md">
          AI-Powered
        </span>
      </div>

      {/* Animated Message */}
      <div className="mb-4 h-6 flex items-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={messageIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{
              duration: 0.4,
              ease: [0.04, 0.62, 0.23, 0.98],
            }}
            className="text-sm font-medium text-gray-600"
          >
            {LOADING_MESSAGES[messageIndex]}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Skeleton Lines */}
      <div className="space-y-2.5 mb-4">
        <motion.div
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          className="h-3 bg-gray-200 rounded-md w-full"
        />
        <motion.div
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
          className="h-3 bg-gray-200 rounded-md w-11/12"
        />
        <motion.div
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
          className="h-3 bg-gray-200 rounded-md w-10/12"
        />
        <motion.div
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
          className="h-3 bg-gray-200 rounded-md w-9/12"
        />
      </div>

      {/* Animated Dots */}
      <div className="flex items-center gap-1.5">
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
            className="h-2 w-2 bg-[#FFC72C] rounded-full"
          />
        ))}
      </div>
    </motion.div>
  );
}



