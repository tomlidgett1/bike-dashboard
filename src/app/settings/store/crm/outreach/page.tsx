"use client";

import nextDynamic from "next/dynamic";
import { CrmSkeleton } from "@/components/crm/primitives";

const CrmPageContent = nextDynamic(
  () => import("../crm-page-content").then((module) => module.CrmPageContent),
  {
    ssr: false,
    loading: () => <CrmSkeleton count={5} className="p-4" />,
  },
);

export default function StoreCrmOutreachPage() {
  return <CrmPageContent embedded />;
}
