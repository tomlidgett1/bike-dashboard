"use client";

import Image from "next/image";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConnectLightspeedBentoProps {
  error: string | null;
  isConnecting: boolean;
  onConnect: () => void;
}

export function ConnectLightspeedBento({
  error,
  isConnecting,
  onConnect,
}: ConnectLightspeedBentoProps) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-gray-50 p-6">
      <div className="grid w-full max-w-lg gap-2 sm:grid-cols-[140px_1fr]">
        <div className="flex items-center justify-center rounded-md border border-gray-200 bg-white p-8">
          <Image
            src="/ls.png"
            alt="Lightspeed"
            width={72}
            height={72}
            className="h-16 w-16 object-contain"
            unoptimized
            priority
          />
        </div>

        <div className="flex flex-col justify-center gap-5 rounded-md border border-gray-200 bg-white p-6 sm:p-8">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              Connect Lightspeed
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Sync your inventory to the marketplace.
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-white p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <p className="text-sm text-red-900">{error}</p>
              </div>
            </div>
          )}

          <Button
            onClick={onConnect}
            disabled={isConnecting}
            size="lg"
            className="w-full rounded-md"
          >
            {isConnecting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Connecting…
              </>
            ) : (
              "Connect Lightspeed"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
