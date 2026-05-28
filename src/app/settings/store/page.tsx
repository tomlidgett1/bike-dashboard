"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Store, Wrench, Tag } from "lucide-react";
import { Header } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StoreCategoriesManager } from "@/components/settings/store-categories-manager";
import { StoreServicesManager } from "@/components/settings/store-services-manager";
import { StoreBrandsManager } from "@/components/settings/store-brands-manager";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";

export default function StoreSettingsPage() {
  const { user } = useAuth();
  const { profile, loading } = useUserProfile();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (!loading) {
      if (!profile) {
        router.replace('/marketplace');
        return;
      }

      const authorized =
        profile.account_type === 'bicycle_store' && profile.bicycle_store === true;

      if (!authorized) {
        router.replace('/marketplace/settings');
      } else {
        setIsAuthorized(true);
      }
    }
  }, [profile, loading, router]);

  if (loading || isAuthorized === null) {
    return (
      <>
        <Header
          title="Store Settings"
          description="Manage your store profile, categories, and services"
        />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Store Settings"
        description="Manage your store profile, categories, and services"
      />

      <div className="p-4 lg:p-6">
        <div className="mx-auto max-w-3xl">
          <Tabs defaultValue="categories">
            <TabsList className="w-full justify-start mb-6">
              <TabsTrigger value="categories" className="flex-none gap-2">
                <Store className="h-4 w-4" />
                Categories
              </TabsTrigger>
              <TabsTrigger value="services" className="flex-none gap-2">
                <Wrench className="h-4 w-4" />
                Services
              </TabsTrigger>
              <TabsTrigger value="brands" className="flex-none gap-2">
                <Tag className="h-4 w-4" />
                Brands
              </TabsTrigger>
            </TabsList>

            <TabsContent value="categories">
              <Card className="bg-white dark:bg-card rounded-md border-border">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                      <Store className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">
                        Product Categories
                      </CardTitle>
                      <CardDescription className="text-sm">
                        Manage the category carousels shown on your store page. Import from Lightspeed or create custom categories.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <StoreCategoriesManager />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="services">
              <Card className="bg-white dark:bg-card rounded-md border-border">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                      <Wrench className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">
                        Store Services
                      </CardTitle>
                      <CardDescription className="text-sm">
                        Manage the services you offer to customers
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <StoreServicesManager />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="brands">
              <Card className="bg-white dark:bg-card rounded-md border-border">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                      <Tag className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">
                        Brands We Stock
                      </CardTitle>
                      <CardDescription className="text-sm">
                        Upload brand logos to showcase on your store page
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <StoreBrandsManager />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}
