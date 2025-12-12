// ============================================================
// Stripe Configuration
// ============================================================
// Server and client-side Stripe initialisation for Yellow Jersey marketplace

import Stripe from 'stripe';
import { loadStripe, Stripe as StripeClient } from '@stripe/stripe-js';

// ============================================================
// Server-side Stripe Instance
// ============================================================

// Singleton pattern for server-side Stripe
let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    
    stripeInstance = new Stripe(secretKey, {
      apiVersion: '2025-11-17.clover',
      typescript: true,
    });
  }
  
  return stripeInstance;
}

// ============================================================
// Client-side Stripe Instance
// ============================================================

// Singleton promise for client-side Stripe
let stripePromise: Promise<StripeClient | null> | null = null;

export function getStripeClient(): Promise<StripeClient | null> {
  if (!stripePromise) {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    
    if (!publishableKey) {
      console.error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not configured');
      return Promise.resolve(null);
    }
    
    stripePromise = loadStripe(publishableKey);
  }
  
  return stripePromise;
}

// ============================================================
// Constants
// ============================================================

// Yellow Jersey platform fee percentage (3%)
export const PLATFORM_FEE_PERCENTAGE = 0.03;

// Calculate platform fee from total amount
export function calculatePlatformFee(totalAmount: number): number {
  return Math.round(totalAmount * PLATFORM_FEE_PERCENTAGE * 100) / 100;
}

// Calculate seller payout amount (total - platform fee)
export function calculateSellerPayout(totalAmount: number): number {
  const platformFee = calculatePlatformFee(totalAmount);
  return Math.round((totalAmount - platformFee) * 100) / 100;
}

// ============================================================
// Types
// ============================================================

export interface CheckoutSessionRequest {
  productId: string;
  productName: string;
  productDescription?: string;
  productImage?: string | null;
  price: number;
  shippingCost?: number;
  sellerId: string;
  buyerId: string;
}

export interface CheckoutSessionResponse {
  sessionId: string;
  url: string;
}
