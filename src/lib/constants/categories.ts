// ============================================================
// Marketplace Category Taxonomy
// 3-level hierarchy for product categorization
// ============================================================

export interface CategoryNode {
  level1: string;
  level2: string;
  level3: string | null;
  icon?: string;
}

export const CATEGORY_TAXONOMY: CategoryNode[] = [
  // BICYCLES
  { level1: "Bicycles", level2: "Road", level3: null },
  { level1: "Bicycles", level2: "Gravel", level3: null },
  { level1: "Bicycles", level2: "Mountain", level3: "XC" },
  { level1: "Bicycles", level2: "Mountain", level3: "Trail" },
  { level1: "Bicycles", level2: "Mountain", level3: "Enduro" },
  { level1: "Bicycles", level2: "Mountain", level3: "Downhill" },
  { level1: "Bicycles", level2: "Hybrid / Fitness", level3: null },
  { level1: "Bicycles", level2: "Commuter / City", level3: null },
  { level1: "Bicycles", level2: "Folding", level3: null },
  { level1: "Bicycles", level2: "Cargo", level3: null },
  { level1: "Bicycles", level2: "Touring", level3: null },
  { level1: "Bicycles", level2: "Track / Fixie", level3: null },
  { level1: "Bicycles", level2: "Cyclocross", level3: null },
  { level1: "Bicycles", level2: "Time Trial / Triathlon", level3: null },
  { level1: "Bicycles", level2: "BMX", level3: "Race" },
  { level1: "Bicycles", level2: "BMX", level3: "Freestyle" },
  { level1: "Bicycles", level2: "Kids", level3: "Balance" },
  { level1: "Bicycles", level2: "Kids", level3: "12–16 inch" },
  { level1: "Bicycles", level2: "Kids", level3: "20–24 inch" },
  
  // E-BIKES
  { level1: "E-Bikes", level2: "E-Road", level3: null },
  { level1: "E-Bikes", level2: "E-Gravel", level3: null },
  { level1: "E-Bikes", level2: "E-MTB", level3: "Hardtail" },
  { level1: "E-Bikes", level2: "E-MTB", level3: "Full Suspension" },
  { level1: "E-Bikes", level2: "E-Commuter / City", level3: null },
  { level1: "E-Bikes", level2: "E-Hybrid", level3: null },
  { level1: "E-Bikes", level2: "E-Cargo", level3: null },
  { level1: "E-Bikes", level2: "E-Folding", level3: null },
  
  // FRAMES & FRAMESETS
  { level1: "Frames & Framesets", level2: "Road Frameset", level3: null },
  { level1: "Frames & Framesets", level2: "Gravel Frameset", level3: null },
  { level1: "Frames & Framesets", level2: "MTB Hardtail Frame", level3: null },
  { level1: "Frames & Framesets", level2: "MTB Full Suspension Frame", level3: null },
  { level1: "Frames & Framesets", level2: "E-Bike Frame", level3: null },
  { level1: "Frames & Framesets", level2: "Other Frames", level3: null },
  
  // WHEELS & TYRES
  { level1: "Wheels & Tyres", level2: "Road Wheelsets", level3: null },
  { level1: "Wheels & Tyres", level2: "Gravel Wheelsets", level3: null },
  { level1: "Wheels & Tyres", level2: "MTB Wheelsets", level3: null },
  { level1: "Wheels & Tyres", level2: "Tyres", level3: "Road" },
  { level1: "Wheels & Tyres", level2: "Tyres", level3: "Gravel / CX" },
  { level1: "Wheels & Tyres", level2: "Tyres", level3: "MTB" },
  { level1: "Wheels & Tyres", level2: "Tubes", level3: null },
  { level1: "Wheels & Tyres", level2: "Tubeless", level3: "Sealant / Valves / Tape" },
  
  // DRIVETRAIN
  { level1: "Drivetrain", level2: "Groupsets", level3: null },
  { level1: "Drivetrain", level2: "Cranksets", level3: null },
  { level1: "Drivetrain", level2: "Cassettes", level3: null },
  { level1: "Drivetrain", level2: "Derailleurs", level3: "Front" },
  { level1: "Drivetrain", level2: "Derailleurs", level3: "Rear" },
  { level1: "Drivetrain", level2: "Chains", level3: null },
  { level1: "Drivetrain", level2: "Bottom Brackets", level3: null },
  { level1: "Drivetrain", level2: "Power Meters", level3: null },
  
  // BRAKES
  { level1: "Brakes", level2: "Disc Brakes", level3: "Complete Sets" },
  { level1: "Brakes", level2: "Disc Brakes", level3: "Calipers" },
  { level1: "Brakes", level2: "Disc Brakes", level3: "Rotors" },
  { level1: "Brakes", level2: "Brake Pads", level3: null },
  { level1: "Brakes", level2: "Levers", level3: null },
  
  // COCKPIT
  { level1: "Cockpit", level2: "Handlebars", level3: "Road" },
  { level1: "Cockpit", level2: "Handlebars", level3: "MTB / DH" },
  { level1: "Cockpit", level2: "Handlebars", level3: "Gravel / Flared" },
  { level1: "Cockpit", level2: "Stems", level3: null },
  { level1: "Cockpit", level2: "Headsets", level3: null },
  { level1: "Cockpit", level2: "Bar Tape & Grips", level3: null },
  
  // SEAT & SEATPOSTS
  { level1: "Seat & Seatposts", level2: "Saddles", level3: null },
  { level1: "Seat & Seatposts", level2: "Seatposts", level3: null },
  { level1: "Seat & Seatposts", level2: "Dropper Posts", level3: null },
  
  // PEDALS
  { level1: "Pedals", level2: "Clipless Pedals", level3: null },
  { level1: "Pedals", level2: "Flat Pedals", level3: null },
  { level1: "Pedals", level2: "Pedal Accessories", level3: null },
  
  // ACCESSORIES
  { level1: "Accessories", level2: "Helmets", level3: null },
  { level1: "Accessories", level2: "Lights", level3: "Front" },
  { level1: "Accessories", level2: "Lights", level3: "Rear" },
  { level1: "Accessories", level2: "Lights", level3: "Sets" },
  { level1: "Accessories", level2: "Pumps", level3: "Floor" },
  { level1: "Accessories", level2: "Pumps", level3: "Mini / Hand" },
  { level1: "Accessories", level2: "Locks", level3: null },
  { level1: "Accessories", level2: "Bags", level3: "On-Bike" },
  { level1: "Accessories", level2: "Bags", level3: "Off-Bike" },
  { level1: "Accessories", level2: "Racks & Panniers", level3: null },
  { level1: "Accessories", level2: "Mudguards / Fenders", level3: null },
  { level1: "Accessories", level2: "Bottles & Cages", level3: null },
  { level1: "Accessories", level2: "Child Seats & Trailers", level3: null },
  { level1: "Accessories", level2: "Car Racks", level3: null },
  
  // APPAREL
  { level1: "Apparel", level2: "Jerseys", level3: null },
  { level1: "Apparel", level2: "Shorts & Bibs", level3: null },
  { level1: "Apparel", level2: "Jackets & Gilets", level3: null },
  { level1: "Apparel", level2: "Gloves", level3: null },
  { level1: "Apparel", level2: "Shoes", level3: "Road" },
  { level1: "Apparel", level2: "Shoes", level3: "MTB / Gravel" },
  { level1: "Apparel", level2: "Casual Clothing", level3: null },
  
  // PROTECTION
  { level1: "Protection", level2: "Knee & Elbow Pads", level3: null },
  { level1: "Protection", level2: "Body Armor", level3: null },
  
  // MAINTENANCE & WORKSHOP
  { level1: "Maintenance & Workshop", level2: "Tools", level3: null },
  { level1: "Maintenance & Workshop", level2: "Cleaning", level3: null },
  { level1: "Maintenance & Workshop", level2: "Lubricants & Grease", level3: null },
  { level1: "Maintenance & Workshop", level2: "Repair Kits", level3: null },
  { level1: "Maintenance & Workshop", level2: "Workstands", level3: null },
  
  // TECH & ELECTRONICS
  { level1: "Tech & Electronics", level2: "Bike Computers", level3: null },
  { level1: "Tech & Electronics", level2: "Smart Trainers", level3: null },
  { level1: "Tech & Electronics", level2: "Heart Rate Monitors", level3: null },
  { level1: "Tech & Electronics", level2: "Cameras", level3: null },
  { level1: "Tech & Electronics", level2: "E-Bike Batteries & Chargers", level3: null },
  
  // NUTRITION
  { level1: "Nutrition", level2: "Energy Gels & Chews", level3: null },
  { level1: "Nutrition", level2: "Bars", level3: null },
  { level1: "Nutrition", level2: "Drink Mixes & Electrolytes", level3: null },
  
  // SHOP SERVICES
  { level1: "Shop Services", level2: "Bike Service", level3: "Basic / Bronze" },
  { level1: "Shop Services", level2: "Bike Service", level3: "Intermediate / Silver" },
  { level1: "Shop Services", level2: "Bike Service", level3: "Premium / Gold" },
  { level1: "Shop Services", level2: "Bike Fitting", level3: null },
  { level1: "Shop Services", level2: "Suspension Service", level3: null },
  
  // MARKETPLACE SPECIALS
  { level1: "Marketplace Specials", level2: "Verified Bikes", level3: null },
  { level1: "Marketplace Specials", level2: "Certified Pre-Owned", level3: null },
  { level1: "Marketplace Specials", level2: "Clearance", level3: null },
];

// Helper functions
export function getLevel1Categories(): string[] {
  return Array.from(new Set(CATEGORY_TAXONOMY.map(c => c.level1)));
}

export function getLevel2Categories(level1: string): string[] {
  return Array.from(
    new Set(
      CATEGORY_TAXONOMY
        .filter(c => c.level1 === level1)
        .map(c => c.level2)
    )
  );
}

export function getLevel3Categories(level1: string, level2: string): string[] {
  return CATEGORY_TAXONOMY
    .filter(c => c.level1 === level1 && c.level2 === level2 && c.level3 !== null)
    .map(c => c.level3) as string[];
}

export function hasLevel3(level1: string, level2: string): boolean {
  return CATEGORY_TAXONOMY.some(
    c => c.level1 === level1 && c.level2 === level2 && c.level3 !== null
  );
}











