"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Globe, ImageIcon } from "lucide-react";
import { PhotoQueue } from "@/components/optimize/photo-queue";
import { CopyQueue } from "@/components/optimize/copy-queue";
import { OptimiseWorkflowTabs } from "@/components/optimize/optimize-layout";
import { StoreOnlineProductsManager } from "@/components/settings/store-online-products-manager";

type OptimiseWorkflow = "photos" | "copy" | "online";

const WORKFLOWS: {
  id: OptimiseWorkflow;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "photos", label: "Photos", icon: ImageIcon },
  { id: "copy", label: "Copy", icon: FileText },
  { id: "online", label: "Online products", icon: Globe },
];

function parseWorkflow(param: string | null): OptimiseWorkflow {
  if (param === "online") return "online";
  if (param === "copy") return "copy";
  if (param === "catalogue") return "photos";
  return "photos";
}

export function OptimiseTabPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workflow = parseWorkflow(searchParams.get("workflow"));

  const setWorkflow = (next: OptimiseWorkflow) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "photos") {
      params.delete("workflow");
    } else {
      params.set("workflow", next);
    }
    const query = params.toString();
    router.replace(query ? `/optimize?${query}` : "/optimize", { scroll: false });
  };

  return (
    <div className="space-y-6">
      <OptimiseWorkflowTabs
        items={WORKFLOWS}
        activeId={workflow}
        onChange={(id) => setWorkflow(id as OptimiseWorkflow)}
      />

      {workflow === "photos" && <PhotoQueue />}
      {workflow === "copy" && <CopyQueue />}
      {workflow === "online" && <StoreOnlineProductsManager />}
    </div>
  );
}
