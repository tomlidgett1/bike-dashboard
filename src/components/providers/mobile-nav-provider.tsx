'use client';

import React, { createContext, useContext, useState } from 'react';

interface MobileNavContextType {
  isHidden: boolean;
  setIsHidden: (hidden: boolean) => void;
}

const MobileNavContext = createContext<MobileNavContextType | undefined>(undefined);

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [isHidden, setIsHidden] = useState(false);

  return (
    <MobileNavContext.Provider value={{ isHidden, setIsHidden }}>
      {children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav() {
  const context = useContext(MobileNavContext);
  // Return a no-op default during SSR or when provider is not available
  // This prevents hydration errors when the provider hasn't mounted yet
  if (context === undefined) {
    return {
      isHidden: false,
      setIsHidden: () => {},
    };
  }
  return context;
}







