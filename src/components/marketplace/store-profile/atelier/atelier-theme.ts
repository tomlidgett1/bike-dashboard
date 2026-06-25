import { Inter, JetBrains_Mono } from "next/font/google";

/**
 * "Studio" alt storefront — a clean, white, classic e-commerce design
 * inspired by bikenow.com.au: black announcement bar, centred logo header,
 * full-bleed hero, image-tile categories, clean white product cards with
 * red sale accents, promo bands, and a services trio.
 *
 * Light, white, Shopify-style. Distinctly different from the default
 * Yellow Jersey rounded-yellow-carousel storefront.
 */

export const studioDisplay = Inter({
  subsets: ["latin"],
  variable: "--font-studio-display",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const studioMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-studio-mono",
  display: "swap",
  weight: ["400", "500"],
});

/** Class applied to the alt root to opt into the scoped fonts. */
export const STUDIO_FONT_CLASS = `${studioDisplay.variable} ${studioMono.variable}`;

export const STUDIO = {
  paper: "#ffffff",
  paperDeep: "#f5f5f4",
  surface: "#ffffff",
  surfaceAlt: "#f7f7f6",
  ink: "#111111",
  inkSoft: "#1f1f1f",
  muted: "#6b6b70",
  faint: "#a1a1a9",
  line: "#e5e5e4",
  lineSoft: "#efeeec",
  /** Sale / discount accent — classic e-commerce red. */
  sale: "#d92d20",
  saleSoft: "#fef3f2",
  /** Ink used for announcement bar + buttons. */
  banner: "#111111",
  bannerText: "#ffffff",
} as const;

export function padIndex(n: number): string {
  return n.toString().padStart(2, "0");
}

export const DISPLAY_FONT = "var(--font-studio-display), ui-sans-serif, system-ui, sans-serif";
export const MONO_FONT = "var(--font-studio-mono), ui-monospace, monospace";
