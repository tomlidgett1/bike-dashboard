import { Suspense } from "react";
import { InboxView } from "@/components/crm/inbox-view";
import { CrmSkeleton } from "@/components/crm/primitives";

export default function StoreCrmInboxPage() {
  return (
    <Suspense fallback={<CrmSkeleton variant="rows" count={6} className="p-4" />}>
      <InboxView />
    </Suspense>
  );
}
