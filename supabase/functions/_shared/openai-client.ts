// ============================================================
// AI Image Discovery with Google Images (Serper API)
// ============================================================
// Priority 1: Serper API (Google Images) - REAL working URLs
// Priority 2: OpenAI Responses API with web search - Fallback
// ============================================================

interface ImageSearchResult {
  url: string;
  description: string;
  source: string;
  isPrimary: boolean;
  rank: number;
}

interface AIImageDiscoveryResult {
  images: ImageSearchResult[];
  searchQuery: string;
  totalFound: number;
  reasoning: string;
}

interface SerperImageResult {
  title: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  thumbnailUrl: string;
  source: string;
  domain: string;
  link: string;
  position: number;
}

/**
 * Extract brand name from product using GPT-4o-mini
 */
async function extractBrandName(productName: string, manufacturer?: string | null): Promise<string | null> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  
  if (!OPENAI_API_KEY) {
    return manufacturer || null;
  }

  try {
    console.log(`🏷️ [BRAND EXTRACT] Extracting brand from: "${productName}"`);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'Extract the bicycle brand/manufacturer name from product names. Output ONLY the brand name, nothing else. Examples: "Shimano", "SRAM", "Trek", "Specialized", "Giant"' 
          },
          { 
            role: 'user', 
            content: `Product: "${productName}"\nManufacturer field: ${manufacturer || 'Unknown'}\n\nOutput only the brand name.` 
          }
        ],
        temperature: 0.1,
        max_tokens: 20,
      }),
    });

    if (!response.ok) {
      console.error('❌ [BRAND EXTRACT] API error:', response.status);
      return manufacturer || null;
    }

    const data = await response.json();
    const brandName = data.choices?.[0]?.message?.content?.trim() || null;
    
    console.log(`✅ [BRAND EXTRACT] Brand identified: "${brandName}"`);
    return brandName;
  } catch (error) {
    console.error('❌ [BRAND EXTRACT] Error:', error);
    return manufacturer || null;
  }
}

/**
 * Clean product name for e-commerce search using GPT-4o-mini
 */
async function cleanProductName(rawName: string, manufacturer?: string | null, category?: string | null): Promise<string> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  
  if (!OPENAI_API_KEY) {
    console.log('⚠️ [CLEAN NAME] No OpenAI key, using raw name');
    return rawName;
  }

  try {
    console.log(`🧹 [CLEAN NAME] Starting cleanup for: "${rawName}"`);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You clean bicycle product names for e-commerce image search. Remove SKUs, internal codes, sizes, colors unless critical for identification. Keep brand, model, key features. Output ONLY the cleaned name, nothing else. Be concise.' 
          },
          { 
            role: 'user', 
            content: `Clean this bicycle product name for Google Image search:\n\nRaw: "${rawName}"\nBrand: ${manufacturer || 'Unknown'}\nCategory: ${category || 'Unknown'}\n\nOutput only the cleaned name suitable for finding product photos.` 
          }
        ],
        temperature: 0.2,
        max_tokens: 80,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [CLEAN NAME] API error:', response.status, errorText);
      return rawName;
    }

    const data = await response.json();
    const cleanedName = data.choices?.[0]?.message?.content?.trim() || rawName;
    
    if (!cleanedName || cleanedName === '') {
      console.log('⚠️ [CLEAN NAME] Empty result, using raw name');
      return rawName;
    }
    
    console.log(`✅ [CLEAN NAME] "${rawName}" → "${cleanedName}"`);
    return cleanedName;
  } catch (error) {
    console.error('❌ [CLEAN NAME] Exception:', error);
    return rawName;
  }
}

/**
 * Uses Google Images (via Serper) to find REAL, accessible product images
 * Falls back to OpenAI Responses API if Serper not available
 */
