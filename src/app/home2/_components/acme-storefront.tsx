"use client";

import * as React from "react";
import Image from "next/image";
import {
  ArrowRight,
  ArrowUpRight,
  Bike,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock,
  Home,
  Info,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Search,
  ShoppingCart,
  Star,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NoiseTexture } from "@/components/ui/noise-texture";
import { STORE_ACCESSORIES, STORE_BIKES, ACME_STORE_HERO_IMAGE } from "./store-products";

type Tab = "home" | "products" | "bikes" | "rentals" | "service" | "about";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "products", label: "Products", icon: Package },
  { id: "bikes", label: "Bikes", icon: Bike },
  { id: "rentals", label: "Rentals", icon: CircleDot },
  { id: "service", label: "Service", icon: Wrench },
  { id: "about", label: "About", icon: Info },
];

const BRANDS = ["Orbea", "Focus", "Kalkhoff", "Kask", "Apollo"];

type Product = { img: string; title: string; price: string; brand: string };

const PRODUCTS: Product[] = STORE_ACCESSORIES;

const BIKES: Product[] = STORE_BIKES;

const CATEGORIES = [
  { label: "Road & Race", img: "/bike.png" },
  { label: "Helmets & Protection", img: "/helmet.png" },
  { label: "Gravel & MTB", img: "/bicycle.png" },
  { label: "Drivetrain", img: "/chain.png" },
  { label: "Cockpit & Bars", img: "/handlebar.png" },
  { label: "Apparel", img: "/jersey.png" },
];

const SERVICES = [
  { title: "Standard Tune-up", desc: "Gears, brakes, safety check & lube.", price: "$89" },
  { title: "Pro Bike Fit", desc: "60-min fit with a certified fitter.", price: "$199" },
  { title: "Wheel Build", desc: "Hand-built & tensioned to spec.", price: "$150" },
  { title: "Suspension Service", desc: "Fork & shock lower-leg service.", price: "$179" },
];

const RENTALS = [
  { title: "Orbea Vibe Mid H30 · E-bike", price: "$89", img: STORE_BIKES[5].img },
  { title: "Kalkhoff Endeavour 3.B · E-bike", price: "$95", img: STORE_BIKES[4].img },
  { title: "Orbea Katu-E 30 · E-bike", price: "$75", img: STORE_BIKES[7].img },
];

const HOURS = [
  ["Monday", "9:00 – 5:30"],
  ["Tuesday", "9:00 – 5:30"],
  ["Wednesday", "9:00 – 5:30"],
  ["Thursday", "9:00 – 7:00"],
  ["Friday", "9:00 – 5:30"],
  ["Saturday", "10:00 – 4:00"],
  ["Sunday", "10:00 – 4:00"],
];

function ProductTile({ product }: { product: Product }) {
  return (
    <button type="button" className="group block text-left">
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-zinc-100 ring-1 ring-black/[0.04]">
        <Image
          src={product.img}
          alt={product.title}
          fill
          unoptimized
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="180px"
        />
      </div>
      <p className="mt-2 truncate text-[13px] font-medium text-zinc-900">{product.title}</p>
      <p className="text-[13px] font-bold text-zinc-900">{product.price}</p>
      <p className="mt-0.5 text-[11px] text-zinc-500">{product.brand}</p>
    </button>
  );
}

function CarouselProductTile({ product }: { product: Product }) {
  return (
    <button type="button" className="group w-[128px] shrink-0 snap-start text-left sm:w-[140px]">
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-zinc-100 ring-1 ring-black/[0.04]">
        <Image
          src={product.img}
          alt={product.title}
          fill
          unoptimized
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="140px"
        />
      </div>
      <p className="mt-1.5 truncate text-[12px] font-medium text-zinc-900">{product.title}</p>
      <p className="text-[12px] font-bold text-zinc-900">{product.price}</p>
      <p className="mt-0.5 truncate text-[10px] text-zinc-500">{product.brand}</p>
    </button>
  );
}

