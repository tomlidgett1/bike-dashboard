"use client";

import * as React from "react";

interface BikeIconProps {
  iconName: string;
  className?: string;
  size?: number;
}

/**
 * Component to load bicycle-specific SVG icons from public/icons folder
 */
export function BikeIcon({ iconName, className = "", size = 20 }: BikeIconProps) {
  return (
    <img
      src={`/icons/${iconName}`}
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, display: 'inline-block', flexShrink: 0 }}
    />
  );
}

/**
 * Comprehensive icon mapping for all categories (Level 1 and Level 2)
 */
export const CATEGORY_ICON_MAP: Record<string, string> = {
  // Level 1 Categories
  "Accessories": "noun-bike-bell-6991334.svg",
  "Apparel": "noun-bike-helmet-6991316.svg",
  "BICYCLE": "noun-road-bike-frame-6991314.svg",
  "Bicycles": "noun-road-bike-frame-6991314.svg",
  "Brakes": "noun-bike-brake-rotor-6991341.svg",
  "Cockpit": "noun-drop-bar-6991318.svg",
  "Components": "noun-bike-headset-6991384.svg",
  "Drivetrain": "noun-bike-chain-6991402.svg",
  "E-Bikes": "noun-e-bike-battery-6991320.svg",
  "Frames & Framesets": "noun-road-bike-frame-6991314.svg",
  "Maintenance & Workshop": "noun-chain-tool-6991336.svg",
  "Nutrition": "noun-water-bottle-6991375.svg",
  "Parts": "noun-bike-cassette-6991390.svg",
  "Pedals": "noun-bike-pedal-6991389.svg",
  "Protection": "noun-bike-helmet-6991316.svg",
  "Seat & Seatposts": "noun-bike-saddle-6991388.svg",
  "Tech & Electronics": "noun-bike-computer-6991376.svg",
  "Wheels & Tyres": "noun-bike-wheels-6991373.svg",
  
  // Level 2 Categories - Accessories
  "Bags": "noun-bike-front-rack-6991323.svg",
  "Bar Tape & Grips": "noun-bike-grip-6991396.svg",
  "Bells": "noun-bike-bell-6991334.svg",
  "Bottles & Cages": "noun-bottle-cage-6991379.svg",
  "Cables": "noun-bike-brake-cable-6991339.svg",
  "Cages": "noun-bottle-cage-6991379.svg",
  "Car Racks": "noun-bike-rear-rack-6991343.svg",
  "Casual Clothing": "noun-bike-jersey-6991397.svg",
  "Child Seats & Trailers": "noun-bike-rear-rack-6991343.svg",
  "Cleaning": "noun-chain-tool-6991336.svg",
  "Glasses": "noun-bike-helmet-6991316.svg",
  "Gloves": "noun-bike-glove-6991401.svg",
  "Helmets": "noun-bike-helmet-6991316.svg",
  "Lights": "noun-bike-computer-6991376.svg",
  "Locks": "noun-bike-lock-6991317.svg",
  "Mirrors": "noun-bike-bell-6991334.svg",
  "Mudguards / Fenders": "noun-bike-fender-6991381.svg",
  "Pumps": "noun-tire-lever-6991374.svg",
  "Racks & Panniers": "noun-bike-rear-rack-6991343.svg",
  "Repair Kits": "noun-chain-tool-6991336.svg",
  "Saddles": "noun-bike-saddle-6991388.svg",
  "Skin Care": "noun-water-bottle-6991375.svg",
  "Sunglasses": "noun-bike-helmet-6991316.svg",
  
  // Level 2 Categories - Apparel
  "Arm Warmers": "noun-bike-glove-6991401.svg",
  "Jackets & Gilets": "noun-bike-jersey-6991397.svg",
  "Jerseys": "noun-bike-jersey-6991397.svg",
  "Knee Warmers": "noun-bike-shorts-6991400.svg",
  "Shoes": "noun-bike-pedal-6991389.svg",
  "Shorts & Bibs": "noun-bike-shorts-6991400.svg",
  "Socks": "noun-bike-shorts-6991400.svg",
  
  // Level 2 Categories - Brakes
  "Adapters": "noun-bike-brake-6991377.svg",
  "Brake Pads": "noun-bike-brake-pads-6991393.svg",
  "Calipers": "noun-bike-brake-6991377.svg",
  "Complete Sets": "noun-bike-brake-6991377.svg",
  "Disc Brakes": "noun-bike-brake-rotor-6991341.svg",
  "Hoses": "noun-bike-brake-cable-6991339.svg",
  "Levers": "noun-bike-brake-lever-6991395.svg",
  "Rotors": "noun-bike-brake-rotor-6991341.svg",
  "Tools": "noun-chain-tool-6991336.svg",
  
  // Level 2 Categories - Cockpit
  "Handlebars": "noun-drop-bar-6991318.svg",
  "Stems": "noun-bike-stem-6991380.svg",
  
  // Level 2 Categories - Components
  "Forks": "noun-bike-shock-absorber-6991333.svg",
  "Headsets": "noun-bike-headset-6991384.svg",
  
  // Level 2 Categories - Drivetrain
  "Bearings": "noun-bottom-bracket-6991386.svg",
  "Bottom Brackets": "noun-bottom-bracket-6991386.svg",
  "Cables & Housing": "noun-bike-brake-cable-6991339.svg",
  "Cassettes": "noun-bike-cassette-6991390.svg",
  "Chainrings": "noun-chainring-6991385.svg",
  "Chains": "noun-bike-chain-6991402.svg",
  "Cogs": "noun-bike-cassette-6991390.svg",
  "Cranksets": "noun-chainring-6991385.svg",
  "Derailleurs": "noun-rear-delailleur-6991404.svg",
  "Freehubs": "noun-bike-rear-hub-6991324.svg",
  "Groupsets": "noun-bike-cassette-6991390.svg",
  "Shifters": "noun-shifter-6991383.svg",
  
  // Level 2 Categories - E-Bikes
  "E-Commuter / City": "noun-e-bike-battery-6991320.svg",
  "E-MTB": "noun-e-bike-motor-6991340.svg",
  
  // Level 2 Categories - Frames
  "Other Frames": "noun-road-bike-frame-6991314.svg",
  
  // Level 2 Categories - Maintenance
  "Lubricants & Grease": "noun-bike-chain-6991402.svg",
  
  // Level 2 Categories - Nutrition
  "Bars": "noun-water-bottle-6991375.svg",
  "Drink Mixes & Electrolytes": "noun-water-bottle-6991375.svg",
  "Energy Gels & Chews": "noun-water-bottle-6991375.svg",
  
  // Level 2 Categories - Pedals
  "Clipless Pedals": "noun-bike-pedal-6991389.svg",
  "Flat Pedals": "noun-bike-pedal-6991389.svg",
  "Pedal Accessories": "noun-bike-pedal-6991389.svg",
  
  // Level 2 Categories - Protection
  "Knee & Elbow Pads": "noun-bike-helmet-6991316.svg",
  
  // Level 2 Categories - Seat & Seatposts
  "Dropper Posts": "noun-seatpost-6991399.svg",
  "Seatposts": "noun-seatpost-6991399.svg",
  
  // Level 2 Categories - Tech & Electronics
  "Batteries": "noun-e-bike-battery-6991320.svg",
  "Bike Computers": "noun-bike-computer-6991376.svg",
  "E-Bike Batteries & Chargers": "noun-e-bike-battery-6991320.svg",
  "Heart Rate Monitors": "noun-bike-computer-6991376.svg",
  "Smart Trainers": "noun-bike-stand-6991329.svg",
  
  // Level 2 Categories - Wheels & Tyres
  "MTB Wheelsets": "noun-bike-wheels-6991373.svg",
  "Road Wheelsets": "noun-bike-wheels-6991373.svg",
  "Spokes": "noun-bike-spokes-6991378.svg",
  "Tubeless": "noun-bike-tire-sealant-6991372.svg",
  "Tubes": "noun-bike-tire-6991392.svg",
  "Tyres": "noun-bike-tire-6991392.svg",
  "Valves": "noun-bike-tire-6991392.svg",
  "Wheelsets": "noun-bike-wheels-6991373.svg",
  
  // Generic fallbacks
  "Other": "noun-bike-cassette-6991390.svg",
  "Other Accessories": "noun-bike-bell-6991334.svg",
};

