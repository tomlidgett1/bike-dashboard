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
  if (context === undefined) {
    throw new Error('useMobileNav must be used within MobileNavProvider');
  }
  return context;
}



