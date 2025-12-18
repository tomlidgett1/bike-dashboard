"use client";

// Re-export the purchases page for the marketplace route
// This allows bicycle stores to access order management via /marketplace/purchases
// while individual users can access it via /settings/purchases
export { default } from "@/app/settings/purchases/page";





