"use client";

import * as React from "react";
import nextDynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  HOMEV2_HOME_PATH,
  emitHomeV2PromptSignal,
  queueHomeV2Prompt,
} from "@/lib/genie/homev2-navigation";
import type { GenieTransitionPhase } from "./genie-transition-scene";

const GenieTransitionScene = nextDynamic(() => import("./genie-transition-scene"), {
  ssr: false,
});

type GenieTransitionContextValue = {
  /** Queue a prompt, play the calm transition, and open it in a fresh home chat. */
  startTransition: (prompt: string) => void;
  active: boolean;
  phase: GenieTransitionPhase;
  prompt: string;
  reduced: boolean;
};

const GenieTransitionContext = React.createContext<GenieTransitionContextValue | null>(null);

export function useGenieTransition() {
  const ctx = React.useContext(GenieTransitionContext);
  if (!ctx) {
    throw new Error("useGenieTransition must be used within a GenieTransitionProvider");
  }
  return ctx;
}

const SHIMMER_STYLE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(90deg, #8a8478 0%, #2f2a20 42%, #c79a2b 52%, #8a8478 100%)",
  backgroundSize: "220% 100%",
  color: "transparent",
  WebkitTextFillColor: "transparent",
};

// Phase timeline (ms from trigger). Gentle and unhurried (~1.6s).
const T_NAVIGATE = 280;
const T_PEAK = 640;
const T_RELEASE = 1180;
const T_DONE = 1640;
const REDUCED_DONE = 520;

export function GenieTransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = React.useRef(pathname);
  const [phase, setPhase] = React.useState<GenieTransitionPhase>("idle");
  const [prompt, setPrompt] = React.useState("");
  const [reduced, setReduced] = React.useState(false);
  const phaseRef = React.useRef<GenieTransitionPhase>("idle");
  const timeoutsRef = React.useRef<number[]>([]);

  React.useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  React.useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const clearTimers = React.useCallback(() => {
    for (const id of timeoutsRef.current) window.clearTimeout(id);
    timeoutsRef.current = [];
  }, []);

  React.useEffect(() => () => clearTimers(), [clearTimers]);

  const startTransition = React.useCallback(
    (rawPrompt: string) => {
      const trimmed = rawPrompt.trim();
      if (!trimmed) return;
      if (phaseRef.current !== "idle") return;

      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

      queueHomeV2Prompt(trimmed);
      setReduced(Boolean(prefersReduced));
      setPrompt(trimmed);
      setPhase("gather");

      const schedule = (fn: () => void, delay: number) => {
        timeoutsRef.current.push(window.setTimeout(fn, delay));
      };

      const alreadyHome = pathnameRef.current === HOMEV2_HOME_PATH;

      if (prefersReduced) {
        router.push(HOMEV2_HOME_PATH);
        schedule(() => emitHomeV2PromptSignal(), T_NAVIGATE);
        schedule(() => {
          setPhase("idle");
          setPrompt("");
        }, REDUCED_DONE);
        return;
      }

      schedule(() => {
        if (!alreadyHome) router.push(HOMEV2_HOME_PATH);
      }, T_NAVIGATE);
      schedule(() => {
        setPhase("peak");
        // Same-page header submits open a fresh chat via this signal; cross-page
        // loads consume the queued prompt on mount, so this is a harmless no-op.
        emitHomeV2PromptSignal();
      }, T_PEAK);
      schedule(() => setPhase("release"), T_RELEASE);
      schedule(() => {
        setPhase("idle");
        setPrompt("");
      }, T_DONE);
    },
    [router],
  );

  const value = React.useMemo<GenieTransitionContextValue>(
    () => ({ startTransition, active: phase !== "idle", phase, prompt, reduced }),
    [startTransition, phase, prompt, reduced],
  );

  return (
    <GenieTransitionContext.Provider value={value}>
      {children}
    </GenieTransitionContext.Provider>
  );
}

/**
 * The visual transition veil. Mounted inside the main content region so the app
 * header and sidebar stay visible — only the working area transforms.
 */
export function GenieTransitionOverlay() {
  const { active, phase, prompt, reduced } = useGenieTransition();

  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          key="genie-transition"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.04, 0.62, 0.23, 0.98] }}
          className="absolute inset-0 z-[60] flex items-center justify-center overflow-hidden"
          style={{
            background:
              "radial-gradient(circle at 50% 38%, #fffdf6 0%, #fbf7ee 58%, #f4efe4 100%)",
          }}
          aria-live="polite"
          aria-label="Opening Genie"
        >
          <div className="absolute inset-0">
            <GenieTransitionScene phase={phase} reduced={reduced} />
          </div>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{
              opacity: phase === "release" ? 0 : 1,
              y: phase === "release" ? -6 : 0,
            }}
            transition={{ duration: 0.55, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="relative z-10 mx-auto max-w-xl bg-clip-text px-6 text-balance text-center text-base font-medium leading-snug animate-[agent-text-shimmer_2.8s_linear_infinite] sm:text-lg"
            style={SHIMMER_STYLE}
          >
            {prompt}
          </motion.p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
