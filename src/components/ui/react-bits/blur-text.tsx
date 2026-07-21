"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type BlurTextProps = {
  text: string;
  className?: string;
  delay?: number;
  animateBy?: "words" | "letters";
  direction?: "top" | "bottom";
  as?: "span" | "h1" | "h2" | "h3" | "p";
};

/**
 * Adapted from React Bits BlurText (MIT).
 * Staggered blur-to-focus reveal, using Framer Motion to match the rest of the app.
 * Source: https://reactbits.dev/text-animations/blur-text
 */
export function BlurText({
  text,
  className,
  delay = 80,
  animateBy = "words",
  direction = "top",
  as: Tag = "span",
}: BlurTextProps) {
  const reduceMotion = useReducedMotion();
  const segments = animateBy === "words" ? text.split(" ") : text.split("");
  const fromY = direction === "top" ? -18 : 18;

  return (
    <Tag className={cn("inline-flex flex-wrap", className)}>
      {segments.map((segment, index) => (
        <motion.span
          key={`${segment}-${index}`}
          initial={
            reduceMotion
              ? false
              : { filter: "blur(8px)", opacity: 0, y: fromY }
          }
          whileInView={
            reduceMotion
              ? undefined
              : { filter: "blur(0px)", opacity: 1, y: 0 }
          }
          viewport={{ once: true, amount: 0.4 }}
          transition={{
            duration: 0.55,
            delay: (index * delay) / 1000,
            ease: [0.04, 0.62, 0.23, 0.98],
          }}
          className="inline-block will-change-[transform,filter,opacity]"
        >
          {segment === " " ? "\u00A0" : segment}
          {animateBy === "words" && index < segments.length - 1 ? "\u00A0" : null}
        </motion.span>
      ))}
    </Tag>
  );
}
