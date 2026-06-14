import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/seo/site";
import { WhyYellowJerseyClient } from "../_components/why-yellow-jersey-client";

const TITLE = "Why bike shops need Yellow Jersey";
const DESCRIPTION =
  "Buyers shop online, but bikes still need real service. See why independent bike shops sell better with connected commerce instead of standalone sites or old marketplaces.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/home2/why-yellow-jersey` },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME}: ${TITLE}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/home2/why-yellow-jersey`,
    locale: "en_AU",
    images: [{ url: "/yjlogo.png", alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME}: ${TITLE}`,
    description: DESCRIPTION,
    images: ["/yjlogo.png"],
  },
};

export default function WhyYellowJerseyPage() {
  return <WhyYellowJerseyClient />;
}
