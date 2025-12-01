"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
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
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import { Header } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useUserProfile } from "@/lib/hooks/use-user-profile";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { optimizeImage, formatFileSize } from "@/lib/utils/image-optimizer";
import { OpeningHoursEditor } from "@/components/opening-hours-editor";
import type { OpeningHours } from "@/components/providers/profile-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLightspeedConnection } from "@/lib/hooks/use-lightspeed-connection";

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

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [logoPreview, setLogoPreview] = React.useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = React.useState(false);
  const [isAuthorized, setIsAuthorized] = React.useState<boolean | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  const { profile, loading, saving, isFirstTime, saveProfile, refreshProfile } = useUserProfile();
  
  // Lightspeed connection status
  const { 
    isConnected: lightspeedConnected, 
    isLoading: lightspeedLoading,
    accountInfo: lightspeedAccount,
    lastSync: lightspeedLastSync,
    formatLastSync,
  } = useLightspeedConnection({ autoFetch: true, pollInterval: 60000 });

  // Form state
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

  // Check access permissions immediately when profile loads
  React.useEffect(() => {
    if (!loading) {
      if (!profile) {
        // No profile yet, redirect to marketplace
        router.replace('/marketplace');
        return;
      }
      
      // Check if user is authorized (account_type = bicycle_store AND bicycle_store = true)
      const authorized = profile.account_type === 'bicycle_store' && profile.bicycle_store === true;
      
      if (!authorized) {
        // Redirect individual users to marketplace settings
        router.replace('/marketplace/settings');
      } else {
        // Only set authorized after confirming
        setIsAuthorized(true);
      }
    }
  }, [profile, loading, router]);

  // Load profile data when available
  React.useEffect(() => {
    if (profile) {
      // Combine first_name and last_name for display, or use name field
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
      
      // Set logo preview if exists
      if (profile.logo_url) {
        setLogoPreview(profile.logo_url);
      }

      // Set opening hours if exists
      if (profile.opening_hours) {
        setOpeningHours(profile.opening_hours);
      }
    }
  }, [profile]);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }
      
      // Validate file size (max 5MB for original)
      if (file.size > 5 * 1024 * 1024) {
        setError('Image size must be less than 5MB');
        return;
      }

      setError(null);
      setUploadingLogo(true);

      // Optimize image (resize to 512x512, convert to WebP)
      const optimizedBlob = await optimizeImage(file, {
        maxWidth: 512,
        maxHeight: 512,
        quality: 0.85,
        format: 'webp'
      });

      // Create File from Blob
      const optimizedFile = new File(
        [optimizedBlob], 
        file.name.replace(/\.[^/.]+$/, '.webp'),
        { type: 'image/webp' }
      );

      console.log('Image optimized:', {
        original: formatFileSize(file.size),
        optimized: formatFileSize(optimizedFile.size),
        savings: `${Math.round((1 - optimizedFile.size / file.size) * 100)}%`
      });

      setLogoFile(optimizedFile);
      
      // Create preview from optimized image
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
        setUploadingLogo(false);
      };
      reader.readAsDataURL(optimizedFile);
    } catch (error) {
      console.error('Error optimizing image:', error);
      setError('Failed to process image. Please try another file.');
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!user) return;
    
    setUploadingLogo(true);
    try {
      const supabase = createClient();
      
      // Delete from storage if exists
      if (formData.logoUrl) {
        const fileName = formData.logoUrl.split('/').pop();
        if (fileName) {
          await supabase.storage
            .from('logo')
            .remove([`${user.id}/${fileName}`]);
        }
      }
      
      // Update profile
      await saveProfile({ logo_url: undefined });
      
      setLogoFile(null);
      setLogoPreview(null);
      setFormData(prev => ({ ...prev, logoUrl: "" }));
      
      await refreshProfile();
    } catch (error) {
      console.error('Error removing logo:', error);
      setError('Failed to remove logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile || !user) return null;
    
    try {
      const supabase = createClient();
      
      // Delete old logo if exists
      if (formData.logoUrl) {
        const oldFileName = formData.logoUrl.split('/').pop();
        if (oldFileName) {
          await supabase.storage
            .from('logo')
            .remove([`${user.id}/${oldFileName}`]);
        }
      }
      
      // Upload new logo
      const fileExt = logoFile.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('logo')
        .upload(filePath, logoFile, {
          cacheControl: '31536000', // 1 year (immutable with versioned filenames)
          upsert: false,
          contentType: 'image/webp'
        });
      
      if (uploadError) {
        throw uploadError;
      }
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('logo')
        .getPublicUrl(filePath);
      
      return publicUrl;
    } catch (error) {
      console.error('Error uploading logo:', error);
      throw error;
    }
  };

  const handleSave = async () => {
    setError(null);
    setUploadingLogo(true);
    
    try {
      // Upload logo if changed
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
        await refreshProfile();
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

  // Check authorization synchronously during render
  const checkAuth = () => {
    if (loading) return 'loading';
    if (!profile) return 'unauthorized';
    return (profile.account_type === 'bicycle_store' && profile.bicycle_store === true) ? 'authorized' : 'unauthorized';
  };

  const authStatus = checkAuth();

  // Don't render ANYTHING until authorized
  if (authStatus !== 'authorized') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <Header
        title="Settings"
        description="Manage your account and preferences"
      />

      <div className="p-4 lg:p-6">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="mx-auto max-w-3xl space-y-6"
        >
          {/* First Time User Notice */}
          {isFirstTime && (
            <motion.div variants={itemVariants}>
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-border dark:bg-card">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-foreground">
                      Welcome! Complete Your Profile
                    </h3>
                    <p className="mt-1 text-sm text-gray-600 dark:text-muted-foreground">
                      Please fill in your account details below to get started. This information will be used for your business profile and communications.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Error Message */}
          {error && (
            <motion.div variants={itemVariants}>
              <div className="rounded-xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900 dark:bg-card">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-red-900 dark:text-red-400">
                      Error Saving Settings
                    </h3>
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          {/* Account Settings */}
          <motion.div variants={itemVariants}>
            <Card className="bg-white dark:bg-card rounded-md border-border">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                    <User className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">
                      Account Settings
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Update your personal information
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium">
                      Full Name
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => updateForm("name", e.target.value)}
                        className="pl-10 rounded-md"
                        placeholder="Your name"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">
                      Email Address
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => updateForm("email", e.target.value)}
                        className="pl-10 rounded-md"
                        placeholder="your@email.com"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-sm font-medium">
                    Phone Number
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => updateForm("phone", e.target.value)}
                      className="pl-10 rounded-md"
                      placeholder="+61 400 000 000"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Business Profile */}
          <motion.div variants={itemVariants}>
            <Card className="bg-white dark:bg-card rounded-md border-border">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                    <Building2 className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">
                      Business Profile
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Your business details for invoices and communications
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="businessName" className="text-sm font-medium">
                    Business Name
                  </Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="businessName"
                      value={formData.businessName}
                      onChange={(e) =>
                        updateForm("businessName", e.target.value)
                      }
                      className="pl-10 rounded-md"
                      placeholder="Your business name"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="storeType" className="text-sm font-medium">
                    Store Type
                  </Label>
                  <div className="relative">
                    <Store className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground z-10 pointer-events-none" />
                    <Select
                      value={formData.storeType}
                      onValueChange={(value) => updateForm("storeType", value)}
                    >
                      <SelectTrigger className="pl-10 rounded-md">
                        <SelectValue placeholder="Select store type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Bicycle Shop">Bicycle Shop</SelectItem>
                        <SelectItem value="Bike Repair & Service">Bike Repair & Service</SelectItem>
                        <SelectItem value="Mountain Bike Specialist">Mountain Bike Specialist</SelectItem>
                        <SelectItem value="Road Bike Specialist">Road Bike Specialist</SelectItem>
                        <SelectItem value="Electric Bike Dealer">Electric Bike Dealer</SelectItem>
                        <SelectItem value="BMX Shop">BMX Shop</SelectItem>
                        <SelectItem value="Cycling Accessories">Cycling Accessories</SelectItem>
                        <SelectItem value="Bike Rental">Bike Rental</SelectItem>
                        <SelectItem value="Online Bike Store">Online Bike Store</SelectItem>
                        <SelectItem value="Sports & Recreation">Sports & Recreation</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address" className="text-sm font-medium">
                    Business Address
                  </Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => updateForm("address", e.target.value)}
                      className="pl-10 rounded-md"
                      placeholder="123 Street, City, State, Postcode"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website" className="text-sm font-medium">
                    Website
                  </Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="website"
                      value={formData.website}
                      onChange={(e) => updateForm("website", e.target.value)}
                      className="pl-10 rounded-md"
                      placeholder="www.yourbusiness.com.au"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Logo Upload */}
          <motion.div variants={itemVariants}>
            <Card className="bg-white dark:bg-card rounded-md border-border">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                    <ImageIcon className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">
                      Business Logo
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Upload your business logo (max 5MB)
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  {/* Logo Preview */}
                  <div className="flex-shrink-0">
                    <div className="relative h-24 w-24 rounded-lg border-2 border-dashed border-border overflow-hidden bg-secondary/20">
                      {logoPreview ? (
                        <>
                          <Image
                            src={logoPreview}
                            alt="Business logo"
                            fill
                            className="object-cover"
                          />
                          <button
                            onClick={handleRemoveLogo}
                            disabled={uploadingLogo}
                            className="absolute top-1 right-1 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                            type="button"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Upload Button */}
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="logo-upload" className="text-sm font-medium">
                      Upload Logo
                    </Label>
                    <div className="flex gap-2">
                      <input
                        ref={fileInputRef}
                        id="logo-upload"
                        type="file"
                        accept="image/*"
                        onChange={handleLogoChange}
                        className="hidden"
                        aria-label="Upload logo"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingLogo}
                        className="rounded-md"
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Choose Image
                      </Button>
                      {logoFile && (
                        <span className="text-sm text-muted-foreground flex items-center">
                          {logoFile.name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Recommended: Square image, at least 200x200px. Supports JPG, PNG, GIF.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Opening Hours */}
          <motion.div variants={itemVariants}>
            <Card className="bg-white dark:bg-card rounded-md border-border">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                    <Clock className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">
                      Opening Hours
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Set your store's operating hours for each day
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <OpeningHoursEditor
                  value={openingHours}
                  onChange={setOpeningHours}
                />
              </CardContent>
            </Card>
          </motion.div>

          {/* Lightspeed Integration */}
          <motion.div variants={itemVariants}>
            <Card className="bg-white dark:bg-card rounded-md border-border">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-secondary overflow-hidden">
                      <Image
                        src="/ls.png"
                        alt="Lightspeed"
                        width={40}
                        height={40}
                        className="object-cover"
                      />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">
                        Lightspeed Integration
                      </CardTitle>
                      <CardDescription className="text-sm">
                        {lightspeedConnected && lightspeedAccount
                          ? `Connected to ${lightspeedAccount.name}`
                          : "Connect your Lightspeed POS account"
                        }
                      </CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "rounded-md",
                      lightspeedConnected
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-secondary text-muted-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "mr-1.5 h-2 w-2 rounded-full",
                        lightspeedConnected ? "bg-green-500" : "bg-muted-foreground"
                      )}
                    />
                    {lightspeedLoading ? "Loading..." : lightspeedConnected ? "Connected" : "Not Connected"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    {lightspeedConnected && lightspeedLastSync ? (
                      <p className="text-sm text-muted-foreground">
                        Last synced: {formatLastSync(lightspeedLastSync)}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Sync your products, orders, and inventory with Lightspeed POS.
                      </p>
                    )}
                  </div>
                  <Link href="/connect-lightspeed">
                    <Button variant="outline" className="rounded-md">
                      {lightspeedConnected ? "Manage Connection" : "Connect Lightspeed"}
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Notification Preferences */}
          <motion.div variants={itemVariants}>
            <Card className="bg-white dark:bg-card rounded-md border-border">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                    <Bell className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">
                      Notification Preferences
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Choose what notifications you receive
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">
                      Email Notifications
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Receive important updates via email
                    </p>
                  </div>
                  <Switch
                    checked={formData.emailNotifications}
                    onCheckedChange={(checked) =>
                      updateForm("emailNotifications", checked)
                    }
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Order Alerts</Label>
                    <p className="text-xs text-muted-foreground">
                      Get notified when you receive new orders
                    </p>
                  </div>
                  <Switch
                    checked={formData.orderAlerts}
                    onCheckedChange={(checked) =>
                      updateForm("orderAlerts", checked)
                    }
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">
                      Inventory Alerts
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Get notified when stock is running low
                    </p>
                  </div>
                  <Switch
                    checked={formData.inventoryAlerts}
                    onCheckedChange={(checked) =>
                      updateForm("inventoryAlerts", checked)
                    }
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">
                      Marketing Emails
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Receive tips, product updates, and promotions
                    </p>
                  </div>
                  <Switch
                    checked={formData.marketingEmails}
                    onCheckedChange={(checked) =>
                      updateForm("marketingEmails", checked)
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Appearance */}
          <motion.div variants={itemVariants}>
            <Card className="bg-white dark:bg-card rounded-md border-border">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                    <Palette className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">
                      Appearance
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Customise how the dashboard looks
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Theme</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {mounted && (
                      <>
                        <button
                          onClick={() => setTheme("light")}
                          className={cn(
                            "flex flex-col items-center gap-2 rounded-md border-2 p-4 transition-all",
                            theme === "light"
                              ? "border-foreground bg-secondary"
                              : "border-border hover:border-muted-foreground"
                          )}
                        >
                          <div className="h-12 w-12 rounded-md border border-border bg-white shadow-sm" />
                          <span className="text-xs font-medium">Light</span>
                        </button>
                        <button
                          onClick={() => setTheme("dark")}
                          className={cn(
                            "flex flex-col items-center gap-2 rounded-md border-2 p-4 transition-all",
                            theme === "dark"
                              ? "border-foreground bg-secondary"
                              : "border-border hover:border-muted-foreground"
                          )}
                        >
                          <div className="h-12 w-12 rounded-md border border-border bg-[#191919] shadow-sm" />
                          <span className="text-xs font-medium">Dark</span>
                        </button>
                        <button
                          onClick={() => setTheme("system")}
                          className={cn(
                            "flex flex-col items-center gap-2 rounded-md border-2 p-4 transition-all",
                            theme === "system"
                              ? "border-foreground bg-secondary"
                              : "border-border hover:border-muted-foreground"
                          )}
                        >
                          <div className="h-12 w-12 overflow-hidden rounded-md border border-border shadow-sm">
                            <div className="flex h-full">
                              <div className="w-1/2 bg-white" />
                              <div className="w-1/2 bg-[#191919]" />
                            </div>
                          </div>
                          <span className="text-xs font-medium">System</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Save Button */}
          <motion.div variants={itemVariants} className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={saving || uploadingLogo}
              className={cn(
                "min-w-[120px] rounded-md transition-all",
                saved && "bg-green-600 hover:bg-green-600"
              )}
            >
              {saving || uploadingLogo ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : saved ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </>
  );
}

