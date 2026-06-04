"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Globe, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PhotoQueue } from "@/components/optimize/photo-queue";
import { CopyQueue } from "@/components/optimize/copy-queue";
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
      <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
        {WORKFLOWS.map((item) => {
          const isActive = workflow === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setWorkflow(item.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                isActive
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70",
              )}
            >
              <item.icon className="size-[15px]" />
              {item.label}
            </button>
          );
        })}
      </div>

      {workflow === "photos" && <PhotoQueue />}
      {workflow === "copy" && <CopyQueue />}
      {workflow === "online" && <StoreOnlineProductsManager />}
    </div>
  );
}
