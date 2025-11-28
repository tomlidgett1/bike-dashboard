import type { Metadata, Viewport } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { ProfileProvider } from "@/components/providers/profile-provider";
import { ConditionalLayout } from "@/components/layout";
import { getUserProfile } from "@/lib/server/get-user-profile";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bike Dashboard",
  description: "Bicycle Marketplace Admin Dashboard",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Bike Dashboard",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch user profile server-side for instant logo loading
  const serverProfile = await getUserProfile();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preload logo for instant display */}
        {serverProfile?.logo_url && (
          <link rel="preload" as="image" href={serverProfile.logo_url} type="image/webp" />
        )}
      </head>
      <body
        className={`${sora.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange={false}
        >
          <AuthProvider>
            <ProfileProvider serverProfile={serverProfile}>
              <ConditionalLayout>{children}</ConditionalLayout>
            </ProfileProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
