"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function SyncInventoryPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the new unified Connect Lightspeed page
    router.replace('/connect-lightspeed');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 text-gray-400 animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">
          Redirecting to Connect Lightspeed...
        </p>
      </div>
    </div>
  );
}
