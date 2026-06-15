"use client";

import Lottie from "lottie-react";
import loadingAnimation from "@/assets/animations/loading2.json";
import type { VariantRun } from "./types";

export function VariantProgress({ run: _run }: { run: VariantRun }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center rounded-md bg-white">
      <div className="flex items-center gap-2.5">
        <Lottie animationData={loadingAnimation} loop className="h-6 w-6 shrink-0" />
        <p className="text-sm font-medium text-optimise-finding-shimmer">Finding product variants…</p>
      </div>
    </div>
  );
}
