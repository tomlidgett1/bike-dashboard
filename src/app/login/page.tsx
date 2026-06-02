"use client";

import * as React from "react";
import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AuthCard, type AuthCardHandle } from "@/components/auth/auth-card";

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
  const [bgLoaded, setBgLoaded] = useState(false);
  const authCardRef = useRef<AuthCardHandle>(null);

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
              onClick={() => authCardRef.current?.showSignup()}
              className="rounded-full bg-[#FFC72C] px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-[#E6B328]"
            >
              Create account
            </button>
          </div>
        </nav>

        {/* ── Centered card ── */}
        <div className="flex flex-1 items-center justify-center px-5 py-6">
          <AuthCard ref={authCardRef} />
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
