// ============================================================
// NOTIFICATION SETTINGS PAGE
// ============================================================

'use client';

export const dynamic = 'force-dynamic';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUserProfile } from '@/lib/hooks/use-user-profile';
import { Save, Check, Loader2, Bell, Mail, Clock, Moon, ShoppingBag, Store, Tag, MessageSquare } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from '@/lib/utils';
import {
  PageContainer,
  PageHeader,
  PageBody,
  SettingsSection,
  SettingsRow,
  SettingsDivider,
} from '@/components/dashboard';

type EmailFrequency = 'instant' | 'smart' | 'digest' | 'critical_only';
type MessageFrequency = 'every_message' | 'new_conversations_only' | 'smart';

interface NotificationPreferences {
  email_enabled: boolean;
  email_frequency: EmailFrequency;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  purchase_confirmations_enabled: boolean;
  offer_received_enabled: boolean;
  offer_updates_enabled: boolean;
  message_notifications_enabled: boolean;
  message_frequency: MessageFrequency;
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
  smart: <><strong>Smart:</strong> Batches messages when you&apos;re active; sends immediately when you&apos;re away.</>,
  digest: <><strong>Digest:</strong> A summary every few hours rather than individual emails.</>,
  critical_only: <><strong>Critical Only:</strong> Only purchase receipts, sale alerts, and accepted offers.</>,
};

function NoteBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

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

  if (loading || loadingPreferences) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Notifications"
        description="Manage your email notification preferences."
        actions={
          <Button onClick={handleSave} disabled={saving || savingPreferences} size="sm" className="min-w-[130px]">
            {saving || savingPreferences ? (
              <><Loader2 className="size-4 animate-spin" />Saving…</>
            ) : saved ? (
              <><Check className="size-4" />Saved</>
            ) : (
              <><Save className="size-4" />Save changes</>
            )}
          </Button>
        }
      />

      <PageBody>
        {/* Email delivery */}
        <SettingsSection
          title="Email delivery"
          description="Master control over all email notifications."
          icon={Mail}
        >
          <SettingsRow
            label="Email notifications"
            description="Receive emails about messages, offers, purchases, and sales."
            control={
              <div className="sm:flex sm:justify-end">
                <Switch checked={preferences.email_enabled} onCheckedChange={v => setPref('email_enabled', v)} />
              </div>
            }
          />
          {preferences.email_enabled && (
            <>
              <SettingsDivider />
              <SettingsRow
                label="Global frequency"
                description="Default send cadence (overridden by per-type settings below)."
                control={
                  <Select value={preferences.email_frequency} onValueChange={v => setPref('email_frequency', v as EmailFrequency)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instant">Instant</SelectItem>
                      <SelectItem value="smart">Smart (Recommended)</SelectItem>
                      <SelectItem value="digest">Digest</SelectItem>
                      <SelectItem value="critical_only">Critical Only</SelectItem>
                    </SelectContent>
                  </Select>
                }
              />
              <div className="mt-4">
                <NoteBox>{EMAIL_FREQUENCY_DESCRIPTIONS[preferences.email_frequency]}</NoteBox>
              </div>
            </>
          )}
        </SettingsSection>

        {/* Quiet hours */}
        <SettingsSection
          title="Quiet hours"
          description="Hold non-critical emails during specific hours."
          icon={Moon}
        >
          <SettingsRow
            label="Enable quiet hours"
            description="Emails are held and delivered when quiet hours end."
            control={
              <div className="sm:flex sm:justify-end">
                <Switch checked={preferences.quiet_hours_enabled} onCheckedChange={v => setPref('quiet_hours_enabled', v)} />
              </div>
            }
          />
          {preferences.quiet_hours_enabled && (
            <>
              <SettingsDivider />
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-2">
                  <label htmlFor="quiet-start" className="text-sm font-medium">Start time</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="quiet-start" type="time" value={preferences.quiet_hours_start} onChange={e => setPref('quiet_hours_start', e.target.value)} className="pl-9" />
                  </div>
                </div>
                <span className="pb-2.5 text-muted-foreground">to</span>
                <div className="flex-1 space-y-2">
                  <label htmlFor="quiet-end" className="text-sm font-medium">End time</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="quiet-end" type="time" value={preferences.quiet_hours_end} onChange={e => setPref('quiet_hours_end', e.target.value)} className="pl-9" />
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <NoteBox>
                  Emails will be held between {preferences.quiet_hours_start} and {preferences.quiet_hours_end}, then delivered when quiet hours end.
                </NoteBox>
              </div>
            </>
          )}
        </SettingsSection>

        {/* Messages */}
        <SettingsSection
          title="Messages"
          description="Control when you get emailed about new messages."
          icon={MessageSquare}
        >
          <SettingsRow
            label="Message notifications"
            description="Receive email alerts when someone sends you a message."
            control={
              <div className="sm:flex sm:justify-end">
                <Switch checked={preferences.message_notifications_enabled} onCheckedChange={v => setPref('message_notifications_enabled', v)} disabled={emailDisabled} />
              </div>
            }
          />
          {preferences.message_notifications_enabled && !emailDisabled && (
            <>
              <SettingsDivider />
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Message frequency</p>
                  <p className="text-[13px] text-muted-foreground">Choose how often you receive message emails.</p>
                </div>
                <div className="grid gap-2">
                  {MESSAGE_FREQUENCY_OPTIONS.map(opt => {
                    const active = preferences.message_frequency === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPref('message_frequency', opt.value)}
                        className={cn(
                          'w-full rounded-lg border px-4 py-3 text-left transition-colors',
                          active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn('flex size-4 shrink-0 items-center justify-center rounded-full border-2', active ? 'border-primary' : 'border-muted-foreground/40')}>
                            {active && <div className="size-2 rounded-full bg-primary" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{opt.label}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{opt.description}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </SettingsSection>

        {/* Offers */}
        <SettingsSection
          title="Offers"
          description="Emails about offers you make or receive on listings."
          icon={Tag}
        >
          <SettingsRow
            label="Offers on my listings"
            description="Email when a buyer makes an offer on something you've listed for sale."
            control={
              <div className="sm:flex sm:justify-end">
                <Switch checked={preferences.offer_received_enabled} onCheckedChange={v => setPref('offer_received_enabled', v)} disabled={emailDisabled} />
              </div>
            }
          />
          <SettingsDivider />
          <SettingsRow
            label="Updates on my offers"
            description="Email when an offer you made is accepted, rejected, countered, or expires."
            control={
              <div className="sm:flex sm:justify-end">
                <Switch checked={preferences.offer_updates_enabled} onCheckedChange={v => setPref('offer_updates_enabled', v)} disabled={emailDisabled} />
              </div>
            }
          />
        </SettingsSection>

        {/* Purchases */}
        <SettingsSection
          title="Purchases"
          description="Confirmation emails when you buy something."
          icon={ShoppingBag}
        >
          <SettingsRow
            label="Purchase confirmations"
            description="Receipt email with full order details immediately after a successful purchase."
            control={
              <div className="sm:flex sm:justify-end">
                <Switch checked={preferences.purchase_confirmations_enabled} onCheckedChange={v => setPref('purchase_confirmations_enabled', v)} disabled={emailDisabled} />
              </div>
            }
          />
        </SettingsSection>

        {/* Store notifications */}
        {isStore && (
          <SettingsSection
            title="Store notifications"
            description="Emails about activity on your store's listings."
            icon={Store}
          >
            <SettingsRow
              label="Sale alerts"
              description="Instant email when one of your listings is purchased, with buyer details and your payout amount."
              control={
                <div className="sm:flex sm:justify-end">
                  <Switch checked={preferences.sale_notifications_enabled} onCheckedChange={v => setPref('sale_notifications_enabled', v)} disabled={emailDisabled} />
                </div>
              }
            />
            <div className="mt-4">
              <NoteBox>
                <p className="font-medium text-foreground">Other store activity</p>
                <p className="mt-1">New offers on listings and customer enquiries are controlled in the <strong>Offers</strong> and <strong>Messages</strong> sections above.</p>
              </NoteBox>
            </div>
          </SettingsSection>
        )}

        {/* In-app */}
        <SettingsSection
          title="In-app notifications"
          description="Bell icon notifications inside the app."
          icon={Bell}
        >
          <NoteBox>
            In-app notifications are always on. A badge appears in the header for new messages, offers, and order activity.
          </NoteBox>
        </SettingsSection>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        )}
      </PageBody>
    </PageContainer>
  );
}
