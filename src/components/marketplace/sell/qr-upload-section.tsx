"use client";

import * as React from "react";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "framer-motion";
import { Smartphone, Clock, Check, Loader2, RefreshCw, X, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";

// ============================================================
// QR Upload Section
// Displays QR code for mobile photo uploads with real-time sync
// ============================================================

interface UploadedImage {
  id: string;
  url: string;
  storagePath?: string;
  uploadedAt: string;
}

interface QrUploadSectionProps {
  onPhotosReady: (images: UploadedImage[]) => void;
  onCancel: () => void;
}

type SessionStatus = "creating" | "ready" | "uploading" | "complete" | "expired" | "error";

export function QrUploadSection({ onPhotosReady, onCancel }: QrUploadSectionProps) {
  const [status, setStatus] = React.useState<SessionStatus>("creating");
  const [sessionToken, setSessionToken] = React.useState<string | null>(null);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [images, setImages] = React.useState<UploadedImage[]>([]);
  const [expiresAt, setExpiresAt] = React.useState<Date | null>(null);
  const [timeRemaining, setTimeRemaining] = React.useState<number>(0);
  const [error, setError] = React.useState<string | null>(null);

  // Create session on mount
  React.useEffect(() => {
    createSession();
  }, []);

  // Set up Supabase Realtime subscription when session is ready
  React.useEffect(() => {
    if (!sessionId) return;

    const supabase = createClient();
    
    const channel = supabase
      .channel(`mobile-upload-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mobile_upload_sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          console.log('[QR Upload] Realtime update:', payload);
          const newData = payload.new as any;
          
          // Update images
          if (newData.images) {
            setImages(newData.images);
          }
          
          // Update status
          if (newData.status === 'complete') {
            setStatus('complete');
          } else if (newData.status === 'uploading') {
            setStatus('uploading');
          } else if (newData.status === 'pending' && newData.images?.length > 0) {
            setStatus('ready');
          }
        }
      )
      .subscribe((status) => {
        console.log('[QR Upload] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // Update countdown timer
  React.useEffect(() => {
    if (!expiresAt) return;

    const updateTimer = () => {
      const remaining = Math.max(0, expiresAt.getTime() - Date.now());
      setTimeRemaining(remaining);
      
      if (remaining === 0 && status !== "expired") {
        setStatus("expired");
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, status]);

  const createSession = async () => {
    setStatus("creating");
    setError(null);

    try {
      const response = await fetch("/api/mobile-upload/create-session", {
        method: "POST",
      });

      const result = await response.json();

      if (!response.ok) {
        setStatus("error");
        setError(result.error || "Failed to create session");
        return;
      }

      setSessionToken(result.data.sessionToken);
      setSessionId(result.data.sessionId);
      setExpiresAt(new Date(result.data.expiresAt));
      setImages([]);
      setStatus("ready");

      console.log('[QR Upload] Session created:', result.data.sessionToken);
    } catch (err) {
      console.error("Error creating session:", err);
      setStatus("error");
      setError("Failed to create session. Please try again.");
    }
  };

  const handleUsePhotos = () => {
    if (images.length > 0) {
      onPhotosReady(images);
    }
  };

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const getQrUrl = () => {
    if (typeof window === "undefined" || !sessionToken) return "";
    return `${window.location.origin}/upload/mobile/${sessionToken}`;
  };

  // Creating state
  if (status === "creating") {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-3" />
        <p className="text-gray-600">Creating upload session...</p>
      </div>
    );
  }

  // Error state
  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
          <X className="h-6 w-6 text-red-600" />
        </div>
        <p className="text-gray-900 font-medium mb-1">Something went wrong</p>
        <p className="text-gray-500 text-sm mb-4">{error}</p>
        <Button onClick={createSession} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    );
  }

  // Expired state
  if (status === "expired") {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mb-4">
          <Clock className="h-6 w-6 text-orange-600" />
        </div>
        <p className="text-gray-900 font-medium mb-1">Session Expired</p>
        <p className="text-gray-500 text-sm mb-4">Generate a new QR code to continue</p>
        <Button onClick={createSession} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Generate New Code
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      {/* QR Code */}
      <div className="relative mb-6">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <QRCodeSVG
            value={getQrUrl()}
            size={180}
            level="M"
            includeMargin={false}
            bgColor="#ffffff"
            fgColor="#111827"
          />
        </div>
        
        {/* Timer badge */}
        <div className="absolute -top-2 -right-2 bg-gray-900 text-white text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatTime(timeRemaining)}
        </div>
      </div>

      {/* Instructions */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2 text-gray-900 font-medium mb-1">
          <Smartphone className="h-4 w-4" />
          Scan with your phone
        </div>
        <p className="text-gray-500 text-sm">
          Open your camera app and point at the QR code
        </p>
      </div>

      {/* Photo count / Status */}
      <AnimatePresence mode="wait">
        {images.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full"
          >
            {/* Photo thumbnails */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-900">
                    {images.length} photo{images.length !== 1 ? "s" : ""} received
                  </span>
                </div>
                {status === "uploading" && (
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                )}
              </div>
              
              <div className="grid grid-cols-5 gap-2">
                {images.slice(0, 5).map((img, index) => (
                  <div
                    key={img.id}
                    className="aspect-square rounded-lg overflow-hidden bg-gray-200 relative"
                  >
                    <Image
                      src={img.url}
                      alt={`Photo ${index + 1}`}
                      fill
                      className="object-cover"
                      sizes="60px"
                    />
                  </div>
                ))}
                {images.length > 5 && (
                  <div className="aspect-square rounded-lg bg-gray-200 flex items-center justify-center">
                    <span className="text-xs font-medium text-gray-600">
                      +{images.length - 5}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Use photos button */}
            <Button
              onClick={handleUsePhotos}
              className="w-full bg-gray-900 hover:bg-gray-800"
              size="lg"
            >
              <ImageIcon className="h-4 w-4 mr-2" />
              Use {images.length} Photo{images.length !== 1 ? "s" : ""}
            </Button>
          </motion.div>
        )}

        {images.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center"
          >
            <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
              <div className="w-2 h-2 bg-gray-300 rounded-full animate-pulse" />
              Waiting for photos...
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cancel link */}
      <button
        onClick={onCancel}
        className="mt-4 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        Cancel and upload from computer instead
      </button>
    </div>
  );
}

