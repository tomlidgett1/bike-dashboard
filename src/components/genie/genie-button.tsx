"use client";

import { useGenie } from '@/components/providers/genie-provider';
import { motion } from 'framer-motion';
import AIMotionOrb from './ai-motion-orb';

export function GenieButton() {
  const { isOpen, isExpanded, toggle } = useGenie();
  if (isOpen || isExpanded) return null;

  return (
    <motion.button
      onClick={toggle}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', damping: 18, stiffness: 260, delay: 0.5 }}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      className="fixed bottom-6 right-6 z-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full mb-[env(safe-area-inset-bottom)]"
      aria-label={isOpen ? 'Close Genie' : 'Open Yellow Jersey Genius'}
    >
      <AIMotionOrb size={56} />
    </motion.button>
  );
}
