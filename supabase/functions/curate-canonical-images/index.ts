// ============================================================
// Curate Canonical Images Edge Function
// Uses Serper API + GPT-4o Vision (Responses API) to select
// up to 5 diverse angle images for a canonical product
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { uploadToCloudinary } from '../_shared/cloudinary-uploader.ts'

console.log('Function "curate-canonical-images" initialized!')

// ============================================================
// Types
// ============================================================

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

interface Base64Image {
  url: string;
  base64: string;
  index: number;
  mimeType: string;
}

interface ImageSelection {
  index: number;
  isPrimary: boolean;
  angle: string;
  reason: string;
}

interface CuratedImage {
  id: string;
  url: string;
  cardUrl: string | null;
  isPrimary: boolean;
  angle: string;
  reason: string;
}

// ============================================================
// Serper API: Search Google Images
// ============================================================

async function searchSerperImages(
  productName: string,
  upc: string | null,
  maxImages: number = 15
): Promise<string[]> {
  const SERPER_API_KEY = Deno.env.get('SERPER_API_KEY');
  
  if (!SERPER_API_KEY) {
    throw new Error('SERPER_API_KEY not configured');
  }

  const searchQuery = `cycling ${productName}`;
  console.log(`🔍 [SERPER] Searching for: "${searchQuery}"`);

  try {
    const response = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: searchQuery,
        num: 30, // Get more candidates for AI to choose from
        gl: 'au',
        hl: 'en',
        tbs: 'isz:l', // Large images only
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Serper API failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const images: SerperImageResult[] = data.images || [];
    
    console.log(`✅ [SERPER] Found ${images.length} images`);

    // Filter and extract URLs
    const imageUrls = images
      .filter(img => {
        // Filter out small images
        if (img.imageWidth < 400 || img.imageHeight < 400) return false;
        // Filter out known placeholder/sketch domains
        const badDomains = ['pinterest.', 'facebook.', 'instagram.', 'tiktok.', 'twitter.'];
        if (badDomains.some(d => img.domain?.includes(d))) return false;
        return true;
      })
      .slice(0, maxImages)
      .map(img => img.imageUrl);

    console.log(`✅ [SERPER] Filtered to ${imageUrls.length} usable images`);
    return imageUrls;
  } catch (error) {
    console.error('❌ [SERPER] Error:', error);
    throw error;
  }
}

// ============================================================
// Download Images as Base64
// ============================================================

