"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export type BounceCardItem = {
  imageUrl: string;
  title: string;
  subtitle?: string | null;
  alt?: string;
};

type BounceCardsProps = {
  items: BounceCardItem[];
  className?: string;
  animationDelay?: number;
  animationStagger?: number;
  enableHover?: boolean;
};

type FanPose = { rotate: number; x: string };

function fanPoses(count: number): FanPose[] {
  if (count <= 1) return [{ rotate: 0, x: "0%" }];
  if (count === 2) {
    return [
      { rotate: 5, x: "-42%" },
      { rotate: -5, x: "42%" },
    ];
  }
  if (count === 3) {
    return [
      { rotate: 6, x: "-78%" },
      { rotate: -2, x: "0%" },
      { rotate: -6, x: "78%" },
    ];
  }
  if (count === 4) {
    return [
      { rotate: 7, x: "-105%" },
      { rotate: 3, x: "-35%" },
      { rotate: -4, x: "35%" },
      { rotate: 2, x: "105%" },
    ];
  }
  return [
    { rotate: 8, x: "-118%" },
    { rotate: 4, x: "-59%" },
    { rotate: -2, x: "0%" },
    { rotate: -6, x: "59%" },
    { rotate: 3, x: "118%" },
  ];
}

/**
 * Adapted from React Bits BounceCards (MIT).
 * Fanned photo cards with an elastic scale-in on load.
 * Source: https://reactbits.dev/components/bounce-cards
 */
export function BounceCards({
  items,
  className,
  animationDelay = 0.2,
  animationStagger = 0.08,
  enableHover = true,
}: BounceCardsProps) {
  const reduceMotion = useReducedMotion();
  const [hovered, setHovered] = React.useState<number | null>(null);
  const cards = items.slice(0, 5);
  const poses = fanPoses(cards.length);

  if (cards.length === 0) return null;

  return (
    <div
      className={cn(
        "relative mx-auto flex h-[220px] w-full max-w-[640px] items-center justify-center sm:h-[250px]",
        className,
      )}
    >
      {cards.map((item, index) => {
        const base = poses[index] ?? { rotate: 0, x: "0%" };
        const isHovered = hovered === index;
        const active =
          enableHover && hovered !== null
            ? isHovered
              ? { rotate: 0, x: base.x }
              : {
                  rotate: base.rotate,
                  x:
                    typeof base.x === "string" && base.x.endsWith("%")
                      ? `${parseFloat(base.x) + (index < hovered ? -28 : 28)}%`
                      : base.x,
                }
            : base;

        return (
          <motion.div
            key={`${item.imageUrl}-${index}`}
            className="absolute aspect-[4/5] w-[132px] overflow-hidden rounded-md border-[3px] border-white bg-gray-100 shadow-[0_8px_24px_rgba(0,0,0,0.12)] sm:w-[152px]"
            style={{ zIndex: isHovered ? 20 : index + 1 }}
            initial={
              reduceMotion
                ? false
                : { scale: 0, opacity: 0, rotate: base.rotate, x: base.x }
            }
            animate={{
              scale: 1,
              opacity: 1,
              rotate: active.rotate,
              x: active.x,
            }}
            transition={{
              scale: {
                type: "spring",
                stiffness: 260,
                damping: 14,
                mass: 0.7,
                delay: animationDelay + index * animationStagger,
              },
              opacity: {
                duration: 0.35,
                delay: animationDelay + index * animationStagger,
              },
              rotate: { type: "spring", stiffness: 280, damping: 22 },
              x: { type: "spring", stiffness: 280, damping: 22 },
            }}
            onMouseEnter={() => enableHover && setHovered(index)}
            onMouseLeave={() => enableHover && setHovered(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt={item.alt || item.title}
              referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent px-2.5 pb-2.5 pt-10">
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
                {item.title}
              </p>
              {item.subtitle ? (
                <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-white">
                  {item.subtitle}
                </p>
              ) : null}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
