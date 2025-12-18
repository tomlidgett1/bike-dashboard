"use client";

import * as React from "react";

// ============================================================
// Sell Modal Provider
// Simple context to trigger the sell/list modal from anywhere
// ============================================================

interface SellModalContextType {
  openSellModal: () => void;
  registerHandler: (handler: () => void) => void;
}

const SellModalContext = React.createContext<SellModalContextType | null>(null);

export function SellModalProvider({ children }: { children: React.ReactNode }) {
  const handlerRef = React.useRef<(() => void) | null>(null);

  const registerHandler = React.useCallback((handler: () => void) => {
    handlerRef.current = handler;
  }, []);

  const openSellModal = React.useCallback(() => {
    if (handlerRef.current) {
      handlerRef.current();
    }
  }, []);

  return (
    <SellModalContext.Provider value={{ openSellModal, registerHandler }}>
      {children}
    </SellModalContext.Provider>
  );
}

export function useSellModal() {
  const context = React.useContext(SellModalContext);
  if (!context) {
    throw new Error("useSellModal must be used within a SellModalProvider");
  }
  return context;
}


