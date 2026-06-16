"use client";

import * as React from "react";
import { ExternalLink } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import type { BikeSpecsMetadata } from "@/lib/types/bike-specs";

interface BikeSpecsSourcesProps {
  metadata: BikeSpecsMetadata | null | undefined;
  className?: string;
}

export function BikeSpecsSources({ metadata, className }: BikeSpecsSourcesProps) {
  if (!metadata?.sources?.length) return null;

  return (
    <div className={cn("space-y-3 border-t border-gray-100 pt-6", className)}>
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Sources</h3>
        <p className="mt-1 text-sm text-gray-500">
          Specifications were sourced from the official brand website where available.
        </p>
      </div>

      {metadata.primary_source_url ? (
        <div className="rounded-md border border-gray-200 bg-white p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Primary source
          </p>
          <a
            href={metadata.primary_source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-start gap-2 text-sm font-medium text-gray-900 hover:underline"
          >
            <ExternalLink className="mt-0.5 size-4 shrink-0 text-gray-400" />
            <span className="min-w-0 break-all">
              {metadata.primary_source_title || metadata.primary_source_url}
            </span>
          </a>
          {metadata.brand_website ? (
            <p className="mt-2 text-xs text-gray-500">
              Official brand site:{" "}
              <a
                href={metadata.brand_website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-700 hover:underline"
              >
                {metadata.brand_website.replace(/^https?:\/\//, "")}
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      <ul className="space-y-2">
        {metadata.sources.map((source) => (
          <li key={source.url}>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 rounded-md px-1 py-1 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900"
            >
              <ExternalLink className="mt-0.5 size-4 shrink-0 text-gray-400" />
              <span className="min-w-0 flex-1">
                <span className="block break-all">{source.title}</span>
                {source.is_official_brand ? (
                  <span className="mt-1 inline-flex rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-600">
                    Official brand site
                  </span>
                ) : (
                  <span className="mt-1 inline-flex rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-500">
                    Supporting source
                  </span>
                )}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
