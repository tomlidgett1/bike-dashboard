import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Inter, Caveat } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { ProfileProvider } from "@/components/providers/profile-provider";
import { MobileNavProvider } from "@/components/providers/mobile-nav-provider";
import { AuthModalProvider } from "@/components/providers/auth-modal-provider";
import { SellModalProvider } from "@/components/providers/sell-modal-provider";
import { UploadProvider } from "@/components/providers/upload-provider";
import { OptimizeJobsProvider } from "@/components/providers/optimize-jobs-provider";
import { GenieJobsProvider } from "@/components/providers/genie-jobs-provider";
import { OrderNotificationsProvider } from "@/components/providers/order-notifications-provider";
import { MessagesProvider } from "@/components/providers/messages-provider";
import { NestNotificationsProvider } from "@/components/providers/nest-notifications-provider";
import { CartProvider } from "@/components/providers/cart-provider";
import { ConditionalLayout } from "@/components/layout";
import { GenieProvider } from "@/components/providers/genie-provider";
import { DeferredGlobalPanels } from "@/components/layout/deferred-global-panels";
import { getUserProfile } from "@/lib/server/get-user-profile";
import { WebVitalsReporter } from "@/lib/performance/web-vitals";
import { HapticsBootstrap } from "@/components/providers/haptics-bootstrap";
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

const caveat = Caveat({
  variable: "--font-handwriting",
  subsets: ["latin"],
  weight: ["600", "700"],
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
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://frjcluhuictnbimitvrm.supabase.co" />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} ${caveat.variable} font-sans antialiased touch-manipulation`}
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' } as any}
      >
        <HapticsBootstrap />
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange={false}
        >
          <AuthProvider>
            <ProfileProvider serverProfile={serverProfile}>
              <OrderNotificationsProvider>
                <AuthModalProvider>
                  <SellModalProvider>
                    <UploadProvider>
                      <OptimizeJobsProvider>
                      <GenieJobsProvider>
                      <MobileNavProvider>
                        <MessagesProvider>
                          <NestNotificationsProvider>
                          <GenieProvider>
                              <CartProvider>
                                <ConditionalLayout>{children}</ConditionalLayout>
                              <WebVitalsReporter />
                              <DeferredGlobalPanels />
                            </CartProvider>
                          </GenieProvider>
                          </NestNotificationsProvider>
                        </MessagesProvider>
                      </MobileNavProvider>
                      </GenieJobsProvider>
                      </OptimizeJobsProvider>
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
