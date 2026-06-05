"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  User,
  Bell,
  Palette,
  Building2,
  Mail,
  Phone,
  MapPin,
  Globe,
  Save,
  Check,
  Loader2,
  AlertCircle,
  Store,
  Upload,
  X,
  Image as ImageIcon,
  Clock,
  Zap,
  ChevronRight,
  CreditCard,
  Monitor,
  Moon,
  Sun,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useUserProfile } from "@/lib/hooks/use-user-profile";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import type { OpeningHours } from "@/components/providers/profile-provider";
import { useLightspeedConnection } from "@/lib/hooks/use-lightspeed-connection";
import {
  PageContainer,
  PageHeader,
  SettingsSection,
  SettingsRow,
  SettingsDivider,
  SettingsField,
  StatusBadge,
} from "@/components/dashboard";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const OpeningHoursEditor = dynamic(
  () => import("@/components/opening-hours-editor").then((mod) => mod.OpeningHoursEditor),
  {
    ssr: false,
    loading: () => <SettingsManagerLoading className="min-h-56 rounded-lg" />,
  }
);

const StripeConnectCard = dynamic(
  () => import("@/components/settings/stripe-connect-card").then((mod) => mod.StripeConnectCard),
  {
    ssr: false,
    loading: () => <SettingsManagerLoading className="min-h-40 rounded-lg" />,
  }
);

const DeleteAccountDialog = dynamic(
  () => import("@/components/settings/delete-account-dialog").then((mod) => mod.DeleteAccountDialog),
  {
    ssr: false,
    loading: () => (
      <Button type="button" variant="outline" size="sm" disabled>
        Delete account
      </Button>
    ),
  }
);

const StoreSetupButton = dynamic(
  () => import("@/components/settings/store-setup-button").then((mod) => mod.StoreSetupButton),
  {
    ssr: false,
    loading: () => (
      <Button type="button" variant="outline" size="sm" disabled>
        Store setup
      </Button>
    ),
  }
);

type SectionId =
  | "account"
  | "business"
  | "payments"
  | "logo"
  | "hours"
  | "integrations"
  | "notifications"
  | "appearance";

