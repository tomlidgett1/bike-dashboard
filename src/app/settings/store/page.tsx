"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Store, Wrench } from "lucide-react";
import { Header } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StoreCategoryDisplayManager } from "@/components/settings/store-category-display-manager";
import { StoreServicesManager } from "@/components/settings/store-services-manager";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";

// ============================================================
// Store Settings Page
// Manage store categories and services
// ============================================================

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.04, 0.62, 0.23, 0.98] as any,
    },
  },
};

export default function StoreSettingsPage() {
  const { user } = useAuth();
  const { profile, loading } = useUserProfile();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = React.useState<boolean | null>(null);

  // Check access permissions
  React.useEffect(() => {
    if (!loading) {
      if (!profile) {
        router.replace('/marketplace');
        return;
      }

      const authorized =
        profile.account_type === 'bicycle_store' && profile.bicycle_store === true;

      if (!authorized) {
        // Redirect individual users to marketplace settings
        router.replace('/marketplace/settings');
      } else {
        setIsAuthorized(true);
      }
    }
  }, [profile, loading, router]);

  // Show loading while checking authorization
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
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="mx-auto max-w-3xl space-y-6"
        >
          {/* Categories Section */}
          <motion.div variants={itemVariants}>
            <Card className="bg-white dark:bg-card rounded-md border-border">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                    <Store className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
              <CardTitle className="text-base font-semibold">
                  Category Display Names
                </CardTitle>
                <CardDescription className="text-sm">
                  Rename how categories appear on your store profile
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <StoreCategoryDisplayManager />
          </CardContent>
            </Card>
          </motion.div>

          {/* Services Section */}
          <motion.div variants={itemVariants}>
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
          </motion.div>
        </motion.div>
      </div>
    </>
  );
}

