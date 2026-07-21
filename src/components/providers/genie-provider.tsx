"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import type { ProductGenieContext } from "@/lib/genie/product-context";

interface GenieContextValue {
  isOpen: boolean;
  isExpanded: boolean;
  /** Set when opening from the store header — GeniePanel switches to agent mode. */
  launchAsAgent: boolean;
  /** Set when opening from a product page — shows the simplified product Q&A panel. */
  productContext: ProductGenieContext | null;
  /** Question seeded when opening from an ask bar; consumed once by ProductGeniePanel. */
  pendingProductQuestion: string | null;
  open: () => void;
  openAgent: () => void;
  openForProduct: (
    context: ProductGenieContext,
    options?: { question?: string },
  ) => void;
  consumePendingProductQuestion: () => string | null;
  close: () => void;
  toggle: () => void;
  toggleExpand: () => void;
  acknowledgeAgentLaunch: () => void;
}

const GenieContext = createContext<GenieContextValue | null>(null);

export function GenieProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [launchAsAgent, setLaunchAsAgent] = useState(false);
  const [productContext, setProductContext] =
    useState<ProductGenieContext | null>(null);
  const [pendingProductQuestion, setPendingProductQuestion] = useState<
    string | null
  >(null);
  const pendingQuestionRef = useRef<string | null>(null);

  const clearPendingQuestion = useCallback(() => {
    pendingQuestionRef.current = null;
    setPendingProductQuestion(null);
  }, []);

  const consumePendingProductQuestion = useCallback(() => {
    const taken = pendingQuestionRef.current;
    pendingQuestionRef.current = null;
    setPendingProductQuestion(null);
    return taken;
  }, []);

  return (
    <GenieContext.Provider
      value={{
        isOpen,
        isExpanded,
        launchAsAgent,
        productContext,
        pendingProductQuestion,
        open: () => {
          setProductContext(null);
          clearPendingQuestion();
          setIsOpen(true);
        },
        openAgent: () => {
          setProductContext(null);
          clearPendingQuestion();
          setLaunchAsAgent(true);
          setIsOpen(true);
        },
        openForProduct: (context, options) => {
          const question = options?.question?.trim() || null;
          setLaunchAsAgent(false);
          setProductContext(context);
          pendingQuestionRef.current = question;
          setPendingProductQuestion(question);
          setIsOpen(true);
        },
        consumePendingProductQuestion,
        close: () => {
          setIsOpen(false);
          setIsExpanded(false);
          setLaunchAsAgent(false);
          setProductContext(null);
          clearPendingQuestion();
        },
        toggle: () =>
          setIsOpen((value) => {
            if (value) {
              setProductContext(null);
              clearPendingQuestion();
              setLaunchAsAgent(false);
            }
            return !value;
          }),
        toggleExpand: () => setIsExpanded((value) => !value),
        acknowledgeAgentLaunch: () => setLaunchAsAgent(false),
      }}
    >
      {children}
    </GenieContext.Provider>
  );
}

export function useGenie() {
  const ctx = useContext(GenieContext);
  if (!ctx) throw new Error("useGenie must be used within GenieProvider");
  return ctx;
}
