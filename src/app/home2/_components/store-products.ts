// Real catalogue products (names, prices, photos) pulled from the connected
// store's live inventory. Image URLs are the app's own Cloudinary/Supabase
// assets — anonymous (no store name in the path).

export type StoreProduct = { title: string; price: string; brand: string; img: string };

const C = "https://res.cloudinary.com/dydrzocpt/image/upload";

export const STORE_BIKES: StoreProduct[] = [
  {
    title: "Focus Izalco Max 9.8",
    price: "$9,999",
    brand: "Focus",
    img: `${C}/v1781148780/bike-marketplace/enhanced/store-card-1809fb34-6d07-4b90-ab44-ee005067904f/1781148780.png`,
  },
  {
    title: "Focus Izalco Max 9.7",
    price: "$8,999",
    brand: "Focus",
    img: `${C}/v1780183560/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-8dceb31b-8720-40c4-9d7b-29cbe3ece912/1780183560-0.png`,
  },
  {
    title: "Focus Atlas 8.9 Gravel",
    price: "$6,999",
    brand: "Focus",
    img: `${C}/v1780183395/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-3feb3297-0b49-42e1-a8fb-1b195e4b614b/1780183395-2.jpg`,
  },
  {
    title: "Focus Jam 8.8",
    price: "$5,999",
    brand: "Focus",
    img: `${C}/v1780194927/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-f1d903c4-2de3-4252-8d0f-548539c31932/1780194927-0.png`,
  },
  {
    title: "Kalkhoff Endeavour 3.B E-bike",
    price: "$5,299",
    brand: "Kalkhoff",
    img: `${C}/v1780190551/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-25118258-a159-46bf-a346-37dae2b8b1b0/1780190549-1.png`,
  },
  {
    title: "Orbea Vibe Mid H30 E-bike",
    price: "$5,199",
    brand: "Orbea",
    img: `${C}/v1780190403/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-b4835a4c-b380-4de5-bd85-401659e736f2/1780190401-0.png`,
  },
  {
    title: "Apollo Trail D 20 MTB",
    price: "$4,599",
    brand: "Apollo",
    img: `${C}/v1781058825/bike-marketplace/enhanced/store-card-f6c7a97d-2d77-4481-8d40-f41fb501ffbe/1781058822.png`,
  },
  {
    title: "Orbea Katu-E 30 E-bike",
    price: "$4,200",
    brand: "Orbea",
    img: `${C}/v1780194918/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-ddf059e4-e159-40c6-a902-26d2f272c381/1780194918-0.png`,
  },
];

