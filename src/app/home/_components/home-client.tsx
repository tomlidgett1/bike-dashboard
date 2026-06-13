"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, useReducedMotion, useScroll, useMotionValueEvent } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Sparkles,
  Boxes,
  Receipt,
  MessageSquareText,
  Bike,
  Truck,
  Heart,
} from "lucide-react";
import styles from "./home.module.css";

const WheelScene = dynamic(() => import("./wheel-scene"), { ssr: false });

const STORE_URL = "/marketplace/store/3acef09d-8b28-46e8-a0c3-45ce59c61972";
const PRODUCT_URL = "/marketplace/product/5769f740-bab1-4f82-9828-53b03c2d57b6";

class SceneBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(50% 50% at 50% 50%, rgba(255,222,89,0.18), transparent 70%)",
          }}
        />
      );
    }
    return this.props.children;
  }
}

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 16 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 0.7, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}

const CAPS = [
  {
    icon: Sparkles,
    title: "Genie, your AI assistant",
    desc: "Ask it to list products, write copy or check your numbers. It plugs into your tools and does the work.",
  },
  {
    icon: Boxes,
    title: "Lightspeed sync",
    desc: "Connect your POS once. Inventory and sales stay in sync across your store and the marketplace.",
  },
  {
    icon: Receipt,
    title: "Xero accounting",
    desc: "Sales, bills and purchase orders reconcile themselves. See your P&L without leaving Yellow Jersey.",
  },
  {
    icon: MessageSquareText,
    title: "Sell by text",
    desc: "Snap a photo, send a message, and Genie turns it into a polished, ready-to-sell listing.",
  },
];

const RIDERS = [
  {
    icon: Bike,
    title: "New & used, from real shops",
    desc: "Thousands of bikes, parts and apparel — all from trusted independent shops.",
  },
  {
    icon: Truck,
    title: "Delivery or local pickup",
    desc: "Have it shipped, or roll in to collect and get fitted in person.",
  },
  {
    icon: Heart,
    title: "A feed that learns your ride",
    desc: "The more you browse, the better it gets at finding the gear that fits you.",
  },
];

const Logo = ({ className }: { className?: string }) => (
  <Image src="/yjlogo.png" alt="Yellow Jersey" width={217} height={26} className={className ?? styles.logoImg} priority />
);

