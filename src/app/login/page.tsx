"use client";

import * as React from "react";
import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { Mail, Lock, Loader2, ArrowLeft, User, ChevronLeft } from "lucide-react";
import { getBrowserOAuthBaseUrl } from "@/lib/auth/oauth-site-url";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" fill="currentColor" />
    </svg>
  );
}

function CollageBackground({ onLoad }: { onLoad: () => void }) {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      <Image
        src="/back1.jpg"
        alt=""
        fill
        priority
        unoptimized
        className="object-cover"
        onLoad={onLoad}
      />
      {/* Mid wash so the card always reads clearly */}
      <div className="absolute inset-0 bg-black/30" />
      {/* Top gradient — keeps nav readable over any background colour */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent" />
      {/* Bottom gradient — keeps footer readable */}
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black via-black/80 to-transparent" />
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [bgLoaded, setBgLoaded] = useState(false);

  const [showEmail, setShowEmail] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = loading || googleLoading || appleLoading;

  const resetEmail = () => {
    setShowEmail(false);
    setMode("signin");
    setError(null);
    setEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
  };

  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);
      setError(null);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${getBrowserOAuthBaseUrl()}/auth/callback?next=/marketplace`,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setAppleLoading(true);
      setError(null);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: {
          redirectTo: `${getBrowserOAuthBaseUrl()}/auth/callback?next=/marketplace`,
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setAppleLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) {
          const { data: profile } = await supabase
            .from("users")
            .select("bicycle_store, account_type")
            .eq("user_id", data.user.id)
            .single();
          if (profile?.account_type === "bicycle_store" && profile?.bicycle_store === true) {
            router.push("/settings");
          } else {
            router.push("/marketplace");
          }
          router.refresh();
        }
      } else {
        // Sign up via server route — creates user with email pre-confirmed, no verification email
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, firstName, lastName }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Sign up failed");

        // Sign in immediately with the new credentials
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;

        router.push("/marketplace");
        router.refresh();
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-black">
      <CollageBackground onLoad={() => setBgLoaded(true)} />

      {/* Everything fades in once the background image has loaded */}
      <div
        className="relative z-10 flex min-h-screen flex-col transition-opacity duration-500"
        style={{ opacity: bgLoaded ? 1 : 0 }}
      >
        {/* ── Top navigation bar ── */}
        <nav className="flex items-center justify-between px-6 py-5 sm:px-10">
          {/* Left: back to marketplace */}
          <Link
            href="/marketplace"
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            <ChevronLeft className="h-4 w-4" />
            Marketplace
          </Link>

          {/* Right: about + create account */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/marketplace"
              className="rounded-full px-4 py-2 text-sm font-medium text-white/80 transition hover:text-white"
            >
              About
            </Link>
            <button
              onClick={() => { setShowEmail(true); setMode("signup"); }}
              className="rounded-full bg-[#FFC72C] px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-[#E6B328]"
            >
              Create account
            </button>
          </div>
        </nav>

        {/* ── Centered card ── */}
        <div className="flex flex-1 items-center justify-center px-5 py-6">
        <div className="w-full max-w-[420px] rounded-3xl bg-white p-7 shadow-2xl sm:p-9">
          <h1 className="text-2xl font-bold leading-tight text-gray-900 sm:text-3xl">
            {showEmail && mode === "signup" ? "Create your account" : "Log in or sign up in seconds"}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-gray-500">
            {showEmail && mode === "signup"
              ? "Fill in your details to get started with Yellow Jersey."
              : "Use your email or another service to continue with Yellow Jersey."}
          </p>

          {!showEmail ? (
            <div className="mt-6 space-y-2.5">
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleSignIn}
                disabled={busy}
                className="h-12 w-full rounded-full border-gray-300 text-base font-medium hover:bg-gray-50"
              >
                {googleLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <GoogleIcon className="mr-2 h-5 w-5" />}
                Continue with Google
              </Button>
              <Button
                type="button"
                onClick={handleAppleSignIn}
                disabled={busy}
                className="h-12 w-full rounded-full bg-black text-base font-medium text-white hover:bg-gray-800"
              >
                {appleLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <AppleIcon className="mr-2 h-5 w-5" />}
                Continue with Apple
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEmail(true)}
                disabled={busy}
                className="h-12 w-full rounded-full border-gray-300 text-base font-medium hover:bg-gray-50"
              >
                <Mail className="mr-2 h-5 w-5 text-gray-500" />
                Continue with email
              </Button>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleEmailSubmit} className="mt-6 space-y-4">
              {/* Name fields — sign-up only */}
              {mode === "signup" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="text-sm font-medium text-gray-700">First name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                      <Input
                        id="firstName"
                        type="text"
                        placeholder="John"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="h-12 rounded-xl pl-10 text-base"
                        required
                        disabled={loading}
                        autoComplete="given-name"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="text-sm font-medium text-gray-700">Last name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                      <Input
                        id="lastName"
                        type="text"
                        placeholder="Smith"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="h-12 rounded-xl pl-10 text-base"
                        required
                        disabled={loading}
                        autoComplete="family-name"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 rounded-xl pl-10 text-base"
                    required
                    disabled={loading}
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-gray-700">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 rounded-xl pl-10 text-base"
                    required
                    disabled={loading}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="h-12 w-full rounded-full bg-[#FFC72C] text-base font-semibold text-gray-900 hover:bg-[#E6B328]"
              >
                {loading ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" />{mode === "signin" ? "Signing in…" : "Creating account…"}</>
                ) : (
                  mode === "signin" ? "Sign in" : "Create account"
                )}
              </Button>

              {/* Toggle sign-in / sign-up */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
                  className="text-sm text-gray-500 transition hover:text-gray-900"
                  disabled={loading}
                >
                  {mode === "signin" ? (
                    <>Don&apos;t have an account? <span className="font-semibold text-gray-900">Sign up</span></>
                  ) : (
                    <>Already have an account? <span className="font-semibold text-gray-900">Sign in</span></>
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={resetEmail}
                className="flex w-full items-center justify-center gap-1.5 text-sm font-medium text-gray-500 transition hover:text-gray-900"
                disabled={loading}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to all options
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-xs leading-relaxed text-gray-400">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
        </div>

        {/* ── Bottom footer ── */}
        <footer className="flex flex-col items-center gap-3 px-6 py-6 sm:flex-row sm:justify-between sm:px-10">
          <p className="text-sm text-white/60">
            © {new Date().getFullYear()} Yellow Jersey. All rights reserved.
          </p>
          <div className="flex items-center gap-1 text-sm text-white/90">
            <Link href="/privacy" className="rounded px-2 py-1 transition hover:text-white hover:underline">Privacy Policy</Link>
            <span className="text-white/40">·</span>
            <Link href="/terms" className="rounded px-2 py-1 transition hover:text-white hover:underline">Terms of Service</Link>
            <span className="text-white/40">·</span>
            <Link href="/marketplace" className="rounded px-2 py-1 transition hover:text-white hover:underline">About</Link>
            <span className="text-white/40">·</span>
            <a href="mailto:hello@yellowjersey.store" className="rounded px-2 py-1 transition hover:text-white hover:underline">Contact</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
