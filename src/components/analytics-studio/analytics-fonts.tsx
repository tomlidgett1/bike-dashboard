"use client";

import { DM_Serif_Display, Outfit } from "next/font/google";
import { cn } from "@/lib/utils";

const analyticsSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-analytics-serif",
  display: "swap",
});

const analyticsRounded = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-analytics-rounded",
  display: "swap",
});

/** Extra typefaces for Analytics Studio design controls (scoped via CSS variables). */
export function analyticsFontClassName() {
  return cn(analyticsSerif.variable, analyticsRounded.variable);
}