function HomeProductCarousel({ products, title }: { products: Product[]; title: string }) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const checkScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll, products.length]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction === "left" ? -el.clientWidth * 0.75 : el.clientWidth * 0.75,
      behavior: "smooth",
    });
  };

  return (
    <div className="border-t border-zinc-100 px-4 py-4 sm:px-5 sm:py-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold tracking-tight text-zinc-900">{title}</h4>
          <p className="mt-0.5 text-[11px] text-zinc-500">From the live Acme catalogue</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            aria-label="Scroll products left"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 transition-colors",
              canScrollLeft ? "hover:bg-zinc-50" : "cursor-default opacity-40",
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            aria-label="Scroll products right"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 transition-colors",
              canScrollRight ? "hover:bg-zinc-50" : "cursor-default opacity-40",
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="overflow-x-auto scrollbar-hide snap-x snap-mandatory"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
      >
        <div className="flex gap-3 pr-1">
          {products.map((product) => (
            <CarouselProductTile key={product.title} product={product} />
          ))}
        </div>
      </div>
    </div>
  );
}

function HomeContent() {
  return (
    <div>
      {/* hero with bike background */}
      <div className="relative isolate min-h-[280px] overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <Image
            src={ACME_STORE_HERO_IMAGE}
            alt=""
            fill
            unoptimized
            className="object-cover"
            sizes="640px"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(0,0,0,0.44) 0%, rgba(0,0,0,0.25) 55%, transparent 100%)",
            }}
          />
        </div>
        <div className="relative px-6 py-12 sm:px-8 sm:py-14">
          <h2 className="text-4xl font-black tracking-tight text-white sm:text-5xl">Acme Bikes</h2>
          <p className="mt-3 max-w-md text-sm text-zinc-200">
            Bikes, gear and expert servicing in Fitzroy.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" className="inline-flex items-center gap-1.5 rounded-full bg-[#ffde59] px-4 py-2 text-[13px] font-semibold text-zinc-900">
              Shop the range <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[13px] font-medium text-white">
              <MessageCircle className="h-3.5 w-3.5" /> Message store
            </button>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[13px] font-medium text-white">
              Book a service <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-zinc-300">
              <span className="rounded bg-black px-1.5 py-0.5">
                <Image src="/uberwhite.png" alt="Uber" width={30} height={11} className="h-2.5 w-auto" unoptimized />
              </span>
              <span><span className="font-semibold text-white">1-hour delivery</span> via Uber</span>
              <ArrowRight className="h-3 w-3" />
            </span>
          </div>
          <div className="mt-8">
            <span className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] text-zinc-200 backdrop-blur-sm">
              <Clock className="h-3.5 w-3.5 text-zinc-300" /> Saturday · 10:00 – 16:00 · <span className="text-zinc-400">Closed now</span>
            </span>
          </div>
        </div>
      </div>

      <HomeProductCarousel products={BIKES} title="Featured bikes" />

      {/* shop by category */}
      <div className="px-4 pb-6 sm:px-5">
        <h4 className="text-base font-bold tracking-tight text-zinc-900">Shop by category</h4>
        <p className="mt-0.5 text-[12px] text-zinc-500">Everything you need for the ride ahead</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CATEGORIES.map((c) => (
            <button
              key={c.label}
              type="button"
              className="group relative h-36 overflow-hidden rounded-md bg-gradient-to-b from-white to-zinc-200 text-left ring-1 ring-black/[0.04]"
            >
              <Image
                src={c.img}
                alt={c.label}
                fill
                unoptimized
                className="object-contain p-7 transition-transform duration-300 group-hover:scale-105"
                sizes="240px"
              />
              <span className="absolute bottom-3 left-3 text-[13px] font-semibold text-zinc-900">{c.label}</span>
              <span className="absolute bottom-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-zinc-700 ring-1 ring-black/[0.05]">
                <ArrowUpRight className="h-3.5 w-3.5" />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProductsContent({ items }: { items: Product[] }) {
  return (
    <div className="p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            readOnly
            placeholder="Search products…"
            className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-8 pr-3 text-xs text-zinc-600 outline-none"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        {[...items, ...items].map((p, i) => (
          <ProductTile key={`${p.title}-${i}`} product={p} />
        ))}
      </div>
    </div>
  );
}

function RentalsContent() {
  return (
    <div className="space-y-3 p-4 sm:p-5">
      {RENTALS.map((r) => (
        <div key={r.title} className="flex items-center gap-3 rounded-md border border-zinc-200 bg-white p-3">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-zinc-100">
            <Image src={r.img} alt={r.title} fill unoptimized className="object-cover" sizes="64px" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-zinc-900">{r.title}</p>
            <p className="mt-0.5 text-[12px] text-zinc-500">
              From <span className="font-bold text-zinc-900">{r.price}</span>/day · helmet included
            </p>
          </div>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-2 text-[12px] font-medium text-white">
            <Calendar className="h-3.5 w-3.5" /> Book
          </button>
        </div>
      ))}
    </div>
  );
}

