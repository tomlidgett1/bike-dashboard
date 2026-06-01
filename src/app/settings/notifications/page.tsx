// ============================================================
// NOTIFICATION SETTINGS PAGE
// ============================================================

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
import { Save, Check, Loader2, Bell, Mail, Clock, Moon, ShoppingBag, Store, Tag, MessageSquare } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.04, 0.62, 0.23, 0.98] as [number, number, number, number] } },
};

type EmailFrequency = 'instant' | 'smart' | 'digest' | 'critical_only';
type MessageFrequency = 'every_message' | 'new_conversations_only' | 'smart';

interface NotificationPreferences {
  email_enabled: boolean;
  email_frequency: EmailFrequency;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  // Purchases
  purchase_confirmations_enabled: boolean;
  // Offers — granular
  offer_received_enabled: boolean;
  offer_updates_enabled: boolean;
  // Messages — granular
  message_notifications_enabled: boolean;
  message_frequency: MessageFrequency;
  // Store-only
  sale_notifications_enabled: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  email_enabled: true,
  email_frequency: 'smart',
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
  purchase_confirmations_enabled: true,
  offer_received_enabled: true,
  offer_updates_enabled: true,
  message_notifications_enabled: true,
  message_frequency: 'smart',
  sale_notifications_enabled: true,
};

