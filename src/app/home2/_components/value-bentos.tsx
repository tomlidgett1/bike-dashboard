"use client";

import * as React from "react";
import Image from "next/image";
import {
  BatteryFull,
  Bot,
  CalendarClock,
  Check,
  Pencil,
  PhoneMissed,
  RefreshCw,
  Search,
  Send,
  Signal,
  Smartphone,
  Sparkles,
  Wifi,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { HomeV2ChatInput } from "@/components/genie/homev2-chat-input";
import { NoiseTexture } from "@/components/ui/noise-texture";

/* =====================================================================
   Genie: live conversation (matches the store Home chat)
   ===================================================================== */

const THINKING_STEPS: {
  label: string;
  detail: string;
  at: string;
  logo?: string;
  icon?: React.ComponentType<{ className?: string }>;
}[] = [
  { label: "Lightspeed", detail: "Querying helmet sales · last 30 days", at: "0:02", logo: "/ls.png" },
  { label: "Deputy", detail: "Checking Saturday roster vs forecast", at: "0:04", icon: CalendarClock },
  { label: "Xero", detail: "Reconciling margin on helmets", at: "0:05", logo: "/xero.png" },
];

const SHIMMER_STYLE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(90deg,#a1a1aa 0%,#a1a1aa 35%,#27272a 50%,#a1a1aa 65%,#a1a1aa 100%)",
  backgroundSize: "200% 100%",
};

function ThinkingSteps() {
  return (
    <div className="pl-1">
      {THINKING_STEPS.map((s) => (
        <div key={s.label} className="relative flex gap-2.5 pb-3">
          <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300" />
          <span className="absolute bottom-0 left-[2.5px] top-3 w-px bg-zinc-200" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {s.logo ? (
                <Image src={s.logo} alt="" width={12} height={12} className="h-3 w-3 object-contain" unoptimized />
              ) : s.icon ? (
                <s.icon className="h-3 w-3 text-zinc-500" />
              ) : null}
              <span className="text-[11px] font-medium text-zinc-500">{s.label}</span>
              <span className="text-[10px] text-zinc-300">{s.at}</span>
            </div>
            <p className="mt-0.5 text-[12px] leading-snug text-zinc-600">{s.detail}</p>
          </div>
        </div>
      ))}
      <div className="relative flex items-center gap-2.5">
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-zinc-500" />
        <span
          className="animate-[agent-text-shimmer_2.2s_linear_infinite] bg-clip-text text-[12px] font-medium text-transparent"
          style={SHIMMER_STYLE}
        >
          Analysing helmet trend and staffing…
        </span>
      </div>
    </div>
  );
}

export function GenieBentoVisual() {
  return (
    <div className="relative w-full overflow-hidden rounded-[18px] bg-[#d9d2c5] p-4 sm:p-6">
      <NoiseTexture />
      <div className="relative z-10">
        <GenieChat />
      </div>
    </div>
  );
}

function GenieChat() {
  return (
    <div className="flex h-[568px] flex-col overflow-hidden rounded-[14px] border border-black/[0.06] bg-white shadow-sm sm:h-[628px]">
      <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-2.5">
        <Image src="/yjsmall.svg" alt="" width={16} height={16} className="opacity-80" />
        <span className="text-[12px] font-medium text-zinc-700">Genie</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
          <Image src="/ls.png" alt="" width={11} height={11} unoptimized /> Connected
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4">
        <div className="flex justify-end">
          <div className="max-w-[86%] rounded-[20px] rounded-br-md bg-[#ffde59] px-4 py-2.5 text-[13px] leading-snug text-zinc-900 shadow-sm">
            How did helmet sales compare to last month, and am I understaffed Saturday?
          </div>
        </div>
        <ThinkingSteps />
      </div>
      <div className="border-t border-zinc-100 p-3">
        <HomeV2ChatInput value="" onChange={() => {}} onSubmit={() => {}} compact showDisclaimer={false} />
      </div>
    </div>
  );
}

/* =====================================================================
   Nest: AI concierge inbox (matches the store Nest page)
   ===================================================================== */

const CONVOS = [
  { name: "Sarah M.", preview: "Is my Orbea ready to pick up?", time: "2m", unread: true, active: true },
  { name: "James T.", preview: "Thanks, see you Saturday!", time: "1h", unread: false, active: false },
  { name: "Alex R.", preview: "Can I book a service next week?", time: "3h", unread: true, active: false },
  { name: "Priya N.", preview: "Do you have the SL8 in 54cm?", time: "Wed", unread: false, active: false },
];

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-semibold text-zinc-600 ${className ?? ""}`}>
      {name.charAt(0)}
    </span>
  );
}

export function NestInbox() {
  return (
    <div className="flex h-full w-full overflow-hidden bg-white">
        {/* conversation list */}
        <aside className="hidden w-[244px] shrink-0 flex-col border-r border-zinc-200 sm:flex">
        <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2.5">
          <Image src="/nest-logo.png" alt="Nest" width={18} height={18} unoptimized />
          <span className="text-sm font-semibold text-zinc-900">Nest</span>
          <span className="ml-auto rounded-md bg-[#ffde59] px-1.5 py-0.5 text-[10px] font-semibold text-zinc-900">2 new</span>
        </div>
        <div className="border-b border-zinc-100 px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input readOnly placeholder="Search messages" className="h-8 w-full rounded-md border border-zinc-200 bg-zinc-50 pl-8 pr-3 text-xs text-zinc-500 outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CONVOS.map((c) => (
            <button
              key={c.name}
              type="button"
              className={`flex w-full items-center gap-2.5 border-b border-zinc-50 px-3 py-2.5 text-left transition-colors ${c.active ? "bg-zinc-50" : "hover:bg-zinc-50/70"}`}
            >
              <Avatar name={c.name} className="h-8 w-8" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[12px] font-semibold text-zinc-900">{c.name}</p>
                  <span className="shrink-0 text-[10px] text-zinc-400">{c.time}</span>
                </div>
                <p className={`truncate text-[11px] ${c.unread ? "font-medium text-zinc-700" : "text-zinc-500"}`}>{c.preview}</p>
              </div>
              {c.unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-[#ffde59]" /> : null}
            </button>
          ))}
        </div>
      </aside>

      {/* thread */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2.5 border-b border-zinc-100 px-4 py-2.5">
          <Avatar name="Sarah M." className="h-7 w-7" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-zinc-900">Sarah M.</p>
            <p className="text-[10px] text-zinc-400">+61 4xx · linked to work order #4821</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
            <Image src="/ls.png" alt="" width={11} height={11} unoptimized /> Lightspeed
          </span>
        </div>

        <div className="flex-1 space-y-2.5 overflow-y-auto bg-[#fafafa] p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <p className="text-center text-[10px] text-zinc-400">Today 2:14 pm</p>
          <div className="max-w-[78%] rounded-[18px] rounded-bl-[5px] bg-[#E9E9EB] px-3 py-2 text-[13px] leading-snug text-zinc-900">
            Hi, is my Orbea ready to pick up?
          </div>
          <div className="ml-auto max-w-[78%] rounded-[18px] rounded-br-[5px] bg-[#007AFF] px-3 py-2 text-[13px] leading-snug text-white">
            Hi Sarah, let me check with the workshop.
          </div>

          {/* AI suggested reply */}
          <div className="rounded-[14px] border border-zinc-200 bg-[#F2F2F7] p-3">
            <p className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              <Sparkles className="h-3 w-3 text-[#c9a800]" /> Suggested by Genie
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-800">
              Good news! Your Orbea Occam is serviced and ready. We&apos;re open till 5 pm today. See you soon!
            </p>
            <div className="mt-2.5 flex gap-2">
              <button type="button" className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-[11px] font-medium text-white">
                <Send className="h-3 w-3" /> Send
              </button>
              <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-700">
                <Pencil className="h-3 w-3" /> Edit
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-zinc-100 p-2.5">
          <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5">
            <span className="flex-1 text-[12px] text-zinc-400">iMessage</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#007AFF] text-white">
              <Send className="h-3 w-3" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   Nest: customer-facing concierge (iPhone tabs)
   ===================================================================== */

type NestTab = "customer" | "handoff" | "chatbot";

const NEST_TABS: { id: NestTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "customer", label: "Customer", icon: Smartphone },
  { id: "handoff", label: "Handoff", icon: PhoneMissed },
  { id: "chatbot", label: "Chatbot", icon: Bot },
];

function ChatBubble({ side, children }: { side: "left" | "right"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "max-w-[82%] px-3 py-2 text-[12.5px] leading-snug",
        side === "right"
          ? "ml-auto rounded-[17px] rounded-br-[5px] bg-[#007AFF] text-white"
          : "rounded-[17px] rounded-bl-[5px] bg-[#E9E9EB] text-zinc-900",
      )}
    >
      {children}
    </div>
  );
}

function ChatDay({ children }: { children: React.ReactNode }) {
  return <p className="py-1 text-center text-[9.5px] font-medium text-zinc-400">{children}</p>;
}

function ChatNote({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex items-center gap-1.5 rounded-md bg-zinc-100 px-2.5 py-1 text-[9.5px] font-medium text-zinc-500">
      <Icon className="h-2.5 w-2.5" />
      {children}
    </div>
  );
}

function NestCaption({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-0.5 flex items-center gap-1 pl-1 text-[9px] text-zinc-400">
      <Sparkles className="h-2.5 w-2.5 text-[#c9a800]" />
      {children}
    </p>
  );
}

function NestPhone({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-[400px] w-[228px] shrink-0 flex-col overflow-hidden rounded-[38px] bg-zinc-900 p-1.5 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.5)] ring-1 ring-black/20 sm:h-[464px] sm:w-[236px]">
      <div className="relative flex flex-1 flex-col overflow-hidden rounded-[31px] bg-white">
        <div className="pointer-events-none absolute left-1/2 top-[9px] z-30 h-[18px] w-[68px] -translate-x-1/2 rounded-full bg-black" />
        <div className="flex items-center justify-between px-5 pb-1 pt-2.5 text-[10px] font-semibold text-zinc-900">
          <span>9:41</span>
          <span className="flex items-center gap-1">
            <Signal className="h-3 w-3" />
            <Wifi className="h-3 w-3" />
            <BatteryFull className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className="flex flex-col items-center gap-1 border-b border-zinc-100 px-4 pb-2 pt-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-[12px] font-semibold text-white">A</span>
          <span className="text-[12px] font-semibold text-zinc-900">Acme Bikes</span>
          <span className="text-[9px] text-zinc-400">iMessage</span>
        </div>
        <div className="flex flex-1 flex-col gap-1.5 overflow-hidden bg-[#fafafa] px-3 py-3">
          {children}
        </div>
        <div className="border-t border-zinc-100 bg-white p-2">
          <div className="flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1.5">
            <span className="flex-1 text-[11px] text-zinc-400">iMessage</span>
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#007AFF] text-white">
              <Send className="h-2.5 w-2.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomerScreen() {
  return (
    <NestPhone>
      <ChatDay>Today 2:14 PM</ChatDay>
      <ChatBubble side="left">Hi Sarah! Good news, your Orbea Occam is serviced and ready to collect.</ChatBubble>
      <ChatBubble side="left">We&apos;re open till 5pm today.</ChatBubble>
      <ChatBubble side="right">Amazing, thank you! I&apos;ll pop in at 4.</ChatBubble>
      <ChatBubble side="left">Perfect, see you then.</ChatBubble>
    </NestPhone>
  );
}

function HandoffScreen() {
  return (
    <NestPhone>
      <div className="mx-auto mt-1 w-full max-w-[210px] rounded-md border border-zinc-200 bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-zinc-600">
            <PhoneMissed className="h-3 w-3" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-zinc-900">Missed call</p>
            <p className="text-[9.5px] text-zinc-400">Acme Bikes couldn&apos;t pick up · 2:14 PM</p>
          </div>
        </div>
      </div>
      <ChatNote icon={Sparkles}>Nest replied by text in 30s</ChatNote>
      <div>
        <ChatBubble side="left">
          Hi Sarah, sorry we missed your call! This is the Acme Bikes assistant. How can I help?
        </ChatBubble>
        <NestCaption>Nest · automated</NestCaption>
      </div>
      <ChatBubble side="right">Just checking if my bike&apos;s ready to pick up</ChatBubble>
      <ChatBubble side="left">Yes, it&apos;s serviced and ready. Want me to hold it at the counter?</ChatBubble>
    </NestPhone>
  );
}

function NestFeatureNote({ tab }: { tab: "customer" | "handoff" }) {
  const data =
    tab === "customer"
      ? {
          title: "Texts your customers love",
          points: ["Pickup-ready alerts", "Service reminders", "Answers in their Messages app"],
        }
      : {
          title: "Never miss a call",
          points: [
            "Unanswered calls hand off to Nest",
            "Auto-texts the customer straight back",
            "Keeps the conversation going",
          ],
        };
  return (
    <div className="hidden max-w-[230px] shrink-0 lg:block">
      <h5 className="text-[16px] font-semibold tracking-tight text-zinc-900">{data.title}</h5>
      <ul className="mt-3.5 space-y-2.5">
        {data.points.map((p) => (
          <li key={p} className="flex items-start gap-2 text-[13px] leading-snug text-zinc-600">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NestConcierge() {
  const [tab, setTab] = React.useState<NestTab>("customer");
  return (
    <div className="flex h-[568px] flex-col overflow-hidden rounded-[14px] border border-black/[0.06] bg-white shadow-sm sm:h-[628px]">
      {/* app header */}
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2.5">
        <Image src="/nest-logo.png" alt="Nest" width={18} height={18} unoptimized />
        <span className="text-sm font-semibold text-zinc-900">Nest</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
          <Sparkles className="h-3 w-3 text-[#c9a800]" /> AI concierge
        </span>
      </div>

      {/* tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-200 bg-white px-3">
        {NEST_TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
                active ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800",
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* content */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="h-full w-full"
          >
            {tab === "chatbot" ? (
              <NestInbox />
            ) : (
              <div className="flex h-full items-center justify-center gap-8 bg-[#fafafa] p-6 sm:gap-10 sm:p-8">
                {tab === "customer" ? <CustomerScreen /> : <HandoffScreen />}
                <NestFeatureNote tab={tab} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export function NestBentoVisual() {
  return (
    <div className="relative w-full overflow-hidden rounded-[18px] bg-[#d9d2c5] p-4 sm:p-6">
      <NoiseTexture />
      <div className="relative z-10">
        <NestConcierge />
      </div>
    </div>
  );
}

/* =====================================================================
   Minor value-prop visuals (three-in-a-row)
   ===================================================================== */

export function WriteBackVisual() {
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <div className="rounded-md border border-zinc-200 bg-white p-2.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Sold online</p>
        <p className="mt-0.5 text-[12px] font-medium text-zinc-900">Focus Izalco Max 9.8 · $9,999</p>
      </div>
      <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-zinc-500">
        <RefreshCw className="h-3.5 w-3.5" /> Writing back to Lightspeed
      </div>
      <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-2.5 py-2">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-800">
          <Image src="/ls.png" alt="" width={14} height={14} unoptimized /> Stock 1 → 0 · synced
        </span>
        <Check className="h-3.5 w-3.5 text-emerald-600" />
      </div>
    </div>
  );
}

export function ImageFindVisual() {
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-2.5 py-2">
        <span className="text-[12px] text-zinc-700">Shimano Deore Rotor</span>
        <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">No photo</span>
      </div>
      <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-zinc-500">
        <Sparkles className="h-3.5 w-3.5 text-[#c9a800]" /> Genie found 3 photos
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="relative aspect-square overflow-hidden rounded-md bg-zinc-100 ring-1 ring-black/[0.04]">
            <Image src="/chain.png" alt="" fill unoptimized className="object-cover" sizes="80px" />
            {i === 0 ? (
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-900 text-white">
                <Check className="h-2.5 w-2.5" />
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AutoCategoriseVisual() {
  const items = [
    { n: "Giro Aether Helmet", category: "Helmets" },
    { n: "Shimano Deore Rotor", category: "Brakes" },
  ];
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-2.5 py-2">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-800">
          <Image src="/ls.png" alt="" width={14} height={14} unoptimized /> Lightspeed inventory
        </span>
        <span className="text-[10px] font-medium text-zinc-500">12 new items</span>
      </div>
      <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-zinc-500">
        <Sparkles className="h-3.5 w-3.5 text-[#c9a800]" /> Auto categorising products
      </div>
      {items.map((item) => (
        <div key={item.n} className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-2.5 py-2">
          <span className="truncate text-[12px] text-zinc-800">{item.n}</span>
          <span className="ml-2 shrink-0 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
            {item.category}
          </span>
        </div>
      ))}
    </div>
  );
}
