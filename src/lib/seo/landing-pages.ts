/**
 * SEO landing page definitions — keyword-targeted hubs that drive organic
 * traffic to Yellow Jersey. Each page gets unique copy, live inventory, FAQs
 * and internal links. Served at /guides/[slug].
 */

export interface LandingFaq {
  q: string;
  a: string;
}

export interface LandingProductFilters {
  location?: string;
  searchTerms?: string[];
  listingType?: "private_listing" | "store_inventory";
  level1?: string;
  maxPrice?: number;
}

export type LandingIntent = "buy" | "sell" | "browse";

export interface LandingPage {
  slug: string;
  /** Meta title — kept under ~60 chars where possible. */
  title: string;
  /** Meta description — kept under ~155 chars. */
  description: string;
  /** Eyebrow label above the H1. */
  eyebrow: string;
  /** H1 headline. */
  headline: string;
  /** Hero paragraph — unique per page to avoid duplicate-content penalties. */
  intro: string;
  /** Product grid section heading. */
  gridHeading: string;
  /** Shown when national fallback is used instead of local stock. */
  fallbackGridHeading?: string;
  intent: LandingIntent;
  filters: LandingProductFilters;
  /** State code for Melbourne pages — triggers local → national fallback. */
  location?: string;
  /** Primary CTA href. */
  ctaHref: string;
  ctaLabel: string;
  /** Secondary CTA. */
  secondaryHref?: string;
  secondaryLabel?: string;
  /** Marketplace deep-link for "see all". */
  browseHref: string;
  browseLabel: string;
  faqs: LandingFaq[];
  /** Related guide slugs for internal linking. */
  related: string[];
}