function SectionDivider() {
  return <div className="border-t border-gray-200 my-2" />;
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4', disabled && 'opacity-50')}>
      <div className="space-y-0.5 flex-1 min-w-0">
        <Label htmlFor={id} className="text-base cursor-pointer">{label}</Label>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

const MESSAGE_FREQUENCY_OPTIONS: { value: MessageFrequency; label: string; description: string }[] = [
  {
    value: 'every_message',
    label: 'Every message',
    description: 'An email for each message as soon as it arrives.',
  },
  {
    value: 'smart',
    label: 'Smart batching (Recommended)',
    description: 'Emails are batched when you\'re active and sent once you\'re away for 30 min.',
  },
  {
    value: 'new_conversations_only',
    label: 'New conversations only',
    description: 'Only the first message in each new conversation — no follow-up emails.',
  },
];

const EMAIL_FREQUENCY_DESCRIPTIONS: Record<EmailFrequency, React.ReactNode> = {
  instant: <><strong>Instant:</strong> An email for every notification, immediately.</>,
  smart: <><strong>Smart:</strong> Batches messages when you're active; sends immediately when you're away.</>,
  digest: <><strong>Digest:</strong> A summary every few hours rather than individual emails.</>,
  critical_only: <><strong>Critical Only:</strong> Only purchase receipts, sale alerts, and accepted offers.</>,
};

export default function NotificationSettingsPage() {
  const { profile, loading, saving, saveProfile } = useUserProfile();
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loadingPreferences, setLoadingPreferences] = React.useState(true);
  const [savingPreferences, setSavingPreferences] = React.useState(false);

  const [preferences, setPreferences] = React.useState<NotificationPreferences>(DEFAULT_PREFERENCES);

  const isStore = !!(profile?.bicycle_store || profile?.account_type === 'store');

  React.useEffect(() => {
    if (!profile) return;
    async function fetchPreferences() {
      try {
        const response = await fetch('/api/notifications/preferences');
        if (response.ok) {
          const data = await response.json();
          if (data.preferences) {
            const p = data.preferences;
            setPreferences({
              email_enabled: p.email_enabled ?? true,
              email_frequency: p.email_frequency ?? 'smart',
              quiet_hours_enabled: p.quiet_hours_enabled ?? false,
              quiet_hours_start: p.quiet_hours_start?.slice(0, 5) ?? '22:00',
              quiet_hours_end: p.quiet_hours_end?.slice(0, 5) ?? '08:00',
              purchase_confirmations_enabled: p.purchase_confirmations_enabled ?? true,
              offer_received_enabled: p.offer_received_enabled ?? p.offer_notifications_enabled ?? true,
              offer_updates_enabled: p.offer_updates_enabled ?? p.offer_notifications_enabled ?? true,
              message_notifications_enabled: p.message_notifications_enabled ?? true,
              message_frequency: p.message_frequency ?? 'smart',
              sale_notifications_enabled: p.sale_notifications_enabled ?? true,
            });
          }
        }
      } catch (err) {
        console.error('Error fetching notification preferences:', err);
      } finally {
        setLoadingPreferences(false);
      }
    }
    fetchPreferences();
  }, [profile]);

  const setPref = <K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    try {
      setError(null);
      setSaved(false);
      setSavingPreferences(true);

      // Persist legacy fields that edge functions still read as fallback
      await saveProfile({
        email_notifications: preferences.message_notifications_enabled,
        order_alerts: preferences.purchase_confirmations_enabled || preferences.sale_notifications_enabled,
        marketing_emails: false,
      });

      const prefsResponse = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...preferences,
          // Keep legacy field in sync
          offer_notifications_enabled: preferences.offer_received_enabled || preferences.offer_updates_enabled,
        }),
      });

      if (!prefsResponse.ok) throw new Error('Failed to save notification preferences');

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSavingPreferences(false);
    }
  };

  const emailDisabled = !preferences.email_enabled;
  const selectedMsgFreq = MESSAGE_FREQUENCY_OPTIONS.find(o => o.value === preferences.message_frequency)!;

  if (loading || loadingPreferences) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header title="Notification Settings" description="Manage your email notification preferences" />
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Notification Settings" description="Manage your email notification preferences" />

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="container mx-auto px-4 py-8 max-w-3xl"
      >

        {/* ── Email Delivery ── */}
        <motion.div variants={itemVariants}>
          <Card className="rounded-md mb-6">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-md"><Mail className="h-5 w-5 text-blue-600" /></div>
                <div>
                  <CardTitle>Email Delivery</CardTitle>
                  <CardDescription>Master control over all email notifications</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <ToggleRow
                id="email-enabled"
                label="Email Notifications"
                description="Receive emails about messages, offers, purchases, and sales"
                checked={preferences.email_enabled}
                onCheckedChange={v => setPref('email_enabled', v)}
              />

              {preferences.email_enabled && (
                <>
                  <SectionDivider />
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <Label className="text-base">Global Frequency</Label>
                      <p className="text-sm text-gray-600">Default send cadence (overridden by per-type settings below)</p>
                    </div>
                    <Select
                      value={preferences.email_frequency}
                      onValueChange={v => setPref('email_frequency', v as EmailFrequency)}
                    >
                      <SelectTrigger className="w-[200px] rounded-md">
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
                  <div className="bg-gray-50 rounded-md p-4 border border-gray-200 text-sm text-gray-600">
                    {EMAIL_FREQUENCY_DESCRIPTIONS[preferences.email_frequency]}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Quiet Hours ── */}
        <motion.div variants={itemVariants}>
          <Card className="rounded-md mb-6">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-md"><Moon className="h-5 w-5 text-purple-600" /></div>
                <div>
                  <CardTitle>Quiet Hours</CardTitle>
                  <CardDescription>Hold non-critical emails during specific hours</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <ToggleRow
                id="quiet-hours"
                label="Enable Quiet Hours"
                description="Emails are held and delivered when quiet hours end"
                checked={preferences.quiet_hours_enabled}
                onCheckedChange={v => setPref('quiet_hours_enabled', v)}
              />
              {preferences.quiet_hours_enabled && (
                <>
                  <SectionDivider />
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <Label htmlFor="quiet-start" className="text-sm font-medium mb-2 block">Start Time</Label>
                      <div className="relative">
                        <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                          id="quiet-start"
                          type="time"
                          value={preferences.quiet_hours_start}
                          onChange={e => setPref('quiet_hours_start', e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div className="flex items-center pt-6"><span className="text-gray-500">to</span></div>
                    <div className="flex-1">
                      <Label htmlFor="quiet-end" className="text-sm font-medium mb-2 block">End Time</Label>
                      <div className="relative">
                        <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                          id="quiet-end"
                          type="time"
                          value={preferences.quiet_hours_end}
                          onChange={e => setPref('quiet_hours_end', e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="bg-purple-50 rounded-md p-4 border border-purple-200">
                    <p className="text-sm text-purple-700">
                      Emails will be held between {preferences.quiet_hours_start} and {preferences.quiet_hours_end}, then delivered when quiet hours end.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Messages ── */}
        <motion.div variants={itemVariants}>
          <Card className="rounded-md mb-6">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-md"><MessageSquare className="h-5 w-5 text-blue-600" /></div>
                <div>
                  <CardTitle>Messages</CardTitle>
                  <CardDescription>Control when you get emailed about new messages</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <ToggleRow
                id="message-notifications"
                label="Message Notifications"
                description="Receive email alerts when someone sends you a message"
                checked={preferences.message_notifications_enabled}
                onCheckedChange={v => setPref('message_notifications_enabled', v)}
                disabled={emailDisabled}
              />

              {preferences.message_notifications_enabled && !emailDisabled && (
                <>
                  <SectionDivider />
                  <div className="space-y-3">
                    <Label className="text-base">Message Frequency</Label>
                    <p className="text-sm text-gray-600">Choose how often you receive message emails</p>
                    <div className="grid gap-2">
                      {MESSAGE_FREQUENCY_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setPref('message_frequency', opt.value)}
                          className={cn(
                            'w-full text-left px-4 py-3 rounded-md border transition-colors',
                            preferences.message_frequency === opt.value
                              ? 'border-blue-500 bg-blue-50 text-blue-900'
                              : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              'w-4 h-4 rounded-full border-2 flex-shrink-0',
                              preferences.message_frequency === opt.value
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-gray-300'
                            )}>
                              {preferences.message_frequency === opt.value && (
                                <div className="w-full h-full rounded-full bg-white scale-[0.4] block" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{opt.label}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Offers ── */}
        <motion.div variants={itemVariants}>
          <Card className="rounded-md mb-6">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-md"><Tag className="h-5 w-5 text-amber-600" /></div>
                <div>
                  <CardTitle>Offers</CardTitle>
                  <CardDescription>Emails about offers you make or receive on listings</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <ToggleRow
                id="offer-received"
                label="Offers on my listings"
                description="Email when a buyer makes an offer on something you've listed for sale"
                checked={preferences.offer_received_enabled}
                onCheckedChange={v => setPref('offer_received_enabled', v)}
                disabled={emailDisabled}
              />
              <SectionDivider />
              <ToggleRow
                id="offer-updates"
                label="Updates on my offers"
                description="Email when an offer you made is accepted, rejected, countered, or expires"
                checked={preferences.offer_updates_enabled}
                onCheckedChange={v => setPref('offer_updates_enabled', v)}
                disabled={emailDisabled}
              />
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Purchases (Buyer) ── */}
        <motion.div variants={itemVariants}>
          <Card className="rounded-md mb-6">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-md"><ShoppingBag className="h-5 w-5 text-green-600" /></div>
                <div>
                  <CardTitle>Purchases</CardTitle>
                  <CardDescription>Confirmation emails when you buy something</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <ToggleRow
                id="purchase-confirmations"
                label="Purchase Confirmations"
                description="Receipt email with full order details immediately after a successful purchase"
                checked={preferences.purchase_confirmations_enabled}
                onCheckedChange={v => setPref('purchase_confirmations_enabled', v)}
                disabled={emailDisabled}
              />
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Store Notifications (stores only) ── */}
        {isStore && (
          <motion.div variants={itemVariants}>
            <Card className="rounded-md mb-6 border-purple-200">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-md"><Store className="h-5 w-5 text-purple-600" /></div>
                  <div>
                    <CardTitle>Store Notifications</CardTitle>
                    <CardDescription>Emails about activity on your store's listings</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <ToggleRow
                  id="sale-notifications"
                  label="Sale Alerts"
                  description="Instant email when one of your listings is purchased, with buyer details and your payout amount"
                  checked={preferences.sale_notifications_enabled}
                  onCheckedChange={v => setPref('sale_notifications_enabled', v)}
                  disabled={emailDisabled}
                />
                <div className="bg-gray-50 rounded-md p-4 border border-gray-200 text-sm text-gray-600 space-y-1">
                  <p className="font-medium text-gray-700">Other store activity</p>
                  <p>New offers on listings and customer enquiries are controlled in the <strong>Offers</strong> and <strong>Messages</strong> sections above.</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── In-App ── */}
        <motion.div variants={itemVariants}>
          <Card className="rounded-md mb-6">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 rounded-md"><Bell className="h-5 w-5 text-gray-600" /></div>
                <div>
                  <CardTitle>In-App Notifications</CardTitle>
                  <CardDescription>Bell icon notifications inside the app</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-4">
                In-app notifications are always on. A badge appears in the header for new messages, offers, and order activity.
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 border border-red-200 rounded-md p-4 mb-6"
          >
            <p className="text-sm text-red-600">{error}</p>
          </motion.div>
        )}

        <motion.div variants={itemVariants} className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving || savingPreferences}
            className={cn('rounded-md min-w-[120px]', saved && 'bg-green-600 hover:bg-green-700')}
          >
            {saving || savingPreferences ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
            ) : saved ? (
              <><Check className="h-4 w-4 mr-2" />Saved!</>
            ) : (
              <><Save className="h-4 w-4 mr-2" />Save Changes</>
            )}
          </Button>
        </motion.div>

      </motion.div>
    </div>
  );
}
