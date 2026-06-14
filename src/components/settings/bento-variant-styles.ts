import { cn } from "@/lib/utils";

export type BentoShellVariant = "default" | "light-beige-floating" | "gray-inset";

export function getBentoShellStyles(variant: BentoShellVariant) {
  const listItemBorder =
    variant === "gray-inset" ? "border-gray-200/90" : "border-black/[0.07]";

  switch (variant) {
    case "light-beige-floating":
      return {
        outerInset: true,
        outerInsetClassName: "px-1.5 pt-0 pb-1.5",
        panelClassName:
          "overflow-hidden rounded-t-[22px] rounded-b-[26px] border border-black/[0.07] bg-[#f2f1ee] px-3 pt-3 pb-0 shadow-[0_2px_12px_rgba(0,0,0,0.06)]",
        panelBg: "bg-[#f2f1ee]",
        listItemBorder,
      };
    case "gray-inset":
      return {
        outerInset: true,
        outerInsetClassName: "px-1.5 pt-0 pb-1.5",
        panelClassName:
          "overflow-hidden rounded-t-[22px] rounded-b-[26px] border border-gray-200/90 bg-gray-50 px-3 pt-3 pb-0 shadow-[0_1px_8px_rgba(0,0,0,0.04)]",
        panelBg: "bg-gray-50",
        listItemBorder,
      };
    default:
      return {
        outerInset: false,
        outerInsetClassName: "",
        panelClassName: "overflow-hidden rounded-t-[28px] bg-[#f2f1ee] px-3 pt-4 pb-0",
        panelBg: "bg-[#f2f1ee]",
        listItemBorder,
      };
  }
}

export function bentoPanelShellClass(variant: BentoShellVariant) {
  return cn("flex min-h-0 flex-1 flex-col", getBentoShellStyles(variant).panelClassName);
}

/** Wrapper between the card header and inner panel (inset variants only). */
export function bentoOuterWrapClassName(variant: BentoShellVariant) {
  const shell = getBentoShellStyles(variant);
  return cn("relative flex min-h-0 flex-1 flex-col", shell.outerInset && shell.outerInsetClassName);
}

/** Outer footy-card shell shared by Overivewo bentos (20% shorter than original 5/8 × 520px). */
export function bentoCardShellClassName(className?: string) {
  return cn(
    "relative flex aspect-[25/32] w-full max-w-[340px] shrink-0 min-h-[416px] flex-col overflow-hidden rounded-[32px] border border-gray-200/80 bg-white shadow-sm",
    className,
  );
}

/** Wider Overivewo bento — spans ~2 standard cards for dashboard-style panels. */
export function bentoWideCardShellClassName(className?: string) {
  return cn(
    "relative flex w-full max-w-[860px] shrink-0 min-h-[380px] flex-col overflow-hidden rounded-[32px] border border-gray-200/80 bg-white shadow-sm",
    className,
  );
}
