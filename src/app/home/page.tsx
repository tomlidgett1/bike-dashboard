import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/seo/site";
import { HomeClient } from "./_components/home-client";

const TITLE = "The storefront and marketplace for local bike shops";
const DESCRIPTION =
  "Yellow Jersey replaces your bike shop's website, syncs your inventory and puts your stock in front of riders across the country — with AI that handles the busywork.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/home` },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${TITLE}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/home`,
    locale: "en_AU",
    images: [{ url: "/yjlogo.png", alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${TITLE}`,
    description: DESCRIPTION,
    images: ["/yjlogo.png"],
  },
};

export default function HomePage() {
  return <HomeClient />;
}
