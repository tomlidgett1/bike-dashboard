"use client";

export const dynamic = "force-dynamic";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StoreUberManager } from "@/components/settings/store-uber-manager";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";

export default function UberSettingsPage() {
  const { user } = useAuth();
  const { profile, loading } = useUserProfile();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (loading) return;

    if (!user || !profile) {
      router.replace("/marketplace");
      return;
    }

    const authorized = profile.account_type === "bicycle_store" && profile.bicycle_store === true;
    if (!authorized) {
      router.replace("/marketplace/settings");
      return;
    }

    setIsAuthorized(true);
  }, [loading, profile, router, user]);

  if (loading || isAuthorized === null) {
    return (
      <>
        <Header title="Uber" description="Manage express delivery" />
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Uber" description="Manage express delivery" />
      <div className="p-4 lg:p-6">
        <div className="mx-auto max-w-5xl">
          <Card className="rounded-md border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Uber Delivery</CardTitle>
              <CardDescription className="text-sm">
                Choose products and SMS recipients for Uber Express orders.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StoreUberManager />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
