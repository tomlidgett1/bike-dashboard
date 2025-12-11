// ============================================================
// NOTIFICATION SETTINGS PAGE
// ============================================================
// Manage email and in-app notification preferences

'use client';

export const dynamic = 'force-dynamic';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUserProfile } from '@/lib/hooks/use-user-profile';
import { Save, Check, Loader2, Bell, Mail, Clock, Moon } from 'lucide-react';
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

interface NotificationPreferences {
  email_enabled: boolean;
  email_frequency: 'instant' | 'smart' | 'digest' | 'critical_only';
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

export default function NotificationSettingsPage() {
  const { profile, loading, saving, saveProfile } = useUserProfile();
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loadingPreferences, setLoadingPreferences] = React.useState(true);
  const [savingPreferences, setSavingPreferences] = React.useState(false);

  // Legacy settings (stored in users table)
  const [emailNotifications, setEmailNotifications] = React.useState(true);
  const [orderAlerts, setOrderAlerts] = React.useState(true);
  const [inventoryAlerts, setInventoryAlerts] = React.useState(true);
  const [marketingEmails, setMarketingEmails] = React.useState(false);

  // New advanced preferences (stored in notification_preferences table)
  const [preferences, setPreferences] = React.useState<NotificationPreferences>({
    email_enabled: true,
    email_frequency: 'smart',
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00',
    quiet_hours_end: '08:00',
  });

  // Initialize legacy settings from profile
  React.useEffect(() => {
    if (profile) {
      setEmailNotifications(profile.email_notifications ?? true);
      setOrderAlerts(profile.order_alerts ?? true);
      setInventoryAlerts(profile.inventory_alerts ?? true);
      setMarketingEmails(profile.marketing_emails ?? false);
    }
  }, [profile]);

  // Fetch advanced notification preferences
  React.useEffect(() => {
    async function fetchPreferences() {
      try {
        const response = await fetch('/api/notifications/preferences');
        if (response.ok) {
          const data = await response.json();
          if (data.preferences) {
            setPreferences({
              email_enabled: data.preferences.email_enabled ?? true,
              email_frequency: data.preferences.email_frequency ?? 'smart',
              quiet_hours_enabled: data.preferences.quiet_hours_enabled ?? false,
              quiet_hours_start: data.preferences.quiet_hours_start?.slice(0, 5) ?? '22:00',
              quiet_hours_end: data.preferences.quiet_hours_end?.slice(0, 5) ?? '08:00',
            });
          }
        }
      } catch (err) {
        console.error('Error fetching notification preferences:', err);
      } finally {
        setLoadingPreferences(false);
      }
    }

    if (profile) {
      fetchPreferences();
    }
  }, [profile]);

