// ============================================================
// Listing Form Hook
// ============================================================
// Manages state for the multi-step listing form

import { useState, useCallback, useEffect } from 'react';
import { ListingFormData, ItemType } from '@/lib/types/listing';

const DRAFT_STORAGE_KEY = 'listing_draft';
const AUTOSAVE_INTERVAL = 30000; // 30 seconds

export const useListingForm = (listingId?: string, draftId?: string) => {
  const [formData, setFormData] = useState<ListingFormData>({
    itemType: 'bike',
    listingStatus: 'draft',
  });
  const [currentStep, setCurrentStep] = useState(1);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(draftId || null);

  // Load draft from database or localStorage on mount
  useEffect(() => {
    // If draftId is provided, load that specific draft
    if (draftId) {
      const loadSpecificDraft = async () => {
        try {
          console.log('📂 [HOOK] Loading draft with ID:', draftId);
          const response = await fetch(`/api/marketplace/drafts/${draftId}`);
          if (response.ok) {
            const { draft } = await response.json();
            console.log('✅ [HOOK] Loaded draft from database:', draft.id);
            console.log('📋 [HOOK] Draft form data:', draft.form_data);
            console.log('📍 [HOOK] Current step:', draft.current_step);
            
            // Ensure form_data is properly structured
            const loadedFormData = {
              ...draft.form_data,
              listingStatus: 'draft', // Ensure draft status is set
            };
            
            setFormData(loadedFormData);
            setCurrentStep(draft.current_step || 1);
            setCurrentDraftId(draft.id);
            setLastSaved(new Date(draft.last_saved_at));
            
            console.log('✅ [HOOK] Draft loaded successfully, step:', draft.current_step);
          } else {
            console.error('❌ [HOOK] Failed to fetch draft, status:', response.status);
          }
        } catch (error) {
          console.error('❌ [HOOK] Error loading specific draft:', error);
        }
      };
      loadSpecificDraft();
      return;
    }
    
    if (!listingId) {
      // Check for AI-generated data first
      const aiData = localStorage.getItem('ai_listing_data');
      if (aiData) {
        try {
          const parsed = JSON.parse(aiData);
          console.log('🎯 [HOOK] Found AI data in localStorage:', parsed);
          
          // Check if data is recent (within last 5 minutes)
          if (Date.now() - parsed.timestamp < 5 * 60 * 1000) {
            console.log('🎯 [HOOK] Loading AI-generated data into form');
            console.log('🎯 [HOOK] Form data to load:', parsed.formData);
            
            setFormData(parsed.formData || {});
            setCurrentStep(3); // Start at condition step
            
            console.log('🎯 [HOOK] Form data loaded, current step set to 3');
            
            localStorage.removeItem('ai_listing_data'); // Clear after loading
            return;
          } else {
            console.log('🎯 [HOOK] AI data expired, clearing');
          }
        } catch (error) {
          console.error('Failed to load AI data:', error);
        }
        localStorage.removeItem('ai_listing_data'); // Clear stale data
      } else {
        console.log('🎯 [HOOK] No AI data found in localStorage');
      }
      
      // Don't auto-load any drafts
      // User must explicitly click "Continue" on a draft to load it
      // Clear any old localStorage data to ensure fresh start
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      console.log('🎯 [HOOK] Starting with fresh form (no auto-load)');
    }
  }, [listingId, draftId]);

  // Auto-save to localStorage
  useEffect(() => {
    const interval = setInterval(() => {
      saveDraft();
    }, AUTOSAVE_INTERVAL);

    return () => clearInterval(interval);
  }, [formData, currentStep]);

  const saveDraft = useCallback(async () => {
    try {
      console.log('💾 [HOOK] Saving draft...');
      console.log('💾 [HOOK] Form data to save:', formData);
      console.log('💾 [HOOK] Current step:', currentStep);
      console.log('💾 [HOOK] Draft ID:', currentDraftId);

      // Save to Supabase database (primary storage)
      const response = await fetch('/api/marketplace/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: currentDraftId,
          formData,
          currentStep,
        }),
      });

      if (response.ok) {
        const { draft } = await response.json();
        setCurrentDraftId(draft.id);
        setLastSaved(new Date());
        console.log('✅ [HOOK] Draft saved to database:', draft.id);
        console.log('✅ [HOOK] Saved draft name:', draft.draft_name);
      } else {
        console.error('❌ [HOOK] Failed to save draft to database, status:', response.status);
        const errorData = await response.text();
        console.error('❌ [HOOK] Error response:', errorData);
      }
    } catch (error) {
      console.error('❌ [HOOK] Error saving draft:', error);
    }
  }, [formData, currentStep, currentDraftId]);

  const clearDraft = useCallback(async () => {
    // Mark draft as completed in database if we have a draft ID
    if (currentDraftId) {
      try {
        await fetch(`/api/marketplace/drafts/${currentDraftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            completed: true,
            completed_at: new Date().toISOString()
          }),
        });
        console.log('✅ Draft marked as completed:', currentDraftId);
      } catch (error) {
        console.error('Failed to mark draft as completed:', error);
      }
      setCurrentDraftId(null);
    }
    
    setLastSaved(null);
  }, [currentDraftId]);

  const updateFormData = useCallback((updates: Partial<ListingFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  }, []);

  const setItemType = useCallback((itemType: ItemType) => {
    setFormData(prev => ({ ...prev, itemType }));
    setCurrentStep(2);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep(prev => Math.min(prev + 1, 7));
  }, []);

  const previousStep = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  }, []);

  const goToStep = useCallback((step: number) => {
    setCurrentStep(Math.max(1, Math.min(step, 7)));
  }, []);

  const resetForm = useCallback(() => {
    setFormData({
      itemType: 'bike',
      listingStatus: 'draft',
    });
    setCurrentStep(1);
    clearDraft();
  }, [clearDraft]);

  return {
    formData,
    currentStep,
    lastSaved,
    currentDraftId,
    updateFormData,
    setItemType,
    nextStep,
    previousStep,
    goToStep,
    saveDraft,
    clearDraft,
    resetForm,
  };
};

