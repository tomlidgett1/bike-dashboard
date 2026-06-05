"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Building2,
  Check,
  ImageIcon,
  Loader2,
  MapPin,
  Palette,
  Phone,
  Sparkles,
  Store,
  Upload,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { OpeningHoursEditor } from "@/components/opening-hours-editor";
import { cn } from "@/lib/utils";
import { useUserProfile } from "@/lib/hooks/use-user-profile";
import { useLightspeedConnection } from "@/lib/hooks/use-lightspeed-connection";
import type { OpeningHours } from "@/components/providers/profile-provider";
import {
  DEFAULT_HEADER_IMAGES,
  STOREFRONT_THEME_PRESETS,
} from "@/lib/store/setup-constants";
import {
  fetchRawHomepageConfig,
  patchHomepageHeroImage,
  patchHomepageTheme,
  uploadHomepageHeroImage,
} from "@/lib/store/setup-homepage";
import {
  DEFAULT_OPENING_HOURS,
  DEFAULT_THEME_ACCENT,
  getFirstIncompleteStepIndex,
  STORE_SETUP_STEPS,
  STORE_TYPES,
  type StoreSetupStepId,
} from "@/lib/store/setup-steps";

type StoreSetupFlowProps = {
  className?: string;
  onClose: () => void;
  onComplete?: () => void;
};

type FormState = {
  businessName: string;
  storeType: string;
  address: string;
  phone: string;
  logoUrl: string;
  openingHours: OpeningHours;
  headerImageUrl: string;
  themeAccent: string;
  bio: string;
  serviceName: string;
  uberEnabled: boolean;
};

const STEP_META: Record<StoreSetupStepId, { title: string; description: string }> = {
  welcome: {
    title: "Welcome to Yellow Jersey",
    description:
      "Let’s set up your storefront — one step at a time — so customers can find and trust your shop.",
  },
  "store-name": {
    title: "What is your store called?",
    description: "This is the name customers see on your Yellow Jersey storefront.",
  },
  "store-type": {
    title: "What kind of bike shop are you?",
    description: "Helps shoppers understand what you specialise in.",
  },
  address: {
    title: "Where are you located?",
    description: "Shown on your storefront so customers can visit or get directions.",
  },
  phone: {
    title: "What is your shop phone number?",
    description: "Customers can call you directly from your storefront.",
  },
  logo: {
    title: "Upload your store logo",
    description: "Square image works best. You can change this anytime in Settings.",
  },
  "opening-hours": {
    title: "When are you open?",
    description: "Set hours for each day — copy one day to all if your schedule is consistent.",
  },
  "header-image": {
    title: "Choose a header image",
    description: "The banner at the top of your storefront. Upload your own or pick a default.",
  },
  theme: {
    title: "Pick your storefront colour",
    description: "Your accent colour appears on buttons and highlights across your shop page.",
  },
  bio: {
    title: "Tell customers about your shop",
    description: "A short intro for your storefront — what makes your shop worth visiting?",
  },
  service: {
    title: "What is your main service?",
    description: "Most bike shops offer at least one workshop service. You can add more later.",
  },
  lightspeed: {
    title: "Connect your inventory",
    description:
      "Link Lightspeed to sync products automatically. You can skip and connect later.",
  },
  uber: {
    title: "Offer Uber delivery",
    description:
      "Let customers order for same-day delivery via Uber. You can fine-tune products later.",
  },
  complete: {
    title: "You are ready to go",
    description: "Your essentials are saved. View your storefront or keep customising.",
  },
};

function StoreTypeOption({
  value,
  label,
  description,
  checked,
}: {
  value: string;
  label: string;
  description: string;
  checked: boolean;
}) {
  return (
    <div
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-md border-2 p-4 transition-colors",
        checked ? "border-gray-900 bg-gray-50" : "border-gray-200 bg-white hover:bg-gray-50"
      )}
    >
      <RadioGroupItem value={value} id={`store-type-${value}`} className="mt-0.5" />
      <Label htmlFor={`store-type-${value}`} className="flex-1 cursor-pointer">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="mt-0.5 text-sm text-gray-500">{description}</p>
      </Label>
    </div>
  );
}

