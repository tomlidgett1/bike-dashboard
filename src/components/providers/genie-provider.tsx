"use client";

import React, { createContext, useContext, useState } from 'react';

interface GenieContextValue {
  isOpen: boolean;
  isExpanded: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  toggleExpand: () => void;
}

const GenieContext = createContext<GenieContextValue | null>(null);

export function GenieProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <GenieContext.Provider value={{
      isOpen,
      isExpanded,
      open: () => setIsOpen(true),
      close: () => { setIsOpen(false); setIsExpanded(false); },
      toggle: () => setIsOpen(v => !v),
      toggleExpand: () => setIsExpanded(v => !v),
    }}>
      {children}
    </GenieContext.Provider>
  );
}

export function useGenie() {
  const ctx = useContext(GenieContext);
  if (!ctx) throw new Error('useGenie must be used within GenieProvider');
  return ctx;
}
