"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Palette, RotateCcw } from "lucide-react";
import { isStoreSettingsPath } from "@/lib/routes/store-dashboard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { topbarIconButtonClass } from "@/components/layout/topbar-nav-pills";
import { cn } from "@/lib/utils";

export const DASHBOARD_HEADER_BG_DEFAULT = "#5c5c5c";
const STORAGE_KEY = "dashboard-header-bg";

const PRESET_COLORS = [
  { label: "Grey", value: "#5c5c5c" },
  { label: "Light beige", value: "#f3f0eb" },
  { label: "Beige", value: "#e5e0d8" },
  { label: "Warm taupe", value: "#d9d3c8" },
  { label: "Darker taupe", value: "#cdc5b8" },
  { label: "Stone", value: "#b8b0a4" },
  { label: "Brand yellow", value: "#ffde59" },
  { label: "Charcoal", value: "#1a1a1a" },
] as const;

const HEADER_CONTROL_VARS = {
  dark: {
    "--dashboard-header-fg": "rgba(255, 255, 255, 0.92)",
    "--dashboard-header-control-bg": "#ffffff",
    "--dashboard-header-control-border": "rgba(0, 0, 0, 0.16)",
    "--dashboard-header-control-fg": "#171717",
    "--dashboard-header-control-hover-bg": "rgba(0, 0, 0, 0.05)",
    "--dashboard-header-control-hover-fg": "#000000",
    "--dashboard-header-control-active-bg": "rgba(0, 0, 0, 0.08)",
    "--dashboard-header-logo-filter": "none",
  },
  light: {
    "--dashboard-header-fg": "rgba(17, 24, 39, 0.92)",
    "--dashboard-header-control-bg": "#ffffff",
    "--dashboard-header-control-border": "rgba(0, 0, 0, 0.16)",
    "--dashboard-header-control-fg": "#171717",
    "--dashboard-header-control-hover-bg": "rgba(0, 0, 0, 0.05)",
    "--dashboard-header-control-hover-fg": "#000000",
    "--dashboard-header-control-active-bg": "rgba(0, 0, 0, 0.08)",
    "--dashboard-header-logo-filter": "none",
  },
} as const;

function normalizeHeaderColor(color: string): string {
  const trimmed = color.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return DASHBOARD_HEADER_BG_DEFAULT;
  }
  return trimmed.toLowerCase();
}

function getHeaderColorTargets(): HTMLElement[] {
  const targets = new Set<HTMLElement>([document.documentElement]);
  document
    .querySelectorAll<HTMLElement>(".dashboard-shell, .dashboard-header")
    .forEach((element) => targets.add(element));
  return [...targets];
}

function getHeaderTone(color: string): "dark" | "light" {
  const hex = color.replace("#", "");
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? "light" : "dark";
}

type ApplyDashboardHeaderColorOptions = {
  /** Keep icons/buttons white even on light header backgrounds (store settings). */
  forceWhiteControls?: boolean;
};

export function applyDashboardHeaderColor(
  color: string,
  options?: ApplyDashboardHeaderColorOptions,
) {
  const normalized = normalizeHeaderColor(color);
  const tone = options?.forceWhiteControls ? "dark" : getHeaderTone(normalized);
  const vars = HEADER_CONTROL_VARS[tone];

  document.documentElement.setAttribute("data-dashboard-header-tone", tone);
  if (options?.forceWhiteControls) {
    document.documentElement.setAttribute(
      "data-dashboard-header-force-white-controls",
      "true",
    );
  } else {
    document.documentElement.removeAttribute(
      "data-dashboard-header-force-white-controls",
    );
  }

  for (const target of getHeaderColorTargets()) {
    target.style.setProperty("--dashboard-header-bg", normalized);
    for (const [key, value] of Object.entries(vars)) {
      target.style.setProperty(key, value);
    }
  }
}

type DashboardHeaderColorContextValue = {
  color: string;
  setColor: (color: string) => void;
  resetColor: () => void;
};

const DashboardHeaderColorContext =
  React.createContext<DashboardHeaderColorContextValue | null>(null);

export function DashboardHeaderColorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const forceWhiteControls = isStoreSettingsPath(pathname);
  const [color, setColorState] = React.useState(DASHBOARD_HEADER_BG_DEFAULT);

  React.useLayoutEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const next = stored
      ? normalizeHeaderColor(stored)
      : DASHBOARD_HEADER_BG_DEFAULT;
    setColorState(next);
  }, []);

  React.useLayoutEffect(() => {
    applyDashboardHeaderColor(color, { forceWhiteControls });
  }, [color, forceWhiteControls]);

  const setColor = React.useCallback(
    (next: string) => {
      const normalized = normalizeHeaderColor(next);
      setColorState(normalized);
      window.localStorage.setItem(STORAGE_KEY, normalized);
      applyDashboardHeaderColor(normalized, { forceWhiteControls });
    },
    [forceWhiteControls],
  );

  const resetColor = React.useCallback(() => {
    setColor(DASHBOARD_HEADER_BG_DEFAULT);
  }, [setColor]);

  const value = React.useMemo(
    () => ({ color, setColor, resetColor }),
    [color, setColor, resetColor],
  );

  return (
    <DashboardHeaderColorContext.Provider value={value}>
      {children}
    </DashboardHeaderColorContext.Provider>
  );
}

export function useDashboardHeaderColor() {
  const context = React.useContext(DashboardHeaderColorContext);
  if (!context) {
    throw new Error(
      "useDashboardHeaderColor must be used within DashboardHeaderColorProvider",
    );
  }
  return context;
}

export function DashboardHeaderColorPicker() {
  const { color, setColor, resetColor } = useDashboardHeaderColor();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const openCustomPicker = React.useCallback(() => {
    window.requestAnimationFrame(() => {
      inputRef.current?.click();
    });
  }, []);

  return (
    <>
      <input
        ref={inputRef}
        type="color"
        value={color}
        onChange={(event) => setColor(event.target.value)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(topbarIconButtonClass, "relative")}
            aria-label="Change header colour"
            title="Change header colour"
          >
            <Palette className="size-4" />
            <span
              className="absolute bottom-1 right-1 size-2 rounded-full border border-[color:var(--dashboard-header-control-border)] shadow-sm"
              style={{ backgroundColor: color }}
              aria-hidden
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 rounded-md">
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            Header colour
          </DropdownMenuLabel>
          {PRESET_COLORS.map((preset) => (
            <DropdownMenuItem
              key={preset.value}
              className="gap-2 rounded-md"
              onSelect={() => setColor(preset.value)}
            >
              <span
                className="size-4 shrink-0 rounded-md border border-border/60"
                style={{ backgroundColor: preset.value }}
                aria-hidden
              />
              <span className="flex-1">{preset.label}</span>
              {color.toLowerCase() === preset.value ? (
                <span className="text-[10px] font-medium text-muted-foreground">
                  Active
                </span>
              ) : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2 rounded-md"
            onSelect={(event) => {
              event.preventDefault();
              openCustomPicker();
            }}
          >
            <span
              className="size-4 shrink-0 rounded-md border border-border/60"
              style={{ backgroundColor: color }}
              aria-hidden
            />
            <span>Custom colour…</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 rounded-md"
            onSelect={() => resetColor()}
          >
            <RotateCcw className="size-3.5 text-muted-foreground" />
            <span>Reset default</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
