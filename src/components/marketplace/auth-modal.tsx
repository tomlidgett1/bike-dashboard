"use client";

import * as React from "react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Mail, Lock, Loader2, Store, User } from "lucide-react";
import Image from "next/image";

// Google Icon SVG Component
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

// Apple Icon SVG Component
function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
        fill="currentColor"
      />
    </svg>
  );
}

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [accountType, setAccountType] = useState<"individual" | "bicycle_store">(
    "individual"
  );
  const router = useRouter();
  const supabase = createClient();

  // Get the site URL for OAuth redirects
  // In development with ngrok, we need to use the ngrok URL
  const getSiteUrl = () => {
    // Check if we're on a ngrok domain
    if (typeof window !== 'undefined' && window.location.hostname.includes('ngrok')) {
      return window.location.origin;
    }
    // Check env variable
    if (process.env.NEXT_PUBLIC_SITE_URL) {
      return process.env.NEXT_PUBLIC_SITE_URL;
    }
    // Fallback to current origin
    return typeof window !== 'undefined' ? window.location.origin : '';
  };

  // Handle Google OAuth sign-in
  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);
      setError(null);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${getSiteUrl()}/auth/callback?next=/marketplace`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) throw error;
    } catch (error: any) {
      setError(error.message);
      setGoogleLoading(false);
    }
  };

  // Handle Apple OAuth sign-in
  const handleAppleSignIn = async () => {
    try {
      setAppleLoading(true);
      setError(null);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: {
          redirectTo: `${getSiteUrl()}/auth/callback?next=/marketplace`,
        },
      });

      if (error) throw error;
    } catch (error: any) {
      setError(error.message);
      setAppleLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === "login") {
        const { data: authData, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        // Fetch user profile to determine redirect
        if (authData.user) {
          const { data: profile } = await supabase
            .from("users")
            .select("bicycle_store, account_type")
            .eq("user_id", authData.user.id)
            .single();

          // Close modal first
          onOpenChange(false);

          // Redirect based on account type and verification status
          // Only verified bicycle stores (account_type = 'bicycle_store' AND bicycle_store = true) go to settings
          if (
            profile?.account_type === "bicycle_store" &&
            profile?.bicycle_store === true
          ) {
            // Verified bike store -> go to settings/dashboard
            router.push("/settings");
          } else {
            // Individual users OR unverified stores -> stay on marketplace
            router.refresh();
          }
        }
      } else {
        // Sign up the user
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (authError) throw authError;

        // Update user profile with account type (trigger already created the base profile)
        // bicycle_store is always false until admin approves
        if (authData.user) {
          const { error: profileError } = await supabase
            .from("users")
            .update({
              account_type: accountType,
            })
            .eq("user_id", authData.user.id);

          if (profileError) {
            console.error("Error updating profile:", profileError);
          }

          // Close modal and redirect to onboarding
          onOpenChange(false);
          router.push(`/onboarding?type=${accountType}`);
          router.refresh();
          return;
        }
      }
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Reset form when modal opens/closes
  React.useEffect(() => {
    if (!open) {
      // Reset form after a delay to avoid visual flicker
      setTimeout(() => {
        setEmail("");
        setPassword("");
        setError(null);
        setMode("login");
        setAccountType("individual");
        setGoogleLoading(false);
        setAppleLoading(false);
      }, 200);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        fullScreenMobile 
        className="sm:max-w-[440px] bg-white sm:rounded-md flex flex-col"
      >
        {/* Header with Logo */}
        <DialogHeader className="px-6 sm:px-8 pt-12 sm:pt-8 pb-4 space-y-3 sm:space-y-4 flex-shrink-0">
          <div className="flex items-center justify-center">
            {/* Mobile Logo */}
            <Image
              src="/yjsmall.svg"
              alt="Yellow Jersey"
              width={120}
              height={24}
              className="h-16 sm:hidden"
            />
            {/* Desktop Logo */}
            <Image
              src="/yj.svg"
              alt="Yellow Jersey"
              width={200}
              height={40}
              className="hidden sm:block h-8 sm:h-10"
            />
          </div>
          <DialogTitle className="text-center text-xl sm:text-2xl font-semibold text-gray-900">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </DialogTitle>
        </DialogHeader>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto px-6 sm:px-8 pb-8 sm:pb-8">
          {/* OAuth Buttons */}
          <div className="space-y-3 mb-4 sm:mb-5">
            {/* Google Sign-In Button */}
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogleSignIn}
              disabled={loading || googleLoading || appleLoading}
              className="w-full h-12 sm:h-11 text-base font-medium rounded-md border-gray-300 hover:bg-gray-50 active:scale-[0.98] transition-transform"
            >
              {googleLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <GoogleIcon className="mr-2 h-5 w-5" />
              )}
              Continue with Google
            </Button>

            {/* Apple Sign-In Button */}
            <Button
              type="button"
              onClick={handleAppleSignIn}
              disabled={loading || googleLoading || appleLoading}
              className="w-full h-12 sm:h-11 text-base font-medium rounded-md bg-black hover:bg-gray-800 text-white active:scale-[0.98] transition-transform"
            >
              {appleLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <AppleIcon className="mr-2 h-5 w-5" />
              )}
              Continue with Apple
            </Button>
          </div>

          {/* Divider */}
          <div className="relative mb-4 sm:mb-5">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">Or continue with email</span>
            </div>
          </div>

          <form onSubmit={handleAuth} className="space-y-4 sm:space-y-5">
            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-12 sm:h-11 rounded-md text-base sm:text-sm"
                  required
                  disabled={loading}
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-12 sm:h-11 rounded-md text-base sm:text-sm"
                  required
                  disabled={loading}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              </div>
            </div>

            {/* Account Type Selection (Signup Only) */}
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="accountType" className="text-sm font-medium text-gray-700">
                  Account Type
                </Label>
                <Select
                  value={accountType}
                  onValueChange={(value: "individual" | "bicycle_store") =>
                    setAccountType(value)
                  }
                  disabled={loading}
                >
                  <SelectTrigger className="h-12 sm:h-11 rounded-md bg-white text-base sm:text-sm">
                    <SelectValue placeholder="Select account type" />
                  </SelectTrigger>
                  <SelectContent className="bg-white rounded-md">
                    <SelectItem value="individual" className="rounded-md py-3 sm:py-2">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <span>Individual Seller</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="bicycle_store" className="rounded-md py-3 sm:py-2">
                      <div className="flex items-center gap-2">
                        <Store className="h-4 w-4" />
                        <span>Bicycle Store</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  {accountType === "bicycle_store"
                    ? "Store accounts require admin verification before approval"
                    : "Perfect for selling your personal bikes"}
                </p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-white border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-12 sm:h-11 text-base font-medium rounded-md bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 active:scale-[0.98] transition-transform"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {mode === "login" ? "Signing in..." : "Creating account..."}
                </>
              ) : (
                <>{mode === "login" ? "Sign In" : "Create Account"}</>
              )}
            </Button>
          </form>

          {/* Toggle Mode */}
          <div className="mt-4 sm:mt-5 text-center">
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError(null);
              }}
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors py-2 px-4 -mx-4 active:bg-gray-100 rounded-md"
              disabled={loading}
            >
              {mode === "login" ? (
                <>
                  Don&apos;t have an account?{" "}
                  <span className="font-semibold">Sign up</span>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <span className="font-semibold">Sign in</span>
                </>
              )}
            </button>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-gray-500 mt-4 sm:mt-5">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

