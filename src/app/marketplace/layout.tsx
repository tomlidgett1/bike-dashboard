export default function MarketplaceRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="marketplace-light-surface min-h-dvh overflow-x-hidden bg-white sm:bg-gray-50">
      {children}
    </div>
  );
}
