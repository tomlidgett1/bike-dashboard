"use client";

import { motion } from "framer-motion";
import { Sparkles } from '@/components/layout/app-sidebar/dashboard-icons';
import { BRAND } from "./data";

export function QualityMeter({ score, tips }: { score: number; tips: string[] }) {
  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-gray-700">Listing quality</p>
        <span className="text-[15px] font-bold text-gray-900">{score}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: BRAND }}
          initial={false}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.5, ease: [0.04, 0.62, 0.23, 0.98] }}
        />
      </div>
      {tips.length > 0 && (
        <div className="mt-2.5 space-y-1">
          {tips.slice(0, 3).map((t) => (
            <p key={t} className="flex items-center gap-1.5 text-[12px] text-gray-500">
              <Sparkles className="h-3 w-3 text-gray-400" />
              {t}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
