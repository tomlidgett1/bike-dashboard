"use client";

import * as React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Heart, MapPin, Clock, Star, ArrowUpRight, Bookmark, Eye, Zap, ChevronRight, BadgeCheck, Sparkles, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ============================================================
// 13 World-Class Product Card Designs
// Test Page: /test-card-designs
// ============================================================

// Mock product data for demonstration
const mockProduct = {
  id: "1",
  title: "2023 Specialized Tarmac SL7",
  price: 4500,
  originalPrice: 5200,
  condition: "Like New",
  location: "Melbourne",
  seller: "James K.",
  sellerRating: 4.8,
  sellerVerified: true,
  timeAgo: "2h ago",
  views: 124,
  saves: 18,
  image: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=800&h=800&fit=crop",
  category: "Road Bike",
  specs: ["Carbon Frame", "Shimano Ultegra", "Size 56"],
  isNew: true,
  isFeatured: false,
};

const mockProducts = [
  mockProduct,
  { ...mockProduct, id: "2", title: "Canyon Endurace CF 7", price: 2800, image: "https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=800&h=800&fit=crop", isNew: false, isFeatured: true },
  { ...mockProduct, id: "3", title: "Trek Domane SL 6", price: 3200, image: "https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?w=800&h=800&fit=crop", condition: "Excellent" },
];

// ============================================================
// Card 1: MINIMAL - Ultra-clean, whitespace-focused
// ============================================================
function CardMinimal({ product }: { product: typeof mockProduct }) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="group cursor-pointer"
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-stone-100">
        <Image
          src={product.image}
          alt={product.title}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
      <div className="mt-4 space-y-1">
        <p className="text-xs text-stone-400 uppercase tracking-widest">{product.category}</p>
        <h3 className="font-light text-stone-900 text-lg">{product.title}</h3>
        <p className="text-stone-600 font-medium">${product.price.toLocaleString()}</p>
      </div>
    </motion.div>
  );
}

// ============================================================
// Card 2: GLASSMORPHISM - Frosted glass overlay
// ============================================================
function CardGlass({ product }: { product: typeof mockProduct }) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="group relative cursor-pointer rounded-3xl overflow-hidden"
    >
      <div className="aspect-[4/5] relative">
        <Image
          src={product.image}
          alt={product.title}
          fill
          className="object-cover"
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        
        {/* Glass info panel */}
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <div className="bg-white/20 backdrop-blur-xl rounded-2xl p-4 border border-white/30">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-white text-sm line-clamp-1">{product.title}</h3>
                <p className="text-white/70 text-xs mt-1">{product.condition} • {product.location}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-white">${product.price.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Floating heart */}
        <button className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 opacity-0 group-hover:opacity-100 transition-opacity">
          <Heart className="h-5 w-5 text-white" />
        </button>
      </div>
    </motion.div>
  );
}

// ============================================================
// Card 3: BRUTALIST - Bold, raw, stark contrast
// ============================================================
function CardBrutalist({ product }: { product: typeof mockProduct }) {
  return (
    <div className="group cursor-pointer">
      <div className="relative border-4 border-black bg-white">
        <div className="aspect-square relative overflow-hidden">
          <Image
            src={product.image}
            alt={product.title}
            fill
            className="object-cover grayscale group-hover:grayscale-0 transition-all duration-300"
          />
        </div>
        {/* Bold price tag */}
        <div className="absolute -bottom-3 -right-3 bg-yellow-400 border-4 border-black px-4 py-2">
          <span className="font-black text-2xl text-black">${product.price.toLocaleString()}</span>
        </div>
      </div>
      <div className="mt-6 border-l-4 border-black pl-4">
        <h3 className="font-black text-lg uppercase tracking-tight">{product.title}</h3>
        <p className="text-sm font-mono mt-1">{product.seller} / {product.location}</p>
      </div>
    </div>
  );
}

