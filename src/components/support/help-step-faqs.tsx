"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

interface FAQ {
  id: string;
  question: string;
  answer: string;
}

interface HelpStepFaqsProps {
  category: string;
  onResolved: (resolved: boolean) => void;
}

// ============================================================
// Component
// ============================================================

export function HelpStepFaqs({ category, onResolved }: HelpStepFaqsProps) {
  const [faqs, setFaqs] = React.useState<FAQ[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchFaqs = async () => {
      try {
        const res = await fetch(`/api/support/faqs?category=${category}`);
        const data = await res.json();
        setFaqs(data.faqs || []);
        // Auto-expand first FAQ
        if (data.faqs && data.faqs.length > 0) {
          setExpandedId(data.faqs[0].id);
        }
      } catch (error) {
        console.error("Failed to fetch FAQs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFaqs();
  }, [category]);

  const toggleFaq = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse space-y-4 w-full">
          <div className="h-14 bg-gray-200 rounded-md" />
          <div className="h-14 bg-gray-200 rounded-md" />
          <div className="h-14 bg-gray-200 rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-md border border-amber-200">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
          <Lightbulb className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <p className="font-medium text-amber-900">Before you submit</p>
          <p className="text-sm text-amber-700">
            Check if any of these common answers help resolve your issue
          </p>
        </div>
      </div>

      {/* FAQs */}
      {faqs.length > 0 ? (
        <div className="space-y-2">
          {faqs.map((faq) => {
            const isExpanded = expandedId === faq.id;

            return (
              <div
                key={faq.id}
                className="bg-white rounded-md border border-gray-200 overflow-hidden"
              >
                <button
                  onClick={() => toggleFaq(faq.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="font-medium text-gray-900 pr-4">{faq.question}</span>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 text-gray-400 flex-shrink-0 transition-transform duration-200",
                      isExpanded && "rotate-180"
                    )}
                  />
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        duration: 0.4,
                        ease: [0.04, 0.62, 0.23, 0.98],
                      }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 text-sm text-gray-600 border-t border-gray-100 pt-3">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-gray-500">No FAQs available for this category.</p>
          <p className="text-sm text-gray-400 mt-1">
            Please continue to submit your support request.
          </p>
        </div>
      )}

      {/* Prompt */}
      <div className="pt-4 text-center">
        <p className="text-sm text-gray-600 font-medium">
          Did any of these answers help resolve your issue?
        </p>
      </div>
    </div>
  );
}

