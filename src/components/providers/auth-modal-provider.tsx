"use client";

import * as React from "react";
import { createContext, useContext, useState, useCallback } from "react";
import dynamic from "next/dynamic";

const AuthModal = dynamic(
  () => import("@/components/marketplace/auth-modal").then((mod) => mod.AuthModal),
  { ssr: false }
);

export type AuthModalMode = "signin" | "signup";

interface AuthModalContextType {
  openAuthModal: (options?: { mode?: AuthModalMode }) => void;
  closeAuthModal: () => void;
  isOpen: boolean;
  mode: AuthModalMode;
}

const AuthModalContext = createContext<AuthModalContextType>({
  openAuthModal: () => {},
  closeAuthModal: () => {},
  isOpen: false,
  mode: "signin",
});

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AuthModalMode>("signin");

  const openAuthModal = useCallback((options?: { mode?: AuthModalMode }) => {
    setMode(options?.mode ?? "signin");
    setIsOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsOpen(false);
    setMode("signin");
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setMode("signin");
    }
  }, []);

  return (
    <AuthModalContext.Provider
      value={{ openAuthModal, closeAuthModal, isOpen, mode }}
    >
      {children}
      <AuthModal open={isOpen} onOpenChange={handleOpenChange} mode={mode} />
    </AuthModalContext.Provider>
  );
}

export const useAuthModal = () => {
  const context = useContext(AuthModalContext);
  if (!context) {
    throw new Error("useAuthModal must be used within an AuthModalProvider");
  }
  return context;
};
