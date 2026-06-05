"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OptimiseHub, type OptimiseSource } from "@/components/optimize/optimise-hub";
import { CatalogueOptimiseFlow } from "@/components/optimize/catalogue-optimise-flow";
import { PrivateListingsOptimiseFlow } from "@/components/optimize/private-listings-optimise-flow";
import { CsvOptimiseFlow } from "@/components/optimize/csv-optimise-flow";

function parseSource(param: string | null): OptimiseSource | null {
  if (param === "catalogue" || param === "private" || param === "csv") return param;
  if (param === "photos") return "catalogue";
  if (param === "copy") return "catalogue";
  if (param === "online") return "csv";
  return null;
}

export function OptimiseTabPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const source = parseSource(searchParams.get("source"));

  const setSource = (next: OptimiseSource | null) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("workflow");
    if (next) {
      params.set("source", next);
    } else {
      params.delete("source");
    }
    const query = params.toString();
    router.replace(query ? `/optimize?${query}` : "/optimize", { scroll: false });
  };

  if (!source) {
    return <OptimiseHub onSelect={setSource} />;
  }

  if (source === "catalogue") {
    return <CatalogueOptimiseFlow onBack={() => setSource(null)} />;
  }

  if (source === "private") {
    return <PrivateListingsOptimiseFlow onBack={() => setSource(null)} />;
  }

  return <CsvOptimiseFlow onBack={() => setSource(null)} />;
}
