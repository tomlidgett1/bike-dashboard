"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useCart } from "@/components/providers/cart-provider";
import { useMessages } from "@/components/providers/messages-provider";
import { useUpload } from "@/components/providers/upload-provider";
import { useOptimizeJobs } from "@/components/providers/optimize-jobs-provider";
import { useGenieJobs } from "@/components/providers/genie-jobs-provider";

const LazyCartDrawer = dynamic(
  () => import("@/components/marketplace/cart-drawer").then((mod) => mod.CartDrawer),
  { ssr: false }
);

const LazyMessagesPanel = dynamic(
  () => import("@/components/messages/messages-panel").then((mod) => mod.MessagesPanel),
  { ssr: false }
);

const LazyGeniePortal = dynamic(
  () => import("@/components/genie/genie-portal").then((mod) => mod.GeniePortal),
  { ssr: false }
);

const LazyFloatingUploadBar = dynamic(
  () => import("@/components/marketplace/floating-upload-bar").then((mod) => mod.FloatingUploadBar),
  { ssr: false }
);

const LazyFloatingOptimizeJobsCard = dynamic(
  () =>
    import("@/components/optimize/floating-optimize-jobs-card").then(
      (mod) => mod.FloatingOptimizeJobsCard,
    ),
  { ssr: false }
);

const LazyFloatingGenieJobsPill = dynamic(
  () =>
    import("@/components/genie/floating-genie-jobs-pill").then(
      (mod) => mod.FloatingGenieJobsPill,
    ),
  { ssr: false }
);

const LazyFloatingImageApprovalCard = dynamic(
  () =>
    import("@/components/optimize/floating-image-approval-card").then(
      (mod) => mod.FloatingImageApprovalCard,
    ),
  { ssr: false }
);

export function DeferredGlobalPanels() {
  const cart = useCart();
  const messages = useMessages();
  const upload = useUpload();
  const optimizeJobs = useOptimizeJobs();
  const genieJobs = useGenieJobs();
  const [loadIdlePanels, setLoadIdlePanels] = React.useState(false);

  React.useEffect(() => {
    const win = window as Window & {
      requestIdleCallback?: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(() => setLoadIdlePanels(true), { timeout: 2500 });
      return () => win.cancelIdleCallback?.(id);
    }

    const id = window.setTimeout(() => setLoadIdlePanels(true), 1500);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <>
      {(cart.isOpen || cart.pendingReplacement || cart.buyNowItem) && <LazyCartDrawer />}
      {messages.isOpen && <LazyMessagesPanel />}
      {(upload.isUploading || upload.stage !== "idle") && <LazyFloatingUploadBar />}
      {optimizeJobs.visibleJobs.length > 0 && <LazyFloatingOptimizeJobsCard />}
      {genieJobs.visibleJobs.length > 0 && <LazyFloatingGenieJobsPill />}
      {loadIdlePanels && <LazyFloatingImageApprovalCard />}
      {loadIdlePanels && <LazyGeniePortal />}
    </>
  );
}
