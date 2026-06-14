"use client";

import * as React from "react";
import Image from "next/image";
import {
  Bell,
  Bot,
  ChevronLeft,
  ChevronRight,
  Database,
  Home,
  Lock,
  MessageSquare,
  Package,
  RotateCw,
  Sparkles,
  Store,
  Sun,
  Truck,
  Wand2,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MarketplaceHero } from "./marketplace-hero";

/* =====================================================================
   Shared store-settings tabs (used by the big interactive bento)
   ===================================================================== */

type DemoTab = "home" | "nest" | "products" | "landing" | "optimise" | "lightspeed";

type NavEntry = {
  id: DemoTab | "storefront";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tab?: DemoTab;
  children?: { id: DemoTab; label: string }[];
};

const STORE_NAV: NavEntry[] = [
  { id: "home", label: "Home", icon: Home, tab: "home" },
  { id: "nest", label: "Nest", icon: MessageSquare, tab: "nest" },
  { id: "products", label: "Products", icon: Package, tab: "products" },
  {
    id: "storefront",
    label: "Storefront",
    icon: Store,
    children: [{ id: "landing", label: "Landing page" }],
  },
  { id: "optimise", label: "Product Optimise", icon: Sparkles, tab: "optimise" },
];

const OPS_NAV: { id: string; label: string; icon: React.ComponentType<{ className?: string }>; tab?: DemoTab }[] = [
  { id: "lightspeed", label: "Lightspeed", icon: Zap, tab: "lightspeed" },
  { id: "uber", label: "Uber Direct", icon: Truck },
  { id: "data", label: "Data", icon: Database },
];

const CRUMB: Record<DemoTab, string> = {
  home: "Home",
  nest: "Nest",
  products: "Products",
  landing: "Landing page",
  optimise: "Product Optimise",
  lightspeed: "Lightspeed",
};

/* ---------- panels ---------- */

function HomePanel() {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-3 pt-8 text-center">
        <h2 className="text-base font-medium tracking-tight text-zinc-900 sm:text-lg">
          Welcome, today is Saturday 13 June 2026.
        </h2>
        <div className="mt-6 grid w-full max-w-md grid-cols-3 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {[
            { v: "212", l: "Distinct views", s: "Last 7 days" },
            { v: "596", l: "Live products", s: "Synced" },
            { v: "1,939", l: "Needs attention", s: "Queue" },
          ].map((m, i) => (
            <div key={m.l} className={cn("px-3 py-3.5", i > 0 && "border-l border-zinc-100")}>
              <p className="text-lg font-semibold tabular-nums text-zinc-900">{m.v}</p>
              <p className="mt-0.5 text-[10px] font-medium leading-snug text-zinc-500">
                {m.l}
                <span className="text-zinc-300"> · </span>
                {m.s}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 ring-1 ring-sky-100">
          <Image src="/xero.png" alt="" width={13} height={13} unoptimized />
          Xero connected
        </div>
      </div>
      <div className="border-t border-zinc-100 bg-zinc-50/60 px-4 py-3">
        <div className="mx-auto flex max-w-md items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2">
          <span className="text-zinc-400">+</span>
          <span className="flex-1 text-left text-xs text-zinc-400">Ask anything</span>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-white">
            <Bot className="h-3 w-3" />
          </span>
        </div>
      </div>
    </div>
  );
}

