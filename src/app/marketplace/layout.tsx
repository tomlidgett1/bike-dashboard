import { ForceLightChrome } from "@/components/layout/force-light-chrome";

export default function MarketplaceRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ForceLightChrome>
      <div className="marketplace-light-surface min-h-dvh min-h-screen overflow-x-clip bg-white text-foreground sm:bg-gray-50">
        {children}
      </div>
    </ForceLightChrome>
  );
}