const NAV: { id: SectionId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "account", label: "Account", icon: User },
  { id: "business", label: "Business", icon: Building2 },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "logo", label: "Logo", icon: ImageIcon },
  { id: "hours", label: "Opening hours", icon: Clock },
  { id: "integrations", label: "Integrations", icon: Store },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "appearance", label: "Appearance", icon: Palette },
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [logoPreview, setLogoPreview] = React.useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = React.useState(false);
  const [section, setSection] = React.useState<SectionId>("account");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const logoPreviewObjectUrlRef = React.useRef<string | null>(null);

  const revokeLogoPreviewObjectUrl = React.useCallback(() => {
    if (logoPreviewObjectUrlRef.current) {
      URL.revokeObjectURL(logoPreviewObjectUrlRef.current);
      logoPreviewObjectUrlRef.current = null;
    }
  }, []);

  React.useEffect(() => () => revokeLogoPreviewObjectUrl(), [revokeLogoPreviewObjectUrl]);

  const { profile, loading: profileLoading, saving, isFirstTime, saveProfile } = useUserProfile();

  const {
    isConnected: lightspeedConnected,
    isLoading: lightspeedLoading,
    accountInfo: lightspeedAccount,
    lastSync: lightspeedLastSync,
    formatLastSync,
  } = useLightspeedConnection({
    autoFetch: section === "integrations",
    pollInterval: section === "integrations" ? 60000 : 0,
  });

  const isVerifiedStore =
    profile?.account_type === "bicycle_store" && profile.bicycle_store === true;

  const [formData, setFormData] = React.useState({
    name: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    businessName: "",
    storeType: "",
    address: "",
    website: "",
    logoUrl: "",
    emailNotifications: true,
    orderAlerts: true,
    marketingEmails: false,
    inventoryAlerts: true,
  });

  const [openingHours, setOpeningHours] = React.useState<OpeningHours>({
    monday: { open: "09:00", close: "17:00", closed: false },
    tuesday: { open: "09:00", close: "17:00", closed: false },
    wednesday: { open: "09:00", close: "17:00", closed: false },
    thursday: { open: "09:00", close: "17:00", closed: false },
    friday: { open: "09:00", close: "17:00", closed: false },
    saturday: { open: "10:00", close: "16:00", closed: false },
    sunday: { open: "10:00", close: "16:00", closed: true },
  });

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (profileLoading || (authLoading && !profile)) return;

    if (!profile) {
      router.replace('/marketplace');
      return;
    }

    if (!isVerifiedStore) {
      router.replace('/marketplace/settings');
    }
  }, [profile, profileLoading, authLoading, isVerifiedStore, router]);

  React.useEffect(() => {
    if (profile) {
      const displayName = profile.first_name || profile.last_name
        ? `${profile.first_name} ${profile.last_name}`.trim()
        : profile.name || "";

      setFormData({
        name: displayName,
        firstName: profile.first_name || "",
        lastName: profile.last_name || "",
        email: profile.email || "",
        phone: profile.phone || "",
        businessName: profile.business_name || "",
        storeType: profile.store_type || "",
        address: profile.address || "",
        website: profile.website || "",
        logoUrl: profile.logo_url || "",
        emailNotifications: profile.email_notifications ?? true,
        orderAlerts: profile.order_alerts ?? true,
        marketingEmails: profile.marketing_emails ?? false,
        inventoryAlerts: profile.inventory_alerts ?? true,
      });

      if (profile.logo_url) {
        revokeLogoPreviewObjectUrl();
        setLogoPreview(profile.logo_url);
      }

      if (profile.opening_hours) {
        setOpeningHours(profile.opening_hours);
      }
    }
  }, [profile, revokeLogoPreviewObjectUrl]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB');
      return;
    }

    setError(null);
    revokeLogoPreviewObjectUrl();
    const previewUrl = URL.createObjectURL(file);
    logoPreviewObjectUrlRef.current = previewUrl;
    setLogoPreview(previewUrl);
    setLogoFile(file);
  };

  const handleRemoveLogo = async () => {
    if (!user) return;

    setUploadingLogo(true);
    try {
      const supabase = createClient();

      if (formData.logoUrl) {
        const fileName = formData.logoUrl.split('/').pop();
        if (fileName) {
          await supabase.storage
            .from('logo')
            .remove([`${user.id}/${fileName}`]);
        }
      }

      await saveProfile({ logo_url: null });

      revokeLogoPreviewObjectUrl();
      setLogoFile(null);
      setLogoPreview(null);
      setFormData(prev => ({ ...prev, logoUrl: "" }));
    } catch (error) {
      console.error('Error removing logo:', error);
      setError('Failed to remove logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile) return null;

    const fd = new FormData();
    fd.append('file', logoFile);

    const response = await fetch('/api/settings/upload-logo', {
      method: 'POST',
      body: fd,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Failed to upload logo');
    }

    return data.url as string;
  };

  const handleSave = async () => {
    setError(null);
    setUploadingLogo(true);

    try {
      let logoUrl = formData.logoUrl;
      if (logoFile) {
        const uploadedUrl = await uploadLogo();
        if (uploadedUrl) {
          logoUrl = uploadedUrl;
        }
      }

      const result = await saveProfile({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        business_name: formData.businessName,
        store_type: formData.storeType,
        address: formData.address,
        website: formData.website,
        logo_url: logoUrl,
        opening_hours: openingHours,
        email_notifications: formData.emailNotifications,
        order_alerts: formData.orderAlerts,
        marketing_emails: formData.marketingEmails,
        inventory_alerts: formData.inventoryAlerts,
      });

      if (result.success) {
        setSaved(true);
        setLogoFile(null);
        revokeLogoPreviewObjectUrl();
        if (logoUrl) {
          setLogoPreview(logoUrl);
          setFormData((prev) => ({ ...prev, logoUrl }));
        }
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(result.error || "Failed to save settings");
      }
    } catch (error) {
      console.error('Error saving:', error);
      setError('Failed to save settings. Please try again.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const updateForm = (key: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  if (profileLoading || (authLoading && !profile) || !profile || !isVerifiedStore) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const SaveBar = () => (
    <>
      <Button
        onClick={handleSave}
        disabled={saving || uploadingLogo}
        size="sm"
        className="min-w-[130px]"
      >
        {saving || uploadingLogo ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Saving…
          </>
        ) : saved ? (
          <>
            <Check className="size-4" />
            Saved
          </>
        ) : (
          <>
            <Save className="size-4" />
            Save changes
          </>
        )}
      </Button>
    </>
  );

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Settings"
        description="Manage your account, store profile and preferences."
        actions={<StoreSetupButton />}
      />

      {isFirstTime && (
        <div className="mt-6 flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
          <AlertCircle className="mt-0.5 size-5 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Welcome! Complete your profile
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Fill in your account details below to get started — this is used for
              your business profile and communications.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <AlertCircle className="mt-0.5 size-5 text-destructive" />
          <div>
            <h3 className="text-sm font-semibold text-destructive">
              Error saving settings
            </h3>
            <p className="mt-1 text-sm text-destructive/90">{error}</p>
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
        {/* Secondary nav */}
        <nav className="lg:sticky lg:top-20 lg:self-start">
          <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {NAV.map((item) => {
              const isActive = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
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
                      isActive ? "text-foreground" : "text-muted-foreground"
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
          {section === "account" && (
            <>
              <SettingsSection
                title="Account"
                description="Update your personal information."
                icon={User}
                footer={<SaveBar />}
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <SettingsField label="Full name" htmlFor="name">
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="name" value={formData.name} onChange={(e) => updateForm("name", e.target.value)} className="pl-9" placeholder="Your name" />
                    </div>
                  </SettingsField>
                  <SettingsField label="Email address" htmlFor="email">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="email" type="email" value={formData.email} onChange={(e) => updateForm("email", e.target.value)} className="pl-9" placeholder="your@email.com" />
                    </div>
                  </SettingsField>
                  <SettingsField label="Phone number" htmlFor="phone" className="sm:col-span-2">
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="phone" value={formData.phone} onChange={(e) => updateForm("phone", e.target.value)} className="pl-9" placeholder="+61 400 000 000" />
                    </div>
                  </SettingsField>
                </div>
              </SettingsSection>

              <SettingsSection
                title="Danger zone"
                description="Irreversible account actions."
                icon={Trash2}
                className="ring-destructive/30"
              >
                <SettingsRow
                  label="Delete account"
                  description="Permanently remove your account, store profile and all marketplace listings."
                  control={<div className="sm:flex sm:justify-end"><DeleteAccountDialog /></div>}
                />
              </SettingsSection>
            </>
          )}

          {section === "business" && (
            <SettingsSection
              title="Business profile"
              description="Your business details for invoices and communications."
              icon={Building2}
              footer={<SaveBar />}
            >
              <div className="space-y-5">
                <SettingsField label="Business name" htmlFor="businessName">
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="businessName" value={formData.businessName} onChange={(e) => updateForm("businessName", e.target.value)} className="pl-9" placeholder="Your business name" />
                  </div>
                </SettingsField>
                <SettingsField label="Store type" htmlFor="storeType">
                  <Select value={formData.storeType} onValueChange={(value) => updateForm("storeType", value)}>
                    <SelectTrigger id="storeType" className="w-full">
                      <SelectValue placeholder="Select store type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bicycle Shop">Bicycle Shop</SelectItem>
                      <SelectItem value="Bike Repair & Service">Bike Repair &amp; Service</SelectItem>
                      <SelectItem value="Mountain Bike Specialist">Mountain Bike Specialist</SelectItem>
                      <SelectItem value="Road Bike Specialist">Road Bike Specialist</SelectItem>
                      <SelectItem value="Electric Bike Dealer">Electric Bike Dealer</SelectItem>
                      <SelectItem value="BMX Shop">BMX Shop</SelectItem>
                      <SelectItem value="Cycling Accessories">Cycling Accessories</SelectItem>
                      <SelectItem value="Bike Rental">Bike Rental</SelectItem>
                      <SelectItem value="Online Bike Store">Online Bike Store</SelectItem>
                      <SelectItem value="Sports & Recreation">Sports &amp; Recreation</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingsField>
                <SettingsField label="Business address" htmlFor="address">
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="address" value={formData.address} onChange={(e) => updateForm("address", e.target.value)} className="pl-9" placeholder="123 Street, City, State, Postcode" />
                  </div>
                </SettingsField>
                <SettingsField label="Website" htmlFor="website">
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="website" value={formData.website} onChange={(e) => updateForm("website", e.target.value)} className="pl-9" placeholder="www.yourbusiness.com.au" />
                  </div>
                </SettingsField>
              </div>
            </SettingsSection>
          )}

          {section === "payments" && (
            <SettingsSection
              title="Payments & payouts"
              description="Connect your bank account to receive payouts when you sell items."
              icon={CreditCard}
            >
              <StripeConnectCard />
            </SettingsSection>
          )}

          {section === "logo" && (
            <SettingsSection
              title="Business logo"
              description="Upload your business logo (max 5MB). Images are compressed to WebP for fast loading."
              icon={ImageIcon}
              footer={<SaveBar />}
            >
              <div className="flex flex-col items-start gap-4 sm:flex-row">
                <div className="relative size-24 shrink-0 overflow-hidden rounded-lg border border-dashed bg-muted/30">
                  {logoPreview ? (
                    <>
                      <Image src={logoPreview} alt="Business logo" fill className="object-cover" />
                      <button
                        onClick={handleRemoveLogo}
                        disabled={uploadingLogo}
                        className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-destructive text-white transition-colors hover:bg-destructive/90"
                        type="button"
                      >
                        <X className="size-4" />
                      </button>
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <ImageIcon className="size-8 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <SettingsField label="Upload logo" htmlFor="logo-upload" hint="Square image, at least 200×200px. JPG, PNG or WebP — we compress automatically on save.">
                    <div className="flex items-center gap-2">
                      <input ref={fileInputRef} id="logo-upload" type="file" accept="image/*" onChange={handleLogoChange} className="hidden" aria-label="Upload logo" />
                      <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingLogo}>
                        <Upload className="size-4" />
                        Choose image
                      </Button>
                      {logoFile && <span className="text-sm text-muted-foreground">{logoFile.name}</span>}
                    </div>
                  </SettingsField>
                </div>
              </div>
            </SettingsSection>
          )}

          {section === "hours" && (
            <SettingsSection
              title="Opening hours"
              description="Set your store's operating hours for each day."
              icon={Clock}
              footer={<SaveBar />}
            >
              <OpeningHoursEditor value={openingHours} onChange={setOpeningHours} />
            </SettingsSection>
          )}

          {section === "integrations" && (
            <SettingsSection
              title="Lightspeed integration"
              description={
                lightspeedConnected && lightspeedAccount
                  ? `Connected to ${lightspeedAccount.name}`
                  : "Connect your Lightspeed POS account"
              }
              icon={Zap}
              headerAction={
                <StatusBadge
                  label={lightspeedLoading ? "Loading…" : lightspeedConnected ? "Connected" : "Not connected"}
                  tone={lightspeedConnected ? "success" : "neutral"}
                />
              }
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {lightspeedConnected && lightspeedLastSync
                    ? `Last synced: ${formatLastSync(lightspeedLastSync)}`
                    : "Sync your products, orders, and inventory with Lightspeed POS."}
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/connect-lightspeed">
                    {lightspeedConnected ? "Manage connection" : "Connect Lightspeed"}
                    <ChevronRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </SettingsSection>
          )}

          {section === "notifications" && (
            <SettingsSection
              title="Notification preferences"
              description="Choose what notifications you receive."
              icon={Bell}
              footer={<SaveBar />}
            >
              <div className="space-y-5">
                <SettingsRow
                  label="Email notifications"
                  description="Receive important updates via email."
                  control={<div className="sm:flex sm:justify-end"><Switch checked={formData.emailNotifications} onCheckedChange={(c) => updateForm("emailNotifications", c)} /></div>}
                />
                <SettingsDivider />
                <SettingsRow
                  label="Order alerts"
                  description="Get notified when you receive new orders."
                  control={<div className="sm:flex sm:justify-end"><Switch checked={formData.orderAlerts} onCheckedChange={(c) => updateForm("orderAlerts", c)} /></div>}
                />
                <SettingsDivider />
                <SettingsRow
                  label="Inventory alerts"
                  description="Get notified when stock is running low."
                  control={<div className="sm:flex sm:justify-end"><Switch checked={formData.inventoryAlerts} onCheckedChange={(c) => updateForm("inventoryAlerts", c)} /></div>}
                />
                <SettingsDivider />
                <SettingsRow
                  label="Marketing emails"
                  description="Receive tips, product updates, and promotions."
                  control={<div className="sm:flex sm:justify-end"><Switch checked={formData.marketingEmails} onCheckedChange={(c) => updateForm("marketingEmails", c)} /></div>}
                />
              </div>
            </SettingsSection>
          )}

          {section === "appearance" && (
            <SettingsSection
              title="Appearance"
              description="Customise how the dashboard looks."
              icon={Palette}
            >
              <label className="mb-3 block text-sm font-medium text-foreground">Theme</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: "light", label: "Light", icon: Sun },
                  { id: "dark", label: "Dark", icon: Moon },
                  { id: "system", label: "System", icon: Monitor },
                ].map((opt) => {
                  const isActive = mounted && theme === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setTheme(opt.id)}
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors",
                        isActive ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
                      )}
                    >
                      <opt.icon className={cn("size-5", isActive ? "text-foreground" : "text-muted-foreground")} />
                      <span className="text-sm font-medium">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </SettingsSection>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
