"use client";

import * as React from "react";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";

const STORAGE_KEY = "marketplace-sidebar-collapsed";

interface SidebarState {
  isCollapsed: boolean;
  toggle: () => void;
  mounted: boolean;
  isHovered: boolean;
  setIsHovered: (hovered: boolean) => void;
}

const SidebarContext = createContext<SidebarState | undefined>(undefined);

/**
 * Provider component for sidebar state
 */
export function SidebarStateProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true); // Default to collapsed
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);

  // Load initial state from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        setIsCollapsed(stored === "true");
      } else {
        // If no stored value, default to collapsed (true)
        setIsCollapsed(true);
      }
      setMounted(true);
    }
  }, []);

  // Persist state to localStorage whenever it changes
  useEffect(() => {
    if (mounted && typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(isCollapsed));
    }
  }, [isCollapsed, mounted]);

  const toggle = () => {
    setIsCollapsed((prev) => !prev);
  };

  return (
    <SidebarContext.Provider value={{ isCollapsed, toggle, mounted, isHovered, setIsHovered }}>
      {children}
    </SidebarContext.Provider>
  );
}

/**
 * Hook to access sidebar state
 */
export function useSidebarState() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebarState must be used within a SidebarStateProvider");
  }
  return context;
}

