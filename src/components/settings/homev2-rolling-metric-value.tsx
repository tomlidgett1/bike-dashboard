"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const DIGIT_HEIGHT = "1.25em";
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const ROLL_EASE = [0.04, 0.62, 0.23, 0.98] as const;
const DIGIT_STRIP = [...DIGITS, ...DIGITS, ...DIGITS];

type MetricPart =
  | { type: "digit"; digit: number; key: string }
  | { type: "sep"; char: string; key: string };

function splitFormattedNumber(value: number): MetricPart[] {
  const formatted = new Intl.NumberFormat("en-AU").format(value);

  return formatted.split("").map((char, index) => {
    if (char >= "0" && char <= "9") {
      return { type: "digit", digit: Number(char), key: `d-${index}` };
    }
    return { type: "sep", char, key: `s-${index}` };
  });
}

function extractDigits(value: number): number[] {
  return splitFormattedNumber(value)
    .filter((part): part is Extract<MetricPart, { type: "digit" }> => part.type === "digit")
    .map((part) => part.digit);
}

function DigitRoll({
  digit,
  previousDigit,
  animate,
}: {
  digit: number;
  previousDigit: number | null;
  animate: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const shouldRoll =
    animate && !reduceMotion && previousDigit !== null && previousDigit !== digit;

  const targetIndex = React.useMemo(() => {
    const restingIndex = 10 + digit;

    if (!shouldRoll || previousDigit === null) {
      return restingIndex;
    }

    const forward = (digit - previousDigit + 10) % 10;
    const backward = (previousDigit - digit + 10) % 10;
    const from = 10 + previousDigit;

    return forward <= backward ? from + forward : from - backward;
  }, [digit, previousDigit, shouldRoll]);

  return (
    <span
      className="relative inline-block overflow-hidden align-bottom tabular-nums"
      style={{ width: "0.62em", height: DIGIT_HEIGHT }}
    >
      <motion.span
        className="absolute left-0 top-0 flex w-full flex-col items-center"
        initial={false}
        animate={{ y: `calc(-${targetIndex} * ${DIGIT_HEIGHT})` }}
        transition={
          shouldRoll
            ? { duration: 0.55, ease: ROLL_EASE }
            : { duration: 0 }
        }
      >
        {DIGIT_STRIP.map((value, index) => (
          <span
            key={index}
            className="flex w-full items-center justify-center tabular-nums"
            style={{ height: DIGIT_HEIGHT, lineHeight: DIGIT_HEIGHT }}
          >
            {value}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

export function HomeV2RollingMetricValue({
  value,
  previousValue,
  animate,
  className,
}: {
  value: number;
  previousValue: number | null;
  animate: boolean;
  className?: string;
}) {
  const parts = splitFormattedNumber(value);
  const previousDigits = previousValue !== null ? extractDigits(previousValue) : null;
  const valueDigits = extractDigits(value);
  let digitIndex = 0;

  return (
    <span className={cn("inline-flex items-center justify-center", className)} aria-live="polite">
      {parts.map((part) => {
        if (part.type === "sep") {
          return (
            <span key={part.key} className="inline-block">
              {part.char}
            </span>
          );
        }

        const fromRight = valueDigits.length - 1 - digitIndex;
        const previousDigit =
          animate && previousDigits && fromRight < previousDigits.length
            ? previousDigits[previousDigits.length - 1 - fromRight]
            : null;

        const node = (
          <DigitRoll
            digit={part.digit}
            previousDigit={previousDigit}
            animate={animate}
          />
        );

        digitIndex += 1;
        return <React.Fragment key={part.key}>{node}</React.Fragment>;
      })}
    </span>
  );
}
