// ============================================================
// OpenAI Vision-based Image Selector
// Uses GPT-4o to intelligently select best product images
// ============================================================

export interface Base64Image {
  url: string;
  base64: string;
  index: number;
  mimeType: string;
}

export interface ImageSelection {
  index: number;
  isPrimary: boolean;
  reason: string;
}

export interface AISelectionResult {
  selectedImages: ImageSelection[];
  totalSelected: number;
  reasoning: string;
}

/**
 * Downloads images and converts them to base64 for OpenAI Vision API
 */
export async function downloadImagesAsBase64(
  imageUrls: string[],
  maxImages: number = 10
): Promise<Base64Image[]> {
  console.log(`📥 [VISION] Downloading ${Math.min(imageUrls.length, maxImages)} images as base64...`);
  
  const imagesToDownload = imageUrls.slice(0, maxImages);
  const base64Images: Base64Image[] = [];

  for (let i = 0; i < imagesToDownload.length; i++) {
    const url = imagesToDownload[i];
    
    try {
      console.log(`📥 [VISION] Downloading image ${i + 1}/${imagesToDownload.length}: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BikeMarketplace/1.0)',
        },
      });

      if (!response.ok) {
        console.error(`❌ [VISION] Failed to download image ${i + 1}: HTTP ${response.status}`);
        continue;
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.startsWith('image/')) {
        console.error(`❌ [VISION] Invalid content type for image ${i + 1}: ${contentType}`);
        continue;
      }

      const blob = await response.blob();
      const fileSize = blob.size;

      // Skip images that are too large (OpenAI limit is ~20MB but we want to be safe)
      if (fileSize > 5 * 1024 * 1024) {
        console.error(`❌ [VISION] Image ${i + 1} too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
        continue;
      }

      // Skip images that are too small (likely placeholders)
      if (fileSize < 10 * 1024) {
        console.error(`❌ [VISION] Image ${i + 1} too small: ${(fileSize / 1024).toFixed(0)}KB`);
        continue;
      }

      // Convert to base64 - handle large files by processing in chunks
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Convert in chunks to avoid stack overflow on large images
      let binary = '';
      const chunkSize = 8192; // Process 8KB at a time
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
        binary += String.fromCharCode(...chunk);
      }
      const base64 = btoa(binary);

      base64Images.push({
        url,
        base64,
        index: i,
        mimeType: contentType,
      });

      console.log(`✅ [VISION] Image ${i + 1} downloaded: ${(fileSize / 1024).toFixed(0)}KB`);
    } catch (error) {
      console.error(`❌ [VISION] Error downloading image ${i + 1}:`, error);
      continue;
    }
  }

  console.log(`✅ [VISION] Successfully downloaded ${base64Images.length}/${imagesToDownload.length} images`);
  return base64Images;
}

/**
 * Uses GPT-4o Vision to select the best product images
 */
export async function selectBestImagesWithAI(
  images: Base64Image[],
  productName: string
): Promise<AISelectionResult> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  console.log(`🤖 [VISION] Analyzing ${images.length} images with GPT-4o for product: "${productName}"`);

  // Build the message content with all images
  const imageContent = images.map((img) => ({
    type: 'image_url' as const,
    image_url: {
      url: `data:${img.mimeType};base64,${img.base64}`,
      detail: 'high' as const,
    },
  }));

  const prompt = `You are an expert at selecting e-commerce product images for cycling products.
Analyze these ${images.length} images and select the best 2-5 images for a product listing.

Product: "${productName}"

Requirements:
1. PRIMARY IMAGE (most important):
   - MUST be a clean studio shot with white/neutral background
   - Product-only, NO people or lifestyle context
   - Front view, well-lit, high resolution
   - Professional e-commerce quality
   - This is the HERO image customers see first

2. ADDITIONAL IMAGES (1-4 images):
   - Different angles or product details
   - Maintain professional quality
   - Avoid duplicates or near-identical shots
   - Prefer product-only over lifestyle shots
   - Show features/details not visible in primary

Selection Strategy:
- Prioritize image quality and clarity
- White/neutral backgrounds preferred
- Professional product photography over user-generated content
- Avoid images with watermarks, text overlays, or poor lighting
- Select 2-5 images total (including primary)

Images are numbered 0 to ${images.length - 1}.

Return ONLY valid JSON (no markdown, no code blocks):
{
  "selectedImages": [
    {
      "index": 0,
      "isPrimary": true,
      "reason": "Clean studio shot with white background, excellent front view"
    },
    {
      "index": 2,
      "isPrimary": false,
      "reason": "Shows product detail from side angle"
    }
  ],
  "totalSelected": 2,
  "reasoning": "Selected images prioritize professional product photography with neutral backgrounds"
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              ...imageContent,
            ],
          },
        ],
        max_tokens: 1000,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [VISION] OpenAI API error: ${response.status} - ${errorText}`);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid OpenAI API response structure');
    }

    const content = data.choices[0].message.content;
    const result: AISelectionResult = JSON.parse(content);

    console.log(`🤖 [VISION] AI selected ${result.totalSelected} images`);
    console.log(`🤖 [VISION] Reasoning: ${result.reasoning}`);
    
    result.selectedImages.forEach((img, idx) => {
      console.log(`   ${idx + 1}. Image ${img.index} ${img.isPrimary ? '(PRIMARY)' : ''}: ${img.reason}`);
    });

    // Validate result
    if (!result.selectedImages || result.selectedImages.length === 0) {
      throw new Error('AI returned no image selections');
    }

    if (result.selectedImages.length < 2) {
      throw new Error('AI selected fewer than 2 images - need at least 2 for quality listing');
    }

    const primaryCount = result.selectedImages.filter(img => img.isPrimary).length;
    if (primaryCount !== 1) {
      throw new Error(`AI selected ${primaryCount} primary images - must be exactly 1`);
    }

    // Validate indices are within range
    for (const img of result.selectedImages) {
      if (img.index < 0 || img.index >= images.length) {
        throw new Error(`Invalid image index ${img.index} - must be 0-${images.length - 1}`);
      }
    }

    return result;
  } catch (error) {
    console.error(`❌ [VISION] Error calling OpenAI Vision API:`, error);
    throw error;
  }
}

/**
 * Complete workflow: Download images and select best ones with AI
 */
export async function selectProductImagesWithAI(
  imageUrls: string[],
  productName: string,
  maxImagesToAnalyze: number = 10
): Promise<{
  selectedUrls: string[];
  primaryUrl: string;
  reasoning: string;
}> {
  // Step 1: Download images as base64
  const base64Images = await downloadImagesAsBase64(imageUrls, maxImagesToAnalyze);
  
  if (base64Images.length === 0) {
    throw new Error('Failed to download any images for analysis');
  }

  if (base64Images.length < 2) {
    throw new Error(`Only ${base64Images.length} images downloaded - need at least 2 for quality selection`);
  }

  // Step 2: Use AI to select best images
  const aiResult = await selectBestImagesWithAI(base64Images, productName);

  // Step 3: Map selections back to original URLs
  const selectedUrls: string[] = [];
  let primaryUrl = '';

  for (const selection of aiResult.selectedImages) {
    const selectedImage = base64Images[selection.index];
    if (selectedImage) {
      selectedUrls.push(selectedImage.url);
      if (selection.isPrimary) {
        primaryUrl = selectedImage.url;
      }
    }
  }

  if (!primaryUrl) {
    throw new Error('No primary image identified by AI');
  }

  return {
    selectedUrls,
    primaryUrl,
    reasoning: aiResult.reasoning,
  };
}