/**
 * Get icon name for a category
 */
export function getCategoryIconName(categoryName: string): string {
  // Try exact match first
  if (CATEGORY_ICON_MAP[categoryName]) {
    return CATEGORY_ICON_MAP[categoryName];
  }
  
  // Fallback to keyword matching
  const normalized = categoryName.toLowerCase();
  
  if (normalized.includes("wheel") || normalized.includes("tyre") || normalized.includes("tire")) {
    return "noun-bike-wheels-6991373.svg";
  }
  if (normalized.includes("brake")) {
    return "noun-bike-brake-rotor-6991341.svg";
  }
  if (normalized.includes("pedal")) {
    return "noun-bike-pedal-6991389.svg";
  }
  if (normalized.includes("saddle") || normalized.includes("seat")) {
    return "noun-bike-saddle-6991388.svg";
  }
  if (normalized.includes("chain")) {
    return "noun-bike-chain-6991402.svg";
  }
  if (normalized.includes("cassette")) {
    return "noun-bike-cassette-6991390.svg";
  }
  if (normalized.includes("helmet")) {
    return "noun-bike-helmet-6991316.svg";
  }
  if (normalized.includes("bottle")) {
    return "noun-water-bottle-6991375.svg";
  }
  if (normalized.includes("e-bike") || normalized.includes("battery")) {
    return "noun-e-bike-battery-6991320.svg";
  }
  if (normalized.includes("frame")) {
    return "noun-road-bike-frame-6991314.svg";
  }
  if (normalized.includes("tool")) {
    return "noun-chain-tool-6991336.svg";
  }
  
  // Ultimate fallback - cassette for parts
  return "noun-bike-cassette-6991390.svg";
}
