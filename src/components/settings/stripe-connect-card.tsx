"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  CreditCard,
  Shield,
  Zap,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

interface StripeConnectStatus {
  connected: boolean;
  accountId?: string;
  status: "not_connected" | "pending" | "active" | "restricted" | "disabled";
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardingComplete: boolean;
  requirements?: string[];
  connectedAt?: string;
}

interface StripeConnectCardProps {
  className?: string;
}

// ============================================================
// Component
// ============================================================

export function StripeConnectCard({ className }: StripeConnectCardProps) {
  const [status, setStatus] = React.useState<StripeConnectStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Fetch status on mount
  React.useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/stripe/connect/status");
      
      if (!response.ok) {
        throw new Error("Failed to fetch status");
      }

      const data = await response.json();
      setStatus(data);
    } catch (err) {
      console.error("[StripeConnectCard] Error:", err);
      setError("Failed to load payment status");
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      setActionLoading(true);
      setError(null);

      const response = await fetch("/api/stripe/connect/create-account", {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create account");
      }

      const data = await response.json();
      
      // Redirect to Stripe onboarding
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("[StripeConnectCard] Error:", err);
      setError(err instanceof Error ? err.message : "Something went wrong");
      setActionLoading(false);
    }
  };

  const handleContinueOnboarding = async () => {
    try {
      setActionLoading(true);
      setError(null);

      const response = await fetch("/api/stripe/connect/onboarding-link", {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to get onboarding link");
      }

      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("[StripeConnectCard] Error:", err);
      setError(err instanceof Error ? err.message : "Something went wrong");
      setActionLoading(false);
    }
  };

  const handleOpenDashboard = async () => {
    try {
      setActionLoading(true);

      const response = await fetch("/api/stripe/connect/dashboard-link", {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to open dashboard");
      }

      const data = await response.json();
      
      if (data.url) {
        window.open(data.url, "_blank");
      }
    } catch (err) {
      console.error("[StripeConnectCard] Error:", err);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setActionLoading(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className={cn("bg-white rounded-md border border-gray-200 p-6", className)}>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  // Error state
  if (error && !status) {
    return (
      <div className={cn("bg-white rounded-md border border-gray-200 p-6", className)}>
        <div className="text-center py-4">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-sm text-gray-600">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStatus}
            className="mt-3 rounded-md"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Render based on status
  return (
    <div className={cn("bg-white rounded-md border border-gray-200 overflow-hidden", className)}>
      {/* Not Connected */}
      {(!status || status.status === "not_connected") && (
        <NotConnectedState
          onConnect={handleConnect}
          loading={actionLoading}
          error={error}
        />
      )}

      {/* Pending Onboarding */}
      {status?.status === "pending" && !status.onboardingComplete && (
        <PendingState
          onContinue={handleContinueOnboarding}
          loading={actionLoading}
          error={error}
        />
      )}

      {/* Active */}
      {status?.status === "active" && status.payoutsEnabled && (
        <ActiveState
          onOpenDashboard={handleOpenDashboard}
          loading={actionLoading}
          connectedAt={status.connectedAt}
        />
      )}

      {/* Restricted */}
      {status?.status === "restricted" && (
        <RestrictedState
          onUpdate={handleContinueOnboarding}
          loading={actionLoading}
          requirements={status.requirements}
        />
      )}
    </div>
  );
}

// ============================================================
// Not Connected State
// ============================================================

function NotConnectedState({
  onConnect,
  loading,
  error,
}: {
  onConnect: () => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="h-12 w-12 rounded-md bg-gray-100 flex items-center justify-center">
          <CreditCard className="h-6 w-6 text-gray-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Get Paid for Your Sales</h3>
          <p className="text-sm text-gray-600">Connect your bank account to receive payouts</p>
        </div>
      </div>

      {/* Trust Indicators */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="flex flex-col items-center text-center p-3 bg-gray-50 rounded-md">
          <Shield className="h-5 w-5 text-gray-600 mb-1" />
          <span className="text-xs text-gray-600">Secure</span>
        </div>
        <div className="flex flex-col items-center text-center p-3 bg-gray-50 rounded-md">
          <CheckCircle2 className="h-5 w-5 text-gray-600 mb-1" />
          <span className="text-xs text-gray-600">Verified</span>
        </div>
        <div className="flex flex-col items-center text-center p-3 bg-gray-50 rounded-md">
          <Zap className="h-5 w-5 text-gray-600 mb-1" />
          <span className="text-xs text-gray-600">Fast Payouts</span>
        </div>
      </div>

      {/* Connect Button */}
      <Button
        onClick={onConnect}
        disabled={loading}
        className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800 text-white font-medium"
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <Image
              src="/stripe.svg"
              alt="Stripe"
              width={40}
              height={17}
              className="mr-2 brightness-0 invert"
            />
            Connect with Stripe
          </>
        )}
      </Button>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="text-sm text-red-500 mt-3 text-center"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Footer */}
      <p className="text-xs text-gray-400 text-center mt-4">
        Your financial data is handled securely by Stripe
      </p>
    </div>
  );
}

// ============================================================
// Pending State
// ============================================================

function PendingState({
  onContinue,
  loading,
  error,
}: {
  onContinue: () => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-12 w-12 rounded-md bg-amber-100 flex items-center justify-center">
          <AlertCircle className="h-6 w-6 text-amber-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Complete Your Setup</h3>
          <p className="text-sm text-gray-600">Finish connecting your bank account</p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mb-4">
        <p className="text-sm text-amber-800">
          Your Stripe account setup is incomplete. Complete the onboarding to start receiving payouts.
        </p>
      </div>

      <Button
        onClick={onContinue}
        disabled={loading}
        className="w-full h-11 rounded-md bg-gray-900 hover:bg-gray-800 text-white"
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            Continue Setup
            <ChevronRight className="h-4 w-4 ml-2" />
          </>
        )}
      </Button>

      {error && (
        <p className="text-sm text-red-500 mt-3 text-center">{error}</p>
      )}
    </div>
  );
}

// ============================================================
// Active State
// ============================================================

function ActiveState({
  onOpenDashboard,
  loading,
  connectedAt,
}: {
  onOpenDashboard: () => void;
  loading: boolean;
  connectedAt?: string;
}) {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-12 w-12 rounded-md bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="h-6 w-6 text-green-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Payouts Enabled</h3>
          <p className="text-sm text-gray-600">Your bank account is connected</p>
        </div>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
        <p className="text-sm text-green-800">
          When your items sell, you&apos;ll receive payouts directly to your bank account (minus 3% platform fee).
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={onOpenDashboard}
          disabled={loading}
          variant="outline"
          className="flex-1 h-11 rounded-md"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <ExternalLink className="h-4 w-4 mr-2" />
              View Stripe Dashboard
            </>
          )}
        </Button>
      </div>

      {connectedAt && (
        <p className="text-xs text-gray-400 text-center mt-4">
          Connected {new Date(connectedAt).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
      )}
    </div>
  );
}

// ============================================================
// Restricted State
// ============================================================

function RestrictedState({
  onUpdate,
  loading,
  requirements,
}: {
  onUpdate: () => void;
  loading: boolean;
  requirements?: string[];
}) {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-12 w-12 rounded-md bg-red-100 flex items-center justify-center">
          <AlertCircle className="h-6 w-6 text-red-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Action Required</h3>
          <p className="text-sm text-gray-600">Your account needs attention</p>
        </div>
      </div>

      <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
        <p className="text-sm text-red-800">
          Stripe requires additional information to enable payouts. Please update your details.
        </p>
        {requirements && requirements.length > 0 && (
          <ul className="mt-2 text-xs text-red-700 list-disc list-inside">
            {requirements.slice(0, 3).map((req, i) => (
              <li key={i}>{req.replace(/_/g, " ")}</li>
            ))}
          </ul>
        )}
      </div>

      <Button
        onClick={onUpdate}
        disabled={loading}
        className="w-full h-11 rounded-md bg-red-600 hover:bg-red-700 text-white"
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          "Update Details"
        )}
      </Button>
    </div>
  );
}
