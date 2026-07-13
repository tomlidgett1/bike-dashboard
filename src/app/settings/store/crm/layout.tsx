import type { ReactNode } from "react";
import { Mailbox } from "@/components/layout/app-sidebar/dashboard-icons";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { CrmCommandBar } from "@/components/crm/crm-command-bar";
import { CrmPerformanceReporter } from "@/components/crm/crm-performance-reporter";
import { CrmRouteTabs } from "@/components/crm/crm-route-tabs";
import { isStoreCrmV2Enabled } from "@/lib/crm/feature-flags";

export default function StoreCrmLayout({ children }: { children: ReactNode }) {
  const enabled = isStoreCrmV2Enabled();
  return (
    <>
      {enabled ? <CrmPerformanceReporter /> : null}
      <DashboardFloatingPage
        title="CRM"
        icon={Mailbox}
        actions={enabled ? <CrmCommandBar /> : undefined}
        toolbar={enabled ? <CrmRouteTabs /> : undefined}
        flush
        cardClassName="rounded-xl"
        scrollClassName="overflow-hidden"
      >
        <div className="h-full min-h-0">{children}</div>
      </DashboardFloatingPage>
    </>
  );
}
