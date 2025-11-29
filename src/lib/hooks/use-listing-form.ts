// ============================================================
// Listing Form Hook
// ============================================================
// Manages state for the multi-step listing form

import { useState, useCallback, useEffect } from 'react';
import { ListingFormData, ItemType } from '@/lib/types/listing';

const DRAFT_STORAGE_KEY = 'listing_draft';
const AUTOSAVE_INTERVAL = 30000; // 30 seconds

export const useListingForm = (listingId?: string) => {
  const [formData, setFormData] = useState<ListingFormData>({
    itemType: 'bike',
    listingStatus: 'draft',
  });
  const [currentStep, setCurrentStep] = useState(1);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Load draft from localStorage on mount
  useEffect(() => {
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
      
      // Load regular draft
      const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          setFormData(parsed.formData || {});
          setCurrentStep(parsed.currentStep || 1);
        } catch (error) {
          console.error('Failed to load draft:', error);
        }
      }
    }
  }, [listingId]);

  // Auto-save to localStorage
  useEffect(() => {
    const interval = setInterval(() => {
      saveDraft();
    }, AUTOSAVE_INTERVAL);

    return () => clearInterval(interval);
  }, [formData, currentStep]);

  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          formData,
          currentStep,
          savedAt: new Date().toISOString(),
        })
      );
      setLastSaved(new Date());
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  }, [formData, currentStep]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setLastSaved(null);
  }, []);

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