function ServiceContent() {
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
      {SERVICES.map((s) => (
        <div key={s.title} className="flex items-start justify-between gap-3 rounded-md border border-zinc-200 bg-white p-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#ffde59]">
                <Wrench className="h-4 w-4 text-zinc-900" />
              </span>
              <p className="text-sm font-medium text-zinc-900">{s.title}</p>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">{s.desc}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-bold text-zinc-900">{s.price}</p>
            <button type="button" className="mt-2 rounded-md border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-700">
              Book
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AboutContent() {
  return (
    <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-2">
      <div>
        <h4 className="text-sm font-semibold text-zinc-900">Our story</h4>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-600">
          Acme Bikes has been Fitzroy&apos;s neighbourhood bike shop since 2009. We&apos;re riders first,
          across road, gravel and trail, and we build every bike like it&apos;s our own. Drop in for a coffee,
          a fit, or a full custom build.
        </p>
        <div className="mt-4 space-y-2 text-[13px] text-zinc-600">
          <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-zinc-400" /> 248 Brunswick St, Fitzroy VIC</p>
          <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-zinc-400" /> (03) 9417 1234</p>
        </div>
      </div>
      <div className="rounded-md border border-zinc-200 bg-white p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Clock className="h-4 w-4 text-zinc-400" /> Opening hours
        </p>
        <table className="mt-3 w-full text-[12px]">
          <tbody>
            {HOURS.map(([day, time], i) => (
              <tr key={day} className={cn(i === 5 && "font-medium text-zinc-900")}>
                <td className="py-1 text-zinc-500">{day}</td>
                <td className="py-1 text-right text-zinc-700">{time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AcmeStorefront({
  minHeight = 620,
  embedded = false,
}: {
  minHeight?: number;
  embedded?: boolean;
}) {
  const [tab, setTab] = React.useState<Tab>("home");

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden bg-white",
        embedded ? "h-full min-h-0" : "rounded-md border border-zinc-200",
      )}
      style={embedded ? undefined : { minHeight }}
    >
      {/* store info header */}
      <div className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ffde59] text-[11px] font-black text-zinc-900">
          AC
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight text-zinc-900">Acme Bikes</p>
          <p className="truncate text-[11px] leading-tight text-zinc-500">
            248 Brunswick St, Fitzroy · (03) 9417 1234 <span className="text-zinc-400">· Closed now</span>
          </p>
        </div>
        <div className="ml-auto hidden items-center gap-3 md:flex">
          <div className="relative w-52">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              readOnly
              placeholder="Search products…"
              className="h-8 w-full rounded-full border border-zinc-200 bg-white pl-8 pr-3 text-xs text-zinc-500 outline-none"
            />
          </div>
          <ShoppingCart className="h-4 w-4 text-zinc-500" />
          <Image src="/yjlogo.svg" alt="Yellow Jersey" width={96} height={14} className="h-3.5 w-auto opacity-90" />
        </div>
      </div>

      {/* tabs + brand strip */}
      <div className="flex items-center border-b border-zinc-200 bg-white px-3">
        <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
                  active ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800"
                )}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto hidden items-center gap-4 pr-2 lg:flex">
          {BRANDS.map((b) => (
            <span key={b} className="text-[11px] font-semibold uppercase tracking-wide text-zinc-300">
              {b}
            </span>
          ))}
        </div>
      </div>

      {/* content */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-[#fafafa] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tab === "home" && <HomeContent />}
        {tab === "products" && <ProductsContent items={PRODUCTS} />}
        {tab === "bikes" && <ProductsContent items={BIKES} />}
        {tab === "rentals" && <RentalsContent />}
        {tab === "service" && <ServiceContent />}
        {tab === "about" && <AboutContent />}
      </div>
    </div>
  );
}

export function AcmeStorefrontBentoVisual() {
  return (
    <div className="relative w-full overflow-hidden rounded-[18px] bg-[#d9d2c5] p-4 sm:p-6">
      <NoiseTexture />
      <div className="relative z-10">
        <div className="h-[568px] overflow-hidden rounded-[14px] border border-black/[0.06] bg-white shadow-sm sm:h-[628px]">
          <AcmeStorefront embedded />
        </div>
      </div>
    </div>
  );
}
