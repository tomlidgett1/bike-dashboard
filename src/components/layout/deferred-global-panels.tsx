"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/providers/cart-provider";
import { useGenie } from "@/components/providers/genie-provider";
import { useMessages } from "@/components/providers/messages-provider";
import { useUpload } from "@/components/providers/upload-provider";

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

const LazyFloatingBottomDock = dynamic(
  () =>
    import("@/components/layout/floating-bottom-dock").then(
      (mod) => mod.FloatingBottomDock,
    ),
  { ssr: false },
);

export function DeferredGlobalPanels() {
  const cart = useCart();
  const messages = useMessages();
  const upload = useUpload();
  const pathname = usePathname();
  const { isOpen, productContext } = useGenie();
  const isProductPage = pathname?.startsWith("/marketplace/product/") ?? false;
  const [loadIdlePanels, setLoadIdlePanels] = React.useState(isProductPage);

  React.useEffect(() => {
    if (isProductPage || isOpen || productContext) {
      setLoadIdlePanels(true);
    }
  }, [isProductPage, isOpen, productContext]);

  React.useEffect(() => {
    if (isProductPage) return;

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
  }, [isProductPage]);

  return (
    <>
      {(cart.isOpen || cart.pendingReplacement || cart.buyNowItem) && <LazyCartDrawer />}
      {messages.isOpen && <LazyMessagesPanel />}
      {(upload.isUploading || upload.stage !== "idle") && <LazyFloatingUploadBar />}
      <LazyFloatingBottomDock />
      {loadIdlePanels && <LazyGeniePortal />}
    </>
  );
}
