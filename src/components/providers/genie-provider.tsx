"use client";

import React, { createContext, useContext, useState } from 'react';

interface GenieContextValue {
  isOpen: boolean;
  isExpanded: boolean;
  /** Set when opening from the store header — GeniePanel switches to agent mode. */
  launchAsAgent: boolean;
  open: () => void;
  openAgent: () => void;
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

  return (
    <GenieContext.Provider value={{
      isOpen,
      isExpanded,
      launchAsAgent,
      open: () => setIsOpen(true),
      openAgent: () => {
        setLaunchAsAgent(true);
        setIsOpen(true);
      },
      close: () => {
        setIsOpen(false);
        setIsExpanded(false);
        setLaunchAsAgent(false);
      },
      toggle: () => setIsOpen(v => !v),
      toggleExpand: () => setIsExpanded(v => !v),
      acknowledgeAgentLaunch: () => setLaunchAsAgent(false),
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