export async function discoverProductImages(
  productName: string,
  options: {
    upc?: string | null;
    category?: string | null;
    manufacturer?: string | null;
    maxImages?: number;
  }
): Promise<AIImageDiscoveryResult> {
  const { upc, category, manufacturer, maxImages = 15 } = options;
  
  console.log(`🔍 [IMAGE SEARCH] Original product name: "${productName}"`);
  console.log(`🔍 [IMAGE SEARCH] UPC received: "${upc}"`);
  
  // Extract brand name for domain prioritization
  const brandName = await extractBrandName(productName, manufacturer);
  console.log(`🏷️ [IMAGE SEARCH] Brand name: "${brandName}"`);
  
  // Use raw product name with "cycling" prefix
  const searchProductName = `cycling ${productName}`;
  
  console.log(`🔍 [IMAGE SEARCH] Search product name: "${searchProductName}"`);
  
  // Strategy: Two searches for better coverage
  // Search 1: UPC + product name (7 images) - most precise
  // Search 2: Product name only (8 images) - broader coverage
  const hasValidUPC = upc && upc !== '' && !upc.startsWith('TEMP-');
  
  let allImages: any[] = [];
  
  if (hasValidUPC) {
    console.log(`✅ [IMAGE SEARCH] Valid UPC found: "${upc}" - Using dual search strategy`);
    console.log(`   Strategy: 7 images with UPC + 8 images without UPC = 15 total`);
  } else {
    console.log(`⚠️ [IMAGE SEARCH] No valid UPC - Using single search strategy (15 images)`);
  }

  // ============================================================
  // METHOD 1: Serper API (Google Images) - BEST RESULTS
  // ============================================================
  const SERPER_API_KEY = Deno.env.get('SERPER_API_KEY');
  
  if (SERPER_API_KEY) {
    // If we have a valid UPC, do TWO searches for better results
    if (hasValidUPC) {
      return await dualSearchWithUPC(
        upc!,
        searchProductName,
        manufacturer,
        category,
        SERPER_API_KEY,
        maxImages,
        brandName
      );
    }
    
    // Otherwise do single search
    const searchQuery = searchProductName;
    
    return await singleSearch(searchQuery, SERPER_API_KEY, maxImages);
  }
  
  // Fallback to OpenAI if no Serper key
  return await discoverImagesWithOpenAI(productName, options);
}

/**
 * Dual search strategy: UPC-based + general for comprehensive results
 */
async function dualSearchWithUPC(
  upc: string,
  searchProductName: string,
  manufacturer: string | null | undefined,
  category: string | null | undefined,
  apiKey: string,
  maxImages: number,
  brandName?: string | null
): Promise<AIImageDiscoveryResult> {
  console.log(`🔍 [DUAL SEARCH] Strategy: 7 with UPC + 8 without UPC = 15 total`);
  
  // Search 1: UPC + Product Name (precise)
  const upcQuery = `${upc} ${searchProductName}`;
  
  console.log(`🔍 [SEARCH 1] UPC Query: "${upcQuery}"`);
  
  // Search 2: Product Name Only (broader)
  const nameQuery = searchProductName;
  
  console.log(`🔍 [SEARCH 2] Name Query: "${nameQuery}"`);
  
  try {
    // Execute both searches in parallel
    const [upcResults, nameResults] = await Promise.all([
      fetch('https://google.serper.dev/images', {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: upcQuery }),
      }),
      fetch('https://google.serper.dev/images', {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: nameQuery }),
      }),
    ]);
    
    if (!upcResults.ok || !nameResults.ok) {
      console.error('❌ [DUAL SEARCH] One or both searches failed');
      throw new Error('Serper API failed');
    }
    
    const upcData = await upcResults.json();
    const nameData = await nameResults.json();
    
    const upcImages = upcData.images || [];
    const nameImages = nameData.images || [];
    
    console.log(`✅ [SEARCH 1] UPC search found ${upcImages.length} images`);
    console.log(`✅ [SEARCH 2] Name search found ${nameImages.length} images`);
    
    // Process and score images from both searches with brand awareness
    const processedUpcImages = processAndScoreImages(upcImages, searchProductName, brandName);
    const processedNameImages = processAndScoreImages(nameImages, searchProductName, brandName);
    
    // Take top 7 from UPC search, top 8 from name search
    const top7UPC = processedUpcImages.slice(0, 7);
    const top8Name = processedNameImages.slice(0, 8);
    
    // Merge and deduplicate by URL
    const seenUrls = new Set();
    const mergedImages: any[] = [];
    
    for (const img of [...top7UPC, ...top8Name]) {
      if (!seenUrls.has(img.imageUrl)) {
        seenUrls.add(img.imageUrl);
        mergedImages.push(img);
      }
    }
    
    console.log(`🔍 [DUAL SEARCH] Merged results: ${mergedImages.length} unique images`);
    console.log(`   - From UPC search: ${top7UPC.length}`);
    console.log(`   - From name search: ${top8Name.length}`);
    console.log(`   - After deduplication: ${mergedImages.length}`);
    
    // Convert to final format
    const finalImages: ImageSearchResult[] = mergedImages
      .slice(0, maxImages)
      .map((img, idx) => ({
        url: img.imageUrl,
        description: img.title || `${searchProductName} - ${img.source}`,
        source: img.domain || extractDomain(img.imageUrl),
        isPrimary: idx === 0,
        rank: idx + 1,
      }));
    
    return {
      images: finalImages,
      searchQuery: `[UPC: "${upcQuery}"] + [Name: "${nameQuery}"]`,
      totalFound: finalImages.length,
      reasoning: `Dual search: ${top7UPC.length} from UPC search + ${top8Name.length} from name search = ${finalImages.length} total`,
    };
  } catch (error) {
    console.error('❌ [DUAL SEARCH] Error:', error);
    // Fallback to single search
    const fallbackQuery = `bicycle ${cleanedName} product photo`;
    return await singleSearch(fallbackQuery, apiKey, maxImages);
  }
}

