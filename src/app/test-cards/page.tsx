"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin,
  Heart,
  Share2,
  Store,
  Sparkles,
  Zap,
  Shield,
  MessageCircle,
  Tag,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Truck,
  User,
  Clock,
  BadgeCheck,
  Eye,
  Package,
  ArrowRight,
  CircleCheck,
  Star,
  TrendingUp,
  Flame,
  Send,
  Play,
  Circle,
  Minus,
  Plus,
  ExternalLink,
  Copy,
  Check,
  X,
  ShoppingBag,
  Timer,
  Bike,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// =============================================================================
// MOCK PRODUCT DATA
// =============================================================================
const mockProduct = {
  name: "Peugeot PX-10",
  price: 900,
  originalPrice: 1200,
  location: "Melbourne",
  condition: "Good",
  description:
    "The Peugeot PX-10 is a classic French road racing bicycle renowned for its lightweight Reynolds 531 steel frame and high-quality components.",
  conditionDetails:
    "This Peugeot PX-10 looks like a classic vintage road bike with a sturdy steel frame and original paintwork that's held up quite well. The paint shows some scratches and small chips here and there, which is expected given its age.",
  seller: {
    name: "Ashburton Cycles",
    type: "Bicycle Store",
    rating: 4.8,
    reviews: 127,
    since: "2019",
  },
  views: 234,
  saves: 18,
  timeAgo: "2 hours ago",
};

