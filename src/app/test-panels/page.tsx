"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
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
  Info
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
  location: "Melbourne",
  condition: "Good",
  description: "The Peugeot PX-10 is a classic French road racing bicycle renowned for its lightweight Reynolds 531 steel frame and high-quality components. Popular among professional cyclists in the 1960s and 1970s, it features a responsive ride and timeless design.",
  conditionDetails: "This Peugeot PX-10 looks like a classic vintage road bike with a sturdy steel frame and original paintwork that's held up quite well. The paint shows some scratches and small chips here and there, which is expected given its age. The tires appear serviceable but might need replacing soon for better riding safety and comfort. The saddle and handlebar tape look original but show signs of wear; they're usable but a refresh would improve comfort.",
  seller: {
    name: "Ashburton Cycles",
    type: "Bicycle Store",
    logo: null
  }
};

// =============================================================================
// STRIPE BRANDING COMPONENT
// =============================================================================
function StripeBranding() {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <span className="text-[11px] text-gray-400">Secured by</span>
      <svg className="h-[14px] w-auto text-gray-400" viewBox="0 0 60 25" fill="currentColor">
        <path d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a10.7 10.7 0 0 1-4.56.95c-4.01 0-6.83-2.5-6.83-7.28 0-4.19 2.39-7.34 6.42-7.34 3.95 0 5.87 2.87 5.87 7.22 0 .48-.03 1.03-.09 1.53zm-5.79-5.8c-1.11 0-2.07.8-2.27 2.52h4.44c-.09-1.68-.98-2.52-2.17-2.52zM41.87 19.51V8.04h4.02v1.33c.88-1 2.1-1.65 3.56-1.65 1.3 0 2.3.44 2.94 1.22.7.85 1 2.08 1 3.65v7.07h-4.15V13.4c0-1.33-.41-2.1-1.5-2.1-.88 0-1.54.48-1.75 1.24-.07.22-.12.55-.12 1v5.97h-4zm-6.5-14.98h4.15v14.98h-4.15V4.53zm-5.02 15.18c-1.26 0-2.3-.22-3-.67v2.96l-4.14.88V5.87h4.14v1.18c.85-.96 2.05-1.52 3.37-1.52 2.7 0 4.97 2.37 4.97 7.02 0 5.06-2.47 7.16-5.34 7.16zm-.96-10.76c-.88 0-1.54.37-2 1.04v4.94c.44.63 1.1 1 1.96 1 1.34 0 2.19-1.3 2.19-3.53 0-2.15-.81-3.45-2.15-3.45zm-8.52-.37h-3.85v-3.7l4-.85v4.55h3.15v3.18h-3.15v4.68c0 1.35.52 1.78 1.3 1.78.52 0 1-.15 1.67-.44v3.35a7.6 7.6 0 0 1-2.82.56c-2.44 0-4.15-1.3-4.15-4.16V11.76H14v-3.18h1.93V5.18l4.14-.88v4.28h3.85l-.05 3.18zM10.04 5.87c1.11.33 2.09 1.04 2.09 2.67 0 1-.37 1.67-.96 2.19-.63.52-1.5.81-2.56.81H6.74v3.97h-4V5.53H9a5.6 5.6 0 0 1 1.04.34zm-1.18 3.19c0-.44-.26-.74-.78-.74H6.74v1.5h1.34c.52 0 .78-.33.78-.76z" fillRule="evenodd"/>
      </svg>
    </div>
  );
}

