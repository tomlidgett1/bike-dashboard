"use client";

import React, { createContext, useContext, useState } from "react";
import type { ProductGenieContext } from "@/lib/genie/product-context";

interface GenieContextValue {
  isOpen: boolean;
  isExpanded: boolean;
  /** Set when opening from the store header — GeniePanel switches to agent mode. */
  launchAsAgent: boolean;
  /** Set when opening from a product page — shows the simplified product Q&A panel. */
  productContext: ProductGenieContext | null;
  open: () => void;
  openAgent: () => void;
  openForProduct: (context: ProductGenieContext) => void;
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
  const [productContext, setProductContext] = useState<ProductGenieContext | null>(null);

  return (
    <GenieContext.Provider
      value={{
        isOpen,
        isExpanded,
        launchAsAgent,
        productContext,
        open: () => {
          setProductContext(null);
          setIsOpen(true);
        },
        openAgent: () => {
          setProductContext(null);
          setLaunchAsAgent(true);
          setIsOpen(true);
        },
        openForProduct: (context) => {
          setLaunchAsAgent(false);
          setProductContext(context);
          setIsOpen(true);
        },
        close: () => {
          setIsOpen(false);
          setIsExpanded(false);
          setLaunchAsAgent(false);
          setProductContext(null);
        },
        toggle: () =>
          setIsOpen((value) => {
            if (value) {
              setProductContext(null);
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
