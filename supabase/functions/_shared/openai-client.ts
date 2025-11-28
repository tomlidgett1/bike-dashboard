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
  const { upc, category, manufacturer, maxImages = 5 } = options;
  
  // Build search query - emphasize CYCLING/BICYCLE products
  const searchParts = ['bicycle', productName]; // Start with 'bicycle' to ensure cycling context
  if (manufacturer) searchParts.push(manufacturer);
  if (category && !productName.toLowerCase().includes(category.toLowerCase())) {
    searchParts.push(category);
  }
  
  const searchQuery = searchParts.join(' ') + ' cycling product';
  console.log(`🔍 [IMAGE SEARCH] Query: "${searchQuery}"`);

  // ============================================================
  // METHOD 1: Serper API (Google Images) - BEST RESULTS
  // ============================================================
  const SERPER_API_KEY = Deno.env.get('SERPER_API_KEY');
  
  if (SERPER_API_KEY) {
    console.log(`🌐 [SERPER] Using Google Image Search for guaranteed working URLs...`);
    console.log(`🔑 [SERPER] API Key present: Yes (length: ${SERPER_API_KEY.length} chars)`);
    console.log(`🔑 [SERPER] API Key first 8 chars: ${SERPER_API_KEY.substring(0, 8)}...`);
    
    try {
      const serperResponse = await fetch('https://google.serper.dev/images', {
        method: 'POST',
        headers: {
          'X-API-KEY': SERPER_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: searchQuery,
          num: 30, // Get more to filter for square images
          gl: 'au', // Australia
          hl: 'en',
          // Note: Serper doesn't have direct square filter, we'll filter after
        }),
      });

      if (!serperResponse.ok) {
        const error = await serperResponse.text();
        console.error(`❌ [SERPER] API error: ${serperResponse.status} - ${error}`);
        console.error(`❌ [SERPER] Request URL: https://google.serper.dev/images`);
        console.error(`❌ [SERPER] Request body: ${JSON.stringify({ q: searchQuery, num: 20, gl: 'au', hl: 'en' })}`);
        throw new Error('Serper API failed - check your API key at https://serper.dev/dashboard');
      }

      const serperData = await serperResponse.json();
      const images: SerperImageResult[] = serperData.images || [];
      
      console.log(`✅ [SERPER] Found ${images.length} images from Google`);

      if (images.length === 0) {
        console.log(`⚠️  [SERPER] No images found for "${searchQuery}"`);
        return {
          images: [],
          searchQuery,
          totalFound: 0,
          reasoning: 'No images found in Google Image Search',
        };
      }

      // Filter and score images (prioritize square aspect ratios)
      const scoredImages = images
        .filter(img => {
          // Must have an image URL
          if (!img.imageUrl) {
            console.log(`   ⚠️ Skipping: no imageUrl`);
            return false;
          }
          
          // Must be a valid image URL format
          if (!isValidImageUrl(img.imageUrl)) {
            console.log(`   ⚠️ Skipping: invalid URL format - ${img.imageUrl}`);
            return false;
          }
          
          // Skip tiny images (likely thumbnails)
          if (img.imageWidth && img.imageWidth < 400) {
            console.log(`   ⚠️ Skipping: too small (${img.imageWidth}px)`);
            return false;
          }
          if (img.imageHeight && img.imageHeight < 400) {
            console.log(`   ⚠️ Skipping: too small (${img.imageHeight}px)`);
            return false;
          }
          
          // Skip sketchy domains that often block downloads
          const domain = img.domain?.toLowerCase() || '';
          if (domain.includes('aliexpress') || 
              domain.includes('wish.com') ||
              domain.includes('alibaba') ||
              domain.includes('pinterest')) {
            console.log(`   ⚠️ Skipping: blocked domain - ${domain}`);
            return false;
          }

          // Skip data URLs and blob URLs
          if (img.imageUrl.startsWith('data:') || img.imageUrl.startsWith('blob:')) {
            console.log(`   ⚠️ Skipping: data/blob URL`);
            return false;
          }
          
          return true;
        })
        .map(img => {
          // Calculate aspect ratio score (1.0 = perfect square)
          const aspectRatio = img.imageWidth && img.imageHeight 
            ? img.imageWidth / img.imageHeight 
            : 1;
          
          // Score: closer to 1:1 = higher score
          // Perfect square (1:1) = 1.0
          // 4:3 or 3:4 = ~0.75
          // 16:9 or 9:16 = ~0.56
          const aspectScore = 1 - Math.abs(1 - aspectRatio);
          
          // Size score: larger images preferred
          const sizeScore = (img.imageWidth || 0) * (img.imageHeight || 0) / 1000000; // Normalize to ~1.0 for 1000x1000
          
          // Combined score: 60% aspect ratio, 40% size
          const totalScore = (aspectScore * 0.6) + (Math.min(sizeScore, 1) * 0.4);
          
          const isSquareish = aspectRatio >= 0.8 && aspectRatio <= 1.2;
          
          console.log(`   ${isSquareish ? '🟩' : '⬜'} ${img.imageWidth}x${img.imageHeight} (${aspectRatio.toFixed(2)}:1) score: ${totalScore.toFixed(2)} - ${img.imageUrl.substring(0, 60)}...`);
          
          return {
            ...img,
            aspectRatio,
            aspectScore,
            sizeScore,
            totalScore,
            isSquareish,
          };
        })
        .sort((a, b) => b.totalScore - a.totalScore) // Sort by score (best first)
        .slice(0, 15); // Top 15 candidates
      
      const validImages = scoredImages;

      console.log(`📊 [SERPER] ${validImages.length} valid images after filtering`);
      
      // Count square images
      const squareCount = validImages.filter((img: any) => img.isSquareish).length;
      console.log(`🟩 [SERPER] ${squareCount} square/near-square images (aspect ratio 0.8-1.2)`);

      if (validImages.length === 0) {
        console.log(`⚠️  [SERPER] All images filtered out, trying OpenAI fallback...`);
        return await discoverImagesWithOpenAI(productName, options);
      }

      // Use GPT-4 to intelligently select the best images (already sorted by score)
      const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
      if (OPENAI_API_KEY && validImages.length > maxImages) {
        console.log(`🤖 [GPT-4] Curating best ${maxImages} images from ${validImages.length} candidates...`);
        console.log(`💡 [GPT-4] Images already sorted by square preference`);
        const curatedImages = await curateImagesWithAI(
          productName,
          validImages,
          OPENAI_API_KEY,
          maxImages
        );
        
        return {
          images: curatedImages,
          searchQuery,
          totalFound: curatedImages.length,
          reasoning: `Selected ${curatedImages.length} best images (prioritized square aspect ratios) from ${images.length} Google results`,
        };
      }

      // Return top images (already sorted by square preference + size)
      const topImages: ImageSearchResult[] = validImages
        .slice(0, maxImages)
        .map((img, idx) => ({
          url: img.imageUrl,
          description: img.title || `${productName} - ${img.source}`,
          source: img.domain || extractDomain(img.imageUrl),
          isPrimary: idx === 0,
          rank: idx + 1,
        }));

      console.log(`✅ [SERPER] Returning ${topImages.length} images`);

      return {
        images: topImages,
        searchQuery,
        totalFound: topImages.length,
        reasoning: `Selected top ${topImages.length} images (prioritized square/near-square aspect ratios) from Google Image Search`,
      };
    } catch (error) {
      console.error(`❌ [SERPER] Error:`, error);
      console.log(`🔄 [SERPER] Falling back to OpenAI Responses API...`);
      // Fall through to OpenAI fallback
    }
  } else {
    console.log(`⚠️  [SERPER] SERPER_API_KEY not set`);
    console.log(`💡 [SERPER] Get free API key at https://serper.dev (2,500 searches/month free)`);
  }

  // ============================================================
  // METHOD 2: OpenAI Responses API - Fallback
  // ============================================================
  return await discoverImagesWithOpenAI(productName, options);
}

/**
 * Uses OpenAI Responses API with web_search_preview (fallback method)
 */
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
    console.log(`✅ [OPENAI] Response received (${data.usage?.total_tokens || '?'} tokens)`);

    // Extract output text
    let outputText = '';
    if (data.output && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type === 'web_search_call') {
          console.log(`🔍 [OPENAI] Web search executed: ${item.status}`);
        }
        if (item.type === 'message' && item.content) {
          for (const content of item.content) {
            if (content.type === 'output_text') {
              outputText = content.text;
            }
          }
        }
      }
    }

    if (!outputText) {
      throw new Error('No output from OpenAI');
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

  const prompt = `Select the ${maxImages} best product images for e-commerce: "${productName}"

Available images:
${JSON.stringify(imageDescriptions, null, 2)}

Prioritise:
1. Clear product visibility (not lifestyle shots)
2. Professional quality (white/neutral backgrounds)
3. High resolution (larger = better)
4. Multiple angles
5. Reputable sources (Amazon, manufacturer sites)

Identify the PRIMARY (hero) image - the best main product shot.

Return JSON:
{
  "selections": [
    { "index": 0, "isPrimary": true, "reason": "Clear front view" }
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

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0]?.message?.content || '{}');

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
