"use client";

import * as React from "react";
import { Elements } from "@stripe/react-stripe-js";
import { getStripeClient } from "@/lib/stripe";
import type { StripeElementsOptions } from "@stripe/stripe-js";

// ============================================================
// Stripe Elements Provider
// ============================================================
// Wraps components that need access to Stripe Elements
// Provides theming that matches Yellow Jersey design

interface StripeElementsProviderProps {
  clientSecret: string;
  children: React.ReactNode;
}

export function StripeElementsProvider({
  clientSecret,
  children,
}: StripeElementsProviderProps) {
  const stripePromise = React.useMemo(() => getStripeClient(), []);

  const options: StripeElementsOptions = {
    clientSecret,
    appearance: {
      theme: "stripe",
      variables: {
        colorPrimary: "#111827", // gray-900
        colorBackground: "#ffffff",
        colorText: "#111827",
        colorDanger: "#ef4444", // red-500
        fontFamily: "system-ui, -apple-system, sans-serif",
        borderRadius: "6px", // rounded-md
        spacingUnit: "4px",
      },
      rules: {
        ".Input": {
          border: "1px solid #e5e7eb", // gray-200
          boxShadow: "none",
          padding: "12px",
        },
        ".Input:focus": {
          border: "1px solid #111827",
          boxShadow: "0 0 0 1px #111827",
        },
        ".Label": {
          fontWeight: "500",
          fontSize: "14px",
          marginBottom: "6px",
        },
        ".Tab": {
          border: "1px solid #e5e7eb",
          borderRadius: "6px",
        },
        ".Tab--selected": {
          border: "1px solid #111827",
          backgroundColor: "#f9fafb",
        },
      },
    },
    loader: "auto",
  };

  return (
    <Elements stripe={stripePromise} options={options}>
      {children}
    </Elements>
  );
}