// =============================================================================
// PANEL 1: CLEAN CLASSIC - Refined Facebook Marketplace Style
// =============================================================================
function PanelCleanClassic() {
  const [isLiked, setIsLiked] = React.useState(false);

  return (
    <div className="bg-white">
      {/* Title, Price, Location */}
      <div className="px-4 py-4 space-y-3">
        <h1 className="text-2xl font-bold text-gray-900 leading-tight">
          {mockProduct.name}
        </h1>
        <p className="text-3xl font-bold text-gray-900">
          ${mockProduct.price.toLocaleString("en-AU")}
        </p>
        <div className="flex items-center gap-1.5 text-gray-600">
          <MapPin className="h-4 w-4" />
          <span className="text-sm">Nearby • {mockProduct.location}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-4 pb-4 space-y-3">
        {/* Primary CTA: Buy Now */}
        <div className="flex flex-col">
          <Button 
            size="lg" 
            className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800 text-white font-medium"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Buy Now · ${mockProduct.price}
          </Button>
          <StripeBranding />
        </div>

        {/* Secondary CTAs */}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 h-12 rounded-md border-2 border-gray-300 hover:border-gray-400 hover:bg-gray-50">
            <Tag className="h-4 w-4 mr-2" />
            Make an Offer
          </Button>
          <Button variant="outline" className="flex-1 h-12 rounded-md border-2 border-gray-300 hover:border-gray-400 hover:bg-gray-50">
            <MessageCircle className="h-4 w-4 mr-2" />
            Send Message
          </Button>
        </div>
      </div>

      {/* Express Delivery Banner */}
      <div className="px-4 pb-4">
        <Card className="bg-white border border-gray-200 rounded-md py-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 h-10 w-10 rounded-md bg-gray-900 flex items-center justify-center">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">1-Hour Express Delivery</span>
                  <Badge variant="secondary" className="rounded-md text-[10px] px-1.5 py-0 h-5 bg-gray-100 text-gray-600 border-0">
                    On-demand
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Order now, delivered to your door today</p>
              </div>
              <Truck className="h-5 w-5 text-gray-400 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Actions */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-around">
          <button className="flex flex-col items-center gap-1.5 py-2 hover:opacity-70 transition-opacity">
            <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Share2 className="h-5 w-5 text-gray-700" />
            </div>
            <span className="text-xs text-gray-700">Share</span>
          </button>
          <button 
            onClick={() => setIsLiked(!isLiked)}
            className="flex flex-col items-center gap-1.5 py-2 hover:opacity-70 transition-opacity"
          >
            <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Heart className={cn("h-5 w-5", isLiked ? "fill-red-500 text-red-500" : "text-gray-700")} />
            </div>
            <span className="text-xs text-gray-700">Save</span>
          </button>
          <button className="flex flex-col items-center gap-1.5 py-2 hover:opacity-70 transition-opacity">
            <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Store className="h-5 w-5 text-gray-700" />
            </div>
            <span className="text-xs text-gray-700">Visit Store</span>
          </button>
          <button className="flex flex-col items-center gap-1.5 py-2 hover:opacity-80 transition-opacity">
            <div className="h-10 w-10 rounded-full bg-gray-900 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xs text-gray-700">Research</span>
          </button>
        </div>
      </div>

      {/* Description */}
      <div className="border-t border-gray-200">
        <div className="px-4 py-4">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Description</h2>
          <p className="text-sm text-gray-700 leading-relaxed">
            {mockProduct.conditionDetails}
          </p>
        </div>
      </div>

      {/* Seller Information */}
      <div className="border-t border-gray-200">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">Seller information</h2>
            <span className="text-sm text-blue-600 font-medium cursor-pointer">Seller Details</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
              <User className="h-5 w-5 text-gray-400" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{mockProduct.seller.name}</p>
              <p className="text-sm text-gray-600">{mockProduct.seller.type}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="border-t border-gray-200">
        <div className="px-4 py-4">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Details</h2>
          <div className="divide-y divide-gray-100">
            <div className="flex justify-between py-2">
              <span className="text-sm text-gray-600">Condition</span>
              <span className="text-sm font-medium text-gray-900">{mockProduct.condition}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Location */}
      <div className="border-t border-gray-200">
        <div className="px-4 py-4">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Location</h2>
          <p className="text-sm text-gray-900 font-medium">{mockProduct.location}</p>
          <p className="text-sm text-gray-600 mt-1">Location is approximate</p>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// PANEL 2: COMPACT STICKY - Fixed Actions, Scrollable Content
// =============================================================================
function PanelCompactSticky() {
  const [isLiked, setIsLiked] = React.useState(false);

  return (
    <div className="bg-white flex flex-col h-[600px]">
      {/* Sticky Top Section */}
      <div className="flex-shrink-0 border-b border-gray-100">
        {/* Title & Price */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900 leading-tight truncate">
                {mockProduct.name}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <MapPin className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs text-gray-500">{mockProduct.location}</span>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">${mockProduct.price}</p>
          </div>
        </div>

        {/* Actions - Always Visible */}
        <div className="px-4 pb-4 space-y-2">
          <div className="flex flex-col">
            <Button className="w-full h-11 rounded-md bg-gray-900 hover:bg-gray-800 font-medium">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Buy Now · ${mockProduct.price}
            </Button>
            <StripeBranding />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 h-9 rounded-md text-xs">
              <Tag className="h-3.5 w-3.5 mr-1.5" />
              Offer
            </Button>
            <Button variant="outline" size="sm" className="flex-1 h-9 rounded-md text-xs">
              <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
              Message
            </Button>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Quick Actions Row */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsLiked(!isLiked)}
                className="h-9 w-9 rounded-md bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <Heart className={cn("h-4 w-4", isLiked ? "fill-red-500 text-red-500" : "text-gray-600")} />
              </button>
              <button className="h-9 w-9 rounded-md bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                <Share2 className="h-4 w-4 text-gray-600" />
              </button>
              <button className="h-9 w-9 rounded-md bg-gray-900 flex items-center justify-center hover:bg-gray-800 transition-colors">
                <Sparkles className="h-4 w-4 text-white" />
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Shield className="h-3.5 w-3.5 text-emerald-500" />
              <span>Buyer Protection</span>
            </div>
          </div>
        </div>

        {/* Express Banner - Compact */}
        <div className="px-4 py-3 border-b border-gray-100 bg-amber-50/50">
          <div className="flex items-center gap-2.5">
            <Zap className="h-4 w-4 text-amber-600" />
            <div>
              <span className="text-xs font-semibold text-gray-900">1-Hour Express</span>
              <span className="text-xs text-gray-500 ml-1.5">• Delivered today</span>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="px-4 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Description</h3>
          <p className="text-sm text-gray-600 leading-relaxed line-clamp-4">
            {mockProduct.conditionDetails}
          </p>
        </div>

        {/* Seller */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                <Store className="h-5 w-5 text-gray-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{mockProduct.seller.name}</p>
                <p className="text-xs text-gray-500">{mockProduct.seller.type}</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </div>
        </div>

        {/* Details */}
        <div className="px-4 py-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Details</h3>
          <div className="flex justify-between py-1.5">
            <span className="text-sm text-gray-500">Condition</span>
            <span className="text-sm font-medium text-gray-900">{mockProduct.condition}</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-sm text-gray-500">Location</span>
            <span className="text-sm font-medium text-gray-900">{mockProduct.location}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// PANEL 3: MODERN CARDS - Separated Card Sections
// =============================================================================
function PanelModernCards() {
  const [isLiked, setIsLiked] = React.useState(false);

  return (
    <div className="bg-gray-50 p-4 space-y-3">
      {/* Price Card */}
      <Card className="bg-white border-0 shadow-sm rounded-md">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{mockProduct.name}</h1>
              <div className="flex items-center gap-1.5 mt-1">
                <MapPin className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs text-gray-500">{mockProduct.location}</span>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button 
                onClick={() => setIsLiked(!isLiked)}
                className="h-8 w-8 rounded-md bg-gray-100 flex items-center justify-center hover:bg-gray-200"
              >
                <Heart className={cn("h-4 w-4", isLiked ? "fill-red-500 text-red-500" : "text-gray-500")} />
              </button>
              <button className="h-8 w-8 rounded-md bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                <Share2 className="h-4 w-4 text-gray-500" />
              </button>
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">${mockProduct.price}</p>
        </CardContent>
      </Card>

      {/* Purchase Card */}
      <Card className="bg-white border-0 shadow-sm rounded-md">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col">
            <Button className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800 font-medium">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Buy Now · ${mockProduct.price}
            </Button>
            <StripeBranding />
          </div>
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
        </CardContent>
      </Card>

      {/* Express Delivery Card */}
      <Card className="bg-white border-0 shadow-sm rounded-md">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-gray-900 flex items-center justify-center">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">1-Hour Express</span>
                <Badge className="rounded-md text-[10px] px-1.5 h-5 bg-gray-100 text-gray-600 border-0">On-demand</Badge>
              </div>
              <p className="text-xs text-gray-500">Delivered to your door today</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trust Card */}
      <Card className="bg-white border-0 shadow-sm rounded-md">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-emerald-50 flex items-center justify-center">
              <Shield className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Buyer Protection</p>
              <p className="text-xs text-gray-500">Full refund if item not as described</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions Card */}
      <Card className="bg-white border-0 shadow-sm rounded-md">
        <CardContent className="p-3">
          <div className="flex items-center justify-around">
            <button className="flex flex-col items-center gap-1 py-1">
              <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
                <Store className="h-4 w-4 text-gray-600" />
              </div>
              <span className="text-[10px] text-gray-500">Store</span>
            </button>
            <button className="flex flex-col items-center gap-1 py-1">
              <div className="h-9 w-9 rounded-full bg-gray-900 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <span className="text-[10px] text-gray-500">Research</span>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Seller Card */}
      <Card className="bg-white border-0 shadow-sm rounded-md">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-gray-100 flex items-center justify-center">
                <User className="h-5 w-5 text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{mockProduct.seller.name}</p>
                <p className="text-xs text-gray-500">{mockProduct.seller.type}</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </div>
        </CardContent>
      </Card>

      {/* Description Card */}
      <Card className="bg-white border-0 shadow-sm rounded-md">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Description</h3>
          <p className="text-sm text-gray-600 leading-relaxed">{mockProduct.conditionDetails}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// PANEL 4: MINIMAL ELEGANT - Ultra Clean with Refined Typography
// =============================================================================
function PanelMinimalElegant() {
  const [isLiked, setIsLiked] = React.useState(false);

  return (
    <div className="bg-white">
      {/* Elegant Header */}
      <div className="px-5 py-6">
        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-[0.15em] mb-2">Vintage Road Bicycle</p>
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight leading-tight">
          {mockProduct.name}
        </h1>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="text-4xl font-light text-gray-900 tracking-tight">${mockProduct.price}</p>
            <p className="text-xs text-gray-400 mt-1">{mockProduct.location} • {mockProduct.condition}</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setIsLiked(!isLiked)}
              className="h-10 w-10 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-300 transition-colors"
            >
              <Heart className={cn("h-4 w-4", isLiked ? "fill-red-500 text-red-500" : "text-gray-400")} />
            </button>
            <button className="h-10 w-10 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-300 transition-colors">
              <Share2 className="h-4 w-4 text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 pb-6 space-y-3">
        <div className="flex flex-col">
          <Button className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Buy Now
          </Button>
          <StripeBranding />
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 h-11 rounded-md border-gray-200">
            <Tag className="h-4 w-4 mr-2" />
            Offer
          </Button>
          <Button variant="outline" className="flex-1 h-11 rounded-md border-gray-200">
            <MessageCircle className="h-4 w-4 mr-2" />
            Message
          </Button>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 h-px bg-gray-100" />

      {/* Express Delivery */}
      <div className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-gray-900 flex items-center justify-center">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">1-Hour Express Delivery</p>
            <p className="text-xs text-gray-400">Order now, delivered today</p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 h-px bg-gray-100" />

      {/* Quick Links */}
      <div className="px-5 py-4 flex items-center justify-between">
        <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <Store className="h-4 w-4" />
          <span>Visit Store</span>
        </button>
        <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <Sparkles className="h-4 w-4" />
          <span>AI Research</span>
        </button>
        <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <Shield className="h-4 w-4" />
          <span>Protected</span>
        </button>
      </div>

      {/* Divider */}
      <div className="mx-5 h-px bg-gray-100" />

      {/* Description */}
      <div className="px-5 py-5">
        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Description</h3>
        <p className="text-sm text-gray-600 leading-relaxed">{mockProduct.conditionDetails}</p>
      </div>

      {/* Divider */}
      <div className="mx-5 h-px bg-gray-100" />

      {/* Seller */}
      <div className="px-5 py-5">
        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Seller</h3>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
            <User className="h-4 w-4 text-gray-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">{mockProduct.seller.name}</p>
            <p className="text-xs text-gray-400">{mockProduct.seller.type}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// PANEL 5: BOLD ACTION - Large CTA Focus
// =============================================================================
function PanelBoldAction() {
  const [isLiked, setIsLiked] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);

  return (
    <div className="bg-white">
      {/* Title Area */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between">
          <h1 className="text-2xl font-bold text-gray-900 leading-tight flex-1 pr-3">
            {mockProduct.name}
          </h1>
          <div className="flex gap-1.5">
            <button 
              onClick={() => setIsLiked(!isLiked)}
              className="h-9 w-9 rounded-md bg-gray-100 flex items-center justify-center"
            >
              <Heart className={cn("h-4 w-4", isLiked ? "fill-red-500 text-red-500" : "text-gray-600")} />
            </button>
            <button className="h-9 w-9 rounded-md bg-gray-100 flex items-center justify-center">
              <Share2 className="h-4 w-4 text-gray-600" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Badge className="rounded-md bg-gray-100 text-gray-700 border-0 text-xs">{mockProduct.condition}</Badge>
          <span className="text-xs text-gray-400">•</span>
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {mockProduct.location}
          </span>
        </div>
      </div>

      {/* BOLD Price + CTA */}
      <div className="px-4 pb-4">
        <div className="bg-gray-900 rounded-md p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-3xl font-bold text-white">${mockProduct.price}</p>
            <div className="flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-emerald-400" />
              <span className="text-xs text-gray-300">Protected</span>
            </div>
          </div>
          <Button className="w-full h-12 rounded-md bg-white text-gray-900 hover:bg-gray-100 font-semibold">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Buy Now
          </Button>
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <span className="text-[10px] text-gray-400">Secured by</span>
            <svg className="h-[12px] w-auto text-gray-400" viewBox="0 0 60 25" fill="currentColor">
              <path d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a10.7 10.7 0 0 1-4.56.95c-4.01 0-6.83-2.5-6.83-7.28 0-4.19 2.39-7.34 6.42-7.34 3.95 0 5.87 2.87 5.87 7.22 0 .48-.03 1.03-.09 1.53zm-5.79-5.8c-1.11 0-2.07.8-2.27 2.52h4.44c-.09-1.68-.98-2.52-2.17-2.52zM41.87 19.51V8.04h4.02v1.33c.88-1 2.1-1.65 3.56-1.65 1.3 0 2.3.44 2.94 1.22.7.85 1 2.08 1 3.65v7.07h-4.15V13.4c0-1.33-.41-2.1-1.5-2.1-.88 0-1.54.48-1.75 1.24-.07.22-.12.55-.12 1v5.97h-4zm-6.5-14.98h4.15v14.98h-4.15V4.53zm-5.02 15.18c-1.26 0-2.3-.22-3-.67v2.96l-4.14.88V5.87h4.14v1.18c.85-.96 2.05-1.52 3.37-1.52 2.7 0 4.97 2.37 4.97 7.02 0 5.06-2.47 7.16-5.34 7.16zm-.96-10.76c-.88 0-1.54.37-2 1.04v4.94c.44.63 1.1 1 1.96 1 1.34 0 2.19-1.3 2.19-3.53 0-2.15-.81-3.45-2.15-3.45zm-8.52-.37h-3.85v-3.7l4-.85v4.55h3.15v3.18h-3.15v4.68c0 1.35.52 1.78 1.3 1.78.52 0 1-.15 1.67-.44v3.35a7.6 7.6 0 0 1-2.82.56c-2.44 0-4.15-1.3-4.15-4.16V11.76H14v-3.18h1.93V5.18l4.14-.88v4.28h3.85l-.05 3.18zM10.04 5.87c1.11.33 2.09 1.04 2.09 2.67 0 1-.37 1.67-.96 2.19-.63.52-1.5.81-2.56.81H6.74v3.97h-4V5.53H9a5.6 5.6 0 0 1 1.04.34zm-1.18 3.19c0-.44-.26-.74-.78-.74H6.74v1.5h1.34c.52 0 .78-.33.78-.76z" fillRule="evenodd"/>
            </svg>
          </div>
        </div>
      </div>

      {/* Secondary Actions */}
      <div className="px-4 pb-4 flex gap-2">
        <Button variant="outline" className="flex-1 h-11 rounded-md">
          <Tag className="h-4 w-4 mr-2" />
          Make Offer
        </Button>
        <Button variant="outline" className="flex-1 h-11 rounded-md">
          <MessageCircle className="h-4 w-4 mr-2" />
          Message
        </Button>
      </div>

      {/* Express Banner */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-md">
          <Zap className="h-5 w-5 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-gray-900">1-Hour Express Delivery</p>
            <p className="text-xs text-gray-500">Order now, delivered today</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 pb-4 flex items-center justify-around border-t border-gray-100 pt-4">
        <button className="flex flex-col items-center gap-1.5">
          <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
            <Store className="h-5 w-5 text-gray-600" />
          </div>
          <span className="text-xs text-gray-600">Store</span>
        </button>
        <button className="flex flex-col items-center gap-1.5">
          <div className="h-10 w-10 rounded-full bg-gray-900 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <span className="text-xs text-gray-600">Research</span>
        </button>
      </div>

      {/* Collapsible Details */}
      <div className="border-t border-gray-100">
        <button 
          onClick={() => setShowDetails(!showDetails)}
          className="w-full px-4 py-4 flex items-center justify-between"
        >
          <span className="text-sm font-semibold text-gray-900">Details & Description</span>
          <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform duration-200", showDetails && "rotate-180")} />
        </button>
        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-4">
                <p className="text-sm text-gray-600 leading-relaxed">{mockProduct.conditionDetails}</p>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-md">
                  <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{mockProduct.seller.name}</p>
                    <p className="text-xs text-gray-500">{mockProduct.seller.type}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// =============================================================================
// PANEL 6: SPLIT PRICE - Price and Actions Side by Side
// =============================================================================
function PanelSplitPrice() {
  const [isLiked, setIsLiked] = React.useState(false);

  return (
    <div className="bg-white">
      {/* Split Header */}
      <div className="px-4 py-4">
        <h1 className="text-xl font-bold text-gray-900 leading-tight mb-4">
          {mockProduct.name}
        </h1>
        
        {/* Price + Quick Actions Row */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-3xl font-bold text-gray-900">${mockProduct.price}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <MapPin className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs text-gray-500">{mockProduct.location}</span>
              <span className="text-gray-300">•</span>
              <span className="text-xs text-gray-500">{mockProduct.condition}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <button 
              onClick={() => setIsLiked(!isLiked)}
              className="h-10 w-10 rounded-md bg-gray-100 flex items-center justify-center hover:bg-gray-200"
            >
              <Heart className={cn("h-5 w-5", isLiked ? "fill-red-500 text-red-500" : "text-gray-600")} />
            </button>
            <button className="h-10 w-10 rounded-md bg-gray-100 flex items-center justify-center hover:bg-gray-200">
              <Share2 className="h-5 w-5 text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Full Width Actions */}
      <div className="px-4 pb-4 space-y-2">
        <div className="flex flex-col">
          <Button className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800 font-medium">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Buy Now · ${mockProduct.price}
          </Button>
          <StripeBranding />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11 rounded-md">
            <Tag className="h-4 w-4 mr-1.5" />
            Make Offer
          </Button>
          <Button variant="outline" className="h-11 rounded-md">
            <MessageCircle className="h-4 w-4 mr-1.5" />
            Message
          </Button>
        </div>
      </div>

      {/* Features Row */}
      <div className="px-4 pb-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center p-3 bg-gray-50 rounded-md">
            <Zap className="h-5 w-5 text-gray-700 mb-1" />
            <span className="text-[10px] text-gray-600 text-center">1-Hour Express</span>
          </div>
          <div className="flex flex-col items-center p-3 bg-gray-50 rounded-md">
            <Shield className="h-5 w-5 text-gray-700 mb-1" />
            <span className="text-[10px] text-gray-600 text-center">Protected</span>
          </div>
          <div className="flex flex-col items-center p-3 bg-gray-50 rounded-md">
            <Sparkles className="h-5 w-5 text-gray-700 mb-1" />
            <span className="text-[10px] text-gray-600 text-center">AI Research</span>
          </div>
        </div>
      </div>

      {/* Express Delivery Highlight */}
      <div className="mx-4 mb-4 p-3 bg-amber-50 rounded-md border border-amber-100">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-medium text-gray-900">Express: Delivered today</span>
        </div>
      </div>

      {/* Seller Row */}
      <div className="px-4 py-3 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Store className="h-5 w-5 text-gray-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{mockProduct.seller.name}</p>
              <p className="text-xs text-gray-500">{mockProduct.seller.type}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-xs">
            View Store
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </div>

      {/* Description */}
      <div className="px-4 py-4 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Description</h3>
        <p className="text-sm text-gray-600 leading-relaxed">{mockProduct.conditionDetails}</p>
      </div>

      {/* Location */}
      <div className="px-4 py-3 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-600">{mockProduct.location}</span>
          </div>
          <span className="text-xs text-gray-400">Approximate</span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// PANEL 7: TRUST FOCUSED - Emphasizing Security and Protection
// =============================================================================
function PanelTrustFocused() {
  const [isLiked, setIsLiked] = React.useState(false);

  return (
    <div className="bg-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between">
          <h1 className="text-xl font-bold text-gray-900 leading-tight flex-1 pr-2">
            {mockProduct.name}
          </h1>
          <div className="flex gap-1.5">
            <button 
              onClick={() => setIsLiked(!isLiked)}
              className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center"
            >
              <Heart className={cn("h-4 w-4", isLiked ? "fill-red-500 text-red-500" : "text-gray-500")} />
            </button>
            <button className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
              <Share2 className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-2xl font-bold text-gray-900">${mockProduct.price}</span>
          <Badge className="rounded-md bg-emerald-50 text-emerald-700 border-0 text-xs">{mockProduct.condition}</Badge>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <MapPin className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-xs text-gray-500">{mockProduct.location}</span>
        </div>
      </div>

      {/* Trust Indicators Bar */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-md border border-emerald-100">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">Buyer Protection Active</p>
              <p className="text-[10px] text-emerald-600">Full refund if not as described</p>
            </div>
          </div>
          <BadgeCheck className="h-6 w-6 text-emerald-500" />
        </div>
      </div>

      {/* Purchase Actions */}
      <div className="px-4 pb-4 space-y-2">
        <div className="flex flex-col">
          <Button className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800 font-medium">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Buy Now · ${mockProduct.price}
          </Button>
          <StripeBranding />
        </div>
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

      {/* Trust Checklist */}
      <div className="px-4 pb-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5 py-2">
            <CircleCheck className="h-4 w-4 text-emerald-500" />
            <span className="text-sm text-gray-700">Secure Stripe checkout</span>
          </div>
          <div className="flex items-center gap-2.5 py-2">
            <CircleCheck className="h-4 w-4 text-emerald-500" />
            <span className="text-sm text-gray-700">Funds held until you confirm</span>
          </div>
          <div className="flex items-center gap-2.5 py-2">
            <CircleCheck className="h-4 w-4 text-emerald-500" />
            <span className="text-sm text-gray-700">1-Hour express delivery available</span>
          </div>
          <div className="flex items-center gap-2.5 py-2">
            <CircleCheck className="h-4 w-4 text-emerald-500" />
            <span className="text-sm text-gray-700">Verified seller account</span>
          </div>
        </div>
      </div>

      {/* Express Delivery */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-md">
          <div className="h-10 w-10 rounded-md bg-gray-900 flex items-center justify-center">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">1-Hour Express</p>
            <p className="text-xs text-gray-500">Delivered to your door today</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 pb-4 flex items-center gap-3">
        <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <Store className="h-4 w-4" />
          <span>Visit Store</span>
        </button>
        <span className="text-gray-200">|</span>
        <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <Sparkles className="h-4 w-4" />
          <span>AI Research</span>
        </button>
      </div>

      {/* Seller */}
      <div className="px-4 py-4 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-full bg-gray-100 flex items-center justify-center">
            <User className="h-5 w-5 text-gray-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-gray-900">{mockProduct.seller.name}</p>
              <BadgeCheck className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-xs text-gray-500">{mockProduct.seller.type}</p>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-300" />
        </div>
      </div>

      {/* Description */}
      <div className="px-4 py-4 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Description</h3>
        <p className="text-sm text-gray-600 leading-relaxed line-clamp-4">{mockProduct.conditionDetails}</p>
      </div>
    </div>
  );
}

// =============================================================================
// PANEL 8: TABBED INFO - Tabs for Description/Details/Seller
// =============================================================================
function PanelTabbedInfo() {
  const [isLiked, setIsLiked] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'description' | 'details' | 'seller'>('description');

  return (
    <div className="bg-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900 leading-tight">{mockProduct.name}</h1>
            <div className="flex items-center gap-1.5 mt-1">
              <MapPin className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs text-gray-500">{mockProduct.location}</span>
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">${mockProduct.price}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 space-y-2">
        <div className="flex flex-col">
          <Button className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800 font-medium">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Buy Now · ${mockProduct.price}
          </Button>
          <StripeBranding />
        </div>
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

      {/* Quick Actions Row */}
      <div className="px-4 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsLiked(!isLiked)}
            className="h-9 w-9 rounded-md bg-gray-100 flex items-center justify-center"
          >
            <Heart className={cn("h-4 w-4", isLiked ? "fill-red-500 text-red-500" : "text-gray-600")} />
          </button>
          <button className="h-9 w-9 rounded-md bg-gray-100 flex items-center justify-center">
            <Share2 className="h-4 w-4 text-gray-600" />
          </button>
          <button className="h-9 w-9 rounded-md bg-gray-900 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </button>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Shield className="h-3.5 w-3.5 text-emerald-500" />
          <span>Protected</span>
        </div>
      </div>

      {/* Express Banner */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-md">
          <Zap className="h-5 w-5 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-gray-900">1-Hour Express</p>
            <p className="text-xs text-gray-500">Delivered to your door today</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4">
        <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-full">
          <button
            onClick={() => setActiveTab('description')}
            className={cn(
              "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              activeTab === 'description'
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70"
            )}
          >
            Description
          </button>
          <button
            onClick={() => setActiveTab('details')}
            className={cn(
              "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              activeTab === 'details'
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70"
            )}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('seller')}
            className={cn(
              "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              activeTab === 'seller'
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70"
            )}
          >
            Seller
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-4 py-4 min-h-[180px]">
        {activeTab === 'description' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <p className="text-sm text-gray-600 leading-relaxed">{mockProduct.conditionDetails}</p>
          </motion.div>
        )}
        {activeTab === 'details' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-2"
          >
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">Condition</span>
              <span className="text-sm font-medium text-gray-900">{mockProduct.condition}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">Category</span>
              <span className="text-sm font-medium text-gray-900">Road Bike</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">Location</span>
              <span className="text-sm font-medium text-gray-900">{mockProduct.location}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm text-gray-500">Frame</span>
              <span className="text-sm font-medium text-gray-900">Reynolds 531</span>
            </div>
          </motion.div>
        )}
        {activeTab === 'seller' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center">
                <Store className="h-7 w-7 text-gray-400" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900">{mockProduct.seller.name}</p>
                <p className="text-sm text-gray-500">{mockProduct.seller.type}</p>
              </div>
            </div>
            <Button variant="outline" className="w-full h-10 rounded-md">
              <Store className="h-4 w-4 mr-2" />
              Visit Store
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// PANEL 9: INLINE ACTIONS - Compact Horizontal Layout
// =============================================================================
function PanelInlineActions() {
  const [isLiked, setIsLiked] = React.useState(false);

  return (
    <div className="bg-white">
      {/* Compact Header */}
      <div className="px-4 py-4">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
          <MapPin className="h-3 w-3" />
          <span>{mockProduct.location}</span>
          <span>•</span>
          <span>{mockProduct.condition}</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 leading-tight">
          {mockProduct.name}
        </h1>
        <p className="text-2xl font-bold text-gray-900 mt-2">${mockProduct.price}</p>
      </div>

      {/* Inline Action Bar */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Button className="w-full h-11 rounded-md bg-gray-900 hover:bg-gray-800 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Buy · ${mockProduct.price}
            </Button>
          </div>
          <Button variant="outline" size="icon" className="h-11 w-11 rounded-md shrink-0">
            <Tag className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-11 w-11 rounded-md shrink-0">
            <MessageCircle className="h-4 w-4" />
          </Button>
        </div>
        <StripeBranding />
      </div>

      {/* Feature Pills */}
      <div className="px-4 pb-4">
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-full text-xs font-medium text-amber-700">
            <Zap className="h-3 w-3" />
            1-Hour Express
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 rounded-full text-xs font-medium text-emerald-700">
            <Shield className="h-3 w-3" />
            Protected
          </div>
        </div>
      </div>

      {/* Inline Actions Row */}
      <div className="px-4 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsLiked(!isLiked)}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
          >
            <Heart className={cn("h-4 w-4", isLiked ? "fill-red-500 text-red-500" : "")} />
            <span>Save</span>
          </button>
          <button className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
            <Share2 className="h-4 w-4" />
            <span>Share</span>
          </button>
        </div>
        <button className="flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-gray-600">
          <Sparkles className="h-4 w-4" />
          <span>Research</span>
        </button>
      </div>

      {/* Seller Quick View */}
      <div className="mx-4 p-3 bg-gray-50 rounded-md mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-white flex items-center justify-center shadow-sm">
              <Store className="h-4 w-4 text-gray-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{mockProduct.seller.name}</p>
              <p className="text-xs text-gray-500">{mockProduct.seller.type}</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-gray-400" />
        </div>
      </div>

      {/* Description */}
      <div className="px-4 py-4 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">About this item</h3>
        <p className="text-sm text-gray-600 leading-relaxed">{mockProduct.conditionDetails}</p>
      </div>

      {/* Details */}
      <div className="px-4 py-4 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Details</h3>
        <div className="flex justify-between py-1.5">
          <span className="text-sm text-gray-500">Condition</span>
          <span className="text-sm font-medium text-gray-900">{mockProduct.condition}</span>
        </div>
        <div className="flex justify-between py-1.5">
          <span className="text-sm text-gray-500">Location</span>
          <span className="text-sm font-medium text-gray-900">{mockProduct.location}</span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// PANEL 10: GRADIENT ACCENT - Subtle Gradient Header
// =============================================================================
function PanelGradientAccent() {
  const [isLiked, setIsLiked] = React.useState(false);

  return (
    <div className="bg-white overflow-hidden">
      {/* Gradient Header */}
      <div className="bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 px-4 py-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900 leading-tight">{mockProduct.name}</h1>
            <div className="flex items-center gap-2 mt-2">
              <Badge className="rounded-md bg-white/80 text-gray-700 border-0 text-xs shadow-sm">{mockProduct.condition}</Badge>
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {mockProduct.location}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <p className="text-2xl font-bold text-gray-900">${mockProduct.price}</p>
            <div className="flex gap-1">
              <button 
                onClick={() => setIsLiked(!isLiked)}
                className="h-8 w-8 rounded-md bg-white/80 flex items-center justify-center shadow-sm"
              >
                <Heart className={cn("h-4 w-4", isLiked ? "fill-red-500 text-red-500" : "text-gray-500")} />
              </button>
              <button className="h-8 w-8 rounded-md bg-white/80 flex items-center justify-center shadow-sm">
                <Share2 className="h-4 w-4 text-gray-500" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-4 space-y-2">
        <div className="flex flex-col">
          <Button className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800 font-medium">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Buy Now · ${mockProduct.price}
          </Button>
          <StripeBranding />
        </div>
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

      {/* Features */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 p-2.5 bg-amber-50 rounded-md">
            <Zap className="h-4 w-4 text-amber-600" />
            <span className="text-xs font-medium text-gray-900">1-Hour Express</span>
          </div>
          <div className="flex-1 flex items-center gap-2 p-2.5 bg-emerald-50 rounded-md">
            <Shield className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-medium text-gray-900">Protected</span>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="px-4 pb-4 flex items-center justify-around border-b border-gray-100">
        <button className="flex flex-col items-center gap-1 py-2">
          <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
            <Store className="h-4 w-4 text-gray-600" />
          </div>
          <span className="text-[10px] text-gray-500">Store</span>
        </button>
        <button className="flex flex-col items-center gap-1 py-2">
          <div className="h-9 w-9 rounded-full bg-gray-900 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="text-[10px] text-gray-500">Research</span>
        </button>
        <button className="flex flex-col items-center gap-1 py-2">
          <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
            <Info className="h-4 w-4 text-gray-600" />
          </div>
          <span className="text-[10px] text-gray-500">Help</span>
        </button>
      </div>

      {/* Seller */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-gray-100 flex items-center justify-center">
              <User className="h-5 w-5 text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{mockProduct.seller.name}</p>
              <p className="text-xs text-gray-500">{mockProduct.seller.type}</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-300" />
        </div>
      </div>

      {/* Description */}
      <div className="px-4 py-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Description</h3>
        <p className="text-sm text-gray-600 leading-relaxed">{mockProduct.conditionDetails}</p>
      </div>

      {/* Location */}
      <div className="px-4 py-4 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Location</h3>
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-600">{mockProduct.location}</span>
          <span className="text-xs text-gray-400">(approximate)</span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// PANEL 11: UNDERLINE TABS - Classic Underline Tab Style
// =============================================================================
function PanelUnderlineTabs() {
  const [isLiked, setIsLiked] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'overview' | 'specs' | 'seller'>('overview');

  return (
    <div className="bg-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold text-gray-900 leading-tight">{mockProduct.name}</h1>
        <div className="flex items-center justify-between mt-2">
          <p className="text-2xl font-bold text-gray-900">${mockProduct.price}</p>
          <div className="flex gap-1.5">
            <button 
              onClick={() => setIsLiked(!isLiked)}
              className="h-9 w-9 rounded-md bg-gray-100 flex items-center justify-center"
            >
              <Heart className={cn("h-4 w-4", isLiked ? "fill-red-500 text-red-500" : "text-gray-600")} />
            </button>
            <button className="h-9 w-9 rounded-md bg-gray-100 flex items-center justify-center">
              <Share2 className="h-4 w-4 text-gray-600" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <MapPin className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-xs text-gray-500">{mockProduct.location} • {mockProduct.condition}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 space-y-2">
        <div className="flex flex-col">
          <Button className="w-full h-11 rounded-md bg-gray-900 hover:bg-gray-800 font-medium">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Buy Now · ${mockProduct.price}
          </Button>
          <StripeBranding />
        </div>
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

      {/* Express + Trust Row */}
      <div className="px-4 pb-4 flex gap-2">
        <div className="flex-1 flex items-center gap-2 p-2.5 bg-amber-50 rounded-md">
          <Zap className="h-4 w-4 text-amber-600" />
          <span className="text-xs font-medium text-gray-800">Express Delivery</span>
        </div>
        <div className="flex-1 flex items-center gap-2 p-2.5 bg-emerald-50 rounded-md">
          <Shield className="h-4 w-4 text-emerald-600" />
          <span className="text-xs font-medium text-gray-800">Protected</span>
        </div>
      </div>

      {/* Underline Tabs */}
      <div className="px-4 border-b border-gray-200">
        <div className="flex">
          <button
            onClick={() => setActiveTab('overview')}
            className={cn(
              "flex-1 pb-3 text-sm font-medium border-b-2 transition-colors",
              activeTab === 'overview'
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('specs')}
            className={cn(
              "flex-1 pb-3 text-sm font-medium border-b-2 transition-colors",
              activeTab === 'specs'
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            Specs
          </button>
          <button
            onClick={() => setActiveTab('seller')}
            className={cn(
              "flex-1 pb-3 text-sm font-medium border-b-2 transition-colors",
              activeTab === 'seller'
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            Seller
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-4 py-4 min-h-[200px]">
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
            >
              <p className="text-sm text-gray-600 leading-relaxed">{mockProduct.conditionDetails}</p>
              <button className="flex items-center gap-1.5 mt-4 text-sm font-medium text-gray-900">
                <Sparkles className="h-4 w-4" />
                Research with AI
              </button>
            </motion.div>
          )}
          {activeTab === 'specs' && (
            <motion.div
              key="specs"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-500">Condition</span>
                <span className="text-sm font-medium text-gray-900">{mockProduct.condition}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-500">Category</span>
                <span className="text-sm font-medium text-gray-900">Road Bike</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-500">Frame</span>
                <span className="text-sm font-medium text-gray-900">Reynolds 531</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-500">Location</span>
                <span className="text-sm font-medium text-gray-900">{mockProduct.location}</span>
              </div>
            </motion.div>
          )}
          {activeTab === 'seller' && (
            <motion.div
              key="seller"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-md">
                <div className="h-12 w-12 rounded-full bg-white flex items-center justify-center shadow-sm">
                  <Store className="h-6 w-6 text-gray-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">{mockProduct.seller.name}</p>
                  <p className="text-xs text-gray-500">{mockProduct.seller.type}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </div>
              <Button variant="outline" className="w-full h-10 rounded-md mt-3">
                <Store className="h-4 w-4 mr-2" />
                Visit Store
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// =============================================================================
// PANEL 12: PILL TABS - Rounded Pill Style Tabs
// =============================================================================
function PanelPillTabs() {
  const [isLiked, setIsLiked] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'about' | 'details' | 'shipping'>('about');

  return (
    <div className="bg-gray-50">
      {/* White Header Card */}
      <div className="bg-white m-3 rounded-md shadow-sm">
        <div className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-lg font-bold text-gray-900">{mockProduct.name}</h1>
              <div className="flex items-center gap-1.5 mt-1">
                <MapPin className="h-3 w-3 text-gray-400" />
                <span className="text-xs text-gray-500">{mockProduct.location}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-gray-900">${mockProduct.price}</p>
              <Badge className="rounded-md bg-gray-100 text-gray-700 border-0 text-[10px] mt-1">{mockProduct.condition}</Badge>
            </div>
          </div>
        </div>

        {/* Actions in card */}
        <div className="px-4 pb-4 space-y-2">
          <div className="flex flex-col">
            <Button className="w-full h-11 rounded-md bg-gray-900 hover:bg-gray-800 font-medium">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Buy Now
            </Button>
            <StripeBranding />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 h-9 rounded-md text-sm">
              <Tag className="h-3.5 w-3.5 mr-1.5" />
              Offer
            </Button>
            <Button variant="outline" className="flex-1 h-9 rounded-md text-sm">
              <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
              Message
            </Button>
          </div>
        </div>

        {/* Quick actions */}
        <div className="px-4 pb-4 flex items-center justify-between border-t border-gray-100 pt-3">
          <div className="flex gap-2">
            <button 
              onClick={() => setIsLiked(!isLiked)}
              className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center"
            >
              <Heart className={cn("h-4 w-4", isLiked ? "fill-red-500 text-red-500" : "text-gray-500")} />
            </button>
            <button className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
              <Share2 className="h-4 w-4 text-gray-500" />
            </button>
            <button className="h-8 w-8 rounded-full bg-gray-900 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </button>
          </div>
          <div className="flex items-center gap-1 text-xs text-emerald-600">
            <Shield className="h-3 w-3" />
            <span>Protected</span>
          </div>
        </div>
      </div>

      {/* Pill Tabs */}
      <div className="px-3 pb-3">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('about')}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-medium transition-colors",
              activeTab === 'about'
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 hover:bg-gray-100"
            )}
          >
            About
          </button>
          <button
            onClick={() => setActiveTab('details')}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-medium transition-colors",
              activeTab === 'details'
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 hover:bg-gray-100"
            )}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('shipping')}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-medium transition-colors",
              activeTab === 'shipping'
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 hover:bg-gray-100"
            )}
          >
            Shipping
          </button>
        </div>
      </div>

      {/* Tab Content Card */}
      <div className="bg-white mx-3 mb-3 rounded-md shadow-sm p-4 min-h-[180px]">
        <AnimatePresence mode="wait">
          {activeTab === 'about' && (
            <motion.div
              key="about"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <p className="text-sm text-gray-600 leading-relaxed">{mockProduct.conditionDetails}</p>
              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
                <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                  <Store className="h-5 w-5 text-gray-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{mockProduct.seller.name}</p>
                  <p className="text-xs text-gray-500">{mockProduct.seller.type}</p>
                </div>
              </div>
            </motion.div>
          )}
          {activeTab === 'details' && (
            <motion.div
              key="details"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-2"
            >
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-500">Condition</span>
                <span className="text-sm font-medium text-gray-900">{mockProduct.condition}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-500">Category</span>
                <span className="text-sm font-medium text-gray-900">Road Bike</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-500">Frame</span>
                <span className="text-sm font-medium text-gray-900">Reynolds 531</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-500">Location</span>
                <span className="text-sm font-medium text-gray-900">{mockProduct.location}</span>
              </div>
            </motion.div>
          )}
          {activeTab === 'shipping' && (
            <motion.div
              key="shipping"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-md">
                <Zap className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">1-Hour Express</p>
                  <p className="text-xs text-gray-500">Same-day delivery available</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-md">
                <Truck className="h-5 w-5 text-gray-600" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Standard Shipping</p>
                  <p className="text-xs text-gray-500">2-5 business days</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-md">
                <MapPin className="h-5 w-5 text-gray-600" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Local Pickup</p>
                  <p className="text-xs text-gray-500">{mockProduct.location}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// =============================================================================
// PANEL 13: ICON TABS - Compact Icon-Only Tab Navigation
// =============================================================================
function PanelIconTabs() {
  const [isLiked, setIsLiked] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'info' | 'specs' | 'store' | 'ship'>('info');

  const tabs = [
    { id: 'info' as const, icon: <Info className="h-4 w-4" />, label: 'Info' },
    { id: 'specs' as const, icon: <Eye className="h-4 w-4" />, label: 'Specs' },
    { id: 'store' as const, icon: <Store className="h-4 w-4" />, label: 'Seller' },
    { id: 'ship' as const, icon: <Truck className="h-4 w-4" />, label: 'Ship' },
  ];

  return (
    <div className="bg-white">
      {/* Compact Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate">{mockProduct.name}</h1>
            <p className="text-xs text-gray-500 mt-0.5">{mockProduct.location} • {mockProduct.condition}</p>
          </div>
          <p className="text-xl font-bold text-gray-900 ml-3">${mockProduct.price}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex gap-2">
          <div className="flex-1 flex flex-col">
            <Button className="w-full h-10 rounded-md bg-gray-900 hover:bg-gray-800 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Buy Now
            </Button>
            <StripeBranding />
          </div>
          <Button variant="outline" size="icon" className="h-10 w-10 rounded-md shrink-0">
            <Tag className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-10 w-10 rounded-md shrink-0">
            <MessageCircle className="h-4 w-4" />
          </Button>
          <button 
            onClick={() => setIsLiked(!isLiked)}
            className="h-10 w-10 rounded-md border border-gray-200 flex items-center justify-center shrink-0"
          >
            <Heart className={cn("h-4 w-4", isLiked ? "fill-red-500 text-red-500" : "text-gray-500")} />
          </button>
        </div>
      </div>

      {/* Icon Tab Bar */}
      <div className="px-4 py-2 border-b border-gray-100">
        <div className="flex justify-around">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex flex-col items-center gap-1 py-2 px-4 rounded-md transition-colors",
                activeTab === tab.id
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-400 hover:text-gray-600"
              )}
            >
              {tab.icon}
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-4 py-4 min-h-[220px]">
        <AnimatePresence mode="wait">
          {activeTab === 'info' && (
            <motion.div
              key="info"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Description</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{mockProduct.conditionDetails}</p>
              <button className="flex items-center gap-1.5 mt-4 text-sm font-medium text-gray-900 hover:text-gray-600">
                <Sparkles className="h-4 w-4" />
                AI Research
              </button>
            </motion.div>
          )}
          {activeTab === 'specs' && (
            <motion.div
              key="specs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Specifications</h3>
              <div className="space-y-2">
                <div className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-500">Condition</span>
                  <span className="text-sm font-medium text-gray-900">{mockProduct.condition}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-500">Type</span>
                  <span className="text-sm font-medium text-gray-900">Road Bike</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-500">Frame</span>
                  <span className="text-sm font-medium text-gray-900">Reynolds 531</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-sm text-gray-500">Era</span>
                  <span className="text-sm font-medium text-gray-900">1970s</span>
                </div>
              </div>
            </motion.div>
          )}
          {activeTab === 'store' && (
            <motion.div
              key="store"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center">
                  <Store className="h-7 w-7 text-gray-500" />
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-900">{mockProduct.seller.name}</p>
                  <p className="text-sm text-gray-500">{mockProduct.seller.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-md mb-3">
                <BadgeCheck className="h-4 w-4 text-emerald-600" />
                <span className="text-sm text-emerald-700">Verified Seller</span>
              </div>
              <Button variant="outline" className="w-full h-10 rounded-md">
                View All Listings
              </Button>
            </motion.div>
          )}
          {activeTab === 'ship' && (
            <motion.div
              key="ship"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-md border border-amber-100">
                <Zap className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">1-Hour Express</p>
                  <p className="text-xs text-gray-500">Delivered today</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-md">
                <Package className="h-5 w-5 text-gray-600" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Standard</p>
                  <p className="text-xs text-gray-500">2-5 days</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-md">
                <MapPin className="h-5 w-5 text-gray-600" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Pickup</p>
                  <p className="text-xs text-gray-500">{mockProduct.location}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// =============================================================================
// PANEL 14: SEGMENTED TABS - iOS Segmented Control Style
// =============================================================================
function PanelSegmentedTabs() {
  const [isLiked, setIsLiked] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'description' | 'details'>('description');

  return (
    <div className="bg-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900 leading-tight flex-1">{mockProduct.name}</h1>
          <div className="flex gap-1.5 shrink-0">
            <button 
              onClick={() => setIsLiked(!isLiked)}
              className="h-9 w-9 rounded-full border border-gray-200 flex items-center justify-center"
            >
              <Heart className={cn("h-4 w-4", isLiked ? "fill-red-500 text-red-500" : "text-gray-500")} />
            </button>
            <button className="h-9 w-9 rounded-full border border-gray-200 flex items-center justify-center">
              <Share2 className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <p className="text-2xl font-bold text-gray-900">${mockProduct.price}</p>
          <div className="flex items-center gap-2">
            <Badge className="rounded-md bg-gray-100 text-gray-700 border-0 text-xs">{mockProduct.condition}</Badge>
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {mockProduct.location}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 space-y-2">
        <div className="flex flex-col">
          <Button className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800 font-medium">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Buy Now · ${mockProduct.price}
          </Button>
          <StripeBranding />
        </div>
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

      {/* Feature Badges */}
      <div className="px-4 pb-4 flex gap-2">
        <div className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 rounded-md flex-1">
          <Zap className="h-4 w-4 text-amber-600" />
          <span className="text-xs font-medium text-gray-800">1-Hour Express</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 rounded-md flex-1">
          <Shield className="h-4 w-4 text-emerald-600" />
          <span className="text-xs font-medium text-gray-800">Protected</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 pb-4 flex items-center gap-3">
        <button className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
          <Store className="h-4 w-4" />
          <span>Store</span>
        </button>
        <span className="text-gray-200">|</span>
        <button className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
          <Sparkles className="h-4 w-4" />
          <span>Research</span>
        </button>
      </div>

      {/* Segmented Control */}
      <div className="px-4 pb-3">
        <div className="bg-gray-100 p-1 rounded-md flex">
          <button
            onClick={() => setActiveTab('description')}
            className={cn(
              "flex-1 py-2 text-sm font-medium rounded-md transition-all",
              activeTab === 'description'
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            )}
          >
            Description
          </button>
          <button
            onClick={() => setActiveTab('details')}
            className={cn(
              "flex-1 py-2 text-sm font-medium rounded-md transition-all",
              activeTab === 'details'
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            )}
          >
            Details & Seller
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-4 pb-4 min-h-[200px]">
        <AnimatePresence mode="wait">
          {activeTab === 'description' && (
            <motion.div
              key="description"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2 }}
            >
              <p className="text-sm text-gray-600 leading-relaxed">{mockProduct.conditionDetails}</p>
            </motion.div>
          )}
          {activeTab === 'details' && (
            <motion.div
              key="details"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Specs */}
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Specifications</h4>
                <div className="flex justify-between py-1.5">
                  <span className="text-sm text-gray-500">Condition</span>
                  <span className="text-sm font-medium text-gray-900">{mockProduct.condition}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-sm text-gray-500">Category</span>
                  <span className="text-sm font-medium text-gray-900">Road Bike</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-sm text-gray-500">Location</span>
                  <span className="text-sm font-medium text-gray-900">{mockProduct.location}</span>
                </div>
              </div>
              
              {/* Seller */}
              <div className="pt-3 border-t border-gray-100">
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Seller</h4>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{mockProduct.seller.name}</p>
                    <p className="text-xs text-gray-500">{mockProduct.seller.type}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE - Display All Panels
// =============================================================================
export default function TestPanelsPage() {
  const panels = [
    { 
      id: 1, 
      name: "Clean Classic", 
      description: "Refined Facebook Marketplace style with all standard sections",
      component: <PanelCleanClassic /> 
    },
    { 
      id: 2, 
      name: "Compact Sticky", 
      description: "Fixed action bar with scrollable content below",
      component: <PanelCompactSticky /> 
    },
    { 
      id: 3, 
      name: "Modern Cards", 
      description: "Separated card sections for visual hierarchy",
      component: <PanelModernCards /> 
    },
    { 
      id: 4, 
      name: "Minimal Elegant", 
      description: "Ultra-clean with refined typography and spacing",
      component: <PanelMinimalElegant /> 
    },
    { 
      id: 5, 
      name: "Bold Action", 
      description: "Large dark CTA block with collapsible details",
      component: <PanelBoldAction /> 
    },
    { 
      id: 6, 
      name: "Split Price", 
      description: "Price and actions in a horizontal split layout",
      component: <PanelSplitPrice /> 
    },
    { 
      id: 7, 
      name: "Trust Focused", 
      description: "Emphasises security with trust checklist",
      component: <PanelTrustFocused /> 
    },
    { 
      id: 8, 
      name: "Tabbed Info", 
      description: "Tabs for Description, Details, and Seller sections",
      component: <PanelTabbedInfo /> 
    },
    { 
      id: 9, 
      name: "Inline Actions", 
      description: "Compact horizontal layout with pill features",
      component: <PanelInlineActions /> 
    },
    { 
      id: 10, 
      name: "Gradient Accent", 
      description: "Subtle gradient header with floating elements",
      component: <PanelGradientAccent /> 
    },
    { 
      id: 11, 
      name: "Underline Tabs", 
      description: "Classic underline-style tab navigation with slide animation",
      component: <PanelUnderlineTabs /> 
    },
    { 
      id: 12, 
      name: "Pill Tabs", 
      description: "Rounded pill buttons for tab selection on gray background",
      component: <PanelPillTabs /> 
    },
    { 
      id: 13, 
      name: "Icon Tabs", 
      description: "Compact icon-only tabs with labels for quick navigation",
      component: <PanelIconTabs /> 
    },
    { 
      id: 14, 
      name: "Segmented Tabs", 
      description: "iOS-style segmented control with two sections",
      component: <PanelSegmentedTabs /> 
    },
  ];

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Product Sidebar Panels</h1>
          <p className="text-gray-500 mt-2 text-lg">14 production-ready designs for the product page right panel</p>
        </div>

        {/* Panel Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {panels.map((panel) => (
            <div key={panel.id} className="space-y-3">
              {/* Panel Label */}
              <div className="px-1">
                <h2 className="font-semibold text-gray-900">{panel.id}. {panel.name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{panel.description}</p>
              </div>
              
              {/* Panel Container - Simulating Right Sidebar Width */}
              <div className="w-full max-w-[380px] mx-auto rounded-md overflow-hidden shadow-xl border border-gray-200">
                {panel.component}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-sm text-gray-400">
          All panels include: Stripe branding • Express delivery • Buyer protection • Full product info sections
        </div>
      </div>
    </div>
  );
}
