"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  Bell,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Instagram,
  Monitor,
  Moon,
  Palette,
  Plug,
  Store,
  Sun,
  Trash2,
  Truck,
  User,
  Zap,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  PageContainer,
  PageHeader,
} from "../_components/page-primitives";
import {
  SettingsDivider,
  SettingsRow,
  SettingsSection,
} from "../_components/settings-primitives";
import { STORE } from "../_components/mock-data";

type SectionId =
  | "profile"
  | "store"
  | "business"
  | "hours"
  | "notifications"
  | "payments"
  | "integrations"
  | "appearance";

const NAV: { id: SectionId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "store", label: "Store details", icon: Store },
  { id: "business", label: "Business", icon: Building2 },
  { id: "hours", label: "Opening hours", icon: Clock },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "appearance", label: "Appearance", icon: Palette },
];

export default function SettingsPage() {
  const [active, setActive] = React.useState<SectionId>("profile");

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Settings"
        description="Manage your store profile, payments and preferences."
      />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
        {/* Secondary nav */}
        <nav className="lg:sticky lg:top-20 lg:self-start">
          <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {NAV.map((item) => {
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActive(item.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors lg:w-full",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <item.icon
                    className={cn(
                      "size-4 shrink-0",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Active panel */}
        <div className="min-w-0 space-y-6">
          {active === "profile" && <ProfileSection />}
          {active === "store" && <StoreSection />}
          {active === "business" && <BusinessSection />}
          {active === "hours" && <HoursSection />}
          {active === "notifications" && <NotificationsSection />}
          {active === "payments" && <PaymentsSection />}
          {active === "integrations" && <IntegrationsSection />}
          {active === "appearance" && <AppearanceSection />}
        </div>
      </div>
    </PageContainer>
  );
}

// ── Shared form bits ─────────────────────────────────────────────────────────

function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function SaveBar() {
  return (
    <>
      <Button variant="ghost" size="sm">
        Cancel
      </Button>
      <Button size="sm">Save changes</Button>
    </>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

function ProfileSection() {
  return (
    <>
      <SettingsSection
        title="Your profile"
        description="This information is used across your dashboard and receipts."
        icon={User}
        footer={<SaveBar />}
      >
        <div className="space-y-5">
          <SettingsRow
            label="Profile photo"
            description="PNG or JPG, recommended 400×400px."
            control={
              <div className="flex items-center gap-3 sm:justify-end">
                <Avatar className="size-12 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-muted font-semibold">
                    TL
                  </AvatarFallback>
                </Avatar>
                <Button variant="outline" size="sm">
                  Upload
                </Button>
              </div>
            }
          />
          <SettingsDivider />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Full name" htmlFor="name">
              <Input id="name" defaultValue={STORE.owner} />
            </Field>
            <Field label="Email address" htmlFor="email">
              <Input id="email" type="email" defaultValue={STORE.email} />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <Input id="phone" defaultValue="+61 412 884 201" />
            </Field>
            <Field label="Role" htmlFor="role">
              <Input id="role" defaultValue="Owner" disabled />
            </Field>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Danger zone"
        description="Irreversible actions for your account."
        icon={Trash2}
        className="ring-destructive/30"
      >
        <SettingsRow
          label="Delete account"
          description="Permanently remove your account, store profile and all listings."
          control={
            <div className="sm:flex sm:justify-end">
              <Button variant="destructive" size="sm">
                <Trash2 className="size-4" />
                Delete account
              </Button>
            </div>
          }
        />
      </SettingsSection>
    </>
  );
}

function StoreSection() {
  return (
    <SettingsSection
      title="Storefront"
      description="How your shop appears to customers on the marketplace."
      icon={Store}
      footer={<SaveBar />}
    >
      <div className="space-y-5">
        <Field label="Store name" htmlFor="storeName">
          <Input id="storeName" defaultValue={STORE.name} />
        </Field>
        <Field
          label="Store URL"
          htmlFor="slug"
          hint="This is the public address of your storefront."
        >
          <div className="flex items-center rounded-md border border-input bg-background shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
            <span className="select-none border-r border-input bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              yellowjersey.shop/
            </span>
            <input
              id="slug"
              defaultValue="yellow-jersey-cycles"
              className="h-9 flex-1 rounded-r-md bg-transparent px-3 text-sm outline-none"
            />
          </div>
        </Field>
        <Field label="Tagline" htmlFor="tagline">
          <Input
            id="tagline"
            defaultValue="Premium road, gravel & mountain bikes — fitted by riders."
          />
        </Field>
        <Field
          label="About"
          htmlFor="about"
          hint="Shown on your storefront's home tab."
        >
          <Textarea
            id="about"
            rows={4}
            defaultValue="Yellow Jersey Cycles has been Melbourne's home for performance cycling since 2009. Our team of fitters and mechanics live and breathe bikes — every machine we sell is built, tuned and ridden before it reaches you."
          />
        </Field>
        <SettingsDivider />
        <Field label="Shop address" htmlFor="address">
          <Input
            id="address"
            defaultValue="142 Sydney Road, Brunswick VIC 3056"
          />
        </Field>
      </div>
    </SettingsSection>
  );
}

function BusinessSection() {
  return (
    <SettingsSection
      title="Business details"
      description="Used on invoices, tax records and payouts."
      icon={Building2}
      footer={<SaveBar />}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Legal business name" htmlFor="legal" className="sm:col-span-2">
          <Input id="legal" defaultValue="Yellow Jersey Cycles Pty Ltd" />
        </Field>
        <Field label="ABN" htmlFor="abn">
          <Input id="abn" defaultValue="54 128 904 770" />
        </Field>
        <Field label="Store type" htmlFor="type">
          <Select defaultValue="bicycle">
            <SelectTrigger id="type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bicycle">Bicycle shop</SelectItem>
              <SelectItem value="service">Repair &amp; service</SelectItem>
              <SelectItem value="mtb">Mountain bike specialist</SelectItem>
              <SelectItem value="road">Road bike specialist</SelectItem>
              <SelectItem value="ebike">Electric bike dealer</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Website" htmlFor="website" className="sm:col-span-2">
          <Input id="website" defaultValue="www.yellowjersey.cc" />
        </Field>
      </div>
    </SettingsSection>
  );
}

const DAYS = [
  ["Monday", "09:00", "18:00", false],
  ["Tuesday", "09:00", "18:00", false],
  ["Wednesday", "09:00", "18:00", false],
  ["Thursday", "09:00", "20:00", false],
  ["Friday", "09:00", "18:00", false],
  ["Saturday", "10:00", "17:00", false],
  ["Sunday", "00:00", "00:00", true],
] as const;

function HoursSection() {
  return (
    <SettingsSection
      title="Opening hours"
      description="Displayed on your storefront and used for delivery windows."
      icon={Clock}
      footer={<SaveBar />}
    >
      <div className="space-y-1">
        {DAYS.map(([day, open, close, closed], i) => (
          <div
            key={day}
            className={cn(
              "flex items-center gap-3 py-2.5",
              i !== DAYS.length - 1 && "border-b border-border/50"
            )}
          >
            <span className="w-24 text-sm font-medium">{day}</span>
            {closed ? (
              <span className="flex-1 text-sm text-muted-foreground">Closed</span>
            ) : (
              <div className="flex flex-1 items-center gap-2">
                <Input
                  type="time"
                  defaultValue={open}
                  className="h-8 w-28"
                  aria-label={`${day} opening time`}
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="time"
                  defaultValue={close}
                  className="h-8 w-28"
                  aria-label={`${day} closing time`}
                />
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Open</span>
              <Switch defaultChecked={!closed} aria-label={`${day} open`} />
            </div>
          </div>
        ))}
      </div>
    </SettingsSection>
  );
}

const NOTIFS = [
  { label: "New orders", desc: "When a customer places an order.", on: true },
  { label: "Low stock", desc: "When an item drops to its reorder point.", on: true },
  { label: "New messages", desc: "When a customer messages your store.", on: true },
  { label: "Offers", desc: "When a buyer makes an offer on a listing.", on: true },
  { label: "Product reviews", desc: "When someone reviews a product.", on: false },
  { label: "Marketing & tips", desc: "Occasional product news from Yellow Jersey.", on: false },
];

function NotificationsSection() {
  return (
    <SettingsSection
      title="Email notifications"
      description="Choose what lands in your inbox. Sent to tom@lidgett.net."
      icon={Bell}
      footer={<SaveBar />}
    >
      <div className="space-y-5">
        {NOTIFS.map((n, i) => (
          <React.Fragment key={n.label}>
            {i > 0 && <SettingsDivider />}
            <SettingsRow
              label={n.label}
              description={n.desc}
              control={
                <div className="sm:flex sm:justify-end">
                  <Switch defaultChecked={n.on} aria-label={n.label} />
                </div>
              }
            />
          </React.Fragment>
        ))}
      </div>
    </SettingsSection>
  );
}

function PaymentsSection() {
  return (
    <SettingsSection
      title="Payouts"
      description="Connect a bank account to receive marketplace payouts."
      icon={CreditCard}
    >
      <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-background">
          <CreditCard className="size-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium">Stripe</p>
            <Badge
              variant="outline"
              className="gap-1.5 border-emerald-200 text-emerald-700 dark:border-emerald-900/50 dark:text-emerald-400"
            >
              <CheckCircle2 className="size-3" />
              Connected
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Payouts to •••• 4471 · next payout 9 Jun 2026
          </p>
        </div>
        <Button variant="outline" size="sm">
          Manage
        </Button>
      </div>
    </SettingsSection>
  );
}

const INTEGRATIONS = [
  {
    name: "Lightspeed Retail",
    desc: "Sync products, inventory and orders from your POS.",
    icon: Zap,
    connected: true,
    meta: "Last synced 6 minutes ago",
  },
  {
    name: "Uber Direct",
    desc: "Offer same-day local delivery at checkout.",
    icon: Truck,
    connected: false,
  },
  {
    name: "Instagram",
    desc: "Showcase your latest posts on your storefront.",
    icon: Instagram,
    connected: false,
  },
];

function IntegrationsSection() {
  return (
    <SettingsSection
      title="Connected apps"
      description="Extend your storefront with the tools you already use."
      icon={Plug}
    >
      <div className="space-y-3">
        {INTEGRATIONS.map((app) => (
          <div
            key={app.name}
            className="flex items-center gap-4 rounded-lg border p-4"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
              <app.icon className="size-5 text-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">{app.name}</p>
                {app.connected ? (
                  <Badge
                    variant="outline"
                    className="gap-1.5 border-emerald-200 text-emerald-700 dark:border-emerald-900/50 dark:text-emerald-400"
                  >
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Connected
                  </Badge>
                ) : null}
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {app.connected ? app.meta : app.desc}
              </p>
            </div>
            <Button variant={app.connected ? "outline" : "default"} size="sm">
              {app.connected ? "Manage" : "Connect"}
            </Button>
          </div>
        ))}
      </div>
    </SettingsSection>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const options = [
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
    { id: "system", label: "System", icon: Monitor },
  ];

  return (
    <SettingsSection
      title="Appearance"
      description="Customise how your dashboard looks."
      icon={Palette}
    >
      <Label className="mb-3 block">Theme</Label>
      <div className="grid grid-cols-3 gap-3">
        {options.map((opt) => {
          const isActive = mounted && theme === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setTheme(opt.id)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors",
                isActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/40"
              )}
            >
              <opt.icon
                className={cn(
                  "size-5",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              />
              <span className="text-sm font-medium">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </SettingsSection>
  );
}