function NestPanel() {
  const messages = [
    { name: "Sarah M.", text: "Is my Orbea ready for pickup?", time: "2m", unread: true },
    { name: "James T.", text: "Thanks, see you Saturday!", time: "1h", unread: false },
    { name: "Alex R.", text: "Can I book a service next week?", time: "3h", unread: true },
  ];
  return (
    <div className="flex h-full flex-col bg-white p-5">
      <div className="flex items-center gap-2">
        <Image src="/nest-logo.png" alt="Nest" width={18} height={18} unoptimized />
        <h3 className="text-sm font-medium text-zinc-900">Nest messages</h3>
      </div>
      <ul className="mt-4 space-y-2">
        {messages.map((m) => (
          <li key={m.name} className={cn("rounded-xl border px-3 py-2.5", m.unread ? "border-zinc-200 bg-zinc-50" : "border-transparent")}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-zinc-900">{m.name}</p>
              <span className="text-[10px] text-zinc-400">{m.time} ago</span>
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500">{m.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProductsPanel() {
  const rows = [
    { name: "2024 Orbea Occam M30", sku: "ORB-OCM30", stock: 2, price: "$4,299" },
    { name: "Specialized Tarmac SL8", sku: "SPZ-TSL8", stock: 1, price: "$8,500" },
    { name: "Shimano XT Groupset", sku: "SHI-XT8100", stock: 4, price: "$1,850" },
    { name: "Giro Aether MIPS Helmet", sku: "GIR-AETH", stock: 7, price: "$499" },
  ];
  return (
    <div className="flex h-full flex-col bg-white p-5">
      <h3 className="text-sm font-medium text-zinc-900">Products</h3>
      <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-zinc-50 text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Stock</th>
              <th className="px-3 py-2 font-medium">Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sku} className="border-t border-zinc-100">
                <td className="px-3 py-2 font-medium text-zinc-800">{r.name}</td>
                <td className="px-3 py-2 text-zinc-500">{r.sku}</td>
                <td className="px-3 py-2 text-zinc-700">{r.stock}</td>
                <td className="px-3 py-2 text-zinc-700">{r.price}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LandingPanel() {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-zinc-100 px-5 py-3">
        <p className="text-[11px] font-medium text-zinc-500">Storefront preview</p>
        <h3 className="text-sm font-medium text-zinc-900">Acme Bikes · Landing page</h3>
      </div>
      <div className="flex-1 bg-gradient-to-b from-zinc-100 to-white p-4">
        <div className="mx-auto max-w-xs overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="aspect-[16/7] bg-gradient-to-br from-[#ffe98a] to-[#f0cf45]" />
          <div className="p-3">
            <p className="text-sm font-bold text-zinc-900">Acme Bikes</p>
            <p className="mt-0.5 text-[10px] text-zinc-500">Melbourne&apos;s home for road, gravel &amp; MTB</p>
            <div className="mt-2 flex gap-1.5">
              <span className="rounded-md bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold text-white">Shop bikes</span>
              <span className="rounded-md border border-zinc-200 px-2 py-0.5 text-[10px] text-zinc-600">Book service</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OptimisePanel() {
  const cards = [
    { title: "Catalogue", desc: "Optimise Lightspeed products", icon: Package },
    { title: "CSV", desc: "Generate copy with AI", icon: Database },
    { title: "New Optimise", desc: "Bulk titles, specs & photos", icon: Sparkles },
  ];
  return (
    <div className="flex h-full flex-col bg-white p-5">
      <h3 className="text-sm font-medium text-zinc-900">Product Optimise</h3>
      <p className="mt-1 text-[11px] text-zinc-500">Choose a workflow to polish copy and photos.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.title} className="rounded-xl border border-zinc-200 p-3">
            <c.icon className="h-4 w-4 text-zinc-700" />
            <p className="mt-2 text-xs font-medium text-zinc-900">{c.title}</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500">{c.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function LightspeedPanel() {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-white p-6 text-center">
      <Image src="/ls.png" alt="Lightspeed" width={44} height={44} className="rounded-xl" unoptimized />
      <h3 className="mt-4 text-sm font-medium text-zinc-900">Lightspeed connected</h3>
      <p className="mt-2 max-w-xs text-[11px] leading-relaxed text-zinc-500">
        Connected in minutes · 2,847 SKUs synced · Last sync 4 minutes ago · Orders write back to POS
      </p>
      <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Inventory mirror active
      </div>
    </div>
  );
}

const PANELS: Record<DemoTab, React.ComponentType> = {
  home: HomePanel,
  nest: NestPanel,
  products: ProductsPanel,
  landing: LandingPanel,
  optimise: OptimisePanel,
  lightspeed: LightspeedPanel,
};

function StoreSidebar({
  tab,
  setTab,
  open,
  setOpen,
}: {
  tab: DemoTab;
  setTab: (t: DemoTab) => void;
  open: boolean;
  setOpen: (fn: (o: boolean) => boolean) => void;
}) {
  const itemCls = (active: boolean) =>
    cn(
      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
      active ? "bg-white font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-600 hover:bg-zinc-100"
    );

  return (
    <aside className="hidden w-[200px] shrink-0 flex-col border-r border-zinc-200 bg-[#fbfbfa] sm:flex">
      <div className="border-b border-zinc-100 px-3 py-3">
        <Image src="/yjlogo.svg" alt="Yellow Jersey" width={116} height={16} className="h-4 w-auto opacity-90" />
        <p className="mt-2 text-[11px] font-semibold text-zinc-900">Acme Bikes</p>
        <p className="text-[10px] text-zinc-400">View store ↗</p>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 text-[11px]">
        <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">Store</p>
        {STORE_NAV.map((item) =>
          item.children ? (
            <div key={item.id} className="mt-0.5">
              <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-zinc-600 hover:bg-zinc-100">
                <item.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                <ChevronRight className={cn("h-3 w-3 transition-transform duration-200", open && "rotate-90")} />
              </button>
              {open ? (
                <div className="ml-5 border-l border-zinc-200 pl-2">
                  {item.children.map((sub) => (
                    <button key={sub.id} type="button" onClick={() => setTab(sub.id)} className={cn("block w-full rounded-md px-2 py-1.5 text-left transition-colors", tab === sub.id ? "bg-white font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-500 hover:bg-zinc-100")}>
                      {sub.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <button key={item.id} type="button" onClick={() => item.tab && setTab(item.tab)} className={cn("mt-0.5", itemCls(tab === item.tab))}>
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
            </button>
          )
        )}
        <p className="mb-1 mt-3 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">Operations</p>
        {OPS_NAV.map((item) =>
          item.tab ? (
            <button key={item.id} type="button" onClick={() => setTab(item.tab!)} className={cn("mt-0.5", itemCls(tab === item.tab))}>
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
            </button>
          ) : (
            <div key={item.id} className="mt-0.5 flex items-center gap-2 rounded-md px-2 py-1.5 text-zinc-400">
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
            </div>
          )
        )}
      </nav>
      <div className="border-t border-zinc-100 p-2">
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[10px] text-zinc-500">
          <Image src="/ls.png" alt="" width={14} height={14} unoptimized />
          Lightspeed · Connected
        </div>
      </div>
    </aside>
  );
}

/** Interactive store-settings dashboard for the big bento. */
export function AcmeBikesDemo({
  className,
  minHeight = 520,
  initialTab = "home",
}: {
  className?: string;
  minHeight?: number;
  initialTab?: DemoTab;
}) {
  const [tab, setTab] = React.useState<DemoTab>(initialTab);
  const [storefrontOpen, setStorefrontOpen] = React.useState(true);
  const Panel = PANELS[tab];

  return (
    <div className={cn("flex overflow-hidden rounded-[14px] border border-zinc-200 bg-zinc-50", className)} style={{ minHeight }}>
      <StoreSidebar tab={tab} setTab={setTab} open={storefrontOpen} setOpen={setStorefrontOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-100 bg-white px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <span>Store</span>
            <ChevronRight className="h-3 w-3" />
            <span className="font-medium text-zinc-800">{CRUMB[tab]}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="hidden rounded-md bg-zinc-100 px-2 py-1 text-[10px] font-medium text-zinc-600 sm:inline">Tom feedback</span>
            <Bot className="h-3.5 w-3.5 text-zinc-400" />
            <Wand2 className="h-3.5 w-3.5 text-zinc-400" />
            <Bell className="h-3.5 w-3.5 text-zinc-400" />
            <Sun className="h-3.5 w-3.5 text-zinc-400" />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">
          <Panel />
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   Hero: marketplace homepage (Bike stores tab) framed in a browser
   ===================================================================== */

function TrafficLights() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
      <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
      <span className="h-3 w-3 rounded-full bg-[#28c840]" />
    </div>
  );
}

export function HeroDesktopWindow({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto w-full overflow-hidden rounded-[20px] border border-black/[0.07] bg-white",
        className,
      )}
    >
      <div
        className="relative p-4 sm:p-6 lg:p-8"
        style={{
          background:
            "linear-gradient(180deg,#9fbcd6 0%,#bcc6bd 34%,#d4c39a 60%,#c2a877 80%,#8f7f63 100%)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_40%_at_30%_20%,rgba(255,255,255,0.35),transparent_60%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_40%_at_75%_75%,rgba(120,90,40,0.25),transparent_60%)]"
        />

        <div className="relative overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-black/[0.06] bg-[#ececea] px-3 py-2">
            <TrafficLights />
            <div className="flex flex-1 items-center text-zinc-400">
              <span className="hidden items-center gap-2 sm:flex">
                <ChevronLeft className="h-3.5 w-3.5" />
                <ChevronRight className="h-3.5 w-3.5" />
                <RotateCw className="h-3 w-3" />
              </span>
              <span className="mx-auto flex items-center gap-1.5 rounded-md bg-white px-3 py-1 text-[11px] text-zinc-500 ring-1 ring-black/[0.05]">
                <Lock className="h-2.5 w-2.5" />
                yellowjersey.store/marketplace
              </span>
            </div>
            <span className="hidden w-10 sm:block" />
          </div>
          <div className="h-[560px] w-full overflow-hidden bg-white sm:h-[620px]">
            <MarketplaceHero />
          </div>
        </div>
      </div>
    </div>
  );
}