export const LANDING_PAGES: LandingPage[] = [
  // ── Melbourne — general ──────────────────────────────────────────────
  {
    slug: "bikes-for-sale-melbourne",
    title: "Bikes for sale in Melbourne",
    description:
      "Browse new and used bikes for sale in Melbourne on Yellow Jersey — road, mountain, gravel and e-bikes from local riders and bike shops with secure checkout.",
    eyebrow: "Melbourne · Bikes for sale",
    headline: "Bikes for sale in Melbourne.",
    intro:
      "Whether you're upgrading your road rig, hunting a weekend trail bike or kitting out the family, Yellow Jersey brings Melbourne's cycling marketplace together in one place. Buy from local riders and independent bike shops with secure payment, delivery or pickup.",
    gridHeading: "Bikes for sale in Melbourne",
    fallbackGridHeading: "Bikes available across Australia",
    intent: "buy",
    filters: { location: "VIC" },
    location: "VIC",
    ctaHref: "/marketplace",
    ctaLabel: "Browse marketplace",
    secondaryHref: "/sell-your-bike",
    secondaryLabel: "Sell your bike",
    browseHref: "/marketplace?search=melbourne",
    browseLabel: "See all Melbourne bikes",
    faqs: [
      {
        q: "Where can I buy a bike in Melbourne?",
        a: "Yellow Jersey lists new and used bikes from Melbourne riders and local bike shops. Browse listings, pay securely through Stripe and choose delivery or local pickup.",
      },
      {
        q: "Can I get a bike delivered in Melbourne?",
        a: "Yes. Many sellers offer Uber delivery across Melbourne, or you can arrange local pickup directly through the listing.",
      },
    ],
    related: ["used-bikes-melbourne", "road-bikes-melbourne", "bike-marketplace-melbourne"],
  },
  {
    slug: "used-bikes-melbourne",
    title: "Used bikes for sale in Melbourne",
    description:
      "Buy quality used and second-hand bikes in Melbourne on Yellow Jersey. Road, MTB, gravel and e-bikes from local riders with secure payment and pickup or delivery.",
    eyebrow: "Melbourne · Used bikes",
    headline: "Used bikes for sale in Melbourne.",
    intro:
      "Pre-loved doesn't mean compromised. Melbourne riders list quality used road bikes, mountain bikes, gravel rigs and e-bikes on Yellow Jersey every week — with honest descriptions, real photos and secure checkout instead of risky cash meet-ups.",
    gridHeading: "Used bikes in Melbourne",
    fallbackGridHeading: "Used bikes available across Australia",
    intent: "buy",
    filters: { location: "VIC", listingType: "private_listing" },
    location: "VIC",
    ctaHref: "/marketplace/used-products",
    ctaLabel: "Browse used bikes",
    secondaryHref: "/sell-your-bike",
    secondaryLabel: "Sell your used bike",
    browseHref: "/marketplace/used-products",
    browseLabel: "See all used listings",
    faqs: [
      {
        q: "Is it safe to buy a used bike online in Melbourne?",
        a: "Yellow Jersey uses Stripe for secure payments and connects you with verified riders — not anonymous classifieds accounts. You can also inspect the bike at pickup before completing the sale.",
      },
      {
        q: "What used bikes are popular in Melbourne?",
        a: "Road bikes and gravel bikes are always in demand around Melbourne's bay and hills loops. Mountain bikes and e-bikes are popular too, especially for commuters in the inner north and east.",
      },
    ],
    related: ["second-hand-bikes-melbourne", "road-bikes-melbourne", "sell-bike-melbourne"],
  },
  {
    slug: "second-hand-bikes-melbourne",
    title: "Second hand bikes Melbourne",
    description:
      "Find second hand bikes in Melbourne on Yellow Jersey — quality pre-owned road, MTB, gravel and e-bikes from local cyclists with secure payment and delivery.",
    eyebrow: "Melbourne · Second hand",
    headline: "Second hand bikes in Melbourne.",
    intro:
      "Skip the Gumtree scroll. Yellow Jersey is where Melbourne cyclists buy and sell second hand bikes — with AI-written listings, fair pricing and a checkout that actually works. Road, mountain, gravel and e-bikes from riders who know what they've got.",
    gridHeading: "Second hand bikes in Melbourne",
    fallbackGridHeading: "Second hand bikes across Australia",
    intent: "buy",
    filters: { location: "VIC", listingType: "private_listing" },
    location: "VIC",
    ctaHref: "/marketplace/used-products",
    ctaLabel: "Shop second hand bikes",
    browseHref: "/marketplace?search=used+bike+melbourne",
    browseLabel: "Browse all second hand",
    faqs: [
      {
        q: "How is Yellow Jersey different from Gumtree for second hand bikes?",
        a: "Listings are built for cyclists — with proper specs, condition ratings and secure Stripe payments. No endless 'is this still available?' messages.",
      },
    ],
    related: ["used-bikes-melbourne", "cheap-bikes-melbourne", "buy-bike-melbourne"],
  },
  {
    slug: "bike-marketplace-melbourne",
    title: "Bike marketplace Melbourne",
    description:
      "Melbourne's bike marketplace for new and used bikes, parts and gear. Buy and sell on Yellow Jersey with secure payment, local pickup and delivery across Victoria.",
    eyebrow: "Melbourne · Marketplace",
    headline: "Melbourne's bike marketplace.",
    intro:
      "Yellow Jersey is the marketplace built for Melbourne cyclists — connecting riders, resellers and independent bike shops in one trusted place. Browse new shop stock and used private listings, all with secure checkout and delivery options.",
    gridHeading: "Latest on the Melbourne marketplace",
    fallbackGridHeading: "Latest across the marketplace",
    intent: "browse",
    filters: { location: "VIC" },
    location: "VIC",
    ctaHref: "/marketplace",
    ctaLabel: "Explore marketplace",
    secondaryHref: "/sell-your-bike",
    secondaryLabel: "Sell on Yellow Jersey",
    browseHref: "/marketplace",
    browseLabel: "Browse everything",
    faqs: [
      {
        q: "What is Yellow Jersey?",
        a: "Yellow Jersey is an Australian bike marketplace where you can buy new and used bikes, parts and apparel from local riders and independent bike shops — with secure payment and delivery built in.",
      },
      {
        q: "Can Melbourne bike shops sell on Yellow Jersey?",
        a: "Yes. Independent bike shops across Melbourne list their inventory on Yellow Jersey alongside private sellers, giving buyers one place to shop local.",
      },
    ],
    related: ["bikes-for-sale-melbourne", "bike-shops-melbourne-online", "cycling-marketplace-australia"],
  },
  {
    slug: "buy-bike-melbourne",
    title: "Buy a bike in Melbourne",
    description:
      "Buy a bike in Melbourne on Yellow Jersey — new and used road, mountain, gravel and e-bikes from local shops and riders with secure payment and delivery.",
    eyebrow: "Melbourne · Buy a bike",
    headline: "Buy a bike in Melbourne.",
    intro:
      "Finding the right bike in Melbourne shouldn't mean trawling five different websites. Yellow Jersey brings together listings from local cyclists and independent shops — filter by type, compare prices and buy with secure checkout, delivery or pickup.",
    gridHeading: "Bikes to buy in Melbourne",
    fallbackGridHeading: "Bikes available to buy",
    intent: "buy",
    filters: { location: "VIC" },
    location: "VIC",
    ctaHref: "/marketplace",
    ctaLabel: "Start browsing",
    browseHref: "/marketplace/new-products",
    browseLabel: "Browse new bikes",
    faqs: [
      {
        q: "Should I buy a new or used bike in Melbourne?",
        a: "It depends on your budget and riding goals. New bikes from local shops come with warranty and setup. Used bikes on Yellow Jersey offer great value from riders upgrading their kit.",
      },
    ],
    related: ["new-bikes-melbourne", "used-bikes-melbourne", "commuter-bikes-melbourne"],
  },
  {
    slug: "sell-bike-melbourne",
    title: "Sell your bike in Melbourne",
    description:
      "Sell your bike in Melbourne on Yellow Jersey. List free in two minutes, reach local riders, and get paid securely through Stripe with delivery or pickup.",
    eyebrow: "Melbourne · Sell your bike",
    headline: "Sell your bike in Melbourne.",
    intro:
      "Got a bike gathering dust in the garage? List it on Yellow Jersey and reach Melbourne riders actively searching for what you're selling. Snap a photo, our AI writes the listing, and you get paid securely — no Gumtree lowballers.",
    gridHeading: "Recently listed in Melbourne",
    fallbackGridHeading: "Recently listed across Australia",
    intent: "sell",
    filters: { location: "VIC", listingType: "private_listing" },
    location: "VIC",
    ctaHref: "/marketplace/sell",
    ctaLabel: "List your bike",
    secondaryHref: "/sell-your-bike",
    secondaryLabel: "How selling works",
    browseHref: "/marketplace/used-products",
    browseLabel: "See what others are selling",
    faqs: [
      {
        q: "How much does it cost to sell a bike in Melbourne?",
        a: "Listing is free. You only pay a small fee when your bike actually sells, and you'll see the exact amount before confirming.",
      },
      {
        q: "How quickly do bikes sell in Melbourne?",
        a: "Popular road and mountain bikes in good condition often sell within days. Price it fairly using our suggested pricing and include clear photos for the best results.",
      },
    ],
    related: ["used-bikes-melbourne", "sell-used-bike-online-australia", "bikes-for-sale-melbourne"],
  },

  // ── Melbourne — by bike type ─────────────────────────────────────────
  {
    slug: "road-bikes-melbourne",
    title: "Road bikes for sale in Melbourne",
    description:
      "Buy used and new road bikes in Melbourne on Yellow Jersey. Race, endurance and aero bikes from local riders and shops with secure payment and delivery.",
    eyebrow: "Melbourne · Road bikes",
    headline: "Road bikes for sale in Melbourne.",
    intro:
      "From Beach Road loops to hill climbs in the Dandenongs, Melbourne is a road cycling city. Find your next race bike, endurance rig or winter trainer on Yellow Jersey — new shop stock and quality used listings from local riders.",
    gridHeading: "Road bikes in Melbourne",
    fallbackGridHeading: "Road bikes across Australia",
    intent: "buy",
    filters: { location: "VIC", searchTerms: ["road"] },
    location: "VIC",
    ctaHref: "/marketplace?search=road+bike",
    ctaLabel: "Browse road bikes",
    browseHref: "/marketplace?search=road+bike+melbourne",
    browseLabel: "See all road bikes",
    faqs: [
      {
        q: "What size road bike do I need?",
        a: "Check the manufacturer's size chart against your height and inseam. Most listings on Yellow Jersey include frame size in the description — message the seller if you're unsure.",
      },
    ],
    related: ["gravel-bikes-melbourne", "triathlon-bikes-melbourne", "used-bikes-melbourne"],
  },
  {
    slug: "mountain-bikes-melbourne",
    title: "Mountain bikes for sale in Melbourne",
    description:
      "Buy new and used mountain bikes in Melbourne on Yellow Jersey. Trail, enduro and XC MTBs from local riders and shops with secure checkout and delivery.",
    eyebrow: "Melbourne · Mountain bikes",
    headline: "Mountain bikes for sale in Melbourne.",
    intro:
      "Lysterfield, Smiths Gully, You Yangs — Melbourne has brilliant trail riding on its doorstep. Shop new and used mountain bikes on Yellow Jersey, from hardtails to full-suspension enduro rigs, listed by riders and local MTB shops.",
    gridHeading: "Mountain bikes in Melbourne",
    fallbackGridHeading: "Mountain bikes across Australia",
    intent: "buy",
    filters: { location: "VIC", searchTerms: ["mountain", "mtb"] },
    location: "VIC",
    ctaHref: "/marketplace?search=mountain+bike",
    ctaLabel: "Browse MTBs",
    browseHref: "/marketplace?search=mountain+bike",
    browseLabel: "See all mountain bikes",
    faqs: [
      {
        q: "Where can I ride mountain bikes near Melbourne?",
        a: "Popular spots include Lysterfield Lake Park, Smiths Gully, the You Yangs and Forrest in the Otways — all within a few hours of the city.",
      },
    ],
    related: ["gravel-bikes-melbourne", "used-bikes-melbourne", "bike-parts-melbourne"],
  },
  {
    slug: "gravel-bikes-melbourne",
    title: "Gravel bikes for sale in Melbourne",
    description:
      "Buy gravel and adventure bikes in Melbourne on Yellow Jersey. Used and new all-road bikes from local cyclists and shops with secure payment and delivery.",
    eyebrow: "Melbourne · Gravel bikes",
    headline: "Gravel bikes for sale in Melbourne.",
    intro:
      "Gravel riding has exploded around Melbourne — from the Bay Trail to back roads in the Yarra Valley. Find your next gravel or adventure bike on Yellow Jersey, with listings from local riders who know the terrain.",
    gridHeading: "Gravel bikes in Melbourne",
    fallbackGridHeading: "Gravel bikes across Australia",
    intent: "buy",
    filters: { location: "VIC", searchTerms: ["gravel", "cyclocross", "adventure"] },
    location: "VIC",
    ctaHref: "/marketplace?search=gravel+bike",
    ctaLabel: "Browse gravel bikes",
    browseHref: "/marketplace?search=gravel",
    browseLabel: "See all gravel bikes",
    faqs: [
      {
        q: "What's the difference between a gravel bike and a road bike?",
        a: "Gravel bikes have wider tyre clearance, more relaxed geometry and often disc brakes — making them better on unsealed roads and light trails while still fast on tarmac.",
      },
    ],
    related: ["road-bikes-melbourne", "mountain-bikes-melbourne", "commuter-bikes-melbourne"],
  },
  {
    slug: "e-bikes-melbourne",
    title: "E-bikes for sale in Melbourne",
    description:
      "Buy new and used e-bikes in Melbourne on Yellow Jersey. Electric road, commuter and mountain e-bikes with secure payment and delivery across Victoria.",
    eyebrow: "Melbourne · E-bikes",
    headline: "E-bikes for sale in Melbourne.",
    intro:
      "Beat the hills, skip the sweat. Melbourne commuters and weekend riders are switching to e-bikes in droves. Browse new and used electric bikes on Yellow Jersey — from city commuters to e-MTBs — with secure checkout and local delivery.",
    gridHeading: "E-bikes in Melbourne",
    fallbackGridHeading: "E-bikes across Australia",
    intent: "buy",
    filters: { location: "VIC", searchTerms: ["e-bike", "ebike", "electric"] },
    location: "VIC",
    ctaHref: "/marketplace?search=e-bike",
    ctaLabel: "Browse e-bikes",
    browseHref: "/marketplace?search=electric+bike",
    browseLabel: "See all e-bikes",
    faqs: [
      {
        q: "Are e-bikes legal on Melbourne bike paths?",
        a: "Yes. Pedal-assist e-bikes (max 250W, cut-off at 25 km/h) are legal on bike paths and roads in Victoria. Always check the motor specs on the listing.",
      },
    ],
    related: ["commuter-bikes-melbourne", "used-bikes-melbourne", "e-bikes-for-sale-australia"],
  },
  {
    slug: "new-bikes-melbourne",
    title: "New bikes for sale in Melbourne",
    description:
      "Shop new bikes from Melbourne bike shops on Yellow Jersey. Current-season road, MTB, gravel and e-bikes with secure online checkout and delivery.",
    eyebrow: "Melbourne · New bikes",
    headline: "New bikes from Melbourne shops.",
    intro:
      "Browse current-season bikes from independent Melbourne bike shops — all in one marketplace. New road, mountain, gravel and e-bikes with proper warranty, professional setup and secure online checkout through Yellow Jersey.",
    gridHeading: "New bikes from Melbourne shops",
    fallbackGridHeading: "New bikes from Australian shops",
    intent: "buy",
    filters: { location: "VIC", listingType: "store_inventory" },
    location: "VIC",
    ctaHref: "/marketplace/new-products",
    ctaLabel: "Shop new bikes",
    browseHref: "/marketplace/new-products",
    browseLabel: "See all new stock",
    faqs: [
      {
        q: "Do new bikes from shops come with warranty?",
        a: "Yes. Bikes purchased from verified bike shops on Yellow Jersey include the manufacturer's warranty and are set up by qualified mechanics before dispatch.",
      },
    ],
    related: ["bike-shops-melbourne-online", "road-bikes-melbourne", "buy-bike-melbourne"],
  },
  {
    slug: "commuter-bikes-melbourne",
    title: "Commuter bikes Melbourne",
    description:
      "Buy commuter and city bikes in Melbourne on Yellow Jersey. Hybrid, flat-bar and urban bikes for getting around Melbourne with secure payment and delivery.",
    eyebrow: "Melbourne · Commuter bikes",
    headline: "Commuter bikes for Melbourne streets.",
    intro:
      "Whether you're riding to work along the Yarra, through Fitzroy or across the West Gate, a good commuter bike makes all the difference. Shop hybrid, flat-bar and urban bikes on Yellow Jersey — new and used, with delivery across Melbourne.",
    gridHeading: "Commuter bikes in Melbourne",
    fallbackGridHeading: "Commuter bikes across Australia",
    intent: "buy",
    filters: { location: "VIC", searchTerms: ["commuter", "hybrid", "city", "urban"] },
    location: "VIC",
    ctaHref: "/marketplace?search=commuter+bike",
    ctaLabel: "Browse commuters",
    browseHref: "/marketplace?search=hybrid+bike",
    browseLabel: "See all commuter bikes",
    faqs: [
      {
        q: "What's the best commuter bike for Melbourne?",
        a: "A hybrid or flat-bar bike with puncture-resistant tyres and mudguard mounts is ideal for Melbourne's mix of bike paths and city streets. E-bikes are great if your route has hills.",
      },
    ],
    related: ["e-bikes-melbourne", "fixie-bikes-melbourne", "cheap-bikes-melbourne"],
  },
  {
    slug: "kids-bikes-melbourne",
    title: "Kids bikes for sale Melbourne",
    description:
      "Buy kids and youth bikes in Melbourne on Yellow Jersey. Children's balance, BMX and mountain bikes from local families and shops with secure checkout.",
    eyebrow: "Melbourne · Kids bikes",
    headline: "Kids bikes for sale in Melbourne.",
    intro:
      "They grow out of them fast — so buying pre-loved makes sense. Find kids, youth and junior bikes on Yellow Jersey from Melbourne families and local shops. Balance bikes, BMX, mountain bikes and everything in between.",
    gridHeading: "Kids bikes in Melbourne",
    fallbackGridHeading: "Kids bikes across Australia",
    intent: "buy",
    filters: { location: "VIC", searchTerms: ["kids", "child", "youth", "junior", "balance"] },
    location: "VIC",
    ctaHref: "/marketplace?search=kids+bike",
    ctaLabel: "Browse kids bikes",
    browseHref: "/marketplace?search=youth+bike",
    browseLabel: "See all kids bikes",
    faqs: [
      {
        q: "What size kids bike does my child need?",
        a: "Kids bike sizing is based on wheel diameter (12\", 16\", 20\", 24\") and your child's height. Check the listing for wheel size and compare against manufacturer charts.",
      },
    ],
    related: ["cheap-bikes-melbourne", "used-bikes-melbourne", "bikes-for-sale-melbourne"],
  },
  {
    slug: "womens-bikes-melbourne",
    title: "Women's bikes for sale Melbourne",
    description:
      "Shop women's and unisex bikes in Melbourne on Yellow Jersey. Road, mountain, commuter and e-bikes sized and specced for women riders with secure checkout.",
    eyebrow: "Melbourne · Women's bikes",
    headline: "Women's bikes for sale in Melbourne.",
    intro:
      "From road racing to weekend trail rides, find bikes that fit and perform on Yellow Jersey. Browse women's-specific and unisex frames from Melbourne riders and local shops — with proper sizing info in every listing.",
    gridHeading: "Women's bikes in Melbourne",
    fallbackGridHeading: "Women's bikes across Australia",
    intent: "buy",
    filters: { location: "VIC", searchTerms: ["women", "womens", "ladies"] },
    location: "VIC",
    ctaHref: "/marketplace?search=womens+bike",
    ctaLabel: "Browse women's bikes",
    browseHref: "/marketplace?search=women+bike",
    browseLabel: "See all listings",
    faqs: [
      {
        q: "Do I need a women's-specific bike?",
        a: "Not always — many riders are fine on unisex frames. Women's-specific bikes typically have shorter reach, narrower handlebars and women's saddles. Check geometry charts and test ride if possible.",
      },
    ],
    related: ["road-bikes-melbourne", "commuter-bikes-melbourne", "used-bikes-melbourne"],
  },
  {
    slug: "triathlon-bikes-melbourne",
    title: "Triathlon & TT bikes Melbourne",
    description:
      "Buy triathlon and time trial bikes in Melbourne on Yellow Jersey. Aero TT and tri bikes from local riders and shops with secure payment and delivery.",
    eyebrow: "Melbourne · Triathlon",
    headline: "Triathlon and TT bikes in Melbourne.",
    intro:
      "Chasing a PB at Ironman 70.3 Geelong or racing the clock on Beach Road? Find triathlon and time trial bikes on Yellow Jersey — aero frames, deep-section wheels and race-ready builds from Melbourne's tri community.",
    gridHeading: "Triathlon bikes in Melbourne",
    fallbackGridHeading: "Triathlon bikes across Australia",
    intent: "buy",
    filters: { location: "VIC", searchTerms: ["triathlon", "time trial", "aero", "tt bike"] },
    location: "VIC",
    ctaHref: "/marketplace?search=triathlon+bike",
    ctaLabel: "Browse tri bikes",
    browseHref: "/marketplace?search=tt+bike",
    browseLabel: "See all TT bikes",
    faqs: [
      {
        q: "Should I buy a triathlon bike or a road bike with clip-ons?",
        a: "A dedicated tri/TT bike offers better aerodynamics for racing. A road bike with clip-on aerobars is more versatile for training and group rides. It depends on how serious your racing is.",
      },
    ],
    related: ["road-bikes-melbourne", "bike-parts-melbourne", "used-bikes-melbourne"],
  },
  {
    slug: "fixie-bikes-melbourne",
    title: "Fixie & single speed bikes Melbourne",
    description:
      "Buy fixie and single speed bikes in Melbourne on Yellow Jersey. Track, fixie and SS bikes from local riders with secure payment and delivery.",
    eyebrow: "Melbourne · Fixies",
    headline: "Fixie and single speed bikes in Melbourne.",
    intro:
      "Clean lines, no gears, pure Melbourne street style. Browse fixie, track and single speed bikes on Yellow Jersey — from classic steel track frames to modern city builds listed by local riders.",
    gridHeading: "Fixies in Melbourne",
    fallbackGridHeading: "Fixies across Australia",
    intent: "buy",
    filters: { location: "VIC", searchTerms: ["fixie", "fixed", "single speed", "track"] },
    location: "VIC",
    ctaHref: "/marketplace?search=fixie",
    ctaLabel: "Browse fixies",
    browseHref: "/marketplace?search=single+speed",
    browseLabel: "See all single speeds",
    faqs: [
      {
        q: "Are fixies legal on Melbourne roads?",
        a: "Yes, but your bike must have at least one working brake under Victorian road rules. Many fixies are sold with a front brake fitted or included.",
      },
    ],
    related: ["commuter-bikes-melbourne", "used-bikes-melbourne", "cheap-bikes-melbourne"],
  },

  // ── Melbourne — parts, gear, budget, shops ───────────────────────────
  {
    slug: "bike-parts-melbourne",
    title: "Bike parts for sale Melbourne",
    description:
      "Buy bike parts and components in Melbourne on Yellow Jersey. Wheels, groupsets, frames and components from local riders and shops with secure checkout.",
    eyebrow: "Melbourne · Parts",
    headline: "Bike parts for sale in Melbourne.",
    intro:
      "Upgrading your groupset, hunting a set of carbon wheels or building a new frame? Yellow Jersey lists bike parts and components from Melbourne riders and shops — with secure payment and delivery across the city.",
    gridHeading: "Bike parts in Melbourne",
    fallbackGridHeading: "Bike parts across Australia",
    intent: "buy",
    filters: { location: "VIC", level1: "Parts" },
    location: "VIC",
    ctaHref: "/marketplace?search=bike+parts",
    ctaLabel: "Browse parts",
    browseHref: "/marketplace?search=wheels",
    browseLabel: "See all components",
    faqs: [
      {
        q: "Can I buy individual components on Yellow Jersey?",
        a: "Yes. Riders and shops list wheels, groupsets, frames, handlebars and other components. Filter by category or search for the specific part you need.",
      },
    ],
    related: ["cycling-gear-melbourne", "mountain-bikes-melbourne", "used-bikes-melbourne"],
  },
  {
    slug: "cycling-gear-melbourne",
    title: "Cycling gear & apparel Melbourne",
    description:
      "Shop cycling apparel and gear in Melbourne on Yellow Jersey. Jerseys, bibs, helmets and accessories from local riders and bike shops with secure checkout.",
    eyebrow: "Melbourne · Cycling gear",
    headline: "Cycling gear and apparel in Melbourne.",
    intro:
      "Kit out your next ride with cycling apparel and accessories from Melbourne riders and shops. Jerseys, bibs, helmets, shoes and more on Yellow Jersey — often barely used at a fraction of retail.",
    gridHeading: "Cycling gear in Melbourne",
    fallbackGridHeading: "Cycling gear across Australia",
    intent: "buy",
    filters: { location: "VIC", level1: "Apparel" },
    location: "VIC",
    ctaHref: "/marketplace?search=cycling+jersey",
    ctaLabel: "Browse cycling gear",
    browseHref: "/marketplace?search=cycling+apparel",
    browseLabel: "See all apparel",
    faqs: [
      {
        q: "Can I buy used cycling kit on Yellow Jersey?",
        a: "Yes. Many Melbourne riders sell lightly used jerseys, bibs and shoes when they upgrade. Check condition ratings and photos before buying.",
      },
    ],
    related: ["bike-parts-melbourne", "bikes-for-sale-melbourne", "bike-marketplace-melbourne"],
  },
  {
    slug: "cheap-bikes-melbourne",
    title: "Cheap bikes for sale Melbourne",
    description:
      "Find affordable bikes in Melbourne on Yellow Jersey. Budget road, commuter and mountain bikes under $1,500 from local riders with secure payment.",
    eyebrow: "Melbourne · Budget bikes",
    headline: "Affordable bikes in Melbourne.",
    intro:
      "You don't need to spend a fortune to get riding. Browse budget-friendly bikes on Yellow Jersey — quality used road, commuter and mountain bikes from Melbourne riders, many under $1,500 with secure checkout.",
    gridHeading: "Affordable bikes in Melbourne",
    fallbackGridHeading: "Affordable bikes across Australia",
    intent: "buy",
    filters: { location: "VIC", maxPrice: 1500 },
    location: "VIC",
    ctaHref: "/marketplace/used-products",
    ctaLabel: "Browse budget bikes",
    browseHref: "/marketplace?search=cheap+bike&maxPrice=1500",
    browseLabel: "See all under $1,500",
    faqs: [
      {
        q: "What's a good budget for a first bike in Melbourne?",
        a: "A solid used commuter or hybrid can be found for $300–$800. For a quality used road or mountain bike, budget $800–$1,500. Yellow Jersey's suggested pricing helps you spot fair deals.",
      },
    ],
    related: ["used-bikes-melbourne", "commuter-bikes-melbourne", "kids-bikes-melbourne"],
  },
  {
    slug: "bike-shops-melbourne-online",
    title: "Melbourne bike shops online",
    description:
      "Shop Melbourne bike shops online on Yellow Jersey. Browse new bikes, parts and gear from independent Melbourne retailers with secure checkout and delivery.",
    eyebrow: "Melbourne · Bike shops",
    headline: "Melbourne bike shops, online.",
    intro:
      "Support local. Yellow Jersey brings together inventory from independent Melbourne bike shops — so you can browse new bikes, parts and accessories from multiple stores in one place, with secure online checkout and delivery.",
    gridHeading: "New stock from Melbourne bike shops",
    fallbackGridHeading: "New stock from Australian bike shops",
    intent: "browse",
    filters: { location: "VIC", listingType: "store_inventory" },
    location: "VIC",
    ctaHref: "/marketplace/new-products",
    ctaLabel: "Shop local stores",
    browseHref: "/marketplace",
    browseLabel: "Browse all shops",
    faqs: [
      {
        q: "Which Melbourne bike shops sell on Yellow Jersey?",
        a: "Independent bike shops across Melbourne list their inventory on Yellow Jersey. Browse the marketplace to see current stock from local retailers near you.",
      },
      {
        q: "Can I click and collect from a Melbourne bike shop?",
        a: "Many shops offer local pickup. Check the listing for pickup location and contact the shop to arrange a collection time.",
      },
    ],
    related: ["new-bikes-melbourne", "bike-marketplace-melbourne", "local-bike-shop-online-australia"],
  },

  // ── Australia — marketplace & categories ─────────────────────────────
  {
    slug: "bike-marketplace-australia",
    title: "Bike marketplace Australia",
    description:
      "Australia's bike marketplace for new and used bikes, parts and gear. Buy and sell on Yellow Jersey with secure payment, delivery and local pickup nationwide.",
    eyebrow: "Australia · Marketplace",
    headline: "Australia's bike marketplace.",
    intro:
      "Yellow Jersey is the marketplace built for Australian cyclists. Buy new and used bikes, parts and apparel from riders and independent bike shops across the country — with secure Stripe checkout, Uber delivery and local pickup.",
    gridHeading: "Latest listings nationwide",
    intent: "browse",
    filters: {},
    ctaHref: "/marketplace",
    ctaLabel: "Explore marketplace",
    secondaryHref: "/sell-your-bike",
    secondaryLabel: "Sell your bike",
    browseHref: "/marketplace",
    browseLabel: "Browse everything",
    faqs: [
      {
        q: "Is Yellow Jersey available across Australia?",
        a: "Yes. Riders and bike shops list nationwide, and many sellers offer delivery across Australia through Uber or postal services.",
      },
    ],
    related: ["cycling-marketplace-australia", "used-bike-marketplace-australia", "bike-marketplace-melbourne"],
  },
  {
    slug: "cycling-marketplace-australia",
    title: "Cycling marketplace Australia",
    description:
      "The cycling marketplace for buying and selling bikes, parts and kit in Australia. Yellow Jersey — secure payments, real riders, delivery nationwide.",
    eyebrow: "Australia · Cycling",
    headline: "The cycling marketplace for Australia.",
    intro:
      "Built by cyclists, for cyclists. Yellow Jersey is where Australians buy and sell bikes, components and kit — without the hassle of classifieds. Secure payments, honest listings and delivery or pickup, from Hobart to Darwin.",
    gridHeading: "Trending across Australia",
    intent: "browse",
    filters: {},
    ctaHref: "/marketplace",
    ctaLabel: "Start browsing",
    browseHref: "/marketplace/used-products",
    browseLabel: "Browse used bikes",
    faqs: [
      {
        q: "What can I buy on Yellow Jersey?",
        a: "Road, mountain, gravel and e-bikes, plus wheels, groupsets, frames, jerseys, helmets and other cycling gear — new from shops or used from riders.",
      },
    ],
    related: ["bike-marketplace-australia", "buy-used-bike-online-australia", "local-bike-shop-online-australia"],
  },
  {
    slug: "used-bike-marketplace-australia",
    title: "Used bike marketplace Australia",
    description:
      "Australia's used bike marketplace. Buy and sell second-hand road, MTB, gravel and e-bikes on Yellow Jersey with secure payment and nationwide delivery.",
    eyebrow: "Australia · Used bikes",
    headline: "Australia's used bike marketplace.",
    intro:
      "The smarter way to buy and sell used bikes in Australia. Yellow Jersey connects riders who want to upgrade with riders looking for their next bike — with AI-written listings, secure Stripe payments and delivery built in.",
    gridHeading: "Used bikes just listed",
    intent: "buy",
    filters: { listingType: "private_listing" },
    ctaHref: "/marketplace/used-products",
    ctaLabel: "Browse used bikes",
    secondaryHref: "/sell-your-bike",
    secondaryLabel: "Sell your bike",
    browseHref: "/used-bikes",
    browseLabel: "Used bikes hub",
    faqs: [
      {
        q: "How is Yellow Jersey better than Facebook Marketplace for used bikes?",
        a: "Listings include proper specs and condition ratings, payments are secure through Stripe, and you're dealing with cyclists — not random accounts.",
      },
    ],
    related: ["buy-used-bike-online-australia", "sell-used-bike-online-australia", "used-bikes-melbourne"],
  },
  {
    slug: "buy-used-bike-online-australia",
    title: "Buy a used bike online Australia",
    description:
      "Buy a used bike online in Australia on Yellow Jersey. Quality second-hand road, MTB, gravel and e-bikes with secure payment and delivery nationwide.",
    eyebrow: "Australia · Buy used",
    headline: "Buy a used bike online in Australia.",
    intro:
      "Find your next bike without the classifieds gamble. Browse quality used road, mountain, gravel and e-bikes from riders across Australia on Yellow Jersey — with secure checkout, buyer protection and delivery to your door.",
    gridHeading: "Used bikes for sale",
    intent: "buy",
    filters: { listingType: "private_listing" },
    ctaHref: "/marketplace/used-products",
    ctaLabel: "Shop used bikes",
    browseHref: "/used-bikes",
    browseLabel: "Used bikes by city",
    faqs: [
      {
        q: "Can I get a used bike delivered anywhere in Australia?",
        a: "Many sellers offer Uber delivery in metro areas or postal shipping interstate. Check the listing for delivery options before buying.",
      },
    ],
    related: ["used-bike-marketplace-australia", "road-bikes-for-sale-australia", "used-bikes-melbourne"],
  },
  {
    slug: "sell-used-bike-online-australia",
    title: "Sell a used bike online Australia",
    description:
      "Sell your used bike online in Australia on Yellow Jersey. Free listing, AI-written descriptions, secure Stripe payments and delivery or pickup.",
    eyebrow: "Australia · Sell used",
    headline: "Sell your used bike online in Australia.",
    intro:
      "List your bike in two minutes and reach riders across Australia. Yellow Jersey handles the listing, pricing suggestion and secure payment — so you can skip the Gumtree hassle and actually get paid.",
    gridHeading: "What riders are selling",
    intent: "sell",
    filters: { listingType: "private_listing" },
    ctaHref: "/marketplace/sell",
    ctaLabel: "List your bike free",
    secondaryHref: "/sell-your-bike",
    secondaryLabel: "How it works",
    browseHref: "/marketplace/used-products",
    browseLabel: "See the marketplace",
    faqs: [
      {
        q: "How do I sell my used bike on Yellow Jersey?",
        a: "Take a photo of your bike, our AI identifies it and writes the listing. Set your price, choose delivery or pickup options, and publish — it takes about two minutes.",
      },
    ],
    related: ["sell-bike-melbourne", "used-bike-marketplace-australia", "sell-your-bike"],
  },
  {
    slug: "road-bikes-for-sale-australia",
    title: "Road bikes for sale Australia",
    description:
      "Buy new and used road bikes across Australia on Yellow Jersey. Race, endurance and aero bikes from riders and shops with secure payment and delivery.",
    eyebrow: "Australia · Road bikes",
    headline: "Road bikes for sale across Australia.",
    intro:
      "From crit racing to long-distance sportives, find your next road bike on Yellow Jersey. Browse new shop stock and quality used listings from riders across Australia — with secure checkout and nationwide delivery.",
    gridHeading: "Road bikes for sale",
    intent: "buy",
    filters: { searchTerms: ["road"] },
    ctaHref: "/marketplace?search=road+bike",
    ctaLabel: "Browse road bikes",
    browseHref: "/marketplace?search=road+bike",
    browseLabel: "See all road bikes",
    faqs: [
      {
        q: "Should I buy a carbon or aluminium road bike?",
        a: "Carbon is lighter and absorbs more vibration, but aluminium frames offer excellent value. Many used carbon bikes on Yellow Jersey are priced similarly to new alloy frames.",
      },
    ],
    related: ["road-bikes-melbourne", "gravel-bikes-australia", "mountain-bikes-australia"],
  },
  {
    slug: "mountain-bikes-australia",
    title: "Mountain bikes for sale Australia",
    description:
      "Buy new and used mountain bikes across Australia on Yellow Jersey. Trail, enduro and XC MTBs from riders and shops with secure checkout and delivery.",
    eyebrow: "Australia · Mountain bikes",
    headline: "Mountain bikes for sale across Australia.",
    intro:
      "Australia has some of the best trail riding in the world — and Yellow Jersey has the bikes to match. Shop new and used mountain bikes from riders and MTB shops nationwide, with secure payment and delivery.",
    gridHeading: "Mountain bikes for sale",
    intent: "buy",
    filters: { searchTerms: ["mountain", "mtb"] },
    ctaHref: "/marketplace?search=mountain+bike",
    ctaLabel: "Browse MTBs",
    browseHref: "/marketplace?search=mtb",
    browseLabel: "See all mountain bikes",
    faqs: [
      {
        q: "Hardtail or full suspension mountain bike?",
        a: "Hardtails are lighter, cheaper and great for cross-country and moderate trails. Full suspension offers more comfort and control on rough descents. Consider your local trails and budget.",
      },
    ],
    related: ["mountain-bikes-melbourne", "gravel-bikes-australia", "used-bike-marketplace-australia"],
  },
  {
    slug: "gravel-bikes-australia",
    title: "Gravel bikes for sale Australia",
    description:
      "Buy gravel and adventure bikes across Australia on Yellow Jersey. New and used all-road bikes from riders and shops with secure payment and delivery.",
    eyebrow: "Australia · Gravel bikes",
    headline: "Gravel bikes for sale across Australia.",
    intro:
      "Gravel riding is booming across Australia — from the Munda Biddi to back roads in Tasmania. Find your next gravel or adventure bike on Yellow Jersey, with listings from riders and shops nationwide.",
    gridHeading: "Gravel bikes for sale",
    intent: "buy",
    filters: { searchTerms: ["gravel", "cyclocross", "adventure"] },
    ctaHref: "/marketplace?search=gravel+bike",
    ctaLabel: "Browse gravel bikes",
    browseHref: "/marketplace?search=gravel",
    browseLabel: "See all gravel bikes",
    faqs: [
      {
        q: "What tyre width should I run on a gravel bike?",
        a: "Most gravel bikes handle 35–45mm tyres. Wider tyres offer more comfort on rough surfaces; narrower tyres are faster on smooth gravel roads.",
      },
    ],
    related: ["gravel-bikes-melbourne", "road-bikes-for-sale-australia", "e-bikes-for-sale-australia"],
  },
  {
    slug: "e-bikes-for-sale-australia",
    title: "E-bikes for sale Australia",
    description:
      "Buy new and used e-bikes across Australia on Yellow Jersey. Electric road, commuter and mountain e-bikes with secure payment and nationwide delivery.",
    eyebrow: "Australia · E-bikes",
    headline: "E-bikes for sale across Australia.",
    intro:
      "Electric bikes are transforming how Australians commute and ride. Browse new and used e-bikes on Yellow Jersey — from city commuters to e-MTBs — with secure checkout and delivery across the country.",
    gridHeading: "E-bikes for sale",
    intent: "buy",
    filters: { searchTerms: ["e-bike", "ebike", "electric"] },
    ctaHref: "/marketplace?search=e-bike",
    ctaLabel: "Browse e-bikes",
    browseHref: "/marketplace?search=electric+bike",
    browseLabel: "See all e-bikes",
    faqs: [
      {
        q: "How far can an e-bike go on one charge?",
        a: "Range depends on battery capacity, assist level and terrain. Most e-bikes cover 40–100km per charge. Check the listing for battery watt-hours (Wh) for an estimate.",
      },
    ],
    related: ["e-bikes-melbourne", "commuter-bikes-melbourne", "buy-used-bike-online-australia"],
  },
  {
    slug: "local-bike-shop-online-australia",
    title: "Local bike shop online Australia",
    description:
      "Shop your local bike shop online on Yellow Jersey. Browse new bikes, parts and gear from independent Australian retailers with secure checkout and delivery.",
    eyebrow: "Australia · Local shops",
    headline: "Your local bike shop, online.",
    intro:
      "Independent bike shops are the heart of Australian cycling — and now you can browse their stock online. Yellow Jersey connects you with local retailers across the country, with secure checkout and delivery to your door.",
    gridHeading: "New stock from local bike shops",
    intent: "browse",
    filters: { listingType: "store_inventory" },
    ctaHref: "/marketplace/new-products",
    ctaLabel: "Shop local stores",
    browseHref: "/marketplace",
    browseLabel: "Browse all shops",
    faqs: [
      {
        q: "Why buy from a local bike shop through Yellow Jersey?",
        a: "You get the expertise and warranty of a real bike shop, with the convenience of online browsing and secure checkout. Many shops offer delivery or local pickup.",
      },
    ],
    related: ["bike-shops-melbourne-online", "new-bikes-melbourne", "bike-marketplace-australia"],
  },
];

const PAGE_MAP = new Map(LANDING_PAGES.map((p) => [p.slug, p]));

export function getLandingPage(slug: string): LandingPage | undefined {
  return PAGE_MAP.get(slug.toLowerCase());
}

export function getAllLandingSlugs(): string[] {
  return LANDING_PAGES.map((p) => p.slug);
}

export const MELBOURNE_GUIDES = LANDING_PAGES.filter((p) => p.location === "VIC");
export const AUSTRALIA_GUIDES = LANDING_PAGES.filter((p) => !p.location);
