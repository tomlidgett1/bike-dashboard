"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Lock, Package, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type OptimiseSource = "catalogue" | "private" | "csv";

const SOURCES: {
  id: OptimiseSource;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: "catalogue",
    title: "Catalogue",
    description:
      "Optimise titles, descriptions, and photos for products already in your Lightspeed catalogue.",
    icon: Package,
  },
  {
    id: "private",
    title: "Private Listings",
    description:
      "Polish copy and images for private listings you have already created in Products.",
    icon: Lock,
  },
  {
    id: "csv",
    title: "CSV",
    description:
      "Import a spreadsheet, map stock on hand, generate copy with AI, then choose photos before publishing.",
    icon: FileSpreadsheet,
  },
];

const NEW_OPTIMISE = {
  title: "New Optimise",
  description:
    "Select products from your catalogue, then bulk-optimise titles, descriptions, specs, photos, and brands in one workspace.",
  href: "/products/optimise",
  icon: Sparkles,
};

export function OptimiseHub({
  onSelect,
}: {
  onSelect: (source: OptimiseSource) => void;
}) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SOURCES.map((source) => {
          const Icon = source.icon;
          return (
            <button
              key={source.id}
              type="button"
              onClick={() => onSelect(source.id)}
              className={cn(
                "flex flex-col items-start gap-3 rounded-md border border-border/60 bg-white p-5 text-left transition-colors",
                "hover:border-foreground/20 hover:shadow-sm",
              )}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100">
                <Icon className="h-5 w-5 text-gray-700" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">{source.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {source.description}
                </p>
              </div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => router.push(NEW_OPTIMISE.href)}
          className={cn(
            "flex flex-col items-start gap-3 rounded-md border border-border/60 bg-white p-5 text-left transition-colors",
            "hover:border-foreground/20 hover:shadow-sm",
          )}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100">
            <NEW_OPTIMISE.icon className="h-5 w-5 text-gray-700" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">{NEW_OPTIMISE.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {NEW_OPTIMISE.description}
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
