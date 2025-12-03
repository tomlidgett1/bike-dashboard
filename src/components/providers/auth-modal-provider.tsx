"use client";

import * as React from "react";
import { createContext, useContext, useState, useCallback } from "react";
import { AuthModal } from "@/components/marketplace/auth-modal";

interface AuthModalContextType {
  openAuthModal: () => void;
  closeAuthModal: () => void;
  isOpen: boolean;
}

const AuthModalContext = createContext<AuthModalContextType>({
  openAuthModal: () => {},
  closeAuthModal: () => {},
  isOpen: false,
});

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openAuthModal = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <AuthModalContext.Provider value={{ openAuthModal, closeAuthModal, isOpen }}>
      {children}
      <AuthModal open={isOpen} onOpenChange={setIsOpen} />
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

