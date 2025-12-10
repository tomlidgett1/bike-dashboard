"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PhotoUploadSmart } from "./photo-upload-smart";
import { AIAnalysisLoading } from "./ai-analysis-loading";
import { AIResultsReview } from "./ai-results-review";
import type { ListingAnalysisResult } from "@/lib/ai/schemas";

// ============================================================
// Smart Upload Flow Container
// ============================================================

type FlowStage = "upload" | "analyzing" | "searching" | "review" | "error";

interface SmartUploadFlowProps {
  onComplete: (formData: any, imageUrls: string[]) => void;
  onSwitchToManual: () => void;
}

export function SmartUploadFlow({ onComplete, onSwitchToManual }: SmartUploadFlowProps) {
  const [stage, setStage] = React.useState<FlowStage>("upload");
  const [photos, setPhotos] = React.useState<string[]>([]);
  const [analysis, setAnalysis] = React.useState<ListingAnalysisResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isMobile, setIsMobile] = React.useState(false);

  // Detect if on mobile
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handlePhotosUploaded = async (imageUrls: string[]) => {
    setPhotos(imageUrls);
    setStage("analyzing");
    setError(null);

    try {
      console.log('🤖 [SMART UPLOAD] Starting AI analysis...');
      console.log('🤖 [SMART UPLOAD] Image URLs:', imageUrls);

      // Get Supabase session token
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('You must be logged in to use AI analysis');
      }

      // Call Supabase Edge Function
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/analyze-listing-ai`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            imageUrls,
            userHints: {},
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "AI analysis failed");
      }

      const result = await response.json();
      console.log('✅ [SMART UPLOAD] Analysis received:', result);
      console.log('🔍 [SMART UPLOAD] Item type:', result.analysis?.item_type);
      console.log('🔍 [SMART UPLOAD] Bike details:', result.analysis?.bike_details);
      console.log('🔍 [SMART UPLOAD] Web enrichment data:', result.analysis?.web_enrichment);
      console.log('🔍 [SMART UPLOAD] Search URLs:', result.analysis?.search_urls);
      console.log('🔍 [SMART UPLOAD] Data sources:', result.analysis?.data_sources);
      console.log('🔍 [SMART UPLOAD] Structured metadata:', result.analysis?.structured_metadata);

      setAnalysis(result.analysis);
      setStage("review");
    } catch (err: any) {
      console.error('❌ [SMART UPLOAD] Error:', err);
      setError(err.message || "AI analysis failed");
      setStage("error");
    }
  };

  const handleReanalyze = () => {
    setStage("upload");
    setPhotos([]);
    setAnalysis(null);
    setError(null);
  };

  const handleContinue = (editedAnalysis: ListingAnalysisResult) => {
    console.log('🎯 [SMART UPLOAD] Continue clicked, analysis:', editedAnalysis);
    
    // Helper function to clean AI-generated text
    const cleanAiText = (text: string | undefined | null): string | undefined => {
      if (!text) return undefined;
      
      // Remove uncertainty phrases and clean up
      let cleaned = text
        .replace(/^(maybe|possibly|likely|probably|perhaps|approximately|about|around)\s+/gi, '')
        .replace(/\s+(or so|ish|roughly)\s*$/gi, '')
        .replace(/\s+or\s+/gi, '/') // Convert "Small or Medium" to "Small/Medium"
        .trim();
      
      // Capitalize first letter of each word (for materials, colors, etc.)
      cleaned = cleaned
        .split(' ')
        .map(word => {
          // Handle hyphenated words and slashes
          if (word.includes('-') || word.includes('/')) {
            return word.split(/[-/]/).map(part => 
              part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
            ).join(word.includes('-') ? '-' : '/');
          }
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');
      
      return cleaned || undefined;
    };
    
    // Map analysis to form data structure matching ListingFormData interface
    const formData: any = {
      itemType: editedAnalysis.item_type,
      brand: editedAnalysis.brand,
      model: editedAnalysis.model,
      modelYear: editedAnalysis.model_year,
      conditionRating: editedAnalysis.condition_rating as any,
      conditionDetails: editedAnalysis.condition_details,
      wearNotes: editedAnalysis.wear_notes,
      usageEstimate: editedAnalysis.usage_estimate,
      price: editedAnalysis.price_estimate 
        ? Math.round((editedAnalysis.price_estimate.min_aud + editedAnalysis.price_estimate.max_aud) / 2)
        : undefined,
    };

    // Add bike-specific fields
    if (editedAnalysis.item_type === 'bike' && editedAnalysis.bike_details) {
      console.log('🚴 [SMART UPLOAD] Adding bike details:', editedAnalysis.bike_details);
      formData.bikeType = cleanAiText(editedAnalysis.bike_details.bike_type);
      formData.frameSize = cleanAiText(editedAnalysis.bike_details.frame_size);
      formData.frameMaterial = cleanAiText(editedAnalysis.bike_details.frame_material);
      formData.groupset = cleanAiText(editedAnalysis.bike_details.groupset);
      formData.wheelSize = cleanAiText(editedAnalysis.bike_details.wheel_size);
      formData.suspensionType = cleanAiText(editedAnalysis.bike_details.suspension_type);
      formData.colorPrimary = cleanAiText(editedAnalysis.bike_details.color_primary);
      formData.colorSecondary = cleanAiText(editedAnalysis.bike_details.color_secondary);
      formData.bikeWeight = cleanAiText(editedAnalysis.bike_details.approximate_weight);
      console.log('🚴 [SMART UPLOAD] Cleaned bike fields:', {
        frameSize: formData.frameSize,
        frameMaterial: formData.frameMaterial,
        groupset: formData.groupset,
        wheelSize: formData.wheelSize,
      });
    }

    // Add part-specific fields
    if (editedAnalysis.item_type === 'part' && editedAnalysis.part_details) {
      formData.marketplace_subcategory = editedAnalysis.part_details.category;
      formData.partTypeDetail = cleanAiText(editedAnalysis.part_details.part_type);
      formData.compatibilityNotes = editedAnalysis.part_details.compatibility;
      formData.material = cleanAiText(editedAnalysis.part_details.material);
      formData.weight = cleanAiText(editedAnalysis.part_details.weight);
    }

    // Add apparel-specific fields
    if (editedAnalysis.item_type === 'apparel' && editedAnalysis.apparel_details) {
      formData.marketplace_subcategory = editedAnalysis.apparel_details.category;
      formData.size = cleanAiText(editedAnalysis.apparel_details.size);
      formData.genderFit = cleanAiText(editedAnalysis.apparel_details.gender_fit);
      formData.apparelMaterial = cleanAiText(editedAnalysis.apparel_details.material);
    }

    // Add smart upload metadata (for database JSONB storage)
    if (editedAnalysis.structured_metadata) {
      formData.structuredMetadata = editedAnalysis.structured_metadata;
    }

    // Add web search sources
    if (editedAnalysis.search_urls) {
      formData.searchUrls = editedAnalysis.search_urls;
    }

    // Add AI confidence scores
    if (editedAnalysis.field_confidence) {
      formData.fieldConfidence = editedAnalysis.field_confidence;
    }

    // Add images to formData
    formData.images = photos.map((url, index) => ({
      id: `ai-${index}`,
      url,
      order: index,
      isPrimary: index === 0,
    }));
    formData.primaryImageUrl = photos[0];

    console.log('🎯 [SMART UPLOAD] Mapped form data:', formData);
    console.log('🎯 [SMART UPLOAD] Images:', formData.images);
    
    onComplete(formData, photos);
  };

  return (
    <div className={isMobile ? "min-h-screen bg-gray-50" : "min-h-screen bg-gray-50 py-12 px-6"}>
      <AnimatePresence mode="wait">
        <motion.div
          key={stage}
          initial={{ opacity: 0, y: isMobile ? 0 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: isMobile ? 0 : -20 }}
          transition={{ duration: 0.3 }}
        >
          {stage === "upload" && (
            <PhotoUploadSmart
              onPhotosUploaded={handlePhotosUploaded}
              minPhotos={1}
              maxPhotos={10}
            />
          )}

          {stage === "analyzing" && (
            <AIAnalysisLoading photoCount={photos.length} />
          )}

          {stage === "review" && analysis && (
            <AIResultsReview
              analysis={analysis}
              photos={photos}
              onContinue={handleContinue}
              onReanalyze={handleReanalyze}
              onSwitchToManual={onSwitchToManual}
            />
          )}

          {stage === "error" && (
            <div className={isMobile ? "p-4" : "max-w-2xl mx-auto"}>
              <div className="bg-white rounded-xl border border-red-200 p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                  <span className="text-3xl">❌</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900">Analysis Failed</h3>
                <p className="text-gray-700">{error}</p>
                <div className="flex gap-3 justify-center pt-4">
                  <button
                    onClick={handleReanalyze}
                    className="px-6 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={onSwitchToManual}
                    className="px-6 py-2 border-2 border-gray-300 text-gray-900 rounded-md hover:bg-gray-50"
                  >
                    Use Manual Entry
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