export function StoreSetupFlow({ className, onClose, onComplete }: StoreSetupFlowProps) {
  const router = useRouter();
  const { profile, saveProfile } = useUserProfile();
  const { isConnected: lightspeedConnected } = useLightspeedConnection({
    autoFetch: true,
    pollInterval: 30000,
  });

  const [stepIndex, setStepIndex] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [logoPreview, setLogoPreview] = React.useState<string | null>(null);
  const [headerImageFile, setHeaderImageFile] = React.useState<File | null>(null);
  const [headerPreview, setHeaderPreview] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const headerInputRef = React.useRef<HTMLInputElement>(null);
  const logoPreviewObjectUrlRef = React.useRef<string | null>(null);
  const headerPreviewObjectUrlRef = React.useRef<string | null>(null);
  const hasSetInitialStep = React.useRef(false);

  const [form, setForm] = React.useState<FormState>({
    businessName: "",
    storeType: "",
    address: "",
    phone: "",
    logoUrl: "",
    openingHours: DEFAULT_OPENING_HOURS,
    headerImageUrl: "",
    themeAccent: DEFAULT_THEME_ACCENT,
    bio: "",
    serviceName: "Full bicycle service",
    uberEnabled: false,
  });

  React.useEffect(() => {
    if (!profile) return;
    const hours = (profile.opening_hours as OpeningHours | undefined) ?? DEFAULT_OPENING_HOURS;
    setForm((prev) => ({
      ...prev,
      businessName: profile.business_name || "",
      storeType: profile.store_type || "",
      address: profile.address || "",
      phone: profile.phone || "",
      logoUrl: profile.logo_url || "",
      openingHours: hours,
      bio: profile.bio || "",
    }));
    if (profile.logo_url) {
      setLogoPreview(profile.logo_url);
    }
    if (!hasSetInitialStep.current) {
      setStepIndex(getFirstIncompleteStepIndex(profile));
      hasSetInitialStep.current = true;
    }
  }, [profile]);

  React.useEffect(() => {
    let cancelled = false;
    fetchRawHomepageConfig()
      .then((config) => {
        if (cancelled) return;
        const heroUrl =
          config.hero?.image_urls?.[0] || config.hero?.image_url || "";
        const accent = config.theme?.accent || DEFAULT_THEME_ACCENT;
        setForm((prev) => ({
          ...prev,
          headerImageUrl: heroUrl,
          themeAccent: accent,
        }));
        if (heroUrl) setHeaderPreview(heroUrl);
      })
      .catch(() => {
        /* homepage config optional during onboarding */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(
    () => () => {
      if (logoPreviewObjectUrlRef.current) {
        URL.revokeObjectURL(logoPreviewObjectUrlRef.current);
      }
      if (headerPreviewObjectUrlRef.current) {
        URL.revokeObjectURL(headerPreviewObjectUrlRef.current);
      }
    },
    []
  );

  const stepId = STORE_SETUP_STEPS[stepIndex];
  const totalSteps = STORE_SETUP_STEPS.length;
  const progress = ((stepIndex + 1) / totalSteps) * 100;
  const meta = STEP_META[stepId];

  const updateForm = (patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setError(null);
  };

  const goNext = () => setStepIndex((i) => Math.min(i + 1, totalSteps - 1));
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  const uploadLogo = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    const response = await fetch("/api/settings/upload-logo", {
      method: "POST",
      body: fd,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Failed to upload logo");
    return data.url as string;
  };

  const saveService = async (name: string) => {
    const res = await fetch("/api/store/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 409) {
      throw new Error(data.error || "Failed to save service");
    }
  };

  const saveUberSettings = async () => {
    const phones = form.phone.trim() ? [form.phone.trim()] : [];
    const res = await fetch("/api/store/uber", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enableUberDelivery: true,
        notificationPhones: phones,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to enable Uber delivery");
  };

  const markSetupComplete = async () => {
    const prefs = {
      ...(profile?.preferences ?? {}),
      store_setup_completed: true,
    };
    await saveProfile({
      preferences: prefs,
    });
  };

  const handleContinue = async () => {
    setError(null);

    if (stepId === "welcome") {
      goNext();
      return;
    }

    if (stepId === "complete") {
      onComplete?.();
      onClose();
      return;
    }

    setLoading(true);
    try {
      if (stepId === "store-name") {
        if (!form.businessName.trim()) {
          setError("Please enter your store name.");
          return;
        }
        const result = await saveProfile({
          business_name: form.businessName.trim(),
          name: form.businessName.trim(),
        });
        if (!result.success) throw new Error(result.error);
      }

      if (stepId === "store-type") {
        if (!form.storeType) {
          setError("Please choose a store type.");
          return;
        }
        const result = await saveProfile({ store_type: form.storeType });
        if (!result.success) throw new Error(result.error);
      }

      if (stepId === "address") {
        if (!form.address.trim()) {
          setError("Please enter your store address.");
          return;
        }
        const result = await saveProfile({ address: form.address.trim() });
        if (!result.success) throw new Error(result.error);
      }

      if (stepId === "phone") {
        if (!form.phone.trim()) {
          setError("Please enter a phone number.");
          return;
        }
        const result = await saveProfile({ phone: form.phone.trim() });
        if (!result.success) throw new Error(result.error);
      }

      if (stepId === "logo") {
        if (logoFile) {
          const logoUrl = await uploadLogo(logoFile);
          const result = await saveProfile({ logo_url: logoUrl });
          if (!result.success) throw new Error(result.error);
          updateForm({ logoUrl });
          setLogoFile(null);
        }
      }

      if (stepId === "opening-hours") {
        const result = await saveProfile({ opening_hours: form.openingHours });
        if (!result.success) throw new Error(result.error);
      }

      if (stepId === "header-image") {
        if (headerImageFile) {
          const url = await uploadHomepageHeroImage(headerImageFile);
          await patchHomepageHeroImage(url);
          updateForm({ headerImageUrl: url });
          setHeaderImageFile(null);
        } else if (form.headerImageUrl) {
          await patchHomepageHeroImage(form.headerImageUrl);
        }
      }

      if (stepId === "theme") {
        await patchHomepageTheme(form.themeAccent);
      }

      if (stepId === "bio") {
        if (form.bio.trim()) {
          const result = await saveProfile({ bio: form.bio.trim() });
          if (!result.success) throw new Error(result.error);
        }
      }

      if (stepId === "service") {
        if (!form.serviceName.trim()) {
          setError("Please enter a service name.");
          return;
        }
        await saveService(form.serviceName);
      }

      if (stepId === "uber") {
        if (form.uberEnabled) {
          await saveUberSettings();
        }
        await markSetupComplete();
      }

      goNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5 MB.");
      return;
    }
    if (logoPreviewObjectUrlRef.current) {
      URL.revokeObjectURL(logoPreviewObjectUrlRef.current);
    }
    const previewUrl = URL.createObjectURL(file);
    logoPreviewObjectUrlRef.current = previewUrl;
    setLogoPreview(previewUrl);
    setLogoFile(file);
    setError(null);
  };

  const handleHeaderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Image must be under 8 MB.");
      return;
    }
    if (headerPreviewObjectUrlRef.current) {
      URL.revokeObjectURL(headerPreviewObjectUrlRef.current);
    }
    const previewUrl = URL.createObjectURL(file);
    headerPreviewObjectUrlRef.current = previewUrl;
    setHeaderPreview(previewUrl);
    setHeaderImageFile(file);
    updateForm({ headerImageUrl: "" });
    setError(null);
  };

  const selectDefaultHeader = (url: string) => {
    if (headerPreviewObjectUrlRef.current) {
      URL.revokeObjectURL(headerPreviewObjectUrlRef.current);
      headerPreviewObjectUrlRef.current = null;
    }
    setHeaderImageFile(null);
    setHeaderPreview(url);
    updateForm({ headerImageUrl: url });
  };

  const canContinue = (): boolean => {
    switch (stepId) {
      case "welcome":
      case "complete":
      case "lightspeed":
      case "logo":
      case "header-image":
      case "bio":
      case "uber":
        return true;
      case "store-name":
        return form.businessName.trim().length > 0;
      case "store-type":
        return !!form.storeType;
      case "address":
        return form.address.trim().length > 0;
      case "phone":
        return form.phone.trim().length > 0;
      case "opening-hours":
        return true;
      case "theme":
        return !!form.themeAccent;
      case "service":
        return form.serviceName.trim().length > 0;
      default:
        return false;
    }
  };

  const continueLabel = () => {
    if (stepId === "welcome") return "Get started";
    if (stepId === "complete") return "Done";
    if (stepId === "logo") return logoFile ? "Save and continue" : "Skip for now";
    if (stepId === "header-image") {
      return headerImageFile || form.headerImageUrl ? "Save and continue" : "Skip for now";
    }
    if (stepId === "bio") return form.bio.trim() ? "Continue" : "Skip for now";
    if (stepId === "lightspeed") return lightspeedConnected ? "Continue" : "Skip for now";
    if (stepId === "uber") return form.uberEnabled ? "Enable and continue" : "Skip for now";
    return "Continue";
  };

  const selectedHeaderUrl = headerPreview || form.headerImageUrl;

  return (
    <div
      className={cn(
        "relative flex h-[680px] w-[560px] max-w-full flex-col overflow-hidden rounded-3xl bg-white shadow-2xl",
        className
      )}
    >
      <button
        type="button"
        onClick={onClose}
        disabled={loading}
        className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:bg-gray-50 hover:text-gray-900"
        aria-label="Close setup"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="flex h-full flex-col px-9 pb-8 pt-10">
        {stepId !== "complete" && (
          <div className="mb-5 h-[42px] shrink-0 pr-12">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-gray-500">
              <span>
                Step {stepIndex + 1} of {totalSteps}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
              <motion.div
                className="h-full bg-[#FFC72C]"
                initial={false}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
              />
            </div>
          </div>
        )}

        {stepId === "complete" && <div className="mb-5 h-[42px] shrink-0 pr-12" />}

        <AnimatePresence mode="wait">
          <motion.div
            key={stepId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="h-[108px] shrink-0 pr-10">
              <h2 className="text-2xl font-bold leading-tight text-gray-900 sm:text-[28px]">
                {meta.title}
              </h2>
              <p className="mt-2 line-clamp-2 text-[15px] leading-relaxed text-gray-500">
                {meta.description}
              </p>
            </div>

            <div className="mt-5 flex h-[300px] shrink-0 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {stepId === "welcome" && (
                  <div className="flex flex-col items-center gap-5">
                    <Image
                      src="/yjlogo.svg"
                      alt="Yellow Jersey"
                      width={160}
                      height={48}
                      className="h-12 w-auto"
                      priority
                    />
                    <div className="w-full space-y-3 rounded-md border border-gray-200 bg-white p-4">
                      {[
                        "Store name, location and contact",
                        "Custom opening hours and header image",
                        "Storefront theme, services and integrations",
                      ].map((item) => (
                        <div key={item} className="flex items-center gap-2.5 text-sm text-gray-600">
                          <Check className="h-4 w-4 shrink-0 text-gray-900" />
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {stepId === "store-name" && (
                  <div className="space-y-2">
                    <Label htmlFor="store-name" className="text-sm font-medium text-gray-700">
                      Store name
                    </Label>
                    <div className="relative">
                      <Store className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                      <Input
                        id="store-name"
                        value={form.businessName}
                        onChange={(e) => updateForm({ businessName: e.target.value })}
                        placeholder="e.g. Melbourne Cycle Works"
                        className="h-12 rounded-xl pl-10 text-base"
                        disabled={loading}
                        autoFocus
                      />
                    </div>
                  </div>
                )}

                {stepId === "store-type" && (
                  <RadioGroup
                    value={form.storeType}
                    onValueChange={(value) => updateForm({ storeType: value })}
                    className="space-y-2"
                  >
                    {STORE_TYPES.map((type) => (
                      <StoreTypeOption
                        key={type.value}
                        value={type.value}
                        label={type.label}
                        description={type.description}
                        checked={form.storeType === type.value}
                      />
                    ))}
                  </RadioGroup>
                )}

                {stepId === "address" && (
                  <div className="space-y-2">
                    <Label htmlFor="address" className="text-sm font-medium text-gray-700">
                      Store address
                    </Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                      <Input
                        id="address"
                        value={form.address}
                        onChange={(e) => updateForm({ address: e.target.value })}
                        placeholder="123 Collins St, Melbourne VIC 3000"
                        className="h-12 rounded-xl pl-10 text-base"
                        disabled={loading}
                        autoFocus
                      />
                    </div>
                  </div>
                )}

                {stepId === "phone" && (
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium text-gray-700">
                      Phone number
                    </Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                      <Input
                        id="phone"
                        type="tel"
                        value={form.phone}
                        onChange={(e) => updateForm({ phone: e.target.value })}
                        placeholder="+61 3 9000 0000"
                        className="h-12 rounded-xl pl-10 text-base"
                        disabled={loading}
                        autoFocus
                      />
                    </div>
                  </div>
                )}

                {stepId === "logo" && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative h-28 w-28 overflow-hidden rounded-md border-2 border-dashed border-gray-200 bg-gray-50">
                      {logoPreview ? (
                        <Image src={logoPreview} alt="Logo preview" fill className="object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Building2 className="h-10 w-10 text-gray-300" />
                        </div>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoChange}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={loading}
                      className="h-11 rounded-full border-gray-300 px-6"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Choose image
                    </Button>
                    <p className="text-center text-xs text-gray-400">
                      Optional — you can add this later in Settings.
                    </p>
                  </div>
                )}

                {stepId === "opening-hours" && (
                  <OpeningHoursEditor
                    value={form.openingHours}
                    onChange={(openingHours) => updateForm({ openingHours })}
                  />
                )}

                {stepId === "header-image" && (
                  <div className="space-y-4">
                    {selectedHeaderUrl && (
                      <div className="relative h-24 w-full overflow-hidden rounded-md border border-gray-200">
                        <Image
                          src={selectedHeaderUrl}
                          alt="Header preview"
                          fill
                          className="object-cover"
                          unoptimized={selectedHeaderUrl.startsWith("blob:")}
                        />
                      </div>
                    )}
                    <div className="grid grid-cols-5 gap-2">
                      {DEFAULT_HEADER_IMAGES.map((img) => (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() => selectDefaultHeader(img.url)}
                          className={cn(
                            "relative aspect-[4/3] overflow-hidden rounded-md border-2 transition",
                            form.headerImageUrl === img.url && !headerImageFile
                              ? "border-gray-900"
                              : "border-gray-200 hover:border-gray-400"
                          )}
                          title={img.label}
                        >
                          <Image src={img.url} alt={img.label} fill className="object-cover" />
                        </button>
                      ))}
                    </div>
                    <input
                      ref={headerInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleHeaderChange}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => headerInputRef.current?.click()}
                      disabled={loading}
                      className="h-10 w-full rounded-full border-gray-300"
                    >
                      <ImageIcon className="mr-2 h-4 w-4" />
                      Upload your own
                    </Button>
                    <p className="text-center text-xs text-gray-400">
                      Optional — you can change this on your landing page settings.
                    </p>
                  </div>
                )}

                {stepId === "theme" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      {STOREFRONT_THEME_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => updateForm({ themeAccent: preset.accent })}
                          className={cn(
                            "flex items-center gap-3 rounded-md border-2 p-3 text-left transition",
                            form.themeAccent === preset.accent
                              ? "border-gray-900 bg-gray-50"
                              : "border-gray-200 hover:border-gray-400"
                          )}
                        >
                          <span
                            className="h-8 w-8 shrink-0 rounded-md border border-gray-200"
                            style={{ backgroundColor: preset.accent }}
                          />
                          <span className="text-sm font-medium text-gray-900">{preset.label}</span>
                        </button>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="custom-accent" className="text-sm font-medium text-gray-700">
                        Custom colour
                      </Label>
                      <div className="flex items-center gap-3">
                        <Palette className="h-5 w-5 shrink-0 text-gray-400" />
                        <input
                          id="custom-accent"
                          type="color"
                          value={form.themeAccent}
                          onChange={(e) => updateForm({ themeAccent: e.target.value })}
                          className="h-10 w-14 cursor-pointer rounded-md border border-gray-200 bg-white p-1"
                          disabled={loading}
                        />
                        <Input
                          value={form.themeAccent}
                          onChange={(e) => updateForm({ themeAccent: e.target.value })}
                          className="h-10 rounded-md font-mono text-sm uppercase"
                          disabled={loading}
                          maxLength={7}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {stepId === "bio" && (
                  <div className="space-y-2">
                    <Label htmlFor="bio" className="text-sm font-medium text-gray-700">
                      About your shop
                    </Label>
                    <Textarea
                      id="bio"
                      value={form.bio}
                      onChange={(e) => updateForm({ bio: e.target.value })}
                      placeholder="Family-owned shop since 1998. Expert fittings, friendly advice, and a workshop out the back."
                      className="h-[160px] resize-none rounded-xl text-base"
                      maxLength={500}
                      disabled={loading}
                      autoFocus
                    />
                    <p className="text-xs text-gray-400">
                      Optional — you can add this later in Settings.
                    </p>
                    <p className="text-right text-xs text-gray-400">{form.bio.length}/500</p>
                  </div>
                )}

                {stepId === "service" && (
                  <div className="space-y-2">
                    <Label htmlFor="service" className="text-sm font-medium text-gray-700">
                      Main service
                    </Label>
                    <div className="relative">
                      <Wrench className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                      <Input
                        id="service"
                        value={form.serviceName}
                        onChange={(e) => updateForm({ serviceName: e.target.value })}
                        placeholder="e.g. Full bicycle service"
                        className="h-12 rounded-xl pl-10 text-base"
                        disabled={loading}
                        autoFocus
                      />
                    </div>
                  </div>
                )}

                {stepId === "lightspeed" && (
                  <div className="space-y-4">
                    {lightspeedConnected ? (
                      <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-white p-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100">
                          <Zap className="h-5 w-5 text-gray-700" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">Lightspeed connected</p>
                          <p className="text-sm text-gray-500">
                            Your inventory can sync to the marketplace.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-white p-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100">
                            <Zap className="h-5 w-5 text-gray-700" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">Lightspeed POS</p>
                            <p className="text-sm text-gray-500">
                              Sync products, stock and categories from your till.
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 w-full rounded-full border-gray-300"
                          asChild
                        >
                          <Link href="/connect-lightspeed" onClick={() => onClose()}>
                            Connect Lightspeed
                          </Link>
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {stepId === "uber" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4 rounded-md border border-gray-200 bg-white p-4">
                      <div className="flex items-center gap-3">
                        <Image src="/uber.svg" alt="Uber" width={32} height={32} className="h-8 w-8" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">Uber delivery</p>
                          <p className="text-sm text-gray-500">
                            Same-day delivery for your listed products.
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={form.uberEnabled}
                        onCheckedChange={(uberEnabled) => updateForm({ uberEnabled })}
                        disabled={loading}
                      />
                    </div>
                    {form.uberEnabled && (
                      <p className="rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-600">
                        Your shop phone{form.phone ? ` (${form.phone})` : ""} will receive Uber order
                        notifications. You can manage individual products in Uber settings later.
                      </p>
                    )}
                  </div>
                )}

                {stepId === "complete" && (
                  <div className="space-y-4">
                    <div className="flex justify-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FFC72C]/20">
                        <Sparkles className="h-7 w-7 text-gray-900" />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        type="button"
                        className="h-11 rounded-full bg-[#FFC72C] font-semibold text-gray-900 hover:bg-[#E6B328]"
                        onClick={() => {
                          if (profile?.user_id) {
                            router.push(`/marketplace/store/${profile.user_id}`);
                          }
                          onClose();
                        }}
                      >
                        View storefront
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 rounded-full border-gray-300"
                        onClick={() => {
                          router.push("/settings/store/landing");
                          onClose();
                        }}
                      >
                        Customise landing page
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-3 shrink-0 rounded-xl border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
            </div>

            <div className="mt-5 h-[108px] shrink-0">
              {stepId !== "complete" && (
                <Button
                  type="button"
                  onClick={handleContinue}
                  disabled={loading || !canContinue()}
                  className="h-12 w-full rounded-full bg-[#FFC72C] text-base font-semibold text-gray-900 hover:bg-[#E6B328]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    continueLabel()
                  )}
                </Button>
              )}

              {stepId === "complete" && (
                <Button
                  type="button"
                  onClick={handleContinue}
                  className="h-12 w-full rounded-full bg-[#FFC72C] text-base font-semibold text-gray-900 hover:bg-[#E6B328]"
                >
                  Done
                </Button>
              )}

              {stepIndex > 0 && stepId !== "complete" && (
                <button
                  type="button"
                  onClick={goBack}
                  disabled={loading}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 text-sm font-medium text-gray-500 transition hover:text-gray-900"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