async function downloadImagesAsBase64(
  imageUrls: string[],
  maxImages: number = 15
): Promise<Base64Image[]> {
  console.log(`📥 [DOWNLOAD] Downloading ${Math.min(imageUrls.length, maxImages)} images...`);
  
  const imagesToDownload = imageUrls.slice(0, maxImages);
  const base64Images: Base64Image[] = [];

  for (let i = 0; i < imagesToDownload.length; i++) {
    const url = imagesToDownload[i];
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BikeMarketplace/1.0)',
        },
      });

      if (!response.ok) {
        console.error(`❌ [DOWNLOAD] Failed to download image ${i + 1}: HTTP ${response.status}`);
        continue;
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.startsWith('image/')) {
        console.error(`❌ [DOWNLOAD] Invalid content type for image ${i + 1}: ${contentType}`);
        continue;
      }

      const blob = await response.blob();
      const fileSize = blob.size;

      // Skip images that are too large
      if (fileSize > 5 * 1024 * 1024) {
        console.error(`❌ [DOWNLOAD] Image ${i + 1} too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
        continue;
      }

      // Skip images that are too small
      if (fileSize < 10 * 1024) {
        console.error(`❌ [DOWNLOAD] Image ${i + 1} too small: ${(fileSize / 1024).toFixed(0)}KB`);
        continue;
      }

      // Convert to base64 in chunks
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      let binary = '';
      const chunkSize = 8192;
      for (let j = 0; j < uint8Array.length; j += chunkSize) {
        const chunk = uint8Array.subarray(j, Math.min(j + chunkSize, uint8Array.length));
        binary += String.fromCharCode(...chunk);
      }
      const base64 = btoa(binary);

      base64Images.push({
        url,
        base64,
        index: i,
        mimeType: contentType,
      });

      console.log(`✅ [DOWNLOAD] Image ${i + 1} downloaded: ${(fileSize / 1024).toFixed(0)}KB`);
    } catch (error) {
      console.error(`❌ [DOWNLOAD] Error downloading image ${i + 1}:`, error);
      continue;
    }
  }

  console.log(`✅ [DOWNLOAD] Successfully downloaded ${base64Images.length}/${imagesToDownload.length} images`);
  return base64Images;
}

// ============================================================
// GPT-4o Vision: Select Best Images with Angle Diversity
// Using the Responses API (NOT Completions API)
// ============================================================

async function selectImagesWithVision(
  images: Base64Image[],
  productName: string
): Promise<{ selections: ImageSelection[]; reasoning: string }> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  console.log(`🤖 [VISION] Analysing ${images.length} images with GPT-4o for product: "${productName}"`);

  // Build the message content with all images
  const imageContent = images.map((img) => ({
    type: 'input_image' as const,
    image_url: `data:${img.mimeType};base64,${img.base64}`,
  }));

  const prompt = `You are an expert at selecting e-commerce product images for cycling products.
Analyse these ${images.length} images and select up to 5 DIVERSE images with DIFFERENT ANGLES.

Product: "${productName}"

ANGLE CATEGORIES TO SELECT (one image per category when available):
1. PRIMARY (Hero): Clean front view, white/neutral background, studio quality - THIS IS THE MOST IMPORTANT
2. SIDE VIEW: Product from 45-degree or side angle showing profile
3. BACK/REAR: Showing back of product if relevant
4. DETAIL: Close-up of key feature, texture, branding, or mechanism
5. CONTEXT: Size reference, packaging, or subtle lifestyle context (optional)

CRITICAL REQUIREMENTS:
- Select exactly ONE image per angle category (maximum 5 total)
- Each image MUST show a DIFFERENT perspective/angle
- REJECT duplicates or near-identical views
- Prioritise professional product photography with clean backgrounds
- The PRIMARY image MUST be the best clean studio shot

QUALITY FILTERS:
- Prefer white/neutral backgrounds
- Avoid watermarks, text overlays, poor lighting
- Avoid lifestyle/action shots for PRIMARY (save for CONTEXT)
- High resolution, well-lit, sharp focus

Images are numbered 0 to ${images.length - 1}.

Return ONLY valid JSON (no markdown, no code blocks):
{
  "selectedImages": [
    {
      "index": 0,
      "isPrimary": true,
      "angle": "front",
      "reason": "Clean studio shot with white background, excellent front view"
    },
    {
      "index": 3,
      "isPrimary": false,
      "angle": "side",
      "reason": "Shows product profile from 45-degree angle"
    }
  ],
  "totalSelected": 2,
  "reasoning": "Selected diverse angles covering front view and side profile for complete product representation"
}`;

  try {
    // Using the Responses API (NOT Completions API)
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
              ...imageContent,
            ],
          },
        ],
        temperature: 0.3,
        store: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [VISION] OpenAI API error: ${response.status} - ${errorText}`);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`✅ [VISION] Response received`);

    // Extract output text from Responses API structure
    let outputText = '';
    if (data.output && Array.isArray(data.output)) {
      for (const item of data.output) {
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

    // Parse JSON from response
    const jsonMatch = outputText.match(/```(?:json)?\s*([\s\S]*?)```/) || outputText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON in OpenAI response');
    }

    const parsed = JSON.parse(jsonMatch[jsonMatch.length === 2 ? 1 : 0]);

    console.log(`🤖 [VISION] AI selected ${parsed.totalSelected || parsed.selectedImages?.length || 0} images`);
    console.log(`🤖 [VISION] Reasoning: ${parsed.reasoning}`);

    // Validate selections
    const selections: ImageSelection[] = [];
    for (const selection of parsed.selectedImages || []) {
      if (selection.index >= 0 && selection.index < images.length) {
        selections.push({
          index: selection.index,
          isPrimary: selection.isPrimary === true,
          angle: selection.angle || 'unknown',
          reason: selection.reason || '',
        });
      }
    }

    // Ensure exactly one primary
    const primaryCount = selections.filter(s => s.isPrimary).length;
    if (primaryCount === 0 && selections.length > 0) {
      selections[0].isPrimary = true;
    } else if (primaryCount > 1) {
      let foundFirst = false;
      for (const s of selections) {
        if (s.isPrimary) {
          if (foundFirst) {
            s.isPrimary = false;
          } else {
            foundFirst = true;
          }
        }
      }
    }

    return {
      selections,
      reasoning: parsed.reasoning || 'Images selected based on angle diversity',
    };
  } catch (error) {
    console.error(`❌ [VISION] Error:`, error);
    throw error;
  }
}

