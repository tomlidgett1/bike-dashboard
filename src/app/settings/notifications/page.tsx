// ============================================================
// NOTIFICATION SETTINGS PAGE
// ============================================================
// Manage email and in-app notification preferences

'use client';

import * as React from 'react';
import { Header } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useUserProfile } from '@/lib/hooks/use-user-profile';
import { Save, Check, Loader2, Bell, Mail } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

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
      ease: [0.04, 0.62, 0.23, 0.98] as [number, number, number, number],
    },
  },
};

export default function NotificationSettingsPage() {
  const { profile, loading, saving, saveProfile } = useUserProfile();
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [emailNotifications, setEmailNotifications] = React.useState(true);
  const [orderAlerts, setOrderAlerts] = React.useState(true);
  const [inventoryAlerts, setInventoryAlerts] = React.useState(true);
  const [marketingEmails, setMarketingEmails] = React.useState(false);

  // Initialize from profile
  React.useEffect(() => {
    if (profile) {
      setEmailNotifications(profile.email_notifications ?? true);
      setOrderAlerts(profile.order_alerts ?? true);
      setInventoryAlerts(profile.inventory_alerts ?? true);
      setMarketingEmails(profile.marketing_emails ?? false);
    }
  }, [profile]);

  const handleSave = async () => {
    try {
      setError(null);
      setSaved(false);

      await saveProfile({
        email_notifications: emailNotifications,
        order_alerts: orderAlerts,
        inventory_alerts: inventoryAlerts,
        marketing_emails: marketingEmails,
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Error saving notification settings:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to save settings'
      );
    }
  };

  const hasChanges =
    emailNotifications !== (profile?.email_notifications ?? true) ||
    orderAlerts !== (profile?.order_alerts ?? true) ||
    inventoryAlerts !== (profile?.inventory_alerts ?? true) ||
    marketingEmails !== (profile?.marketing_emails ?? false);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header
          title="Notification Settings"
          description="Manage your notification preferences"
        />
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title="Notification Settings"
        description="Manage your notification preferences"
      />
      
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="container mx-auto px-4 py-8 max-w-4xl"
      >
        {/* Email Notifications */}
        <motion.div variants={itemVariants}>
          <Card className="rounded-md mb-6">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-md">
                  <Mail className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle>Email Notifications</CardTitle>
                  <CardDescription>
                    Receive notifications via email
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Message Notifications */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="email-notifications" className="text-base">
                    Message Notifications
                  </Label>
                  <p className="text-sm text-gray-600">
                    Get emailed when you receive new messages about products
                  </p>
                </div>
                <Switch
                  id="email-notifications"
                  checked={emailNotifications}
                  onCheckedChange={setEmailNotifications}
                />
              </div>

              <div className="border-t border-gray-200 pt-6" />

              {/* Order Alerts */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="order-alerts" className="text-base">
                    Order Alerts
                  </Label>
                  <p className="text-sm text-gray-600">
                    Notifications about order status and updates
                  </p>
                </div>
                <Switch
                  id="order-alerts"
                  checked={orderAlerts}
                  onCheckedChange={setOrderAlerts}
                />
              </div>

              <div className="border-t border-gray-200 pt-6" />

              {/* Inventory Alerts */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="inventory-alerts" className="text-base">
                    Inventory Alerts
                  </Label>
                  <p className="text-sm text-gray-600">
                    Get notified about low stock and inventory sync issues
                  </p>
                </div>
                <Switch
                  id="inventory-alerts"
                  checked={inventoryAlerts}
                  onCheckedChange={setInventoryAlerts}
                />
              </div>

              <div className="border-t border-gray-200 pt-6" />

              {/* Marketing Emails */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="marketing-emails" className="text-base">
                    Marketing Emails
                  </Label>
                  <p className="text-sm text-gray-600">
                    Receive updates about new features and promotions
                  </p>
                </div>
                <Switch
                  id="marketing-emails"
                  checked={marketingEmails}
                  onCheckedChange={setMarketingEmails}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* In-App Notifications */}
        <motion.div variants={itemVariants}>
          <Card className="rounded-md mb-6">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-md">
                  <Bell className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <CardTitle>In-App Notifications</CardTitle>
                  <CardDescription>
                    Notifications shown in the header
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <p className="text-sm text-gray-700">
                  In-app notifications are always enabled. You'll see a badge in the header when you have new messages.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 border border-red-200 rounded-md p-4 mb-6"
          >
            <p className="text-sm text-red-600">{error}</p>
          </motion.div>
        )}

        {/* Save Button */}
        <motion.div variants={itemVariants} className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={cn(
              'rounded-md min-w-[120px]',
              saved && 'bg-green-600 hover:bg-green-700'
            )}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : saved ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Saved!
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}



