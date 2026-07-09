import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Inter, Caveat, Plus_Jakarta_Sans } from "next/font/google";
import { SITE_URL, SITE_NAME, SITE_TITLE, SITE_DESCRIPTION, SITE_OG_IMAGE } from "@/lib/seo/site";
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

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "bike shop",
    "bicycle marketplace",
    "used bikes",
    "new bikes",
    "road bikes",
    "mountain bikes",
    "bike parts",
    "cycling apparel",
    "local bike store",
    "buy bikes online",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "en_AU",
    images: [{ url: SITE_OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [SITE_OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: SITE_NAME,
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  userScalable: true,
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
        className={`${inter.variable} ${jetbrainsMono.variable} ${caveat.variable} ${plusJakartaSans.variable} font-sans antialiased touch-manipulation`}
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