/**
 * Process and score images with brand awareness
 */
function processAndScoreImages(images: SerperImageResult[], productName: string, brandName?: string | null): any[] {
  return images
    .filter(img => {
      // Basic validation
      if (!img.imageUrl || !isValidImageUrl(img.imageUrl)) return false;
      if (img.imageWidth && img.imageWidth < 400) return false;
      if (img.imageHeight && img.imageHeight < 400) return false;
      
      // Block bad domains
      const domain = img.domain?.toLowerCase() || '';
      if (domain.includes('aliexpress') || 
          domain.includes('wish.com') ||
          domain.includes('alibaba') ||
          domain.includes('pinterest') ||
          domain.includes('instagram') ||
          domain.includes('facebook') ||
          domain.includes('ebay.com.au') ||
          domain.includes('gumtree')) {
        return false;
      }
      
      if (img.imageUrl.startsWith('data:') || img.imageUrl.startsWith('blob:')) return false;
      
      return true;
    })
    .map(img => {
      // Score images
      const aspectRatio = img.imageWidth && img.imageHeight ? img.imageWidth / img.imageHeight : 1;
      const aspectScore = 1 - Math.abs(1 - aspectRatio);
      const sizeScore = (img.imageWidth || 0) * (img.imageHeight || 0) / 1000000;
      
      const domain = img.domain?.toLowerCase() || '';
      const fullUrl = img.link?.toLowerCase() || '';
      
      // Check for e-commerce domains
      const isEcommerceDomain = 
        domain.includes('amazon') ||
        domain.includes('rei.com') ||
        domain.includes('99bikes') ||
        domain.includes('pushys');
      
      // Check for official brand website/domain with highest priority
      let brandScore = 0.5; // Default
      
      if (brandName) {
        const brandLower = brandName.toLowerCase();
        
        // HIGHEST PRIORITY: Official brand domains like bike.shimano.com, shimano.com
        const isOfficialBrandDomain = 
          domain === `${brandLower}.com` ||
          domain === `bike.${brandLower}.com` ||
          domain === `www.${brandLower}.com` ||
          domain.startsWith(`bike.${brandLower}`) ||
          domain.endsWith(`.${brandLower}.com`);
        
        if (isOfficialBrandDomain) {
          brandScore = 2.0; // MAXIMUM boost for official brand site
          console.log(`   ⭐⭐ OFFICIAL BRAND: ${domain} (${brandName} official)`);
        } else if (domain.includes(brandLower) || fullUrl.includes(brandLower)) {
          brandScore = 1.5; // HIGH boost for brand in domain/URL
          console.log(`   🌟 BRAND MATCH: ${domain} contains "${brandName}"`);
        } else if (isEcommerceDomain) {
          brandScore = 1.0; // Medium for general e-commerce
        }
      } else {
        brandScore = isEcommerceDomain ? 1.0 : 0.5;
      }
      
      // Title quality score
      const title = img.title?.toLowerCase() || '';
      const hasQualityKeywords = 
        title.includes('official') ||
        title.includes('product photo') ||
        title.includes('stock');
      const titleScore = hasQualityKeywords ? 1.0 : 0.7;
      
      // Combined score: aspect 25%, size 20%, brand 40%, title 15%
      const totalScore = 
        (aspectScore * 0.25) + 
        (Math.min(sizeScore, 1) * 0.20) + 
        (brandScore * 0.40) + 
        (titleScore * 0.15);
      
      return {
        ...img,
        totalScore,
        brandScore,
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore);
}

/**
 * Single search strategy
 */
async function singleSearch(
  searchQuery: string,
  apiKey: string,
  maxImages: number
): Promise<AIImageDiscoveryResult> {
  console.log(`🔍 [SINGLE SEARCH] Query: "${searchQuery}"`);
  
  try {
    const response = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: searchQuery }),
    });
    
    if (!response.ok) {
      throw new Error(`Serper API failed: ${response.status}`);
    }
    
    const data = await response.json();
    const images = data.images || [];
    
    console.log(`✅ [SINGLE SEARCH] Found ${images.length} images`);
    
    const processedImages = processAndScoreImages(images, searchQuery, null);
    const topImages = processedImages.slice(0, maxImages);
    
    const finalImages: ImageSearchResult[] = topImages.map((img, idx) => ({
      url: img.imageUrl,
      description: img.title || searchQuery,
      source: img.domain || extractDomain(img.imageUrl),
      isPrimary: idx === 0,
      rank: idx + 1,
    }));
    
    return {
      images: finalImages,
      searchQuery,
      totalFound: finalImages.length,
      reasoning: `Found ${finalImages.length} images via single search`,
    };
  } catch (error) {
    console.error('❌ [SINGLE SEARCH] Error:', error);
    return { images: [], searchQuery, totalFound: 0, reasoning: 'Search failed' };
  }
}