export const STORE_ACCESSORIES: StoreProduct[] = [
  {
    title: "Buzzrack Eazzy 4 Carrier",
    price: "$999.99",
    brand: "Buzzrack",
    img: `${C}/v1780096504/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-296e68a7-7ad7-4471-8d5a-f2e31213e724/1780096503-0.jpg`,
  },
  {
    title: "Ortovox Trace 20 Backpack",
    price: "$819.99",
    brand: "Ortovox",
    img: `${C}/v1780197067/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-cbbdaae7-7c73-428e-98af-deea797acd10/1780197067-2.png`,
  },
  {
    title: "Ortlieb Sport-Roller Panniers",
    price: "$169.99",
    brand: "Ortlieb",
    img: `${C}/v1781342906/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-29b28e67-d557-4ecf-9d75-6c2a25796a7d/1781342906-2.webp`,
  },
  {
    title: "PRO Stealth Performance Saddle",
    price: "$110",
    brand: "PRO",
    img: "https://frjcluhuictnbimitvrm.supabase.co/storage/v1/object/public/listing-images/3acef09d-8b28-46e8-a0c3-45ce59c61972/sell-1781348640114/1781348645514-original.webp",
  },
  {
    title: "Muc-Off Tubeless Plug Kit",
    price: "$79.99",
    brand: "Muc-Off",
    img: `${C}/v1781075276/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-15771e4e-97a9-4e14-a578-dba08393ce68/1781075276-2.jpg`,
  },
  {
    title: "Zefal Shield R35 Mudguards",
    price: "$79.99",
    brand: "Zefal",
    img: `${C}/v1781314204/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-bb4510ea-1c69-41cc-85c2-46a3af00973d/1781314204-0.jpg`,
  },
  {
    title: "PRO Brake Piston Lever",
    price: "$49.99",
    brand: "PRO",
    img: `${C}/v1781343304/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-79804182-6abc-40f0-8ac2-015ae248c795/1781343304-1.webp`,
  },
  {
    title: "ULAC Piccadilly Combo Lock",
    price: "$24.99",
    brand: "ULAC",
    img: `${C}/v1780033154/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-1cdd231d-b5a0-47b3-8329-f3b44a8fc4a7/1780033154-0.jpg`,
  },
  {
    title: "Zefal Sense Bottle 800ml",
    price: "$14.99",
    brand: "Zefal",
    img: `${C}/v1781314237/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-e4e038ed-c922-42f7-b91e-cc82ff8ea3eb/1781314237-0.jpg`,
  },
  {
    title: "Clif Bar Blueberry",
    price: "$4.00",
    brand: "Clif",
    img: `${C}/v1780034919/bike-marketplace/enhanced/preview-d43d6552-c8f0-4dd5-abbf-ac82b454b274/1780034917.png`,
  },
  {
    title: "Clif Bar White Chocolate Macadamia",
    price: "$4.50",
    brand: "Clif",
    img: `${C}/v1780034702/bike-marketplace/enhanced/preview-a8fb6b2d-a763-4c0c-b0cb-ea0d5f919b7f/1780034700.png`,
  },
  {
    title: "Clif Bar Choc Brownie",
    price: "$4.50",
    brand: "Clif",
    img: `${C}/v1780122925/bike-marketplace/enhanced/preview-d83ea347-b563-4c9a-a221-1f38f3494d8d/1780122922.png`,
  },
  {
    title: "Clif Bar Builders Choc Peanut Butter 68g",
    price: "$6.00",
    brand: "Clif",
    img: `${C}/v1780122844/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-b7cbcb64-6b4d-4050-93a1-73f3f18cf815/1780122843-0.webp`,
  },
  {
    title: "Clif Shot Bloks Strawberry",
    price: "$7.99",
    brand: "Clif",
    img: `${C}/v1780313872/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-feff2cd5-2d02-42a8-a5e7-328ef604c220/1780313872-0.png`,
  },
  {
    title: "Clif Gel Double Espresso",
    price: "$4.00",
    brand: "Clif",
    img: `${C}/v1781059202/bike-marketplace/enhanced/store-card-bbf01f83-4602-4999-9eb6-bc157f480968/1781059200.png`,
  },
  {
    title: "SiS Isotonic Gel Pineapple",
    price: "$4.99",
    brand: "SiS",
    img: `${C}/v1780313834/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-269966f9-03e2-476e-9cd8-3041b2be27e7/1780313834-0.jpg`,
  },
  {
    title: "SiS Beta Fuel Gel Lemon Lime",
    price: "$5.99",
    brand: "SiS",
    img: `${C}/v1780313841/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-6e228afd-2adb-4154-8fa2-22ecf5b11409/1780313841-0.webp`,
  },
  {
    title: "SiS Energy Gel Fruit Salad",
    price: "$4.99",
    brand: "SiS",
    img: `${C}/v1780313867/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-fc767d82-ec91-477b-823e-d11cf663434b/1780313867-0.webp`,
  },
  {
    title: "SiS Caffeine Gel Berry",
    price: "$5.99",
    brand: "SiS",
    img: `${C}/v1780313828/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-735d91e6-deb3-4c4a-b52b-e2dac3771051/1780313828-0.webp`,
  },
  {
    title: "Park Tool 3-Way Hex Wrench 4/5/6mm",
    price: "$16.00",
    brand: "Park Tool",
    img: `${C}/v1781318839/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/bulk-1781318826487/1781318838-1.jpg`,
  },
  {
    title: "PRO Chain Tool 5–9 Speed",
    price: "$49.99",
    brand: "PRO",
    img: `${C}/v1781343281/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-b493058b-ddd6-4849-a82c-76de95620582/1781343281-0.webp`,
  },
  {
    title: "PRO Chain Tool 9/10/11/12 Speed",
    price: "$49.99",
    brand: "PRO",
    img: `${C}/v1781343264/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-5367eeac-df19-4e65-a340-bdf0bd121121/1781343264-0.webp`,
  },
  {
    title: "PRO Y-Wrench Hex 4/5/6mm",
    price: "$19.99",
    brand: "PRO",
    img: `${C}/v1781343410/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-2b3eb98f-99a4-4044-9424-e1094c494399/1781343410-0.png`,
  },
  {
    title: "PRO Quick Link Remover",
    price: "$39.99",
    brand: "PRO",
    img: `${C}/v1781343397/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-319fac4c-d632-4d36-8e7a-6680b8e151a5/1781343397-0.png`,
  },
  {
    title: "Chain Shimano CN-HG701 11-Speed",
    price: "$79.99",
    brand: "Shimano",
    img: `${C}/v1781072389/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-d1790089-0fce-41ed-bfaf-f8a90d49868d/1781072389-0.png`,
  },
  {
    title: "SRAM Eagle T-Type Chain 12-Speed",
    price: "$89.99",
    brand: "SRAM",
    img: `${C}/v1780623319/bike-marketplace/listings/3acef09d-8b28-46e8-a0c3-45ce59c61972/canonical-bcccbe78-3387-43d6-aa32-782863a574f5/1780623317-0.webp`,
  },
];

