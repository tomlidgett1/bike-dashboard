import { ForceLightChrome } from "@/components/layout/force-light-chrome";
import { DashboardSolarProvider } from "@/components/layout/app-sidebar/dashboard-icons";

export default function MarketplaceRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ForceLightChrome>
      <DashboardSolarProvider>
        <div className="marketplace-light-surface min-h-dvh min-h-screen overflow-x-clip bg-white text-foreground sm:bg-gray-50">
          {children}
        </div>
      </DashboardSolarProvider>
    </ForceLightChrome>
  );
}