async function discoverImagesWithOpenAI(
  productName: string,
  options: {
    upc?: string | null;
    category?: string | null;
    manufacturer?: string | null;
    maxImages?: number;
  }
): Promise<AIImageDiscoveryResult> {
  const { upc, category, manufacturer, maxImages = 5 } = options;
  
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured in Supabase secrets');
  }

  const searchParts = [productName];
  if (manufacturer) searchParts.push(manufacturer);
  if (category) searchParts.push(category);
  const searchContext = searchParts.join(' ');

  console.log(`🤖 [OPENAI] Using Responses API with web search for: "${searchContext}"`);

  const inputPrompt = `Search the web to find ${maxImages} high-quality product images for: "${searchContext}"

CRITICAL CONTEXT:
- This is a CYCLING/BICYCLE product (NOT motorcycle, NOT motorbike)
- Look for bicycle helmets, bike components, cycling gear, bicycle accessories
- Avoid any motorcycle, motorbike, or motor scooter images

REQUIREMENTS:
- Direct image URLs from reputable cycling retailers (Amazon, REI, bike shops, manufacturer sites)
- Professional product photography with clean backgrounds
- High resolution (minimum 800x800 pixels)
- Square or nearly-square aspect ratio preferred
- Multiple angles if available

Return ONLY JSON (no markdown):
{
  "images": [
    {"url": "https://...", "description": "...", "source": "...", "isPrimary": true, "rank": 1}
  ],
  "reasoning": "..."
}

CRITICAL: Only include URLs you found via web search. Must be direct image URLs (.jpg, .png, .webp). ONLY CYCLING/BICYCLE products!`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        input: inputPrompt,
        tools: [{ 
          type: 'web_search_preview',
          search_context_size: 'high',
          user_location: { type: 'approximate', country: 'AU' }
        }],
        tool_choice: 'auto',
        temperature: 0.3,
        store: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [OPENAI] Error: ${response.status} - ${errorText}`);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    if (!data) {
      throw new Error('OpenAI returned empty response');
    }

    console.log(`✅ [OPENAI] Response received (${data.usage?.total_tokens || '?'} tokens)`);

    // Extract output text with safety checks
    let outputText = '';
    if (data.output && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item && item.type === 'web_search_call') {
          console.log(`🔍 [OPENAI] Web search executed: ${item.status || 'unknown'}`);
        }
        if (item && item.type === 'message' && item.content && Array.isArray(item.content)) {
          for (const content of item.content) {
            if (content && content.type === 'output_text' && content.text) {
              outputText = content.text;
            }
          }
        }
      }
    }

    if (!outputText) {
      throw new Error('No output text found in OpenAI response');
    }

    // Parse JSON
    const jsonMatch = outputText.match(/```(?:json)?\s*([\s\S]*?)```/) || outputText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON in OpenAI response');
    }

    const parsed = JSON.parse(jsonMatch[jsonMatch.length === 2 ? 1 : 0]);
    
    const validImages: ImageSearchResult[] = [];
    for (const img of parsed.images || []) {
      if (img.url && isValidImageUrl(img.url) && 
          !img.url.includes('example.com') && 
          !img.url.includes('placeholder')) {
        validImages.push({
          url: img.url,
          description: img.description || productName,
          source: img.source || extractDomain(img.url),
          isPrimary: validImages.length === 0,
          rank: validImages.length + 1,
        });
      }
    }

    console.log(`✅ [OPENAI] Validated ${validImages.length} URLs`);

    return {
      images: validImages.slice(0, maxImages),
      searchQuery: searchContext,
      totalFound: validImages.length,
      reasoning: parsed.reasoning || 'Found via OpenAI web search',
    };
  } catch (error) {
    console.error(`❌ [OPENAI] Error:`, error);
    throw error;
  }
}

/**
 * Uses GPT-4 to intelligently select best images from candidates
 */
async function curateImagesWithAI(
  productName: string,
  candidates: SerperImageResult[],
  apiKey: string,
  maxImages: number
): Promise<ImageSearchResult[]> {
  const imageDescriptions = candidates.map((img, idx) => ({
    index: idx,
    url: img.imageUrl.substring(0, 100) + '...',
    title: img.title,
    width: img.imageWidth,
    height: img.imageHeight,
    source: img.domain,
  }));

  const prompt = `Select the ${maxImages} best HERO PRODUCT PHOTOS for e-commerce: "${productName}"

