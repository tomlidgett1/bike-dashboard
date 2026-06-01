"use client";

import React, { createContext, useContext, useState } from 'react';

interface MessagesContextValue {
  isOpen: boolean;
  isExpanded: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  toggleExpand: () => void;
  openConversation: (id: string) => void;
  requestedConversationId: string | null;
  clearRequestedConversation: () => void;
  openTab: (tab: 'messages' | 'offers') => void;
  requestedTab: 'messages' | 'offers' | null;
  clearRequestedTab: () => void;
}

const MessagesContext = createContext<MessagesContextValue | null>(null);

export function MessagesProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [requestedConversationId, setRequestedConversationId] = useState<string | null>(null);
  const [requestedTab, setRequestedTab] = useState<'messages' | 'offers' | null>(null);

  return (
    <MessagesContext.Provider value={{
      isOpen,
      isExpanded,
      open: () => setIsOpen(true),
      close: () => { setIsOpen(false); setIsExpanded(false); },
      toggle: () => setIsOpen(v => !v),
      toggleExpand: () => setIsExpanded(v => !v),
      openConversation: (id: string) => {
        setRequestedConversationId(id);
        setIsOpen(true);
      },
      requestedConversationId,
      clearRequestedConversation: () => setRequestedConversationId(null),
      openTab: (tab: 'messages' | 'offers') => {
        setRequestedTab(tab);
        setIsOpen(true);
      },
      requestedTab,
      clearRequestedTab: () => setRequestedTab(null),
    }}>
      {children}
    </MessagesContext.Provider>
  );
}

export function useMessages() {
  const ctx = useContext(MessagesContext);
  if (!ctx) throw new Error('useMessages must be used within MessagesProvider');
  return ctx;
}
