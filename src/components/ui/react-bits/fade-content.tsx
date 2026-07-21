"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type FadeContentProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
};

/**
 * React Bits FadeContent behaviour implemented with the app's existing
 * Framer Motion dependency, avoiding the extra GSAP runtime.
 * Source: https://reactbits.dev/animations/fade-content
 */
export function FadeContent({
  children,
  delay = 0,
  distance = 14,
  className,
  ...props
}: FadeContentProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: distance }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.08 }}
      transition={{
        duration: 0.48,
        delay,
        ease: [0.04, 0.62, 0.23, 0.98],
      }}
      className={cn(className)}
      {...(props as Omit<React.ComponentProps<typeof motion.div>, "children">)}
    >
      {children}
    </motion.div>
  );
}