Available images:
${JSON.stringify(imageDescriptions, null, 2)}

CRITICAL REQUIREMENTS for e-commerce hero photos:
1. Clean white or neutral background (NO lifestyle shots, NO in-use photos)
2. Product-only shot (NO people, NO scenery, NO action shots)
3. Professional studio quality (clear, well-lit, sharp focus)
4. Square or near-square aspect ratio (800x800+)
5. High resolution from reputable retailers (Amazon, manufacturer sites preferred)
6. Front/main view showing entire product clearly

REJECT these types:
- Lifestyle shots (person riding bike, outdoor scenes)
- In-use photos (being worn, being ridden)
- Catalog pages or multi-product layouts
- Low quality or blurry images
- Images with text overlays or watermarks

Identify the PRIMARY (hero) image - the absolute best clean product shot on white/neutral background.

Return JSON:
{
  "selections": [
    { "index": 0, "isPrimary": true, "reason": "Clean white background, front view, high-res" }
  ]
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You select the best product images for e-commerce.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 500,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid OpenAI API response structure');
    }

    const parsed = JSON.parse(data.choices[0].message.content || '{}');

    const results: ImageSearchResult[] = [];
    for (const selection of parsed.selections || []) {
      const candidate = candidates[selection.index];
      if (candidate) {
        results.push({
          url: candidate.imageUrl,
          description: candidate.title || selection.reason || productName,
          source: candidate.domain || extractDomain(candidate.imageUrl),
          isPrimary: selection.isPrimary === true,
          rank: results.length + 1,
        });
      }
    }

    // Ensure one primary
    if (results.length > 0 && !results.some(img => img.isPrimary)) {
      results[0].isPrimary = true;
    }

    console.log(`✅ [GPT-4] Curated ${results.length} images`);
    return results.slice(0, maxImages);
  } catch (error) {
    console.error(`❌ [GPT-4] Curation failed:`, error);
    
    // Fallback: return first N
    return candidates.slice(0, maxImages).map((img, idx) => ({
      url: img.imageUrl,
      description: img.title || productName,
      source: img.domain || extractDomain(img.imageUrl),
      isPrimary: idx === 0,
      rank: idx + 1,
    }));
  }
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

/**
 * Validates that a URL is a direct image link
 */
export function isValidImageUrl(url: string): boolean {
  try {
    if (!url || typeof url !== 'string') return false;
    
    // No data URLs or blob URLs
    if (url.startsWith('data:') || url.startsWith('blob:')) return false;
    
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    const fullUrl = url.toLowerCase();
    
    // Check for image extensions
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'];
    const hasImageExtension = imageExtensions.some(ext => pathname.endsWith(ext));
    
    // Also allow image query params (Amazon, CDNs)
    const hasImageParam = /\.(jpg|jpeg|png|webp|gif)/i.test(fullUrl);
    
    // Check for common image CDN patterns
    const isImageCDN = /images-na\.ssl-images-amazon\.com|m\.media-amazon\.com|images\.unsplash\.com|i\.imgur\.com|cdn\.shopify\.com/i.test(url);
    
    // Block placeholder domains
    const domain = parsed.hostname.toLowerCase();
    if (domain.includes('example.') || 
        domain.includes('placeholder') ||
        domain === 'localhost') {
      return false;
    }
    
    return hasImageExtension || hasImageParam || isImageCDN;
  } catch {
    return false;
  }
}
