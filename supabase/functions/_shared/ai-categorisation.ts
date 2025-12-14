/**
 * AI Categorisation Shared Module
 * 
 * Provides reusable AI categorisation functionality using GPT-4o-mini
 * to classify products into the standardised 3-level marketplace taxonomy.
 * 
 * Used by:
 * - categorise-canonical-products edge function
 * - Lightspeed sync (on-demand categorisation)
 * - User upload flows (Facebook, Smart, Manual)
 */

// ============================================================
// Category Taxonomy (143 Categories)
// ============================================================

export interface CategoryLevel {
  level1: string;
  level2: string;
  level3: string | null;
}

export const CATEGORY_TAXONOMY: CategoryLevel[] = [
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
  { level1: "E-Bikes", level2: "E-Road", level3: null },
  { level1: "E-Bikes", level2: "E-Gravel", level3: null },
  { level1: "E-Bikes", level2: "E-MTB", level3: "Hardtail" },
  { level1: "E-Bikes", level2: "E-MTB", level3: "Full Suspension" },
  { level1: "E-Bikes", level2: "E-Commuter / City", level3: null },
  { level1: "E-Bikes", level2: "E-Hybrid", level3: null },
  { level1: "E-Bikes", level2: "E-Cargo", level3: null },
  { level1: "E-Bikes", level2: "E-Folding", level3: null },
  { level1: "Frames & Framesets", level2: "Road Frameset", level3: null },
  { level1: "Frames & Framesets", level2: "Gravel Frameset", level3: null },
  { level1: "Frames & Framesets", level2: "MTB Hardtail Frame", level3: null },
  { level1: "Frames & Framesets", level2: "MTB Full Suspension Frame", level3: null },
  { level1: "Frames & Framesets", level2: "E-Bike Frame", level3: null },
  { level1: "Frames & Framesets", level2: "Other Frames", level3: null },
  { level1: "Wheels & Tyres", level2: "Road Wheelsets", level3: null },
  { level1: "Wheels & Tyres", level2: "Gravel Wheelsets", level3: null },
  { level1: "Wheels & Tyres", level2: "MTB Wheelsets", level3: null },
  { level1: "Wheels & Tyres", level2: "Tyres", level3: "Road" },
  { level1: "Wheels & Tyres", level2: "Tyres", level3: "Gravel / CX" },
  { level1: "Wheels & Tyres", level2: "Tyres", level3: "MTB" },
  { level1: "Wheels & Tyres", level2: "Tubes", level3: null },
  { level1: "Wheels & Tyres", level2: "Tubeless", level3: "Sealant / Valves / Tape" },
  { level1: "Drivetrain", level2: "Groupsets", level3: null },
  { level1: "Drivetrain", level2: "Cranksets", level3: null },
  { level1: "Drivetrain", level2: "Cassettes", level3: null },
  { level1: "Drivetrain", level2: "Derailleurs", level3: "Front" },
  { level1: "Drivetrain", level2: "Derailleurs", level3: "Rear" },
  { level1: "Drivetrain", level2: "Chains", level3: null },
  { level1: "Drivetrain", level2: "Bottom Brackets", level3: null },
  { level1: "Drivetrain", level2: "Power Meters", level3: null },
  { level1: "Brakes", level2: "Disc Brakes", level3: "Complete Sets" },
  { level1: "Brakes", level2: "Disc Brakes", level3: "Calipers" },
  { level1: "Brakes", level2: "Disc Brakes", level3: "Rotors" },
  { level1: "Brakes", level2: "Brake Pads", level3: null },
  { level1: "Brakes", level2: "Levers", level3: null },
  { level1: "Cockpit", level2: "Handlebars", level3: "Road" },
  { level1: "Cockpit", level2: "Handlebars", level3: "MTB / DH" },
  { level1: "Cockpit", level2: "Handlebars", level3: "Gravel / Flared" },
  { level1: "Cockpit", level2: "Stems", level3: null },
  { level1: "Cockpit", level2: "Headsets", level3: null },
  { level1: "Cockpit", level2: "Bar Tape & Grips", level3: null },
  { level1: "Seat & Seatposts", level2: "Saddles", level3: null },
  { level1: "Seat & Seatposts", level2: "Seatposts", level3: null },
  { level1: "Seat & Seatposts", level2: "Dropper Posts", level3: null },
  { level1: "Pedals", level2: "Clipless Pedals", level3: null },
  { level1: "Pedals", level2: "Flat Pedals", level3: null },
  { level1: "Pedals", level2: "Pedal Accessories", level3: null },
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
  { level1: "Apparel", level2: "Jerseys", level3: null },
  { level1: "Apparel", level2: "Shorts & Bibs", level3: null },
  { level1: "Apparel", level2: "Jackets & Gilets", level3: null },
  { level1: "Apparel", level2: "Gloves", level3: null },
  { level1: "Apparel", level2: "Shoes", level3: "Road" },
  { level1: "Apparel", level2: "Shoes", level3: "MTB / Gravel" },
  { level1: "Apparel", level2: "Casual Clothing", level3: null },
  { level1: "Protection", level2: "Knee & Elbow Pads", level3: null },
  { level1: "Protection", level2: "Body Armor", level3: null },
  { level1: "Maintenance & Workshop", level2: "Tools", level3: null },
  { level1: "Maintenance & Workshop", level2: "Cleaning", level3: null },
  { level1: "Maintenance & Workshop", level2: "Lubricants & Grease", level3: null },
  { level1: "Maintenance & Workshop", level2: "Repair Kits", level3: null },
  { level1: "Maintenance & Workshop", level2: "Workstands", level3: null },
  { level1: "Tech & Electronics", level2: "Bike Computers", level3: null },
  { level1: "Tech & Electronics", level2: "Smart Trainers", level3: null },
  { level1: "Tech & Electronics", level2: "Heart Rate Monitors", level3: null },
  { level1: "Tech & Electronics", level2: "Cameras", level3: null },
  { level1: "Tech & Electronics", level2: "E-Bike Batteries & Chargers", level3: null },
  { level1: "Nutrition", level2: "Energy Gels & Chews", level3: null },
  { level1: "Nutrition", level2: "Bars", level3: null },
  { level1: "Nutrition", level2: "Drink Mixes & Electrolytes", level3: null },
  { level1: "Shop Services", level2: "Bike Service", level3: "Basic / Bronze" },
  { level1: "Shop Services", level2: "Bike Service", level3: "Intermediate / Silver" },
  { level1: "Shop Services", level2: "Bike Service", level3: "Premium / Gold" },
  { level1: "Shop Services", level2: "Bike Fitting", level3: null },
  { level1: "Shop Services", level2: "Suspension Service", level3: null },
  { level1: "Marketplace Specials", level2: "Verified Bikes", level3: null },
  { level1: "Marketplace Specials", level2: "Certified Pre-Owned", level3: null },
  { level1: "Marketplace Specials", level2: "Clearance", level3: null }
];

