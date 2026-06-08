"use client";

import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BikeSpecSource } from "@/lib/types/bike-specs";

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

interface SpecSourcesProps {
  sources?: BikeSpecSource[] | null;
  className?: string;
}

/**
 * Renders official manufacturer source citations for AI-generated specs/copy.
 * Shared by the product details panel (copy flow) and the bike specs display.
 */
export function SpecSources({ sources, className }: SpecSourcesProps) {
  if (!sources || sources.length === 0) return null;

  const ordered = [...sources].sort(
    (a, b) => Number(b.is_official_brand) - Number(a.is_official_brand)
  );
  const allOfficial = ordered.every((source) => source.is_official_brand);

  return (
    <div className={className}>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
        {allOfficial ? "Official sources" : "Sources"}
      </p>
      <ul className="space-y-0.5">
        {ordered.map((source) => (
          <li key={source.url}>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between gap-3 rounded-md py-1.5 text-sm text-gray-600 transition-colors hover:text-gray-900"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate">{source.title}</span>
                {source.is_official_brand && !allOfficial ? (
                  <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                    Official
                  </span>
                ) : null}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs text-gray-400 group-hover:text-gray-600">
                {hostnameFromUrl(source.url)}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Official sources first, capped — handy for callers passing raw metadata arrays. */
export function orderOfficialFirst(sources: BikeSpecSource[], limit = 6): BikeSpecSource[] {
  const official = sources.filter((source) => source.is_official_brand);
  const other = sources.filter((source) => !source.is_official_brand);
  return (official.length > 0 ? [...official, ...other] : other).slice(0, limit);
}