// ============================================================
// Main Handler
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { canonicalProductId } = await req.json();

    if (!canonicalProductId) {
      return new Response(
        JSON.stringify({ error: 'canonical_product_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`\n🎨 [CURATE] ========================================`);
    console.log(`🎨 [CURATE] Starting image curation for: ${canonicalProductId}`);
    console.log(`🎨 [CURATE] ========================================\n`);

    // STEP 1: Fetch canonical product details
    const { data: canonical, error: canonicalError } = await supabase
      .from('canonical_products')
      .select('*')
      .eq('id', canonicalProductId)
      .single();

    if (canonicalError || !canonical) {
      console.error(`❌ [CURATE] Canonical product not found: ${canonicalError?.message}`);
      return new Response(
        JSON.stringify({ error: 'Canonical product not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use display_name if available, otherwise fall back to normalized_name
    const searchName = canonical.display_name || canonical.normalized_name;
    
    console.log(`📦 [CURATE] Product: "${searchName}"`);
    console.log(`📦 [CURATE] Display Name: ${canonical.display_name || 'NOT SET'}`);
    console.log(`📦 [CURATE] Normalized Name: ${canonical.normalized_name}`);
    console.log(`📦 [CURATE] UPC: ${canonical.upc || 'NONE'}`);
    console.log(`📦 [CURATE] Category: ${canonical.marketplace_category || canonical.category || 'none'}`);

    // STEP 2: Search for images with Serper
    console.log(`\n🔍 [CURATE] Step 1: Searching for images with Serper using: "${searchName}"`);
    const imageUrls = await searchSerperImages(
      searchName,
      canonical.upc,
      20 // Get 20 candidates
    );

    if (imageUrls.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No images found',
          message: 'Serper returned no usable images for this product',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // STEP 3: Download images as base64
    console.log(`\n📥 [CURATE] Step 2: Downloading images for analysis...`);
    const base64Images = await downloadImagesAsBase64(imageUrls, 15);

    if (base64Images.length < 2) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Insufficient images',
          message: `Only ${base64Images.length} images could be downloaded. Need at least 2.`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // STEP 4: Use GPT-4o Vision to select best images
    console.log(`\n🤖 [CURATE] Step 3: AI analysing images for angle diversity...`);
    const aiResult = await selectImagesWithVision(base64Images, searchName);

    if (aiResult.selections.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'AI selection failed',
          message: 'AI could not select any suitable images',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ [CURATE] AI selected ${aiResult.selections.length} diverse images`);

    // STEP 5: Delete existing images for this canonical product (fresh curation)
    console.log(`\n🗑️ [CURATE] Step 4: Clearing existing images...`);
    const { error: deleteError } = await supabase
      .from('product_images')
      .delete()
      .eq('canonical_product_id', canonicalProductId);

    if (deleteError) {
      console.error(`⚠️ [CURATE] Could not delete existing images: ${deleteError.message}`);
    }

    // STEP 6: Save and upload selected images
    console.log(`\n💾 [CURATE] Step 5: Saving ${aiResult.selections.length} curated images...`);
    const curatedImages: CuratedImage[] = [];

    for (let i = 0; i < aiResult.selections.length; i++) {
      const selection = aiResult.selections[i];
      const selectedImage = base64Images[selection.index];
      
      if (!selectedImage) continue;

      console.log(`\n💾 [CURATE] Saving image ${i + 1}/${aiResult.selections.length}`);
      console.log(`   Angle: ${selection.angle}`);
      console.log(`   Primary: ${selection.isPrimary}`);
      console.log(`   Reason: ${selection.reason}`);

      try {
        // Create product_images record
        const { data: imageRecord, error: recordError } = await supabase
          .from('product_images')
          .insert({
            canonical_product_id: canonicalProductId,
            external_url: selectedImage.url,
            storage_path: null,
            is_downloaded: false,
            is_primary: selection.isPrimary,
            sort_order: i + 1,
            variants: {},
            formats: {},
            width: 800,
            height: 800,
            file_size: 0,
            mime_type: 'image/jpeg',
            uploaded_by: null,
            approval_status: 'approved', // AI-approved
          })
          .select('id')
          .single();

        if (recordError) {
          console.error(`❌ [CURATE] Failed to create image record: ${recordError.message}`);
          continue;
        }

        console.log(`✅ [CURATE] Image record created: ${imageRecord.id}`);

        // Upload to Cloudinary
        console.log(`📤 [CURATE] Uploading to Cloudinary...`);
        const cloudinaryResult = await uploadToCloudinary(
          selectedImage.url,
          canonicalProductId,
          i + 1
        );

        if (cloudinaryResult.success) {
          console.log(`✅ [CURATE] Cloudinary upload complete`);

          // Update record with Cloudinary URLs
          await supabase
            .from('product_images')
            .update({
              cloudinary_url: cloudinaryResult.cloudinaryUrl,
              cloudinary_public_id: cloudinaryResult.cloudinaryPublicId,
              thumbnail_url: cloudinaryResult.thumbnailUrl,
              mobile_card_url: cloudinaryResult.mobileCardUrl,
              card_url: cloudinaryResult.cardUrl,
              gallery_url: cloudinaryResult.cardUrl, // Use card URL for gallery
              detail_url: cloudinaryResult.detailUrl,
              is_downloaded: true,
              width: cloudinaryResult.width,
              height: cloudinaryResult.height,
              file_size: cloudinaryResult.fileSize,
              mime_type: 'image/webp',
            })
            .eq('id', imageRecord.id);

          curatedImages.push({
            id: imageRecord.id,
            url: selectedImage.url,
            cardUrl: cloudinaryResult.cardUrl || null,
            isPrimary: selection.isPrimary,
            angle: selection.angle,
            reason: selection.reason,
          });
        } else {
          console.error(`❌ [CURATE] Cloudinary failed: ${cloudinaryResult.error}`);
          
          // Still add to results with external URL
          curatedImages.push({
            id: imageRecord.id,
            url: selectedImage.url,
            cardUrl: null,
            isPrimary: selection.isPrimary,
            angle: selection.angle,
            reason: selection.reason,
          });
        }
      } catch (error) {
        console.error(`❌ [CURATE] Error saving image ${i + 1}:`, error);
        continue;
      }
    }

    // STEP 7: Update canonical product image count
    await supabase
      .from('canonical_products')
      .update({ image_count: curatedImages.length })
      .eq('id', canonicalProductId);

    console.log(`\n📈 [CURATE] ========================================`);
    console.log(`📈 [CURATE] Summary:`);
    console.log(`📈 [CURATE]   - Candidates from Serper: ${imageUrls.length}`);
    console.log(`📈 [CURATE]   - Downloaded for analysis: ${base64Images.length}`);
    console.log(`📈 [CURATE]   - AI selected: ${aiResult.selections.length}`);
    console.log(`📈 [CURATE]   - Successfully saved: ${curatedImages.length}`);
    console.log(`📈 [CURATE]   - Primary image: ${curatedImages.find(i => i.isPrimary)?.angle || 'none'}`);
    console.log(`📈 [CURATE] ========================================\n`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          canonicalProductId,
          productName: searchName,
          candidatesFound: imageUrls.length,
          imagesSelected: curatedImages.length,
          images: curatedImages,
          aiReasoning: aiResult.reasoning,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`❌ [CURATE] Unexpected error:`, error);

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Image curation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

