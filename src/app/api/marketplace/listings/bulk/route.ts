import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import type { ListingFormData } from '@/lib/types/listing';

// ============================================================
// Bulk Listing Creation API
// Creates multiple listings in parallel
// ============================================================

const MAX_CONCURRENT_CREATIONS = 5;

interface BulkListingRequest {
  listings: ListingFormData[];
}

interface CreateResult {
  index: number;
  success: boolean;
  listingId?: string;
  error?: string;
}

// ============================================================
// Helper: Create Single Listing
// ============================================================

async function createSingleListing(
  listing: ListingFormData,
  userId: string,
  supabase: any
): Promise<{ success: boolean; listingId?: string; error?: string }> {
  try {
    // Map form data to database columns (matching regular listings API exactly)
    const listingData = {
      user_id: userId,
      listing_type: 'private_listing' as const,
      listing_source: 'manual' as const,
      listing_status: 'active' as const,
      
      // Basic info
      description: listing.title || '', // description field stores the title/name
      brand: listing.brand || null,
      model: listing.model || null,
      model_year: listing.modelYear || null,
      price: listing.price || 0,
      marketplace_category: listing.marketplace_category || 'Bicycles',
      marketplace_subcategory: listing.marketplace_subcategory || null,
      
      // Images
      images: listing.images || [],
      primary_image_url: listing.primaryImageUrl || (listing.images && listing.images[0]?.url),
      
      // Bike fields
      frame_size: listing.frameSize,
      frame_material: listing.frameMaterial,
      bike_type: listing.bikeType,
      groupset: listing.groupset,
      wheel_size: listing.wheelSize,
      suspension_type: listing.suspensionType,
      bike_weight: listing.bikeWeight,
      color_primary: listing.colorPrimary,
      color_secondary: listing.colorSecondary,
      
      // Part fields
      part_type_detail: listing.partTypeDetail,
      compatibility_notes: listing.compatibilityNotes,
      material: listing.material,
      weight: listing.weight,
      
      // Apparel fields
      size: listing.size,
      gender_fit: listing.genderFit,
      apparel_material: listing.apparelMaterial,
      
      // Condition and descriptions
      product_description: listing.productDescription || null,
      condition_rating: listing.conditionRating,
      condition_details: listing.conditionDetails,
      seller_notes: listing.sellerNotes,
      wear_notes: listing.wearNotes,
      usage_estimate: listing.usageEstimate,
      purchase_location: listing.purchaseLocation,
      purchase_date: listing.purchaseDate,
      service_history: listing.serviceHistory || [],
      upgrades_modifications: listing.upgradesModifications,
      
      // Selling details
      reason_for_selling: listing.reasonForSelling,
      is_negotiable: listing.isNegotiable || false,
      shipping_available: listing.shippingAvailable || false,
      shipping_cost: listing.shippingCost,
      pickup_location: listing.pickupLocation,
      included_accessories: listing.includedAccessories,
      
      // Contact
      seller_contact_preference: listing.sellerContactPreference || 'message',
      seller_phone: listing.sellerPhone,
      seller_email: listing.sellerEmail,
      
      // Dates
      published_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
      
      // System fields
      qoh: 1,
      is_active: true,
      system_sku: `LISTING-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      lightspeed_item_id: `manual-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    };

    const { data, error} = await supabase
      .from('products')
      .insert(listingData)
      .select('id')
      .single();

    if (error) {
      console.error('[BULK API] Error creating listing:', error);
      throw new Error(error.message);
    }

    console.log('[BULK API] Created listing:', data.id);
    return { success: true, listingId: data.id };

  } catch (error) {
    console.error('[BULK API] Exception creating listing:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create listing',
    };
  }
}

// ============================================================
// Helper: Create Listings in Batches
// ============================================================

async function createListingsBatch(
  listings: ListingFormData[],
  userId: string,
  supabase: any
): Promise<CreateResult[]> {
  const results: CreateResult[] = [];
  
  // Process in batches
  for (let i = 0; i < listings.length; i += MAX_CONCURRENT_CREATIONS) {
    const batch = listings.slice(i, i + MAX_CONCURRENT_CREATIONS);
    console.log(`[BULK API] Processing batch ${Math.floor(i / MAX_CONCURRENT_CREATIONS) + 1} (${batch.length} listings)`);
    
    const batchResults = await Promise.all(
      batch.map(async (listing, batchIndex) => {
        const globalIndex = i + batchIndex;
        const result = await createSingleListing(listing, userId, supabase);
        
        return {
          index: globalIndex,
          success: result.success,
          listingId: result.listingId,
          error: result.error,
        };
      })
    );
    
    results.push(...batchResults);
  }
  
  return results;
}

// ============================================================
// POST: Create Multiple Listings
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body: BulkListingRequest = await request.json();
    const { listings } = body;

    if (!listings || !Array.isArray(listings) || listings.length === 0) {
      return NextResponse.json(
        { error: 'No listings provided' },
        { status: 400 }
      );
    }

    console.log(`[BULK API] Creating ${listings.length} listings for user ${user.id}`);

    // Create all listings
    const results = await createListingsBatch(listings, user.id, supabase);

    // Count successes and failures
    const created = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`[BULK API] Complete: ${created.length} succeeded, ${failed.length} failed`);

    return NextResponse.json({
      success: true,
      created: created.map(r => r.listingId),
      failed: failed.map(r => ({
        index: r.index,
        error: r.error,
      })),
      summary: {
        total: listings.length,
        succeeded: created.length,
        failed: failed.length,
      },
    });

  } catch (error) {
    console.error('[BULK API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

