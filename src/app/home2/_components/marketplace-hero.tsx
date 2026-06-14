"use client";

import * as React from "react";
import Image from "next/image";
import {
  ArrowUpDown,
  Baby,
  Bike,
  ChevronDown,
  Disc,
  Droplet,
  Grid3x3,
  HelpCircle,
  LayoutGrid,
  Lock,
  MapPin,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Umbrella,
  User,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MARKETPLACE_PRODUCTS } from "./store-products";

type SpaceId = "for-you" | "marketplace" | "stores" | "uber";

const SPACES: { id: SpaceId; label: string; icon?: React.ComponentType<{ className?: string }>; logo?: string }[] = [
  { id: "for-you", label: "For You", icon: Sparkles },
  { id: "marketplace", label: "Marketplace", icon: Store },
  { id: "stores", label: "Bike Stores", icon: Store },
  { id: "uber", label: "Uber", logo: "/uber.svg" },
];

const CATEGORIES: { label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: "Helmets", icon: Bike },
  { label: "Wheels & Tyres", icon: Disc },
  { label: "Pedals", icon: Disc },
  { label: "Gels", icon: Droplet },
  { label: "Kids", icon: Baby },
  { label: "Bars", icon: Wrench },
  { label: "Bottles & Cages", icon: Droplet },
  { label: "Bags & Baskets", icon: ShoppingBag },
  { label: "Locks", icon: Lock },
  { label: "Mudguards", icon: Umbrella },
  { label: "Lubes", icon: Droplet },
];

type Product = { img: string; title: string; price: string; brand: string };

const PRODUCTS: Product[] = MARKETPLACE_PRODUCTS;

function ProductCard({ product }: { product: Product }) {
  return (
    <button type="button" className="group block text-left">
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-zinc-100 ring-1 ring-black/[0.04]">
        <Image
          src={product.img}
          alt={product.title}
          fill
          unoptimized
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="200px"
        />
      </div>
      <p className="mt-2 truncate text-[13px] font-medium text-zinc-900">{product.title}</p>
      <p className="text-[13px] font-bold text-zinc-900">{product.price}</p>
      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
        <Store className="h-3 w-3" />
        Store · {product.brand}
      </p>
    </button>
  );
}

export function MarketplaceHero() {
  const [space, setSpace] = React.useState<SpaceId>("stores");
  const [category, setCategory] = React.useState<string | null>(null);

  return (
    <div className="flex h-full flex-col bg-white text-zinc-900">
      {/* top header */}
      <div className="flex items-center gap-3 border-b border-zinc-100 px-4 py-2.5">
        <Image src="/yjlogo.svg" alt="Yellow Jersey" width={104} height={15} className="h-[15px] w-auto" />
        <div className="relative ml-1 hidden max-w-sm flex-1 items-center sm:flex">
          <Search className="absolute left-3 h-3.5 w-3.5 text-zinc-400" />
          <input
            readOnly
            placeholder="Search Yellow Jersey"
            className="w-full rounded-full border border-zinc-200 bg-zinc-50 py-1.5 pl-8 pr-3 text-xs text-zinc-600 outline-none"
          />
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-zinc-600">
          <ShoppingCart className="h-4 w-4 text-zinc-500" />
          <span className="hidden lg:inline">Browse</span>
          <span className="hidden lg:inline">For You</span>
          <span className="hidden lg:inline">Bike stores</span>
          <span className="hidden items-center gap-1 lg:inline-flex">
            <HelpCircle className="h-3.5 w-3.5" /> Help
          </span>
          <span className="hidden sm:inline">Sign in</span>
          <span className="rounded-md bg-[#ffde59] px-2.5 py-1 font-medium text-zinc-900">Create account</span>
          <span className="hidden items-center gap-1 rounded-md bg-zinc-900 px-2.5 py-1 font-medium text-white sm:inline-flex">
            <Plus className="h-3 w-3" /> Create Listing
          </span>
        </div>
      </div>

      {/* space tabs + filters */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-2.5">
        {SPACES.map((s) => {
          const active = space === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSpace(s.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              )}
            >
              {s.logo ? (
                <Image
                  src={s.logo}
                  alt=""
                  width={32}
                  height={12}
                  className={cn("h-3 w-auto object-contain", active && "brightness-0 invert")}
                />
              ) : s.icon ? (
                <s.icon className="h-3.5 w-3.5" />
              ) : null}
              {!s.logo && s.label}
            </button>
          );
        })}
        <button type="button" className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
          <Store className="h-3.5 w-3.5" /> Stores <ChevronDown className="h-3 w-3" />
        </button>

        <div className="ml-auto hidden items-center gap-2 text-xs text-zinc-600 md:flex">
          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1.5">
            <MapPin className="h-3.5 w-3.5" /> Melbourne <ChevronDown className="h-3 w-3" />
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1.5">
            Condition <ChevronDown className="h-3 w-3" />
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1.5">
            All prices <ChevronDown className="h-3 w-3" />
          </span>
          <ArrowUpDown className="h-4 w-4 text-zinc-400" />
          <LayoutGrid className="h-4 w-4 text-zinc-400" />
          <Grid3x3 className="h-4 w-4 text-zinc-900" />
        </div>
      </div>

      {/* category pills */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-zinc-100 px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATEGORIES.map((c) => {
          const active = category === c.label;
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => setCategory(active ? null : c.label)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              )}
            >
              <c.icon className="h-3.5 w-3.5" />
              {c.label}
            </button>
          );
        })}
      </div>

      {/* product grid */}
      <div className="flex-1 overflow-y-auto bg-[#fafafa] p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {PRODUCTS.map((p, i) => (
            <ProductCard key={`${p.title}-${i}`} product={p} />
          ))}
        </div>
      </div>
    </div>
  );
}
