"use client";

export const dynamic = "force-dynamic";

import * as React from "react";
import { Soundwave } from "@/components/layout/app-sidebar/dashboard-icons";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { MaiVoiceLiveLab } from "@/components/settings/mai-voice-live-lab";
import { PhoneAiLiveLab } from "@/components/settings/phone-ai-live-lab";
import { cn } from "@/lib/utils";

type TabId = "browser" | "phone";

export default function TestTomPage() {
  const [tab, setTab] = React.useState<TabId>("phone");

  return (
    <DashboardFloatingPage
      title="Test Tom"
      icon={Soundwave}
      description="Speech test benches — browser MAI Voice Live and inbound phone OpenAI Realtime."
      toolbar={
        <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
          <button
            type="button"
            onClick={() => setTab("phone")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              tab === "phone"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            <Soundwave size={15} />
            Phone (OpenAI)
          </button>
          <button
            type="button"
            onClick={() => setTab("browser")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              tab === "browser"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            <Soundwave size={15} />
            Browser (MAI)
          </button>
        </div>
      }
    >
      {tab === "phone" ? <PhoneAiLiveLab /> : <MaiVoiceLiveLab />}
    </DashboardFloatingPage>
  );
}