  const handleSave = async () => {
    try {
      setError(null);
      setSaved(false);
      setSavingPreferences(true);

      // Save legacy settings to users table
      await saveProfile({
        email_notifications: emailNotifications,
        order_alerts: orderAlerts,
        inventory_alerts: inventoryAlerts,
        marketing_emails: marketingEmails,
      });

      // Save advanced preferences to notification_preferences table
      const prefsResponse = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_enabled: preferences.email_enabled,
          email_frequency: preferences.email_frequency,
          quiet_hours_enabled: preferences.quiet_hours_enabled,
          quiet_hours_start: preferences.quiet_hours_start,
          quiet_hours_end: preferences.quiet_hours_end,
        }),
      });

      if (!prefsResponse.ok) {
        throw new Error('Failed to save notification preferences');
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Error saving notification settings:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to save settings'
      );
    } finally {
      setSavingPreferences(false);
    }
  };

  const hasChanges =
    emailNotifications !== (profile?.email_notifications ?? true) ||
    orderAlerts !== (profile?.order_alerts ?? true) ||
    inventoryAlerts !== (profile?.inventory_alerts ?? true) ||
    marketingEmails !== (profile?.marketing_emails ?? false);

  if (loading || loadingPreferences) {
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
        {/* Email Delivery Settings */}
        <motion.div variants={itemVariants}>
          <Card className="rounded-md mb-6">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-md">
                  <Mail className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle>Email Delivery</CardTitle>
                  <CardDescription>
                    Control how and when you receive email notifications
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Master Email Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="email-enabled" className="text-base">
                    Email Notifications
                  </Label>
                  <p className="text-sm text-gray-600">
                    Receive notifications about messages, offers, and orders via email
                  </p>
                </div>
                <Switch
                  id="email-enabled"
                  checked={preferences.email_enabled}
                  onCheckedChange={(checked) => 
                    setPreferences(prev => ({ ...prev, email_enabled: checked }))
                  }
                />
              </div>

              {preferences.email_enabled && (
                <>
                  <div className="border-t border-gray-200 pt-6" />

                  {/* Email Frequency */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">Email Frequency</Label>
                      <p className="text-sm text-gray-600">
                        Choose how often you want to receive email notifications
                      </p>
                    </div>
                    <Select
                      value={preferences.email_frequency}
                      onValueChange={(value: 'instant' | 'smart' | 'digest' | 'critical_only') =>
                        setPreferences(prev => ({ ...prev, email_frequency: value }))
                      }
                    >
                      <SelectTrigger className="w-[180px] rounded-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instant">Instant</SelectItem>
                        <SelectItem value="smart">Smart (Recommended)</SelectItem>
                        <SelectItem value="digest">Digest</SelectItem>
                        <SelectItem value="critical_only">Critical Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Frequency Description */}
                  <div className="bg-gray-50 rounded-md p-4 border border-gray-200">
                    {preferences.email_frequency === 'instant' && (
                      <p className="text-sm text-gray-600">
                        <strong>Instant:</strong> Get an email immediately for every notification. Best for time-sensitive activity.
                      </p>
                    )}
                    {preferences.email_frequency === 'smart' && (
                      <p className="text-sm text-gray-600">
                        <strong>Smart:</strong> We'll send emails intelligently - batching messages when you're active, sending immediately when you're away.
                      </p>
                    )}
                    {preferences.email_frequency === 'digest' && (
                      <p className="text-sm text-gray-600">
                        <strong>Digest:</strong> Receive a summary of notifications every few hours instead of individual emails.
                      </p>
                    )}
                    {preferences.email_frequency === 'critical_only' && (
                      <p className="text-sm text-gray-600">
                        <strong>Critical Only:</strong> Only receive emails for important events like accepted offers and completed purchases.
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Quiet Hours */}
        <motion.div variants={itemVariants}>
          <Card className="rounded-md mb-6">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-md">
                  <Moon className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <CardTitle>Quiet Hours</CardTitle>
                  <CardDescription>
                    Pause email notifications during specific hours
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Quiet Hours Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="quiet-hours" className="text-base">
                    Enable Quiet Hours
                  </Label>
                  <p className="text-sm text-gray-600">
                    Hold email notifications during your preferred quiet time
                  </p>
                </div>
                <Switch
                  id="quiet-hours"
                  checked={preferences.quiet_hours_enabled}
                  onCheckedChange={(checked) => 
                    setPreferences(prev => ({ ...prev, quiet_hours_enabled: checked }))
                  }
                />
              </div>

              {preferences.quiet_hours_enabled && (
                <>
                  <div className="border-t border-gray-200 pt-6" />

                  {/* Time Range */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <Label htmlFor="quiet-start" className="text-sm font-medium mb-2 block">
                        Start Time
                      </Label>
                      <div className="relative">
                        <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                          id="quiet-start"
                          type="time"
                          value={preferences.quiet_hours_start}
                          onChange={(e) =>
                            setPreferences(prev => ({ ...prev, quiet_hours_start: e.target.value }))
                          }
                          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div className="flex items-center pt-6">
                      <span className="text-gray-500">to</span>
                    </div>
                    <div className="flex-1">
                      <Label htmlFor="quiet-end" className="text-sm font-medium mb-2 block">
                        End Time
                      </Label>
                      <div className="relative">
                        <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                          id="quiet-end"
                          type="time"
                          value={preferences.quiet_hours_end}
                          onChange={(e) =>
                            setPreferences(prev => ({ ...prev, quiet_hours_end: e.target.value }))
                          }
                          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-purple-50 rounded-md p-4 border border-purple-200">
                    <p className="text-sm text-purple-700">
                      Emails will be held between {preferences.quiet_hours_start} and {preferences.quiet_hours_end}, 
                      then delivered when quiet hours end.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Notification Types */}
        <motion.div variants={itemVariants}>
          <Card className="rounded-md mb-6">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-md">
                  <Bell className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <CardTitle>Notification Types</CardTitle>
                  <CardDescription>
                    Choose which types of notifications you receive
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Message Notifications */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="message-notifications" className="text-base">
                    Messages & Inquiries
                  </Label>
                  <p className="text-sm text-gray-600">
                    Get notified when you receive new messages about products
                  </p>
                </div>
                <Switch
                  id="message-notifications"
                  checked={emailNotifications}
                  onCheckedChange={setEmailNotifications}
                />
              </div>

              <div className="border-t border-gray-200 pt-6" />

              {/* Order Alerts */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="order-alerts" className="text-base">
                    Orders & Offers
                  </Label>
                  <p className="text-sm text-gray-600">
                    Notifications about new offers, accepted offers, and order updates
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
                    Marketing & Updates
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
                <div className="p-2 bg-gray-100 rounded-md">
                  <Bell className="h-5 w-5 text-gray-600" />
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
              <div className="bg-white border border-gray-200 rounded-md p-4">
                <p className="text-sm text-gray-700">
                  In-app notifications are always enabled. You'll see a badge in the header when you have new messages or offers.
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
            disabled={saving || savingPreferences}
            className={cn(
              'rounded-md min-w-[120px]',
              saved && 'bg-green-600 hover:bg-green-700'
            )}
          >
            {saving || savingPreferences ? (
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
