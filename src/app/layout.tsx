import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Inter } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { ProfileProvider } from "@/components/providers/profile-provider";
import { MobileNavProvider } from "@/components/providers/mobile-nav-provider";
import { AuthModalProvider } from "@/components/providers/auth-modal-provider";
import { SellModalProvider } from "@/components/providers/sell-modal-provider";
import { UploadProvider } from "@/components/providers/upload-provider";
import { OrderNotificationsProvider } from "@/components/providers/order-notifications-provider";
import { FloatingUploadBar } from "@/components/marketplace/floating-upload-bar";
import { ConditionalLayout } from "@/components/layout";
import { GenieProvider } from "@/components/providers/genie-provider";
import { GeniePanel } from "@/components/genie/genie-panel";
import { GenieButton } from "@/components/genie/genie-button";
import { MessagesProvider } from "@/components/providers/messages-provider";
import { MessagesPanel } from "@/components/messages/messages-panel";
import { CartProvider } from "@/components/providers/cart-provider";
import { CartDrawer } from "@/components/marketplace/cart-drawer";
import { getUserProfile } from "@/lib/server/get-user-profile";
import { WebVitalsReporter } from "@/lib/performance/web-vitals";
import "./globals.css";
import { cn } from "@/lib/utils";

// Note: Layout is already dynamic due to getUserProfile() reading auth cookies
// Removed 'force-dynamic' to allow page-level ISR caching to work properly
// Individual pages can set their own caching with `revalidate` export

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bike Dashboard",
  description: "Bicycle Marketplace Admin Dashboard",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Bike Dashboard",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch user profile server-side for instant logo loading
  const serverProfile = await getUserProfile();

  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", inter.variable)}>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased touch-manipulation`}
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' } as any}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange={false}
        >
          <AuthProvider>
            <ProfileProvider serverProfile={serverProfile}>
              <OrderNotificationsProvider>
                <AuthModalProvider>
                  <SellModalProvider>
                    <UploadProvider>
                      <MobileNavProvider>
                        <MessagesProvider>
                          <GenieProvider>
                            <CartProvider>
                              <ConditionalLayout>{children}</ConditionalLayout>
                              <FloatingUploadBar />
                              <WebVitalsReporter />
                              <MessagesPanel />
                              <GeniePanel />
                              <GenieButton />
                              <CartDrawer />
                            </CartProvider>
                          </GenieProvider>
                        </MessagesProvider>
                      </MobileNavProvider>
                    </UploadProvider>
                  </SellModalProvider>
                </AuthModalProvider>
              </OrderNotificationsProvider>
            </ProfileProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