// ============================================================
// Types
// ============================================================

export interface ProductInput {
  id: string;
  normalized_name: string;
  category?: string | null;
  manufacturer?: string | null;
}

export interface CategorisationResult {
  id: string;
  displayName: string;
  category: string;
  subcategory: string;
  level3: string | null;
  success: boolean;
  error?: string;
}

// ============================================================
// AI Categorisation Function
// ============================================================

/**
 * Categorises a batch of products using GPT-4o-mini
 * Returns cleaned display names and 3-level categorisation
 */
export async function categoriseProductBatch(
  products: ProductInput[],
  apiKey: string
): Promise<CategorisationResult[]> {
  
  const prompt = `You are an e-commerce product expert for a cycling marketplace. Your tasks:
1. Clean and format product names for customer display
2. Categorise products into our 3-level taxonomy

NAMING RULES:
1. Use proper capitalisation (first letter of each significant word capitalised)
2. Remove internal codes, SKU numbers, or excessive technical jargon
3. Fix abbreviations (e.g., "MTB" → "Mountain Bike", "RD" → "Rear Derailleur")
4. Remove excessive punctuation
5. Keep brand names, model numbers, and key specifications
6. Make it customer-friendly but accurate
7. Keep it concise (under 80 characters if possible)
8. Preserve Australian spelling (e.g., "colour" not "color")

CATEGORISATION:
Assign each product to the BEST matching category from this taxonomy (level1 > level2 > level3):

${JSON.stringify(CATEGORY_TAXONOMY, null, 2)}

IMPORTANT:
- level3 can be null if the category has no third level
- Choose the MOST SPECIFIC category that fits
- For complete bikes, use "Bicycles" or "E-Bikes" level1
- For components/parts, use appropriate component categories
- For apparel, use "Apparel" level1

Examples:
Input: "trek fuel ex 98 xt 29 mtb"
Output: {
  "displayName": "Trek Fuel EX 9.8 XT 29\\" Mountain Bike",
  "category": "Bicycles",
  "subcategory": "Mountain",
  "level3": "Trail"
}

Input: "SHIMANO DEORE XT M8100 12-SPD RD"
Output: {
  "displayName": "Shimano Deore XT M8100 12-Speed Rear Derailleur",
  "category": "Drivetrain",
  "subcategory": "Derailleurs",
  "level3": "Rear"
}

Input: "specialized s-works carbon helmet blk/red size L"
Output: {
  "displayName": "Specialized S-Works Carbon Helmet Black/Red - Large",
  "category": "Accessories",
  "subcategory": "Helmets",
  "level3": null
}

Products to process:
${JSON.stringify(products.map(p => ({
  id: p.id,
  name: p.normalized_name,
  category: p.category,
  manufacturer: p.manufacturer,
})), null, 2)}

Return ONLY valid JSON (no markdown, no code blocks):
{
  "cleaned": [
    {
      "id": "product-uuid",
      "displayName": "Cleaned Product Name",
      "category": "Level1Category",
      "subcategory": "Level2Category",
      "level3": "Level3Category or null"
    }
  ]
}
`;

  try {
    console.log(`🤖 [AI CATEGORISATION] Sending ${products.length} products to GPT-4o-mini...`);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert at formatting product names and categorising cycling products for e-commerce. You return ONLY valid JSON, no markdown.' 
          },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 12000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [AI CATEGORISATION] API error: ${response.status} - ${errorText}`);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid OpenAI API response structure');
    }

    console.log(`✅ [AI CATEGORISATION] Received response (${data.usage?.total_tokens || '?'} tokens)`);

    const content = data.choices[0].message.content;
    const parsed = JSON.parse(content);

    // Map results back to products
    const results: CategorisationResult[] = [];
    
    for (const product of products) {
      const aiResult = parsed.cleaned?.find((r: any) => r.id === product.id);
      
      if (aiResult) {
        results.push({
          id: product.id,
          displayName: aiResult.displayName || product.normalized_name,
          category: aiResult.category,
          subcategory: aiResult.subcategory,
          level3: aiResult.level3,
          success: true,
        });
      } else {
        results.push({
          id: product.id,
          displayName: product.normalized_name,
          category: 'Accessories', // Fallback
          subcategory: 'Other',
          level3: null,
          success: false,
          error: 'AI did not return result for this product',
        });
      }
    }

    return results;
  } catch (error) {
    console.error('❌ [AI CATEGORISATION] Error:', error);
    
    // Return fallback results
    return products.map(p => ({
      id: p.id,
      displayName: p.normalized_name,
      category: 'Accessories',
      subcategory: 'Other',
      level3: null,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}






