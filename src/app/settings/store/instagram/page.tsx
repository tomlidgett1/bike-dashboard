import { Suspense } from "react";
import { StoreInstagramPanel } from "@/components/settings/store-instagram-panel";

function InstagramWorkspaceFallback() {
  return (
    <div
      className="flex h-[calc(100svh-57px)] items-center justify-center bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.10),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]"
      aria-busy="true"
      aria-label="Loading Instagram"
    >
      <div className="h-10 w-48 animate-pulse rounded-md bg-gray-100" />
    </div>
  );
}

export default function StoreInstagramPage() {
  return (
    <Suspense fallback={<InstagramWorkspaceFallback />}>
      <StoreInstagramPanel />
    </Suspense>
  );
}
