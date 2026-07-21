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

export interface CategoryLevel {
  level1: string;
  level2: string;
  level3: string | null;
}

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
  apiKey: string,
  taxonomy: CategoryLevel[],
): Promise<CategorisationResult[]> {
  if (taxonomy.length === 0) {
    return products.map((product) => ({
      id: product.id,
      displayName: product.normalized_name,
      category: '',
      subcategory: '',
      level3: null,
      success: false,
      error: 'Canonical marketplace taxonomy is empty',
    }));
  }
  
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

${JSON.stringify(taxonomy, null, 2)}

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
        const category = typeof aiResult.category === 'string' ? aiResult.category.trim() : '';
        const subcategory =
          typeof aiResult.subcategory === 'string' ? aiResult.subcategory.trim() : '';
        const level3 =
          typeof aiResult.level3 === 'string' && aiResult.level3.trim()
            ? aiResult.level3.trim()
            : null;
        const validPath = taxonomy.some(
          (entry) =>
            entry.level1 === category &&
            entry.level2 === subcategory &&
            (level3 === null || entry.level3 === level3),
        );

        results.push({
          id: product.id,
          displayName: aiResult.displayName || product.normalized_name,
          category,
          subcategory,
          level3,
          success: validPath,
          error: validPath
            ? undefined
            : `AI returned an invalid taxonomy path: ${category} > ${subcategory} > ${level3 ?? 'none'}`,
        });
      } else {
        results.push({
          id: product.id,
          displayName: product.normalized_name,
          category: '',
          subcategory: '',
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
      category: '',
      subcategory: '',
      level3: null,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}