export function storeProductPriceAud(price: string): number {
  return Number(price.replace(/[^0-9.]/g, ""));
}

const UBER_CAROUSEL_TITLES = new Set([
  "Clif Bar Blueberry",
  "Clif Bar White Chocolate Macadamia",
  "Clif Bar Choc Brownie",
  "Clif Bar Builders Choc Peanut Butter 68g",
  "Clif Shot Bloks Strawberry",
  "Clif Gel Double Espresso",
  "SiS Isotonic Gel Pineapple",
  "SiS Beta Fuel Gel Lemon Lime",
  "SiS Energy Gel Fruit Salad",
  "SiS Caffeine Gel Berry",
  "Park Tool 3-Way Hex Wrench 4/5/6mm",
  "PRO Chain Tool 5–9 Speed",
  "PRO Chain Tool 9/10/11/12 Speed",
  "PRO Y-Wrench Hex 4/5/6mm",
  "PRO Quick Link Remover",
  "Chain Shimano CN-HG701 11-Speed",
  "SRAM Eagle T-Type Chain 12-Speed",
]);

/** Uber carousel — same catalogue entries as the storefront bento, filtered by title. */
export const STORE_UBER_ELIGIBLE = STORE_ACCESSORIES.filter((p) => UBER_CAROUSEL_TITLES.has(p.title));

// Mixed grid for the marketplace hero (bikes + accessories interleaved).
export const MARKETPLACE_PRODUCTS: StoreProduct[] = [
  STORE_BIKES[0],
  STORE_ACCESSORIES[0],
  STORE_BIKES[2],
  STORE_ACCESSORIES[1],
  STORE_BIKES[4],
  STORE_ACCESSORIES[2],
  STORE_BIKES[5],
  STORE_ACCESSORIES[4],
  STORE_BIKES[6],
  STORE_ACCESSORIES[5],
  STORE_BIKES[7],
  STORE_ACCESSORIES[7],
];

/** Hero background for the Acme Bikes storefront demo on home2. */
export const ACME_STORE_HERO_IMAGE =
  "https://images.unsplash.com/photo-1576435728678-68d0fbf94e91?auto=format&fit=crop&w=1600&q=85";
