"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OptimiseHub, type OptimiseSource } from "@/components/optimize/optimise-hub";
import { CatalogueOptimiseModal } from "@/components/optimize/catalogue-optimise-modal";
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
  const [catalogueOpen, setCatalogueOpen] = React.useState(source === "catalogue");

  React.useEffect(() => {
    if (source === "catalogue") setCatalogueOpen(true);
  }, [source]);

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

  const handleSelect = (next: OptimiseSource) => {
    if (next === "catalogue") {
      setSource("catalogue");
      setCatalogueOpen(true);
      return;
    }
    setSource(next);
  };

  const handleCatalogueOpenChange = (open: boolean) => {
    setCatalogueOpen(open);
    if (!open && source === "catalogue") {
      setSource(null);
    }
  };

  if (!source) {
    return (
      <>
        <OptimiseHub onSelect={handleSelect} />
        <CatalogueOptimiseModal
          open={catalogueOpen}
          onOpenChange={handleCatalogueOpenChange}
        />
      </>
    );
  }

  if (source === "catalogue") {
    return (
      <>
        <OptimiseHub onSelect={handleSelect} />
        <CatalogueOptimiseModal
          open={catalogueOpen}
          onOpenChange={handleCatalogueOpenChange}
        />
      </>
    );
  }

  if (source === "private") {
    return <PrivateListingsOptimiseFlow onBack={() => setSource(null)} />;
  }

  return <CsvOptimiseFlow onBack={() => setSource(null)} />;
}