export function HomeClient() {
  const reduced = useReducedMotion() ?? false;
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = React.useState(false);
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 8));

  return (
    <div className={styles.page}>
      {/* nav */}
      <nav className={`${styles.nav} ${scrolled ? styles.navScrolled : ""}`}>
        <div className={`${styles.container} ${styles.navInner}`}>
          <Link href="/home" aria-label="Yellow Jersey home">
            <Logo />
          </Link>
          <div className={styles.navLinks}>
            <a href="#shops" className={`${styles.navLink} ${styles.hideSm}`}>
              For shops
            </a>
            <a href="#riders" className={`${styles.navLink} ${styles.hideSm}`}>
              For riders
            </a>
            <Link href="/login" className={`${styles.navLink} ${styles.hideSm}`}>
              Sign in
            </Link>
            <Link href="/marketplace" className={styles.btnDark}>
              Explore marketplace
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* hero */}
        <section className={`${styles.container} ${styles.hero}`}>
          <Reveal>
            <span className={styles.eyebrow}>
              <span className={styles.eyebrowDot} />
              Built for independent bike shops
            </span>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className={styles.h1}>
              The storefront and marketplace for <span className={styles.mark}>local bike shops</span>.
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className={styles.lede}>
              Replace your website, sync your inventory and reach riders across the country — with AI
              that handles the busywork. One platform, built for the way bike shops actually work.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className={styles.heroCtas}>
              <Link href="/marketplace" className={`${styles.btnDark} ${styles.btnLg}`}>
                Explore the marketplace
                <ArrowRight size={17} />
              </Link>
              <Link href="/login" className={`${styles.btnGhost} ${styles.btnLg}`}>
                List your shop
                <ArrowUpRight size={17} />
              </Link>
            </div>
          </Reveal>
          <Reveal delay={0.2}>
            <p className={styles.heroNote}>Made in Melbourne, for bike shops everywhere.</p>
          </Reveal>

          {/* 3D showpiece */}
          <Reveal delay={0.1}>
            <div className={styles.showpiece}>
              <div className={styles.showpieceCanvas}>
                <SceneBoundary>
                  <WheelScene reduced={reduced} />
                </SceneBoundary>
              </div>
              <div className={styles.showpieceGlow} aria-hidden />
              <span className={styles.showpieceCaption}>Yellow Jersey — in the lead.</span>
            </div>
          </Reveal>
        </section>

        {/* feature: storefront */}
        <section id="shops" className={`${styles.container} ${styles.section}`}>
          <div className={styles.row}>
            <Reveal className={styles.rowText}>
              <span className={styles.kicker}>Your storefront</span>
              <h3 className={styles.featTitle}>A storefront that replaces your website.</h3>
              <p className={styles.featDesc}>
                Every shop gets a fast, beautiful, fully-branded store — your hours, your services,
                your range. It becomes your website, without the web designer or the monthly agency bill.
              </p>
              <ul className={styles.featList}>
                <li>
                  <span className={styles.tick}>
                    <Check size={12} strokeWidth={3} />
                  </span>
                  Built automatically from your shop profile
                </li>
                <li>
                  <span className={styles.tick}>
                    <Check size={12} strokeWidth={3} />
                  </span>
                  Customise every section, your way
                </li>
                <li>
                  <span className={styles.tick}>
                    <Check size={12} strokeWidth={3} />
                  </span>
                  Bookings, brands, reviews & delivery built in
                </li>
              </ul>
              <Link href={STORE_URL} className={styles.textLink}>
                See a live storefront
                <ArrowRight size={15} />
              </Link>
            </Reveal>
            <Reveal delay={0.1} className={styles.rowMedia}>
              <div className={styles.frame}>
                <Image
                  src="/home/storefront.jpg"
                  alt="A Yellow Jersey storefront for Ashburton Cycles"
                  width={2000}
                  height={1250}
                  sizes="(max-width: 860px) 92vw, 600px"
                />
                <span className={styles.frameTint} aria-hidden />
              </div>
            </Reveal>
          </div>
        </section>

        {/* feature: marketplace (reversed) */}
        <section className={`${styles.container} ${styles.section}`}>
          <div className={`${styles.row} ${styles.rowReverse}`}>
            <Reveal className={styles.rowText}>
              <span className={styles.kicker}>The marketplace</span>
              <h3 className={styles.featTitle}>Get found by riders across the country.</h3>
              <p className={styles.featDesc}>
                Your inventory doesn&rsquo;t just sit on your storefront — it appears across the Yellow
                Jersey marketplace, in front of riders actively shopping for their next bike.
              </p>
              <ul className={styles.featList}>
                <li>
                  <span className={styles.tick}>
                    <Check size={12} strokeWidth={3} />
                  </span>
                  New & used, parts & apparel
                </li>
                <li>
                  <span className={styles.tick}>
                    <Check size={12} strokeWidth={3} />
                  </span>
                  Local pickup or nationwide delivery
                </li>
                <li>
                  <span className={styles.tick}>
                    <Check size={12} strokeWidth={3} />
                  </span>
                  A personalised feed that surfaces your stock
                </li>
              </ul>
              <Link href="/marketplace" className={styles.textLink}>
                Browse the marketplace
                <ArrowRight size={15} />
              </Link>
            </Reveal>
            <Reveal delay={0.1} className={styles.rowMedia}>
              <div className={styles.frame}>
                <Image
                  src="/home/marketplace.jpg"
                  alt="The Yellow Jersey marketplace"
                  width={2000}
                  height={1250}
                  sizes="(max-width: 860px) 92vw, 600px"
                />
                <span className={styles.frameTint} aria-hidden />
              </div>
            </Reveal>
          </div>
        </section>

        {/* feature: listings */}
        <section className={`${styles.container} ${styles.section}`}>
          <div className={styles.row}>
            <Reveal className={styles.rowText}>
              <span className={styles.kicker}>Listings</span>
              <h3 className={styles.featTitle}>Listings that do the selling for you.</h3>
              <p className={styles.featDesc}>
                Yellow Jersey finds the right photos and writes the descriptions, so every product —
                from a flagship road bike to a box of tubes — goes live looking its best.
              </p>
              <ul className={styles.featList}>
                <li>
                  <span className={styles.tick}>
                    <Check size={12} strokeWidth={3} />
                  </span>
                  AI-sourced product imagery
                </li>
                <li>
                  <span className={styles.tick}>
                    <Check size={12} strokeWidth={3} />
                  </span>
                  Descriptions & specs written for you
                </li>
                <li>
                  <span className={styles.tick}>
                    <Check size={12} strokeWidth={3} />
                  </span>
                  Offers, questions & secure checkout
                </li>
              </ul>
              <Link href={PRODUCT_URL} className={styles.textLink}>
                See an example listing
                <ArrowRight size={15} />
              </Link>
            </Reveal>
            <Reveal delay={0.1} className={styles.rowMedia}>
              <div className={styles.frame}>
                <Image
                  src="/home/product.jpg"
                  alt="A Yellow Jersey product listing for an Orbea Orca road bike"
                  width={2000}
                  height={1250}
                  sizes="(max-width: 860px) 92vw, 600px"
                />
                <span className={styles.frameTint} aria-hidden />
              </div>
            </Reveal>
          </div>
        </section>

        {/* capabilities */}
        <section className={`${styles.container} ${styles.section}`}>
          <Reveal>
            <div className={styles.sectionHeadCenter}>
              <span className={styles.kicker}>Runs your whole shop</span>
              <h2 className={styles.h2}>Plus everything a modern shop runs on.</h2>
              <p className={styles.sectionLede} style={{ margin: "16px auto 0" }}>
                Yellow Jersey connects to the tools you already use and quietly handles the admin.
              </p>
            </div>
          </Reveal>
          <div className={styles.capWrap}>
            <div className={styles.capGrid}>
              {CAPS.map((c, i) => (
                <Reveal key={c.title} delay={0.05 * i}>
                  <div className={styles.cap}>
                    <span className={styles.capIcon}>
                      <c.icon size={19} strokeWidth={2} />
                    </span>
                    <h4 className={styles.capTitle}>{c.title}</h4>
                    <p className={styles.capDesc}>{c.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* riders */}
        <section id="riders" className={`${styles.container} ${styles.section}`} style={{ paddingTop: 0 }}>
          <Reveal>
            <div className={styles.riders}>
              <div className={styles.ridersGrid}>
                <div>
                  <h2 className={styles.ridersTitle}>
                    For everyone who <em>rides</em>.
                  </h2>
                  <p className={styles.ridersLede}>
                    Yellow Jersey isn&rsquo;t just for shops. It&rsquo;s the best place to find your next
                    bike — from real local shops who know bikes, not faceless warehouses.
                  </p>
                  <Link href="/marketplace" className={`${styles.btnYellow} ${styles.btnLg}`}>
                    Explore the marketplace
                    <ArrowRight size={17} />
                  </Link>
                </div>
                <div className={styles.ridersList}>
                  {RIDERS.map((r) => (
                    <div key={r.title} className={styles.riderItem}>
                      <span className={styles.capIcon}>
                        <r.icon size={19} strokeWidth={2} />
                      </span>
                      <div>
                        <p className={styles.riderItemTitle}>{r.title}</p>
                        <p className={styles.riderItemDesc}>{r.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* closing cta */}
        <section className={`${styles.container} ${styles.cta}`}>
          <Reveal>
            <h2 className={styles.ctaTitle}>
              Ready to wear <span className={styles.mark}>yellow</span>?
            </h2>
          </Reveal>
          <Reveal delay={0.06}>
            <p className={styles.ctaLede}>Put your shop in the lead — or find your next ride.</p>
          </Reveal>
          <Reveal delay={0.12}>
            <div className={styles.ctaBtns}>
              <Link href="/login" className={`${styles.btnDark} ${styles.btnLg}`}>
                List your shop
                <ArrowUpRight size={17} />
              </Link>
              <Link href="/marketplace" className={`${styles.btnGhost} ${styles.btnLg}`}>
                Explore the marketplace
                <ArrowRight size={17} />
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      {/* footer */}
      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footTop}>
            <div className={styles.footBrand}>
              <Logo />
              <p className={styles.footBlurb}>
                The storefront and marketplace for local bike shops. Made in Melbourne.
              </p>
            </div>
            <div className={styles.footCols}>
              <div className={styles.footCol}>
                <h4>Marketplace</h4>
                <Link href="/marketplace">Browse all</Link>
                <Link href="/marketplace/new-products">New bikes</Link>
                <Link href="/marketplace/used-products">Used bikes</Link>
                <Link href="/for-you">For You</Link>
              </div>
              <div className={styles.footCol}>
                <h4>For shops</h4>
                <Link href="/login">List your shop</Link>
                <Link href="/login">Sign in</Link>
                <Link href={STORE_URL}>See a storefront</Link>
              </div>
            </div>
          </div>
          <div className={styles.footBottom}>
            <span className={styles.footMeta}>© {new Date().getFullYear()} Yellow Jersey</span>
            <span className={styles.footMeta}>Made in Melbourne 🇦🇺</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