// =============================================================================
// 1. WHISPER - Ultra Minimal, Text-Only Aesthetic
// =============================================================================
function Panel1Whisper() {
  const [saved, setSaved] = React.useState(false);

  return (
    <div className="bg-[#fafaf9] min-h-[500px] flex flex-col">
      {/* Sparse header */}
      <div className="flex-1 p-6 flex flex-col justify-between">
        <div>
          <p className="text-[10px] tracking-[0.3em] text-stone-400 uppercase mb-4">
            Vintage · {mockProduct.location}
          </p>
          <h1 className="text-3xl font-light text-stone-900 tracking-tight leading-tight mb-2">
            {mockProduct.name}
          </h1>
          <p className="text-sm text-stone-500 leading-relaxed max-w-[280px]">
            {mockProduct.description}
          </p>
        </div>

        <div className="space-y-6">
          {/* Price - whisper style */}
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-extralight text-stone-900">
              ${mockProduct.price}
            </span>
            <span className="text-sm text-stone-400 line-through">
              ${mockProduct.originalPrice}
            </span>
          </div>

          {/* Actions - minimal lines */}
          <div className="space-y-2">
            <button className="w-full py-3.5 text-sm font-medium text-white bg-stone-900 rounded-md hover:bg-stone-800 transition-colors">
              Purchase
            </button>
            <div className="flex gap-2">
              <button className="flex-1 py-2.5 text-xs text-stone-600 border border-stone-200 rounded-md hover:border-stone-300 transition-colors">
                Make Offer
              </button>
              <button className="flex-1 py-2.5 text-xs text-stone-600 border border-stone-200 rounded-md hover:border-stone-300 transition-colors">
                Message
              </button>
            </div>
          </div>

          {/* Bottom actions */}
          <div className="flex items-center justify-between pt-4 border-t border-stone-100">
            <button
              onClick={() => setSaved(!saved)}
              className="text-xs text-stone-500 flex items-center gap-1.5 hover:text-stone-900 transition-colors"
            >
              <Heart
                className={cn(
                  "h-3.5 w-3.5",
                  saved && "fill-stone-900 text-stone-900"
                )}
              />
              {saved ? "Saved" : "Save"}
            </button>
            <button className="text-xs text-stone-500 flex items-center gap-1.5 hover:text-stone-900 transition-colors">
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>
            <button className="text-xs text-stone-500 flex items-center gap-1.5 hover:text-stone-900 transition-colors">
              <Sparkles className="h-3.5 w-3.5" />
              Research
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 2. NOIR - Dark Mode Luxury
// =============================================================================
function Panel2Noir() {
  const [saved, setSaved] = React.useState(false);

  return (
    <div className="bg-[#0a0a0a] min-h-[500px] p-5">
      {/* Floating badge */}
      <div className="flex items-center justify-between mb-6">
        <Badge className="rounded-md bg-white/10 text-white/70 border-0 text-[10px] px-2 py-0.5">
          {mockProduct.condition}
        </Badge>
        <div className="flex gap-1.5">
          <button
            onClick={() => setSaved(!saved)}
            className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <Heart
              className={cn(
                "h-4 w-4",
                saved ? "fill-red-500 text-red-500" : "text-white/50"
              )}
            />
          </button>
          <button className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
            <Share2 className="h-4 w-4 text-white/50" />
          </button>
        </div>
      </div>

      {/* Title */}
      <h1 className="text-2xl font-medium text-white tracking-tight mb-1">
        {mockProduct.name}
      </h1>
      <p className="text-sm text-white/40 mb-6">
        {mockProduct.location} · Listed {mockProduct.timeAgo}
      </p>

      {/* Price block */}
      <div className="bg-white/5 rounded-md p-4 mb-4">
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-3xl font-semibold text-white">
            ${mockProduct.price}
          </span>
          <span className="text-sm text-white/30 line-through">
            ${mockProduct.originalPrice}
          </span>
          <Badge className="rounded-md bg-emerald-500/20 text-emerald-400 border-0 text-[10px] ml-auto">
            25% off
          </Badge>
        </div>
        <Button className="w-full h-11 rounded-md bg-white text-black hover:bg-white/90 font-medium">
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Buy Now
        </Button>
        <div className="flex items-center justify-center gap-1.5 mt-2">
          <span className="text-[10px] text-white/30">Secured by</span>
          <span className="text-[10px] text-white/50 font-medium">Stripe</span>
        </div>
      </div>

      {/* Secondary actions */}
      <div className="flex gap-2 mb-6">
        <Button
          variant="outline"
          className="flex-1 h-10 rounded-md border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <Tag className="h-4 w-4 mr-1.5" />
          Offer
        </Button>
        <Button
          variant="outline"
          className="flex-1 h-10 rounded-md border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <MessageCircle className="h-4 w-4 mr-1.5" />
          Message
        </Button>
      </div>

      {/* Features */}
      <div className="space-y-2">
        <div className="flex items-center gap-2.5 py-2">
          <Zap className="h-4 w-4 text-amber-400" />
          <span className="text-xs text-white/60">
            1-Hour Express Available
          </span>
        </div>
        <div className="flex items-center gap-2.5 py-2">
          <Shield className="h-4 w-4 text-emerald-400" />
          <span className="text-xs text-white/60">Buyer Protection</span>
        </div>
      </div>

      {/* Seller */}
      <div className="mt-6 pt-4 border-t border-white/5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">
            <Store className="h-5 w-5 text-white/40" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white/90">
              {mockProduct.seller.name}
            </p>
            <div className="flex items-center gap-1 text-xs text-white/40">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span>{mockProduct.seller.rating}</span>
              <span>·</span>
              <span>{mockProduct.seller.reviews} reviews</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 3. PULSE - Animated Stats Focus
// =============================================================================
function Panel3Pulse() {
  const [saved, setSaved] = React.useState(false);

  return (
    <div className="bg-white min-h-[500px]">
      {/* Live stats header */}
      <div className="px-4 py-3 bg-gradient-to-r from-rose-50 to-amber-50 border-b border-rose-100/50">
        <div className="flex items-center gap-4">
          <motion.div
            className="flex items-center gap-1.5"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <div className="h-2 w-2 rounded-full bg-rose-500" />
            <span className="text-xs font-medium text-rose-700">
              {mockProduct.views} watching
            </span>
          </motion.div>
          <div className="flex items-center gap-1.5">
            <Heart className="h-3 w-3 text-gray-400" />
            <span className="text-xs text-gray-500">
              {mockProduct.saves} saved
            </span>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <TrendingUp className="h-3 w-3 text-emerald-500" />
            <span className="text-xs text-emerald-600 font-medium">
              Hot item
            </span>
          </div>
        </div>
      </div>

      <div className="p-4">
        {/* Title & Price */}
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900 mb-1">
            {mockProduct.name}
          </h1>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <MapPin className="h-3 w-3" />
            <span>{mockProduct.location}</span>
            <span>·</span>
            <span>{mockProduct.timeAgo}</span>
          </div>
        </div>

        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-3xl font-bold text-gray-900">
            ${mockProduct.price}
          </span>
          <span className="text-sm text-gray-400 line-through">
            ${mockProduct.originalPrice}
          </span>
        </div>

        {/* Urgency indicator */}
        <motion.div
          className="mb-4 p-3 bg-amber-50 rounded-md border border-amber-100"
          animate={{ scale: [1, 1.01, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium text-amber-800">
              5 people viewing right now
            </span>
          </div>
        </motion.div>

        {/* Actions */}
        <div className="space-y-2 mb-4">
          <Button className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800 font-medium">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Buy Now · ${mockProduct.price}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 h-10 rounded-md">
              <Tag className="h-4 w-4 mr-1.5" />
              Offer
            </Button>
            <Button variant="outline" className="flex-1 h-10 rounded-md">
              <MessageCircle className="h-4 w-4 mr-1.5" />
              Message
            </Button>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center justify-between py-3 border-t border-gray-100">
          <button
            onClick={() => setSaved(!saved)}
            className="flex items-center gap-1.5 text-sm text-gray-600"
          >
            <Heart
              className={cn(
                "h-4 w-4",
                saved && "fill-red-500 text-red-500"
              )}
            />
            Save
          </button>
          <button className="flex items-center gap-1.5 text-sm text-gray-600">
            <Share2 className="h-4 w-4" />
            Share
          </button>
          <button className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
            <Sparkles className="h-4 w-4" />
            Research
          </button>
        </div>

        {/* Seller preview */}
        <div className="pt-3 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
              <User className="h-5 w-5 text-gray-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                {mockProduct.seller.name}
              </p>
              <p className="text-xs text-gray-500">{mockProduct.seller.type}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 4. BENTO - Grid-Based Information Architecture
// =============================================================================
function Panel4Bento() {
  const [saved, setSaved] = React.useState(false);

  return (
    <div className="bg-gray-50 min-h-[500px] p-3">
      {/* Title card */}
      <div className="bg-white rounded-md p-4 mb-2 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">
              {mockProduct.name}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {mockProduct.location} · {mockProduct.condition}
            </p>
          </div>
          <span className="text-xl font-bold text-gray-900">
            ${mockProduct.price}
          </span>
        </div>
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        {/* Buy now - large */}
        <div className="col-span-2 bg-gray-900 rounded-md p-4">
          <Button className="w-full h-11 rounded-md bg-white text-gray-900 hover:bg-gray-100 font-medium">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Buy Now
          </Button>
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <Shield className="h-3 w-3 text-gray-400" />
            <span className="text-[10px] text-gray-400">
              Protected by Stripe
            </span>
          </div>
        </div>

        {/* Offer */}
        <button className="bg-white rounded-md p-4 flex flex-col items-center gap-2 shadow-sm hover:shadow-md transition-shadow">
          <Tag className="h-5 w-5 text-gray-600" />
          <span className="text-xs font-medium text-gray-700">Make Offer</span>
        </button>

        {/* Message */}
        <button className="bg-white rounded-md p-4 flex flex-col items-center gap-2 shadow-sm hover:shadow-md transition-shadow">
          <MessageCircle className="h-5 w-5 text-gray-600" />
          <span className="text-xs font-medium text-gray-700">Message</span>
        </button>

        {/* Express */}
        <button className="bg-amber-50 rounded-md p-4 flex flex-col items-center gap-2 border border-amber-100">
          <Zap className="h-5 w-5 text-amber-600" />
          <span className="text-xs font-medium text-amber-800">1hr Express</span>
        </button>

        {/* Research */}
        <button className="bg-gray-900 rounded-md p-4 flex flex-col items-center gap-2">
          <Sparkles className="h-5 w-5 text-white" />
          <span className="text-xs font-medium text-white">AI Research</span>
        </button>
      </div>

      {/* Bottom row */}
      <div className="flex gap-2">
        <button
          onClick={() => setSaved(!saved)}
          className="flex-1 bg-white rounded-md p-3 flex items-center justify-center gap-1.5 shadow-sm"
        >
          <Heart
            className={cn(
              "h-4 w-4",
              saved ? "fill-red-500 text-red-500" : "text-gray-500"
            )}
          />
          <span className="text-xs text-gray-600">Save</span>
        </button>
        <button className="flex-1 bg-white rounded-md p-3 flex items-center justify-center gap-1.5 shadow-sm">
          <Share2 className="h-4 w-4 text-gray-500" />
          <span className="text-xs text-gray-600">Share</span>
        </button>
        <button className="flex-1 bg-white rounded-md p-3 flex items-center justify-center gap-1.5 shadow-sm">
          <Store className="h-4 w-4 text-gray-500" />
          <span className="text-xs text-gray-600">Store</span>
        </button>
      </div>

      {/* Seller */}
      <div className="mt-2 bg-white rounded-md p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
            <User className="h-4 w-4 text-gray-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">
              {mockProduct.seller.name}
            </p>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span>{mockProduct.seller.rating}</span>
              <span>·</span>
              <span>{mockProduct.seller.reviews} reviews</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 5. MONO - Single Column Typography Focus
// =============================================================================
function Panel5Mono() {
  const [saved, setSaved] = React.useState(false);

  return (
    <div className="bg-white min-h-[500px] font-mono">
      <div className="p-5 space-y-6">
        {/* ASCII-style header */}
        <div className="text-xs text-gray-400 whitespace-pre">
          {`┌─────────────────────────────┐`}
        </div>

        {/* Product info */}
        <div>
          <p className="text-[10px] text-gray-400 mb-1">ITEM_NAME:</p>
          <h1 className="text-lg font-bold text-gray-900">
            {mockProduct.name}
          </h1>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-gray-400 mb-0.5">PRICE:</p>
            <p className="text-lg font-bold text-gray-900">
              ${mockProduct.price}
            </p>
          </div>
          <div>
            <p className="text-gray-400 mb-0.5">CONDITION:</p>
            <p className="text-gray-900">{mockProduct.condition}</p>
          </div>
          <div>
            <p className="text-gray-400 mb-0.5">LOCATION:</p>
            <p className="text-gray-900">{mockProduct.location}</p>
          </div>
          <div>
            <p className="text-gray-400 mb-0.5">LISTED:</p>
            <p className="text-gray-900">{mockProduct.timeAgo}</p>
          </div>
        </div>

        {/* Divider */}
        <div className="text-xs text-gray-300">
          ────────────────────────────────
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <Button className="w-full h-11 rounded-md bg-gray-900 hover:bg-gray-800 font-mono text-xs">
            [ PURCHASE ] ${mockProduct.price}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 h-10 rounded-md font-mono text-xs"
            >
              [ OFFER ]
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-10 rounded-md font-mono text-xs"
            >
              [ MSG ]
            </Button>
          </div>
        </div>

        {/* Status flags */}
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">●</span>
            <span className="text-gray-600">BUYER_PROTECTION: ACTIVE</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-amber-500">●</span>
            <span className="text-gray-600">EXPRESS_DELIVERY: AVAILABLE</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-blue-500">●</span>
            <span className="text-gray-600">AI_RESEARCH: READY</span>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <button
            onClick={() => setSaved(!saved)}
            className="text-xs text-gray-500 hover:text-gray-900"
          >
            [{saved ? "♥" : "♡"}] SAVE
          </button>
          <button className="text-xs text-gray-500 hover:text-gray-900">
            [↗] SHARE
          </button>
          <button className="text-xs text-gray-500 hover:text-gray-900">
            [★] STORE
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 6. STACK - Layered Card Depth Effect
// =============================================================================
function Panel6Stack() {
  const [saved, setSaved] = React.useState(false);

  return (
    <div className="bg-gradient-to-b from-gray-100 to-gray-200 min-h-[500px] p-4">
      {/* Stacked cards effect */}
      <div className="relative">
        {/* Shadow cards */}
        <div className="absolute inset-0 bg-white rounded-md shadow-sm transform translate-y-2 translate-x-1 opacity-40" />
        <div className="absolute inset-0 bg-white rounded-md shadow-sm transform translate-y-1 translate-x-0.5 opacity-60" />

        {/* Main card */}
        <div className="relative bg-white rounded-md shadow-xl p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <Badge className="rounded-md bg-gray-100 text-gray-600 border-0 text-[10px] mb-2">
                {mockProduct.condition}
              </Badge>
              <h1 className="text-xl font-bold text-gray-900">
                {mockProduct.name}
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {mockProduct.location}
              </p>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setSaved(!saved)}
                className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center"
              >
                <Heart
                  className={cn(
                    "h-4 w-4",
                    saved ? "fill-red-500 text-red-500" : "text-gray-500"
                  )}
                />
              </button>
              <button className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                <Share2 className="h-4 w-4 text-gray-500" />
              </button>
            </div>
          </div>

          {/* Price */}
          <div className="flex items-baseline gap-2 mb-5">
            <span className="text-3xl font-bold text-gray-900">
              ${mockProduct.price}
            </span>
            <span className="text-sm text-gray-400 line-through">
              ${mockProduct.originalPrice}
            </span>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <Button className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800 font-medium shadow-lg">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Buy Now
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 h-10 rounded-md shadow-sm"
              >
                <Tag className="h-4 w-4 mr-1.5" />
                Offer
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-10 rounded-md shadow-sm"
              >
                <MessageCircle className="h-4 w-4 mr-1.5" />
                Message
              </Button>
            </div>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 mt-4">
            <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 rounded-full text-xs font-medium text-amber-700">
              <Zap className="h-3 w-3" />
              Express
            </div>
            <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 rounded-full text-xs font-medium text-emerald-700">
              <Shield className="h-3 w-3" />
              Protected
            </div>
            <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-700">
              <Sparkles className="h-3 w-3" />
              Research
            </div>
          </div>

          {/* Seller */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center shadow-sm">
                <Store className="h-5 w-5 text-gray-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {mockProduct.seller.name}
                </p>
                <p className="text-xs text-gray-500">
                  {mockProduct.seller.type}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-400" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 7. FLOW - Conversational Chat Style
// =============================================================================
function Panel7Flow() {
  const [saved, setSaved] = React.useState(false);

  return (
    <div className="bg-gray-100 min-h-[500px] flex flex-col">
      {/* Chat header */}
      <div className="bg-white px-4 py-3 border-b border-gray-200 flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-gray-900 flex items-center justify-center">
          <Bike className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {mockProduct.name}
          </p>
          <p className="text-xs text-gray-500">
            ${mockProduct.price} · {mockProduct.location}
          </p>
        </div>
      </div>

      {/* Chat messages */}
      <div className="flex-1 p-4 space-y-3 overflow-y-auto">
        {/* System message */}
        <div className="flex justify-center">
          <span className="px-3 py-1 bg-gray-200 rounded-full text-xs text-gray-600">
            Listed {mockProduct.timeAgo}
          </span>
        </div>

        {/* Product bubble */}
        <div className="flex gap-2">
          <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
            <User className="h-4 w-4 text-gray-500" />
          </div>
          <div className="max-w-[80%]">
            <div className="bg-white rounded-2xl rounded-tl-sm p-3 shadow-sm">
              <p className="text-sm text-gray-800 leading-relaxed">
                {mockProduct.description}
              </p>
            </div>
            <p className="text-[10px] text-gray-400 mt-1 ml-2">
              {mockProduct.seller.name}
            </p>
          </div>
        </div>

        {/* Features bubble */}
        <div className="flex gap-2">
          <div className="h-8 w-8 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="max-w-[80%]">
            <div className="bg-gray-900 rounded-2xl rounded-tl-sm p-3">
              <p className="text-sm text-white mb-2">This listing includes:</p>
              <div className="space-y-1">
                <p className="text-xs text-gray-300 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  Buyer Protection
                </p>
                <p className="text-xs text-gray-300 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  1-Hour Express Delivery
                </p>
                <p className="text-xs text-gray-300 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  Secure Stripe Payment
                </p>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-1 ml-2">Concierge</p>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="bg-white p-4 border-t border-gray-200">
        <div className="flex gap-2 mb-3">
          <Button className="flex-1 h-11 rounded-full bg-gray-900 hover:bg-gray-800 font-medium">
            Buy · ${mockProduct.price}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 rounded-full"
          >
            <Tag className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 rounded-full"
          >
            <MessageCircle className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setSaved(!saved)}
            className="text-xs text-gray-500 flex items-center gap-1"
          >
            <Heart
              className={cn(
                "h-3.5 w-3.5",
                saved && "fill-red-500 text-red-500"
              )}
            />
            Save
          </button>
          <button className="text-xs text-gray-500 flex items-center gap-1">
            <Share2 className="h-3.5 w-3.5" />
            Share
          </button>
          <button className="text-xs text-gray-500 flex items-center gap-1">
            <Store className="h-3.5 w-3.5" />
            Store
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 8. RIBBON - Horizontal Scrolling Sections
// =============================================================================
function Panel8Ribbon() {
  const [saved, setSaved] = React.useState(false);

  return (
    <div className="bg-white min-h-[500px]">
      {/* Header */}
      <div className="p-4 pb-3">
        <h1 className="text-xl font-bold text-gray-900">{mockProduct.name}</h1>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-2xl font-bold text-gray-900">
            ${mockProduct.price}
          </span>
          <Badge className="rounded-md bg-gray-100 text-gray-600 border-0">
            {mockProduct.condition}
          </Badge>
        </div>
        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {mockProduct.location}
        </p>
      </div>

      {/* Scrolling actions ribbon */}
      <div className="px-4 py-3 overflow-x-auto scrollbar-hide">
        <div className="flex gap-2 w-max">
          <Button className="h-10 rounded-full bg-gray-900 hover:bg-gray-800 px-5 flex-shrink-0">
            <ShoppingBag className="h-4 w-4 mr-1.5" />
            Buy Now
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-full px-5 flex-shrink-0"
          >
            <Tag className="h-4 w-4 mr-1.5" />
            Make Offer
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-full px-5 flex-shrink-0"
          >
            <MessageCircle className="h-4 w-4 mr-1.5" />
            Message
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-full px-5 flex-shrink-0"
          >
            <Sparkles className="h-4 w-4 mr-1.5" />
            Research
          </Button>
        </div>
      </div>

      {/* Scrolling features ribbon */}
      <div className="px-4 py-3 overflow-x-auto scrollbar-hide border-t border-gray-100">
        <div className="flex gap-2 w-max">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 rounded-full flex-shrink-0">
            <Zap className="h-4 w-4 text-amber-600" />
            <span className="text-xs font-medium text-amber-800">
              1-Hour Express
            </span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 rounded-full flex-shrink-0">
            <Shield className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-medium text-emerald-800">
              Buyer Protection
            </span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 rounded-full flex-shrink-0">
            <BadgeCheck className="h-4 w-4 text-gray-600" />
            <span className="text-xs font-medium text-gray-700">Verified</span>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="px-4 py-4 border-t border-gray-100">
        <p className="text-sm text-gray-600 leading-relaxed">
          {mockProduct.conditionDetails}
        </p>
      </div>

      {/* Seller */}
      <div className="px-4 py-4 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-gray-100 flex items-center justify-center">
              <Store className="h-5 w-5 text-gray-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {mockProduct.seller.name}
              </p>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span>{mockProduct.seller.rating}</span>
                <span>·</span>
                <span>{mockProduct.seller.reviews} reviews</span>
              </div>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>
      </div>

      {/* Bottom actions */}
      <div className="px-4 py-4 border-t border-gray-100 flex items-center justify-around">
        <button
          onClick={() => setSaved(!saved)}
          className="flex flex-col items-center gap-1"
        >
          <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
            <Heart
              className={cn(
                "h-5 w-5",
                saved ? "fill-red-500 text-red-500" : "text-gray-600"
              )}
            />
          </div>
          <span className="text-[10px] text-gray-500">Save</span>
        </button>
        <button className="flex flex-col items-center gap-1">
          <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
            <Share2 className="h-5 w-5 text-gray-600" />
          </div>
          <span className="text-[10px] text-gray-500">Share</span>
        </button>
        <button className="flex flex-col items-center gap-1">
          <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
            <Store className="h-5 w-5 text-gray-600" />
          </div>
          <span className="text-[10px] text-gray-500">Store</span>
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// 9. FOCUS - Single Giant CTA
// =============================================================================
function Panel9Focus() {
  const [saved, setSaved] = React.useState(false);

  return (
    <div className="bg-white min-h-[500px] flex flex-col">
      {/* Compact header */}
      <div className="p-4 flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-1">
            {mockProduct.location} · {mockProduct.condition}
          </p>
          <h1 className="text-lg font-bold text-gray-900">{mockProduct.name}</h1>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setSaved(!saved)}
            className="h-8 w-8 rounded-md bg-gray-100 flex items-center justify-center"
          >
            <Heart
              className={cn(
                "h-4 w-4",
                saved ? "fill-red-500 text-red-500" : "text-gray-500"
              )}
            />
          </button>
          <button className="h-8 w-8 rounded-md bg-gray-100 flex items-center justify-center">
            <Share2 className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Giant CTA area */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="text-center mb-6">
          <p className="text-6xl font-light text-gray-900 mb-2">
            ${mockProduct.price}
          </p>
          <p className="text-sm text-gray-400 line-through">
            Was ${mockProduct.originalPrice}
          </p>
        </div>

        <motion.div
          className="w-full max-w-xs"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Button className="w-full h-16 rounded-md bg-gray-900 hover:bg-gray-800 font-medium text-lg shadow-2xl">
            Buy Now
          </Button>
        </motion.div>

        <div className="flex items-center gap-1.5 mt-3">
          <Shield className="h-4 w-4 text-gray-400" />
          <span className="text-xs text-gray-500">
            Secure checkout with Stripe
          </span>
        </div>
      </div>

      {/* Compact secondary actions */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 h-10 rounded-md">
            <Tag className="h-4 w-4 mr-1.5" />
            Offer
          </Button>
          <Button variant="outline" className="flex-1 h-10 rounded-md">
            <MessageCircle className="h-4 w-4 mr-1.5" />
            Message
          </Button>
          <Button variant="outline" className="flex-1 h-10 rounded-md">
            <Sparkles className="h-4 w-4 mr-1.5" />
            Research
          </Button>
        </div>
      </div>

      {/* Mini features */}
      <div className="px-4 pb-4 flex items-center justify-center gap-6">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Zap className="h-3.5 w-3.5 text-amber-500" />
          Express
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Shield className="h-3.5 w-3.5 text-emerald-500" />
          Protected
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Truck className="h-3.5 w-3.5 text-blue-500" />
          Delivery
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 10. GRID - Photo Grid Inspired Layout
// =============================================================================
function Panel10Grid() {
  const [saved, setSaved] = React.useState(false);

  return (
    <div className="bg-[#f8f8f8] min-h-[500px]">
      {/* Instagram-style header */}
      <div className="bg-white px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-gray-900 to-gray-600 flex items-center justify-center">
            <Store className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {mockProduct.seller.name}
            </p>
            <p className="text-[10px] text-gray-500">
              {mockProduct.location}
            </p>
          </div>
        </div>
        <button className="text-xs font-medium text-blue-600">Visit</button>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Title & Price card */}
        <div className="bg-white rounded-md p-4 mb-3 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">
                {mockProduct.name}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge className="rounded-md bg-gray-100 text-gray-600 border-0 text-[10px]">
                  {mockProduct.condition}
                </Badge>
                <span className="text-xs text-gray-400">
                  {mockProduct.timeAgo}
                </span>
              </div>
            </div>
            <p className="text-xl font-bold text-gray-900">
              ${mockProduct.price}
            </p>
          </div>
        </div>

        {/* Action grid */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Button className="h-12 rounded-md bg-gray-900 hover:bg-gray-800 font-medium col-span-3">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Buy Now
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <Button variant="outline" className="h-11 rounded-md">
            <Tag className="h-4 w-4 mr-1.5" />
            Offer
          </Button>
          <Button variant="outline" className="h-11 rounded-md">
            <MessageCircle className="h-4 w-4 mr-1.5" />
            Message
          </Button>
        </div>

        {/* Features grid */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-white rounded-md p-3 shadow-sm text-center">
            <Zap className="h-5 w-5 text-amber-500 mx-auto mb-1" />
            <p className="text-[10px] text-gray-600">Express</p>
          </div>
          <div className="bg-white rounded-md p-3 shadow-sm text-center">
            <Shield className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
            <p className="text-[10px] text-gray-600">Protected</p>
          </div>
          <div className="bg-white rounded-md p-3 shadow-sm text-center">
            <Sparkles className="h-5 w-5 text-gray-700 mx-auto mb-1" />
            <p className="text-[10px] text-gray-600">Research</p>
          </div>
        </div>

        {/* Actions row */}
        <div className="bg-white rounded-md p-3 shadow-sm flex items-center justify-around">
          <button
            onClick={() => setSaved(!saved)}
            className="flex items-center gap-1.5 text-xs text-gray-600"
          >
            <Heart
              className={cn(
                "h-5 w-5",
                saved ? "fill-red-500 text-red-500" : ""
              )}
            />
          </button>
          <button className="flex items-center gap-1.5 text-xs text-gray-600">
            <MessageCircle className="h-5 w-5" />
          </button>
          <button className="flex items-center gap-1.5 text-xs text-gray-600">
            <Send className="h-5 w-5" />
          </button>
          <button className="ml-auto flex items-center gap-1.5 text-xs text-gray-600">
            <Copy className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 11. TICKER - Stock Ticker Inspired
// =============================================================================
function Panel11Ticker() {
  const [saved, setSaved] = React.useState(false);

  return (
    <div className="bg-[#0f0f0f] min-h-[500px] text-white">
      {/* Ticker header */}
      <div className="bg-emerald-500 px-4 py-2 flex items-center gap-3 overflow-hidden">
        <TrendingUp className="h-4 w-4 flex-shrink-0" />
        <motion.div
          className="flex gap-8 whitespace-nowrap"
          animate={{ x: [0, -200] }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
        >
          <span className="text-xs font-medium">
            {mockProduct.views} views today
          </span>
          <span className="text-xs font-medium">
            {mockProduct.saves} saves this week
          </span>
          <span className="text-xs font-medium">25% below market</span>
          <span className="text-xs font-medium">
            {mockProduct.views} views today
          </span>
        </motion.div>
      </div>

      <div className="p-4">
        {/* Symbol & Price */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-gray-500 font-mono">PX10.VIN</p>
            <h1 className="text-xl font-bold text-white mt-1">
              {mockProduct.name}
            </h1>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold font-mono text-white">
              ${mockProduct.price}
            </p>
            <p className="text-xs text-emerald-400 font-mono">
              ↓$300 (-25.0%)
            </p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-white/5 rounded-md p-3">
            <p className="text-[10px] text-gray-500 mb-1">Condition</p>
            <p className="text-sm font-medium text-white">
              {mockProduct.condition}
            </p>
          </div>
          <div className="bg-white/5 rounded-md p-3">
            <p className="text-[10px] text-gray-500 mb-1">Location</p>
            <p className="text-sm font-medium text-white">
              {mockProduct.location}
            </p>
          </div>
          <div className="bg-white/5 rounded-md p-3">
            <p className="text-[10px] text-gray-500 mb-1">Listed</p>
            <p className="text-sm font-medium text-white">2h ago</p>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2 mb-4">
          <Button className="w-full h-12 rounded-md bg-emerald-500 hover:bg-emerald-600 font-medium">
            <ShoppingBag className="h-4 w-4 mr-2" />
            Buy · ${mockProduct.price}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 h-10 rounded-md border-white/10 bg-white/5 text-white hover:bg-white/10"
            >
              <Tag className="h-4 w-4 mr-1.5" />
              Bid
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-10 rounded-md border-white/10 bg-white/5 text-white hover:bg-white/10"
            >
              <MessageCircle className="h-4 w-4 mr-1.5" />
              Message
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            Express
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Shield className="h-3.5 w-3.5 text-emerald-400" />
            Protected
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Sparkles className="h-3.5 w-3.5 text-white" />
            AI Research
          </div>
        </div>

        {/* Seller */}
        <div className="border-t border-white/10 pt-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">
              <Store className="h-5 w-5 text-gray-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">
                {mockProduct.seller.name}
              </p>
              <p className="text-xs text-gray-500">{mockProduct.seller.type}</p>
            </div>
            <button
              onClick={() => setSaved(!saved)}
              className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center"
            >
              <Heart
                className={cn(
                  "h-4 w-4",
                  saved ? "fill-red-500 text-red-500" : "text-gray-500"
                )}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 12. ZEN - Extreme Simplicity, One Action
// =============================================================================
function Panel12Zen() {
  const [saved, setSaved] = React.useState(false);
  const [showMore, setShowMore] = React.useState(false);

  return (
    <div className="bg-white min-h-[500px] flex flex-col items-center justify-center p-8">
      {/* Centered content */}
      <div className="text-center max-w-sm">
        <p className="text-xs text-gray-400 tracking-widest uppercase mb-4">
          {mockProduct.condition} · {mockProduct.location}
        </p>

        <h1 className="text-2xl font-light text-gray-900 mb-2">
          {mockProduct.name}
        </h1>

        <p className="text-4xl font-extralight text-gray-900 mb-8">
          ${mockProduct.price}
        </p>

        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button className="w-full max-w-xs h-14 rounded-full bg-gray-900 hover:bg-gray-800 font-medium text-base shadow-xl">
            Purchase
          </Button>
        </motion.div>

        <button
          onClick={() => setShowMore(!showMore)}
          className="text-xs text-gray-400 mt-6 hover:text-gray-600 transition-colors flex items-center gap-1 mx-auto"
        >
          {showMore ? "Less options" : "More options"}
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform",
              showMore && "rotate-180"
            )}
          />
        </button>

        <AnimatePresence>
          {showMore && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
              className="overflow-hidden"
            >
              <div className="pt-6 flex items-center justify-center gap-4">
                <button className="text-xs text-gray-500 flex items-center gap-1.5 hover:text-gray-900">
                  <Tag className="h-3.5 w-3.5" />
                  Offer
                </button>
                <button className="text-xs text-gray-500 flex items-center gap-1.5 hover:text-gray-900">
                  <MessageCircle className="h-3.5 w-3.5" />
                  Message
                </button>
                <button
                  onClick={() => setSaved(!saved)}
                  className="text-xs text-gray-500 flex items-center gap-1.5 hover:text-gray-900"
                >
                  <Heart
                    className={cn(
                      "h-3.5 w-3.5",
                      saved && "fill-red-500 text-red-500"
                    )}
                  />
                  Save
                </button>
                <button className="text-xs text-gray-500 flex items-center gap-1.5 hover:text-gray-900">
                  <Sparkles className="h-3.5 w-3.5" />
                  Research
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// =============================================================================
// 13. AWARD - Premium Achievement Style
// =============================================================================
function Panel13Award() {
  const [saved, setSaved] = React.useState(false);

  return (
    <div className="bg-gradient-to-b from-amber-50 to-white min-h-[500px]">
      {/* Award header */}
      <div className="text-center pt-6 pb-4">
        <Award className="h-12 w-12 text-amber-500 mx-auto mb-2" />
        <p className="text-[10px] text-amber-600 tracking-widest uppercase font-medium">
          Featured Listing
        </p>
      </div>

      <div className="px-4 pb-4">
        {/* Product card */}
        <div className="bg-white rounded-md p-5 shadow-lg border border-amber-100/50">
          <div className="text-center mb-4">
            <h1 className="text-xl font-bold text-gray-900 mb-1">
              {mockProduct.name}
            </h1>
            <div className="flex items-center justify-center gap-2">
              <Badge className="rounded-md bg-amber-100 text-amber-700 border-0 text-xs">
                {mockProduct.condition}
              </Badge>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500">{mockProduct.location}</span>
            </div>
          </div>

          {/* Price highlight */}
          <div className="text-center mb-5">
            <div className="inline-block bg-gray-900 text-white px-6 py-3 rounded-md">
              <p className="text-3xl font-bold">${mockProduct.price}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Save ${mockProduct.originalPrice - mockProduct.price}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <Button className="w-full h-12 rounded-md bg-amber-500 hover:bg-amber-600 text-white font-medium">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Claim This Deal
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-10 rounded-md">
                <Tag className="h-4 w-4 mr-1.5" />
                Offer
              </Button>
              <Button variant="outline" className="flex-1 h-10 rounded-md">
                <MessageCircle className="h-4 w-4 mr-1.5" />
                Message
              </Button>
            </div>
          </div>

          {/* Trust badges */}
          <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Shield className="h-3.5 w-3.5 text-emerald-500" />
              Protected
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              Express
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Sparkles className="h-3.5 w-3.5 text-gray-700" />
              AI Ready
            </div>
          </div>
        </div>

        {/* Seller */}
        <div className="mt-4 bg-white rounded-md p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center">
              <Store className="h-5 w-5 text-amber-700" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1">
                <p className="text-sm font-semibold text-gray-900">
                  {mockProduct.seller.name}
                </p>
                <BadgeCheck className="h-4 w-4 text-blue-500" />
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span>{mockProduct.seller.rating}</span>
                <span>·</span>
                <span>Since {mockProduct.seller.since}</span>
              </div>
            </div>
            <button
              onClick={() => setSaved(!saved)}
              className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center"
            >
              <Heart
                className={cn(
                  "h-4 w-4",
                  saved ? "fill-red-500 text-red-500" : "text-gray-500"
                )}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE - Display All Panels
// =============================================================================
export default function TestCardsPage() {
  const panels = [
    {
      id: 1,
      name: "Whisper",
      description: "Ultra minimal, text-only aesthetic with maximum whitespace",
      component: <Panel1Whisper />,
    },
    {
      id: 2,
      name: "Noir",
      description: "Dark mode luxury with premium feel and subtle accents",
      component: <Panel2Noir />,
    },
    {
      id: 3,
      name: "Pulse",
      description: "Live animated stats with urgency indicators",
      component: <Panel3Pulse />,
    },
    {
      id: 4,
      name: "Bento",
      description: "Grid-based architecture inspired by Japanese design",
      component: <Panel4Bento />,
    },
    {
      id: 5,
      name: "Mono",
      description: "Developer-inspired monospace typography focus",
      component: <Panel5Mono />,
    },
    {
      id: 6,
      name: "Stack",
      description: "Layered card depth effect with floating shadows",
      component: <Panel6Stack />,
    },
    {
      id: 7,
      name: "Flow",
      description: "Conversational chat bubble interface style",
      component: <Panel7Flow />,
    },
    {
      id: 8,
      name: "Ribbon",
      description: "Horizontal scrolling sections for feature discovery",
      component: <Panel8Ribbon />,
    },
    {
      id: 9,
      name: "Focus",
      description: "Single giant CTA with maximum conversion focus",
      component: <Panel9Focus />,
    },
    {
      id: 10,
      name: "Grid",
      description: "Social media inspired compact grid layout",
      component: <Panel10Grid />,
    },
    {
      id: 11,
      name: "Ticker",
      description: "Stock ticker inspired with live market feel",
      component: <Panel11Ticker />,
    },
    {
      id: 12,
      name: "Zen",
      description: "Extreme simplicity, centered single action",
      component: <Panel12Zen />,
    },
    {
      id: 13,
      name: "Award",
      description: "Premium achievement style with featured badge",
      component: <Panel13Award />,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-900 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge className="rounded-md bg-amber-500/20 text-amber-400 border-0 mb-4">
            Design Exploration
          </Badge>
          <h1 className="text-5xl font-bold text-white tracking-tight mb-4">
            13 Product Card Concepts
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            World-class product panel designs, each with a unique personality
            and approach to information architecture.
          </p>
        </div>

        {/* Panel Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {panels.map((panel) => (
            <div key={panel.id} className="space-y-3">
              {/* Panel Label */}
              <div className="px-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-500">
                    {String(panel.id).padStart(2, "0")}
                  </span>
                  <h2 className="font-semibold text-white">{panel.name}</h2>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {panel.description}
                </p>
              </div>

              {/* Panel Container */}
              <div className="w-full rounded-md overflow-hidden shadow-2xl border border-gray-800 hover:border-gray-700 transition-colors">
                {panel.component}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-16 text-sm text-gray-500">
          Each design is self-contained and production-ready
        </div>
      </div>
    </div>
  );
}