// ============================================================
// Card 4: EDITORIAL - Magazine-style, typography-focused
// ============================================================
function CardEditorial({ product }: { product: typeof mockProduct }) {
  return (
    <div className="group cursor-pointer">
      <div className="relative aspect-[3/4] overflow-hidden">
        <Image
          src={product.image}
          alt={product.title}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        
        {/* Editorial layout */}
        <div className="absolute inset-0 p-6 flex flex-col justify-end">
          <p className="text-amber-400 text-xs font-medium tracking-[0.3em] uppercase">{product.category}</p>
          <h3 className="font-serif text-white text-2xl mt-2 leading-tight">{product.title}</h3>
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/20">
            <span className="text-white/60 text-sm">{product.location}</span>
            <span className="font-light text-white text-xl">${product.price.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Card 5: FLOATING 3D - Depth and shadow
// ============================================================
function CardFloating({ product }: { product: typeof mockProduct }) {
  return (
    <motion.div
      whileHover={{ y: -8, rotateX: 2, rotateY: -2 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      style={{ transformStyle: "preserve-3d", perspective: "1000px" }}
      className="group cursor-pointer"
    >
      <div className="relative bg-white rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.2)] overflow-hidden">
        {/* Floating badge */}
        {product.isNew && (
          <div className="absolute top-4 left-4 z-10 bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
            NEW
          </div>
        )}
        
        <div className="aspect-square relative overflow-hidden rounded-t-2xl">
          <Image
            src={product.image}
            alt={product.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
        
        <div className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <span className="text-[10px] font-bold text-white">{product.sellerRating}</span>
            </div>
            <span className="text-sm text-gray-500">{product.seller}</span>
            {product.sellerVerified && <BadgeCheck className="h-4 w-4 text-blue-500" />}
          </div>
          <h3 className="font-semibold text-gray-900 line-clamp-1">{product.title}</h3>
          <div className="flex items-center justify-between mt-3">
            <span className="text-xl font-bold text-gray-900">${product.price.toLocaleString()}</span>
            <span className="text-sm text-gray-400 line-through">${product.originalPrice?.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// Card 6: POLAROID - Classic photo frame nostalgia
// ============================================================
function CardPolaroid({ product }: { product: typeof mockProduct }) {
  return (
    <motion.div
      whileHover={{ rotate: -2, scale: 1.02 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="group cursor-pointer"
    >
      <div className="bg-white p-3 pb-16 shadow-[0_3px_15px_rgba(0,0,0,0.1)] rounded-sm relative">
        {/* Photo */}
        <div className="aspect-square relative overflow-hidden bg-gray-100">
          <Image
            src={product.image}
            alt={product.title}
            fill
            className="object-cover"
          />
        </div>
        
        {/* Handwritten-style info */}
        <div className="absolute bottom-3 left-3 right-3">
          <p className="font-handwriting text-lg text-gray-700" style={{ fontFamily: "'Caveat', cursive" }}>
            {product.title}
          </p>
          <div className="flex items-center justify-between mt-1">
            <span className="text-gray-500 text-sm">{product.location}</span>
            <span className="font-semibold text-gray-800">${product.price.toLocaleString()}</span>
          </div>
        </div>
        
        {/* Corner tape effect */}
        <div className="absolute -top-2 -left-2 w-8 h-8 bg-amber-100/80 rotate-45 transform" />
      </div>
    </motion.div>
  );
}

// ============================================================
// Card 7: SPLIT - Horizontal info split
// ============================================================
function CardSplit({ product }: { product: typeof mockProduct }) {
  return (
    <div className="group cursor-pointer bg-gray-50 rounded-2xl overflow-hidden flex flex-col">
      <div className="aspect-[4/3] relative overflow-hidden">
        <Image
          src={product.image}
          alt={product.title}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute top-3 left-3 flex gap-2">
          <span className="bg-black/80 text-white text-xs px-2.5 py-1 rounded-full">{product.condition}</span>
        </div>
      </div>
      
      <div className="flex-1 p-4 flex flex-col justify-between">
        <div>
          <h3 className="font-medium text-gray-900 text-sm line-clamp-2">{product.title}</h3>
          <div className="flex flex-wrap gap-1 mt-2">
            {product.specs.slice(0, 2).map((spec, i) => (
              <span key={i} className="text-[10px] text-gray-500 bg-gray-200 px-2 py-0.5 rounded-md">
                {spec}
              </span>
            ))}
          </div>
        </div>
        
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3 text-gray-400" />
            <span className="text-xs text-gray-500">{product.location}</span>
          </div>
          <span className="font-bold text-gray-900">${product.price.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Card 8: CIRCULAR - Round focal point
// ============================================================
function CardCircular({ product }: { product: typeof mockProduct }) {
  return (
    <div className="group cursor-pointer text-center">
      <motion.div
        whileHover={{ scale: 1.05 }}
        className="relative mx-auto w-48 h-48 rounded-full overflow-hidden ring-4 ring-gray-100 group-hover:ring-amber-400 transition-all duration-300"
      >
        <Image
          src={product.image}
          alt={product.title}
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <span className="text-white font-bold text-lg opacity-0 group-hover:opacity-100 transition-opacity">
            ${product.price.toLocaleString()}
          </span>
        </div>
      </motion.div>
      
      <div className="mt-5">
        <p className="text-xs text-gray-400 uppercase tracking-wider">{product.category}</p>
        <h3 className="font-medium text-gray-900 mt-1">{product.title}</h3>
        <p className="text-sm text-gray-500 mt-1">{product.condition}</p>
      </div>
    </div>
  );
}

// ============================================================
// Card 9: GRADIENT MESH - Modern gradient aesthetic
// ============================================================
function CardGradient({ product }: { product: typeof mockProduct }) {
  return (
    <div className="group cursor-pointer">
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 p-[2px]">
        <div className="bg-white rounded-[22px] overflow-hidden">
          <div className="aspect-square relative overflow-hidden">
            <Image
              src={product.image}
              alt={product.title}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
            {/* Mesh overlay on hover */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity bg-gradient-to-br from-violet-500 via-transparent to-fuchsia-500" />
          </div>
          
          <div className="p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              <span className="text-xs font-medium text-purple-600">{product.timeAgo}</span>
            </div>
            <h3 className="font-semibold text-gray-900 mt-2 line-clamp-1">{product.title}</h3>
            <div className="flex items-center justify-between mt-3">
              <span className="text-2xl font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                ${product.price.toLocaleString()}
              </span>
              <button className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/30">
                <ArrowUpRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Card 10: NEUBRUTALISM - Bold shadows, thick borders
// ============================================================
function CardNeubrutalism({ product }: { product: typeof mockProduct }) {
  return (
    <motion.div
      whileHover={{ x: -4, y: -4 }}
      className="group cursor-pointer"
    >
      <div className="relative bg-white border-3 border-black rounded-xl overflow-hidden shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] group-hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] transition-shadow">
        <div className="aspect-square relative overflow-hidden">
          <Image
            src={product.image}
            alt={product.title}
            fill
            className="object-cover"
          />
          <div className="absolute top-3 right-3">
            <button className="h-10 w-10 bg-lime-400 border-2 border-black rounded-full flex items-center justify-center hover:bg-lime-300 transition-colors">
              <Heart className="h-5 w-5 text-black" />
            </button>
          </div>
        </div>
        
        <div className="p-4 border-t-3 border-black bg-lime-400">
          <h3 className="font-black text-black line-clamp-1">{product.title}</h3>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm font-bold text-black/70">{product.condition}</span>
            <span className="font-black text-xl text-black">${product.price.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// Card 11: DARK LUXE - Premium dark aesthetic
// ============================================================
function CardDarkLuxe({ product }: { product: typeof mockProduct }) {
  return (
    <div className="group cursor-pointer bg-zinc-900 rounded-2xl overflow-hidden">
      <div className="aspect-square relative overflow-hidden">
        <Image
          src={product.image}
          alt={product.title}
          fill
          className="object-cover transition-all duration-500 group-hover:scale-105 group-hover:brightness-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
        
        {/* Gold accent line */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400" />
      </div>
      
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
          <span className="text-amber-400 text-sm font-medium">{product.sellerRating}</span>
          <span className="text-zinc-600">•</span>
          <span className="text-zinc-500 text-sm">{product.seller}</span>
        </div>
        <h3 className="font-medium text-white">{product.title}</h3>
        <div className="flex items-center justify-between mt-4">
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-wider">Price</p>
            <p className="text-2xl font-light text-white">${product.price.toLocaleString()}</p>
          </div>
          <button className="px-5 py-2.5 bg-white text-black text-sm font-semibold rounded-full hover:bg-amber-400 transition-colors">
            View
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Card 12: STATS CARD - Data-driven display
// ============================================================
function CardStats({ product }: { product: typeof mockProduct }) {
  return (
    <div className="group cursor-pointer bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-gray-300 transition-colors">
      <div className="aspect-[4/3] relative overflow-hidden">
        <Image
          src={product.image}
          alt={product.title}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        
        {/* Stats overlay */}
        <div className="absolute bottom-0 left-0 right-0 flex divide-x divide-white/20">
          <div className="flex-1 bg-black/60 backdrop-blur-sm px-3 py-2 text-center">
            <Eye className="h-3.5 w-3.5 text-white/70 mx-auto" />
            <p className="text-xs text-white font-medium mt-0.5">{product.views}</p>
          </div>
          <div className="flex-1 bg-black/60 backdrop-blur-sm px-3 py-2 text-center">
            <Bookmark className="h-3.5 w-3.5 text-white/70 mx-auto" />
            <p className="text-xs text-white font-medium mt-0.5">{product.saves}</p>
          </div>
          <div className="flex-1 bg-black/60 backdrop-blur-sm px-3 py-2 text-center">
            <Clock className="h-3.5 w-3.5 text-white/70 mx-auto" />
            <p className="text-xs text-white font-medium mt-0.5">{product.timeAgo}</p>
          </div>
        </div>
      </div>
      
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900 text-sm line-clamp-2">{product.title}</h3>
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className="h-5 w-5 rounded-full bg-gray-200" />
              <span className="text-xs text-gray-500">{product.seller}</span>
              {product.sellerVerified && <BadgeCheck className="h-3.5 w-3.5 text-blue-500" />}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-gray-900">${product.price.toLocaleString()}</p>
            <p className="text-xs text-emerald-600 font-medium">
              {Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% off
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Card 13: PILL CARD - Horizontal compact design
// ============================================================
function CardPill({ product }: { product: typeof mockProduct }) {
  return (
    <motion.div
      whileHover={{ x: 4 }}
      className="group cursor-pointer flex items-center gap-4 bg-white rounded-full p-2 pr-6 border border-gray-200 hover:border-gray-300 hover:shadow-lg transition-all"
    >
      <div className="h-16 w-16 rounded-full overflow-hidden relative shrink-0">
        <Image
          src={product.image}
          alt={product.title}
          fill
          className="object-cover"
        />
      </div>
      
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-gray-900 text-sm truncate">{product.title}</h3>
        <p className="text-xs text-gray-500">{product.location} • {product.condition}</p>
      </div>
      
      <div className="text-right shrink-0">
        <p className="font-bold text-gray-900">${product.price.toLocaleString()}</p>
      </div>
      
      <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 transition-colors shrink-0" />
    </motion.div>
  );
}

// ============================================================
// Main Page Component
// ============================================================
export default function TestCardDesignsPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Hero Section */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <h1 className="text-4xl font-bold text-gray-900">Product Card Explorations</h1>
          <p className="text-gray-600 mt-3 text-lg">13 unique, world-class product card designs</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12 space-y-20">
        
        {/* Card 1: Minimal */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="h-8 w-8 rounded-md bg-stone-900 text-white flex items-center justify-center text-sm font-bold">1</span>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Minimal</h2>
              <p className="text-sm text-gray-500">Ultra-clean, whitespace-focused, typography-driven</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 bg-white rounded-md p-8 border border-gray-200">
            {mockProducts.map((p) => <CardMinimal key={p.id} product={p} />)}
          </div>
        </section>

        {/* Card 2: Glass */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="h-8 w-8 rounded-md bg-cyan-500 text-white flex items-center justify-center text-sm font-bold">2</span>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Glassmorphism</h2>
              <p className="text-sm text-gray-500">Frosted glass overlay, depth through blur</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-gradient-to-br from-cyan-500 via-blue-500 to-purple-600 rounded-md p-8">
            {mockProducts.map((p) => <CardGlass key={p.id} product={p} />)}
          </div>
        </section>

        {/* Card 3: Brutalist */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="h-8 w-8 rounded-md bg-black text-white flex items-center justify-center text-sm font-bold">3</span>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Brutalist</h2>
              <p className="text-sm text-gray-500">Bold, raw, stark contrast, industrial feel</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-10 bg-gray-200 rounded-md p-10">
            {mockProducts.map((p) => <CardBrutalist key={p.id} product={p} />)}
          </div>
        </section>

        {/* Card 4: Editorial */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="h-8 w-8 rounded-md bg-amber-700 text-white flex items-center justify-center text-sm font-bold">4</span>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Editorial</h2>
              <p className="text-sm text-gray-500">Magazine-style, elegant typography, rich imagery</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-stone-900 rounded-md p-8">
            {mockProducts.map((p) => <CardEditorial key={p.id} product={p} />)}
          </div>
        </section>

        {/* Card 5: Floating */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="h-8 w-8 rounded-md bg-blue-500 text-white flex items-center justify-center text-sm font-bold">5</span>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Floating 3D</h2>
              <p className="text-sm text-gray-500">Depth through shadows, hover lift effect</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 bg-gradient-to-b from-blue-50 to-blue-100 rounded-md p-10">
            {mockProducts.map((p) => <CardFloating key={p.id} product={p} />)}
          </div>
        </section>

        {/* Card 6: Polaroid */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="h-8 w-8 rounded-md bg-amber-100 text-amber-800 flex items-center justify-center text-sm font-bold border border-amber-300">6</span>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Polaroid</h2>
              <p className="text-sm text-gray-500">Classic photo frame, nostalgic charm</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 bg-amber-50 rounded-md p-10">
            {mockProducts.map((p) => <CardPolaroid key={p.id} product={p} />)}
          </div>
        </section>

        {/* Card 7: Split */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="h-8 w-8 rounded-md bg-gray-500 text-white flex items-center justify-center text-sm font-bold">7</span>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Split Info</h2>
              <p className="text-sm text-gray-500">Balanced image-info ratio, practical layout</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white rounded-md p-8 border border-gray-200">
            {mockProducts.map((p) => <CardSplit key={p.id} product={p} />)}
          </div>
        </section>

        {/* Card 8: Circular */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="h-8 w-8 rounded-full bg-amber-400 text-black flex items-center justify-center text-sm font-bold">8</span>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Circular</h2>
              <p className="text-sm text-gray-500">Round focal point, unique visual identity</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-8 bg-white rounded-md p-12 border border-gray-200">
            {mockProducts.map((p) => <CardCircular key={p.id} product={p} />)}
          </div>
        </section>

        {/* Card 9: Gradient */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="h-8 w-8 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center text-sm font-bold">9</span>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Gradient Mesh</h2>
              <p className="text-sm text-gray-500">Modern gradient borders, vibrant accent</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-gray-950 rounded-md p-8">
            {mockProducts.map((p) => <CardGradient key={p.id} product={p} />)}
          </div>
        </section>

        {/* Card 10: Neubrutalism */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="h-8 w-8 rounded-md bg-lime-400 text-black flex items-center justify-center text-sm font-bold border-2 border-black">10</span>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Neubrutalism</h2>
              <p className="text-sm text-gray-500">Bold shadows, thick borders, high contrast</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 bg-orange-100 rounded-md p-10">
            {mockProducts.map((p) => <CardNeubrutalism key={p.id} product={p} />)}
          </div>
        </section>

        {/* Card 11: Dark Luxe */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="h-8 w-8 rounded-md bg-zinc-900 text-amber-400 flex items-center justify-center text-sm font-bold border border-amber-400">11</span>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Dark Luxe</h2>
              <p className="text-sm text-gray-500">Premium dark aesthetic, gold accents</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-zinc-950 rounded-md p-8">
            {mockProducts.map((p) => <CardDarkLuxe key={p.id} product={p} />)}
          </div>
        </section>

        {/* Card 12: Stats */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="h-8 w-8 rounded-md bg-emerald-500 text-white flex items-center justify-center text-sm font-bold">12</span>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Stats Card</h2>
              <p className="text-sm text-gray-500">Data-driven display, engagement metrics</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 rounded-md p-8">
            {mockProducts.map((p) => <CardStats key={p.id} product={p} />)}
          </div>
        </section>

        {/* Card 13: Pill */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="h-8 w-8 rounded-full bg-gray-800 text-white flex items-center justify-center text-sm font-bold">13</span>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Pill Card</h2>
              <p className="text-sm text-gray-500">Horizontal compact, list-style design</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 bg-gray-50 rounded-md p-8 max-w-2xl">
            {mockProducts.map((p) => <CardPill key={p.id} product={p} />)}
          </div>
        </section>

      </div>

      {/* Footer */}
      <div className="bg-white border-t border-gray-200 mt-20">
        <div className="max-w-7xl mx-auto px-6 py-8 text-center">
          <p className="text-gray-500 text-sm">13 Product Card Explorations • Pick your favourite and let's refine it</p>
        </div>
      </div>
    </div>
  );
}


