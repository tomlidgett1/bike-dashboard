"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Sparkles, ExternalLink, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AISearchResponse } from "@/types/ai-search";

// ============================================================
// AI Search Response Display Component
// Shows structured AI cycling expert responses
// ============================================================

interface AISearchResponseProps {
  response: AISearchResponse;
  isLoading?: boolean;
}

export function AISearchResponseDisplay({ response, isLoading }: AISearchResponseProps) {
  const [showSpecs, setShowSpecs] = React.useState(false);
  const [showRecommendations, setShowRecommendations] = React.useState(false);

  if (isLoading) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="p-4 bg-white border-b border-gray-200"
      >
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-[#FFC72C] animate-pulse" />
          <span className="text-sm font-medium text-gray-700">Cycling Expert is thinking...</span>
          <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md animate-pulse">
            Searching the web
          </span>
        </div>
        <div className="space-y-2.5">
          <div className="h-3 bg-gray-200 rounded-md w-full animate-pulse" />
          <div className="h-3 bg-gray-200 rounded-md w-11/12 animate-pulse" />
          <div className="h-3 bg-gray-200 rounded-md w-10/12 animate-pulse" />
          <div className="h-3 bg-gray-200 rounded-md w-9/12 animate-pulse" />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <div className="h-2 w-2 bg-[#FFC72C] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="h-2 w-2 bg-[#FFC72C] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="h-2 w-2 bg-[#FFC72C] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        ease: [0.04, 0.62, 0.23, 0.98],
      }}
      className="p-4 bg-white"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-[#FFC72C]" />
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Cycling Expert
        </span>
        <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
          AI-Powered
        </span>
      </div>

      {/* Introduction */}
      <div className="mb-4">
        <p className="text-sm text-gray-700 leading-relaxed">
          {response.introduction}
        </p>
      </div>

      {/* Key Points */}
      {response.keyPoints && response.keyPoints.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
            Key Points
          </h4>
          <ul className="space-y-2">
            {response.keyPoints.map((point, index) => (
              <motion.li
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.3,
                  delay: index * 0.1,
                  ease: [0.04, 0.62, 0.23, 0.98],
                }}
                className="flex items-start gap-2 text-sm text-gray-700"
              >
                <span className="mt-1.5 h-1 w-1 rounded-full bg-[#FFC72C] flex-shrink-0" />
                <span className="leading-relaxed">{point}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      )}

      {/* Specifications (Collapsible) */}
      {response.specifications && response.specifications.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowSpecs(!showSpecs)}
            className="flex items-center gap-2 w-full text-left mb-2 hover:opacity-80 transition-opacity"
          >
            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Technical Specifications
            </h4>
            <ChevronDown
              className={cn(
                "h-3 w-3 text-gray-400 transition-transform duration-200",
                showSpecs && "rotate-180"
              )}
            />
          </button>
          
          <motion.div
            initial={false}
            animate={{
              height: showSpecs ? "auto" : 0,
              opacity: showSpecs ? 1 : 0,
            }}
            transition={{
              duration: 0.4,
              ease: [0.04, 0.62, 0.23, 0.98],
            }}
            className="overflow-hidden"
          >
            <div className="bg-gray-50 rounded-md p-3 space-y-2">
              {response.specifications.map((spec, index) => (
                <div key={index} className="flex justify-between items-start gap-4">
                  <span className="text-xs font-medium text-gray-600">{spec.label}:</span>
                  <span className="text-xs text-gray-900 text-right">{spec.value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* Recommendations (Collapsible) */}
      {response.recommendations && response.recommendations.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowRecommendations(!showRecommendations)}
            className="flex items-center gap-2 w-full text-left mb-2 hover:opacity-80 transition-opacity"
          >
            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Recommendations
            </h4>
            <ChevronDown
              className={cn(
                "h-3 w-3 text-gray-400 transition-transform duration-200",
                showRecommendations && "rotate-180"
              )}
            />
          </button>
          
          <motion.div
            initial={false}
            animate={{
              height: showRecommendations ? "auto" : 0,
              opacity: showRecommendations ? 1 : 0,
            }}
            transition={{
              duration: 0.4,
              ease: [0.04, 0.62, 0.23, 0.98],
            }}
            className="overflow-hidden"
          >
            <ul className="space-y-2 bg-gray-50 rounded-md p-3">
              {response.recommendations.map((rec, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-1.5 h-1 w-1 rounded-full bg-gray-400 flex-shrink-0" />
                  <span className="leading-relaxed">{rec}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      )}

      {/* Sources */}
      {response.sources && response.sources.length > 0 && (
        <div className="border-t border-gray-200 pt-3">
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
            Sources
          </h4>
          <div className="flex flex-wrap gap-2">
            {response.sources.slice(0, 3).map((source, index) => (
              <a
                key={index}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-md hover:border-gray-300 hover:bg-gray-50 transition-colors group text-xs"
              >
                <span className="text-gray-700 font-medium truncate max-w-[120px]">
                  {source.domain}
                </span>
                <ExternalLink className="h-3 w-3 text-gray-400 group-hover:text-gray-600 flex-shrink-0" />
              </a>
            ))}
            {response.sources.length > 3 && (
              <span className="inline-flex items-center px-2.5 py-1.5 text-xs text-gray-500">
                +{response.sources.length - 3} more
              </span>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

