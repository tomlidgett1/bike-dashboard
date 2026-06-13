import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/seo/site";
import { Home2Client } from "./_components/home2-client";

const TITLE = "The operating system for local bike shops";
const DESCRIPTION =
  "Yellow Jersey gives independent bike shops a branded storefront, a national marketplace, Lightspeed sync, and Genie AI — so you sell everywhere without the admin.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/home2` },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${TITLE}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/home2`,
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

export default function Home2Page() {
  return <Home2Client />;
}
