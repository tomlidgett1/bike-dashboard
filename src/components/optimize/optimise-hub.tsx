"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { FileSpreadsheet, Layers, Lock, Package, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  bentoHubCardShellClassName,
  bentoOuterWrapClassName,
  bentoPanelShellClass,
} from "@/components/settings/bento-variant-styles";
import { MagicCard } from "@/registry/magicui/magic-card";

export type OptimiseSource = "catalogue" | "private" | "csv";

const BENTO_VARIANT = "light-beige-floating" as const;

type HubCard = {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  action: { type: "source"; source: OptimiseSource } | { type: "href"; href: string };
};

const HUB_CARDS: HubCard[] = [
  {
    id: "catalogue",
    title: "Catalogue",
    description:
      "Optimise titles, descriptions, and photos for products already in your Lightspeed catalogue.",
    icon: Package,
    action: { type: "source", source: "catalogue" },
  },
  {
    id: "private",
    title: "Private Listings",
    description:
      "Polish copy and images for private listings you have already created in Products.",
    icon: Lock,
    action: { type: "source", source: "private" },
  },
  {
    id: "csv",
    title: "CSV",
    description:
      "Import a spreadsheet, map stock on hand, generate copy with AI, then choose photos before publishing.",
    icon: FileSpreadsheet,
    action: { type: "source", source: "csv" },
  },
  {
    id: "new-optimise",
    title: "New Optimise",
    description:
      "Select products from your catalogue, then bulk-optimise titles, descriptions, specs, photos, and brands in one workspace.",
    icon: Sparkles,
    action: { type: "href", href: "/products/optimise" },
  },
  {
    id: "find-variants",
    title: "Find product variants",
    description:
      "Spot products that are really the same item in different sizes or colours, and combine them into one listing with selectable options.",
    icon: Layers,
    action: { type: "href", href: "/optimize/variants" },
  },
];

function OptimiseHubBentoCard({
  card,
  onSelect,
  onNavigate,
}: {
  card: HubCard;
  onSelect: (source: OptimiseSource) => void;
  onNavigate: (href: string) => void;
}) {
  const Icon = card.icon;
  const { theme } = useTheme();
  const gradientColor = theme === "dark" ? "#ffde5940" : "#ffde5955";

  const handleClick = () => {
    if (card.action.type === "source") {
      onSelect(card.action.source);
    } else {
      onNavigate(card.action.href);
    }
  };

  return (
    <MagicCard
      gradientColor={gradientColor}
      gradientFrom="#ffde59"
      gradientTo="#f0cf45"
      className={cn(bentoHubCardShellClassName(), "cursor-pointer border-transparent p-0")}
    >
      <button
        type="button"
        onClick={handleClick}
        className="relative z-10 flex min-h-full w-full flex-col text-left"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-5">
          <h2 className="text-[15px] font-semibold tracking-tight text-gray-950">{card.title}</h2>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.06]">
            <Icon className="h-4 w-4 text-gray-700" />
          </span>
        </div>
        <div className={bentoOuterWrapClassName(BENTO_VARIANT)}>
          <div className={cn(bentoPanelShellClass(BENTO_VARIANT), "pb-3")}>
            <p className="text-[12px] leading-relaxed text-gray-900">{card.description}</p>
          </div>
        </div>
      </button>
    </MagicCard>
  );
}

export function OptimiseHub({
  onSelect,
}: {
  onSelect: (source: OptimiseSource) => void;
}) {
  const router = useRouter();

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {HUB_CARDS.map((card) => (
        <OptimiseHubBentoCard
          key={card.id}
          card={card}
          onSelect={onSelect}
          onNavigate={(href) => router.push(href)}
        />
      ))}
    </div>
  );
}
