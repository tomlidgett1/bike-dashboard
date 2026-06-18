"use client";

import Image from "next/image";
import type { DashboardIcon } from '@/components/layout/app-sidebar/dashboard-icons';

export function ListingBentoTile({
  icon: Icon,
  imageSrc,
  label,
  line,
  onClick,
}: {
  icon?: DashboardIcon;
  imageSrc?: string;
  label: string;
  line: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[120px] flex-col gap-3 rounded-md border border-gray-200 bg-white p-4 text-left transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98]"
    >
      {Icon ? (
        <Icon className="h-[20px] w-[20px] text-gray-700" />
      ) : imageSrc ? (
        <Image src={imageSrc} alt="" width={20} height={20} className="h-5 w-5" />
      ) : null}
      <div className="space-y-0.5">
        <p className="text-[15px] font-semibold tracking-tight text-gray-900">{label}</p>
        <p className="text-[12.5px] leading-snug text-gray-500">{line}</p>
      </div>
    </button>
  );
}

export function ListingOrDivider() {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-gray-200" />
      <span className="text-[12px] font-medium text-gray-400">or</span>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  );
}
