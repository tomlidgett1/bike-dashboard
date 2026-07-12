import type { ReactNode } from "react";
import { Suspense } from "react";
import { CustomersView } from "@/components/crm/customers-view";
import { CrmSkeleton } from "@/components/crm/primitives";

export default function StoreCrmCustomersLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<CrmSkeleton variant="rows" count={10} className="p-4" />}>
        <CustomersView />
      </Suspense>
      {children}
    </>
  );
}
