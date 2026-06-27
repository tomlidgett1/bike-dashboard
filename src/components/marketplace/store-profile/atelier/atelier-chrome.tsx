"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  X,
  Menu,
  LayoutGrid,
  ChevronDown,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { CartButton } from "@/components/marketplace/cart-button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { STUDIO, DISPLAY_FONT, MONO_FONT } from "./atelier-theme";
import type { StoreProfile, OpeningHours } from "@/lib/types/store";
import type { StoreTab } from "@/components/marketplace/store-profile/store-profile-chrome";

export type AtelierDesign = "classic" | "atelier";

const DAY_KEYS: (keyof OpeningHours)[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];
const WEEK_ORDER: (keyof OpeningHours)[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function openStatusFor(hours: OpeningHours | undefined): { open: boolean; label: string } | null {
  if (!hours) return null;
  const now = new Date();
  const today = hours[DAY_KEYS[now.getDay()]];
  if (!today) return null;
  if (today.closed) return { open: false, label: "Closed today" };
  const cur = now.getHours() * 60 + now.getMinutes();
  if (cur < toMinutes(today.open)) return { open: false, label: `Opens ${today.open}` };
  if (cur >= toMinutes(today.close)) return { open: false, label: "Closed now" };
  return { open: true, label: `Open until ${today.close}` };
}

const NAV_ITEMS: { key: StoreTab; label: string }[] = [
  { key: "home", label: "Home" },
  { key: "products", label: "Shop" },
  { key: "bikes", label: "Bikes" },
  { key: "rentals", label: "Rentals" },
  { key: "service", label: "Service" },
  { key: "offers", label: "Offers" },
  { key: "about", label: "About" },
];

export interface AtelierChromeProps {
  store: StoreProfile;
  activeTab: StoreTab;
  onTabSelect: (tab: StoreTab) => void;
  onSwitchDesign: () => void;
  storeSearch: string;
  onStoreSearchChange: (value: string) => void;
  showSearch: boolean;
  hoursOpen: boolean;
  onHoursOpenChange: (open: boolean) => void;
  isOwnProfile?: boolean;
}

export function AtelierChrome({
  store,
  activeTab,
  onTabSelect,
  onSwitchDesign,
  storeSearch,
  onStoreSearchChange,
  showSearch,
  hoursOpen,
  onHoursOpenChange,
}: AtelierChromeProps) {
  const [scrolled, setScrolled] = React.useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const openStatus = openStatusFor(store.opening_hours);
  const homeHref = `/marketplace/store/${store.slug ?? store.id}`;
  const announcement = store.homepage_config?.announcement?.enabled
    ? store.homepage_config.announcement.text?.trim()
    : null;
  const finalAnnouncement = announcement || (openStatus ? openStatus.label : null);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleNav = (tab: StoreTab) => {
    onTabSelect(tab);
    setMobileNavOpen(false);
    if (tab === "home") onStoreSearchChange("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      {/* Announcement bar */}
      {finalAnnouncement && (
        <div
          className="flex h-9 w-full items-center justify-center px-4 text-center text-[11px] font-medium uppercase tracking-[0.08em]"
          style={{ backgroundColor: STUDIO.banner, color: STUDIO.bannerText, fontFamily: DISPLAY_FONT }}
        >
          <p className="truncate">{finalAnnouncement}</p>
        </div>
      )}

      <header
        className="sticky top-0 z-40 transition-[background-color,box-shadow] duration-300"
        style={{
          backgroundColor: STUDIO.surface,
          boxShadow: scrolled ? `0 1px 0 ${STUDIO.line}, 0 6px 20px rgba(0,0,0,0.04)` : `0 1px 0 ${STUDIO.line}`,
        }}
      >
        {/* Main bar: icons left, centred logo, icons right (desktop) */}
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-4 px-5 sm:h-20 sm:px-8 lg:px-12">
          {/* Left cluster — search + nav (desktop) */}
          <div className="flex flex-1 items-center gap-5">
            <button
              type="button"
              onClick={() => setMobileSearchOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center transition-colors hover:bg-black/[0.04] lg:hidden"
              style={{ color: STUDIO.ink }}
              aria-label="Search"
            >
              {mobileSearchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
            </button>
            {showSearch && (
              <div className="relative hidden lg:block w-56">
                <Search
                  className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: STUDIO.faint }}
                />
                <input
                  type="text"
                  value={storeSearch}
                  onChange={(e) => onStoreSearchChange(e.target.value)}
                  placeholder="Search products"
                  className="w-full pb-1.5 pl-6 pr-4 text-[14px] focus:outline-none"
                  style={{ backgroundColor: "transparent", borderBottom: `1px solid ${STUDIO.line}`, color: STUDIO.ink, fontFamily: DISPLAY_FONT }}
                />
              </div>
            )}
          </div>

          {/* Centre logo */}
          <Link href={homeHref} className="flex shrink-0 items-center gap-3 group">
            {store.logo_url ? (
              <Image
                src={store.logo_url}
                alt={store.store_name}
                width={44}
                height={44}
                sizes="44px"
                className="h-9 w-9 object-contain sm:h-11 sm:w-11"
                priority
              />
            ) : (
              <div
                className="flex h-9 w-9 items-center justify-center sm:h-11 sm:w-11"
                style={{ backgroundColor: STUDIO.ink, borderRadius: 2 }}
              >
                <span style={{ fontFamily: DISPLAY_FONT, color: "#fff", fontWeight: 700, fontSize: 16 }}>
                  {store.store_name.slice(0, 1).toUpperCase()}
                </span>
              </div>
            )}
            <span
              className="hidden text-xl sm:block"
              style={{ fontFamily: DISPLAY_FONT, color: STUDIO.ink, fontWeight: 700, letterSpacing: "-0.01em" }}
            >
              {store.store_name}
            </span>
          </Link>

          {/* Right cluster — account, design, cart, menu */}
          <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
            <DesignSwitcher active="atelier" onSwitch={onSwitchDesign} />
            <CartButton className="hover:bg-black/[0.04]" />
            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center transition-colors hover:bg-black/[0.04] lg:hidden"
              style={{ color: STUDIO.ink }}
              aria-label="Menu"
            >
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Desktop nav row */}
        <nav className="hidden border-t lg:block" style={{ borderColor: STUDIO.line }}>
          <div className="mx-auto flex max-w-[1400px] items-center justify-center gap-8 px-5 sm:px-8 lg:px-12">
            {NAV_ITEMS.map(({ key, label }) => {
              const active = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleNav(key)}
                  className="relative py-3.5 text-[13px] font-medium uppercase tracking-[0.08em] transition-colors"
                  style={{ color: active ? STUDIO.ink : STUDIO.muted, fontFamily: DISPLAY_FONT }}
                >
                  {label}
                  {active && (
                    <motion.span
                      layoutId="studio-nav-underline"
                      className="absolute inset-x-0 -bottom-px h-[2px]"
                      style={{ backgroundColor: STUDIO.ink }}
                      transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Mobile search strip */}
        <AnimatePresence>
          {mobileSearchOpen && showSearch && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
              className="overflow-hidden lg:hidden"
            >
              <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-5 py-4 sm:px-8">
                <Search className="h-4 w-4 shrink-0" style={{ color: STUDIO.faint }} />
                <input
                  type="text"
                  value={storeSearch}
                  onChange={(e) => onStoreSearchChange(e.target.value)}
                  placeholder="Search products"
                  autoFocus
                  className="w-full pb-1.5 text-[15px] focus:outline-none"
                  style={{ backgroundColor: "transparent", borderBottom: `1px solid ${STUDIO.line}`, color: STUDIO.ink, fontFamily: DISPLAY_FONT }}
                />
                {storeSearch && (
                  <button type="button" onClick={() => onStoreSearchChange("")} style={{ color: STUDIO.faint }} aria-label="Clear">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile nav drawer */}
        <AnimatePresence>
          {mobileNavOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
              className="overflow-hidden lg:hidden"
            >
              <nav className="mx-auto max-w-[1400px] px-5 pb-6 sm:px-8">
                {NAV_ITEMS.map(({ key, label }) => {
                  const active = activeTab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleNav(key)}
                      className="flex w-full items-center justify-between border-b py-4 text-left transition-colors"
                      style={{ borderColor: STUDIO.line }}
                    >
                      <span
                        className="text-base uppercase tracking-[0.06em]"
                        style={{
                          fontFamily: DISPLAY_FONT,
                          fontWeight: active ? 600 : 500,
                          color: active ? STUDIO.ink : STUDIO.inkSoft,
                        }}
                      >
                        {label}
                      </span>
                      {active && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STUDIO.ink }} />}
                    </button>
                  );
                })}
                {openStatus && (
                  <button
                    type="button"
                    onClick={() => { onHoursOpenChange(true); setMobileNavOpen(false); }}
                    className="mt-4 flex items-center gap-2 text-[12px]"
                    style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: openStatus.open ? "#16a34a" : STUDIO.faint }} />
                    {openStatus.label}
                  </button>
                )}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <AtelierHoursDialog
        open={hoursOpen}
        onOpenChange={onHoursOpenChange}
        store={store}
        openStatus={openStatus}
      />
    </>
  );
}

function DesignSwitcher({
  active,
  onSwitch,
}: {
  active: AtelierDesign;
  onSwitch: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hidden items-center gap-1.5 px-2.5 py-2 text-[12px] font-medium uppercase tracking-[0.06em] transition-colors hover:bg-black/[0.04] sm:flex"
        style={{ color: STUDIO.ink, fontFamily: DISPLAY_FONT }}
        title="Switch storefront design"
      >
        <LayoutGrid className="h-4 w-4" style={{ color: STUDIO.muted }} />
        <span>Design</span>
        <ChevronDown
          className={cn("h-3 w-3 transition-transform duration-200", open && "rotate-180")}
          style={{ color: STUDIO.muted }}
        />
      </button>
      {/* Mobile icon-only version */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center transition-colors hover:bg-black/[0.04] sm:hidden"
        style={{ color: STUDIO.ink }}
        aria-label="Switch storefront design"
      >
        <LayoutGrid className="h-5 w-5" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="absolute right-0 top-[calc(100%+10px)] z-50 w-72 p-5"
            style={{
              backgroundColor: STUDIO.surface,
              boxShadow: "0 20px 50px rgba(0,0,0,0.10)",
              border: `1px solid ${STUDIO.line}`,
              borderRadius: 4,
            }}
          >
            <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: STUDIO.faint, fontFamily: DISPLAY_FONT }}>
              Storefront design
            </p>
            <p className="mt-2 text-lg" style={{ fontFamily: DISPLAY_FONT, color: STUDIO.ink, fontWeight: 700 }}>
              Choose a look
            </p>
            <div className="mt-4 space-y-2">
              <DesignOption
                label="Classic"
                description="The default Yellow Jersey storefront."
                selected={active === "classic"}
                onClick={() => { onSwitch(); setOpen(false); }}
              />
              <DesignOption
                label="Studio"
                description="Clean, modern store — bikenow style."
                selected={active === "atelier"}
                onClick={() => setOpen(false)}
              />
            </div>
            <p className="mt-4 text-[11px] leading-relaxed" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>
              Stores can pick whichever design suits them. Your choice is remembered on this device.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DesignOption({
  label,
  description,
  selected,
  onClick,
}: {
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-black/[0.03]"
      style={{
        backgroundColor: selected ? STUDIO.surfaceAlt : "transparent",
        border: `1px solid ${selected ? STUDIO.ink : STUDIO.line}`,
        borderRadius: 4,
      }}
    >
      <span
        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
        style={{
          backgroundColor: selected ? STUDIO.ink : "transparent",
          boxShadow: selected ? "none" : `inset 0 0 0 1px ${STUDIO.faint}`,
        }}
      />
      <span className="min-w-0">
        <span className="block text-sm" style={{ fontFamily: DISPLAY_FONT, color: STUDIO.ink, fontWeight: 600 }}>
          {label}
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>
          {description}
        </span>
      </span>
    </button>
  );
}

function AtelierHoursDialog({
  open,
  onOpenChange,
  store,
  openStatus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: StoreProfile;
  openStatus: { open: boolean; label: string } | null;
}) {
  const todayKey = DAY_KEYS[new Date().getDay()];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-auto bottom-0 left-0 max-w-none translate-x-0 translate-y-0 rounded-none p-0 duration-300 data-open:slide-in-from-bottom-8 data-closed:slide-out-to-bottom-8 sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-none sm:p-0"
        style={{ backgroundColor: STUDIO.surface, border: `1px solid ${STUDIO.line}`, borderRadius: 4 }}
      >
        <DialogHeader className="border-b px-6 pb-5 pt-6" style={{ borderColor: STUDIO.line }}>
          <DialogTitle className="text-xs uppercase tracking-[0.14em]" style={{ color: STUDIO.faint, fontFamily: DISPLAY_FONT }}>
            Opening Hours
          </DialogTitle>
          <DialogDescription className="mt-1 text-xl" style={{ fontFamily: DISPLAY_FONT, color: STUDIO.ink, fontWeight: 700 }}>
            {store.store_name}
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-6 pt-5">
          {openStatus && (
            <div
              className="mb-5 flex items-center justify-between px-4 py-3 text-xs"
              style={{
                backgroundColor: openStatus.open ? "#f0fdf4" : STUDIO.surfaceAlt,
                border: `1px solid ${openStatus.open ? "#bbf7d0" : STUDIO.line}`,
                borderRadius: 4,
              }}
            >
              <span style={{ color: openStatus.open ? "#15803d" : STUDIO.ink, fontFamily: DISPLAY_FONT, fontWeight: 600 }}>
                {openStatus.open ? "Open now" : "Closed"}
              </span>
              <span style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>
                {openStatus.label}
              </span>
            </div>
          )}
          <div className="space-y-0">
            {WEEK_ORDER.map((day) => {
              const h = store.opening_hours?.[day];
              const isToday = day === todayKey;
              const closed = !h || h.closed;
              return (
                <div
                  key={day}
                  className="flex items-center justify-between border-b py-3 text-sm last:border-b-0"
                  style={{ borderColor: STUDIO.lineSoft }}
                >
                  <span
                    className="capitalize"
                    style={{
                      color: isToday ? STUDIO.ink : STUDIO.inkSoft,
                      fontFamily: DISPLAY_FONT,
                      fontWeight: isToday ? 600 : 400,
                    }}
                  >
                    {day}
                    {isToday && (
                      <span className="ml-2 text-[10px] uppercase tracking-[0.1em]" style={{ color: STUDIO.muted, fontFamily: DISPLAY_FONT }}>
                        Today
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums text-[13px]" style={{ color: closed ? STUDIO.faint : STUDIO.ink, fontFamily: DISPLAY_FONT }}>
                    {closed ? "Closed" : `${h.open} — ${h.close}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
