"use client";

import * as React from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { GoogleLogo } from "@/components/genie/google-logo";
import { LightspeedLogo } from "@/components/genie/lightspeed-logo";
import { NestLogo } from "@/components/genie/nest-logo";
import { ChevronDown } from "@/components/layout/app-sidebar/dashboard-icons";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type AgentIntegration = "nest" | "lightspeed" | "google" | "gmail" | "stripe";

export type AgentBentoCardProps = {
  name: string;
  tagline: string;
  description: string;
  lastRun: string;
  totalRuns: number;
  integrations: AgentIntegration[];
  defaultEnabled?: boolean;
  defaultRequiresApproval?: boolean;
  className?: string;
};

function IntegrationLogo({
  integration,
  size,
}: {
  integration: AgentIntegration;
  size: "sm" | "default";
}) {
  const small = size === "sm";

  if (integration === "nest") {
    return <NestLogo className={cn("shrink-0", small ? "h-5 w-5" : "h-7 w-7")} />;
  }
  if (integration === "lightspeed") {
    return <LightspeedLogo className={cn("shrink-0", small ? "h-5 w-5" : "h-7 w-7")} />;
  }
  if (integration === "google") {
    return <GoogleLogo className={cn("shrink-0", small ? "h-[18px] w-[18px]" : "h-6 w-6")} />;
  }
  if (integration === "gmail") {
    return (
      <Image
        src="/gmail.svg"
        alt="Gmail"
        width={28}
        height={21}
        className={cn("w-auto shrink-0 object-contain", small ? "h-4" : "h-5")}
      />
    );
  }
  return (
    <Image
      src="/stripe.svg"
      alt="Stripe"
      width={38}
      height={16}
      className={cn("w-auto shrink-0 object-contain", small ? "h-3" : "h-4")}
    />
  );
}

export function AgentIntegrationLogos({
  integrations,
  size = "default",
}: {
  integrations: AgentIntegration[];
  size?: "sm" | "default";
}) {
  return (
    <div
      className={cn("flex items-center", size === "sm" ? "min-h-5 gap-1.5" : "min-h-7 gap-2")}
      aria-label="Required integrations"
    >
      {integrations.map((integration) => (
        <IntegrationLogo key={integration} integration={integration} size={size} />
      ))}
    </div>
  );
}

export function AgentBentoCard({
  name,
  tagline,
  description,
  lastRun,
  totalRuns,
  integrations,
  defaultEnabled = false,
  defaultRequiresApproval = true,
  className,
}: AgentBentoCardProps) {
  const [enabled, setEnabled] = React.useState(defaultEnabled);
  const [requiresApproval, setRequiresApproval] = React.useState(defaultRequiresApproval);
  const [isHowItWorksOpen, setIsHowItWorksOpen] = React.useState(false);

  return (
    <article
      className={cn(
        "w-full overflow-hidden rounded-2xl border border-gray-200 bg-white p-1.5 shadow-sm",
        className,
      )}
    >
      <div className="px-3.5 pb-3 pt-3.5">
        <div className="flex items-start justify-between gap-4">
          <AgentIntegrationLogos integrations={integrations} />

          <label className="flex shrink-0 cursor-pointer items-center gap-2 pt-1">
            <span className="text-[12px] font-medium text-gray-500">{enabled ? "On" : "Off"}</span>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label={`Toggle ${name}`}
            />
          </label>
        </div>

        <div className="mt-3 min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-gray-900">{name}</h2>
          <p className="mt-0.5 text-[12px] text-gray-500">{tagline}</p>
        </div>

        <button
          type="button"
          onClick={() => setIsHowItWorksOpen((open) => !open)}
          className="mt-3 flex w-full items-center justify-between gap-3 border-t border-gray-100 pt-2.5 text-left"
          aria-expanded={isHowItWorksOpen}
        >
          <span className="text-[11px] font-medium text-gray-500">
            How it works
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-gray-400 transition-transform duration-200",
              isHowItWorksOpen && "rotate-180",
            )}
          />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isHowItWorksOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: 0.4,
              ease: [0.04, 0.62, 0.23, 0.98],
            }}
            className="overflow-hidden"
          >
            <div
              className={cn(
                "rounded-xl border border-black/[0.07] bg-[#f2f1ee] p-4 transition-opacity duration-200",
                !enabled && "opacity-50",
              )}
            >
              <p className="text-[13px] leading-relaxed text-gray-700">{description}</p>

              <div className="mt-3 flex items-center justify-between gap-4 border-t border-black/[0.08] px-0.5 pt-2.5">
                <p className="text-[11px] font-medium text-gray-600">Requires approval</p>
                <Switch
                  checked={requiresApproval}
                  onCheckedChange={setRequiresApproval}
                  disabled={!enabled}
                  aria-label={`Require approval for ${name}`}
                />
              </div>

              <div className="mt-2.5 flex items-end justify-between gap-5 border-t border-black/[0.08] px-0.5 pt-2.5">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-gray-400">
                    Last run
                  </p>
                  <p className="mt-1 text-[12px] font-medium text-gray-700">{lastRun}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-gray-400">
                    Total runs
                  </p>
                  <p className="mt-1 text-[12px] font-medium tabular-nums text-gray-700">
                    {totalRuns.toLocaleString("en-AU")}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}
