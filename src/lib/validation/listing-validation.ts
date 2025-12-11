// ============================================================
// Listing Form Validation Rules
// ============================================================

import { 
  ListingFormData, 
  ItemType, 
  BikeDetailsFormData,
  PartDetailsFormData,
  ApparelDetailsFormData,
  ConditionFormData,
  PhotosFormData,
  HistoryFormData,
  PricingFormData 
} from '@/lib/types/listing';

// ============================================================
// Error Types
// ============================================================

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// ============================================================
// Text Validation Helpers
// ============================================================

export const validateRequired = (value: any, fieldName: string): ValidationError | null => {
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    return { field: fieldName, message: `${fieldName} is required` };
  }
  return null;
};

export const validateMaxLength = (
  value: string | undefined, 
  maxLength: number, 
  fieldName: string
): ValidationError | null => {
  if (value && value.length > maxLength) {
    return { 
      field: fieldName, 
      message: `${fieldName} must be ${maxLength} characters or less` 
    };
  }
  return null;
};

export const validateMinLength = (
  value: string | undefined, 
  minLength: number, 
  fieldName: string
): ValidationError | null => {
  if (value && value.length < minLength) {
    return { 
      field: fieldName, 
      message: `${fieldName} must be at least ${minLength} characters` 
    };
  }
  return null;
};

// ============================================================
// Price Validation
// ============================================================

export const validatePrice = (price: number | undefined, fieldName: string = 'Price'): ValidationError | null => {
  if (price === undefined || price === null) {
    return { field: fieldName.toLowerCase(), message: `${fieldName} is required` };
  }
  if (price < 1) {
    return { field: fieldName.toLowerCase(), message: `${fieldName} must be at least $1` };
  }
  if (price > 999999) {
    return { field: fieldName.toLowerCase(), message: `${fieldName} cannot exceed $999,999` };
  }
  return null;
};

// ============================================================
// Date Validation
// ============================================================

export const validateDate = (dateString: string | undefined, fieldName: string): ValidationError | null => {
  if (!dateString) return null; // Optional field
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return { field: fieldName.toLowerCase().replace(/\s/g, '_'), message: `${fieldName} is not a valid date` };
  }
  
  const today = new Date();
  if (date > today) {
    return { field: fieldName.toLowerCase().replace(/\s/g, '_'), message: `${fieldName} cannot be in the future` };
  }
  
  return null;
};

// ============================================================
// Images Validation
// ============================================================

export const validateImages = (images: any[] | undefined): ValidationError | null => {
  if (!images || images.length < 3) {
    return { field: 'images', message: 'At least 3 photos are required' };
  }
  if (images.length > 15) {
    return { field: 'images', message: 'Maximum 15 photos allowed' };
  }
  return null;
};

// ============================================================
// Step 1: Item Type Validation
// ============================================================

export const validateItemType = (itemType: ItemType | undefined): ValidationResult => {
  const errors: ValidationError[] = [];
  
  const error = validateRequired(itemType, 'Item type');
  if (error) errors.push(error);
  
  return { isValid: errors.length === 0, errors };
};

// ============================================================
// Step 2A: Bike Details Validation
// ============================================================

export const validateBikeDetails = (data: BikeDetailsFormData): ValidationResult => {
  const errors: ValidationError[] = [];
  
  // Required fields
  const requiredError = validateRequired(data.brand, 'Brand');
  if (requiredError) errors.push(requiredError);
  
  const modelError = validateRequired(data.model, 'Model');
  if (modelError) errors.push(modelError);
  
  const bikeTypeError = validateRequired(data.bikeType, 'Bike type');
  if (bikeTypeError) errors.push(bikeTypeError);
  
  const frameSizeError = validateRequired(data.frameSize, 'Frame size');
  if (frameSizeError) errors.push(frameSizeError);
  
  const materialError = validateRequired(data.frameMaterial, 'Frame material');
  if (materialError) errors.push(materialError);
  
  // Optional length validations
  const titleError = validateMaxLength(data.title, 150, 'Title');
  if (titleError) errors.push(titleError);
  
  const upgradesError = validateMaxLength(data.upgradesModifications, 1000, 'Upgrades/Modifications');
  if (upgradesError) errors.push(upgradesError);
  
  return { isValid: errors.length === 0, errors };
};

// ============================================================
// Step 2B: Part Details Validation
// ============================================================

export const validatePartDetails = (data: PartDetailsFormData): ValidationResult => {
  const errors: ValidationError[] = [];
  
  // Required fields
  const categoryError = validateRequired(data.marketplace_subcategory, 'Part category');
  if (categoryError) errors.push(categoryError);
  
  const brandError = validateRequired(data.brand, 'Brand');
  if (brandError) errors.push(brandError);
  
  const modelError = validateRequired(data.model, 'Model/Part number');
  if (modelError) errors.push(modelError);
  
  // Optional length validations
  const titleError = validateMaxLength(data.title, 150, 'Title');
  if (titleError) errors.push(titleError);
  
  const compatError = validateMaxLength(data.compatibilityNotes, 500, 'Compatibility notes');
  if (compatError) errors.push(compatError);
  
  return { isValid: errors.length === 0, errors };
};

// ============================================================
// Step 2C: Apparel Details Validation
// ============================================================

export const validateApparelDetails = (data: ApparelDetailsFormData): ValidationResult => {
  const errors: ValidationError[] = [];
  
  // Required fields
  const categoryError = validateRequired(data.marketplace_subcategory, 'Category');
  if (categoryError) errors.push(categoryError);
  
  const brandError = validateRequired(data.brand, 'Brand');
  if (brandError) errors.push(brandError);
  
  const sizeError = validateRequired(data.size, 'Size');
  if (sizeError) errors.push(sizeError);
  
  const genderError = validateRequired(data.genderFit, 'Gender/Fit');
  if (genderError) errors.push(genderError);
  
  // Optional length validations
  const titleError = validateMaxLength(data.title, 150, 'Title');
  if (titleError) errors.push(titleError);
  
  const featuresError = validateMaxLength(data.features, 500, 'Features');
  if (featuresError) errors.push(featuresError);
  
  return { isValid: errors.length === 0, errors };
};

// ============================================================
// Step 3: Condition Validation
// ============================================================

export const validateCondition = (data: ConditionFormData): ValidationResult => {
  const errors: ValidationError[] = [];
  
  // Required fields
  const ratingError = validateRequired(data.conditionRating, 'Condition rating');
  if (ratingError) errors.push(ratingError);
  
  const detailsError = validateRequired(data.conditionDetails, 'Condition details');
  if (detailsError) errors.push(detailsError);
  
  // Minimum detail length
  const minDetailsError = validateMinLength(data.conditionDetails, 20, 'Condition details');
  if (minDetailsError) errors.push(minDetailsError);
  
  // Optional length validations
  const maxDetailsError = validateMaxLength(data.conditionDetails, 2000, 'Condition details');
  if (maxDetailsError) errors.push(maxDetailsError);
  
  const wearError = validateMaxLength(data.wearNotes, 1000, 'Wear notes');
  if (wearError) errors.push(wearError);
  
  return { isValid: errors.length === 0, errors };
};

// ============================================================
// Step 4: Photos Validation
// ============================================================

export const validatePhotos = (data: PhotosFormData): ValidationResult => {
  const errors: ValidationError[] = [];
  
  const imagesError = validateImages(data.images);
  if (imagesError) errors.push(imagesError);
  
  return { isValid: errors.length === 0, errors };
};

// ============================================================
// Step 5: History Validation
// ============================================================

export const validateHistory = (data: HistoryFormData): ValidationResult => {
  const errors: ValidationError[] = [];
  
  // Date validation
  const dateError = validateDate(data.purchaseDate, 'Purchase date');
  if (dateError) errors.push(dateError);
  
  // Optional length validations
  const upgradesError = validateMaxLength(data.upgradesModifications, 1000, 'Upgrades/Modifications');
  if (upgradesError) errors.push(upgradesError);
  
  // Original RRP validation (if provided)
  if (data.originalRrp !== undefined && data.originalRrp !== null) {
    if (data.originalRrp < 0) {
      errors.push({ field: 'originalRrp', message: 'Original RRP cannot be negative' });
    }
    if (data.originalRrp > 999999) {
      errors.push({ field: 'originalRrp', message: 'Original RRP cannot exceed $999,999' });
    }
  }
  
  return { isValid: errors.length === 0, errors };
};

// ============================================================
// Step 6: Pricing Validation
// ============================================================

export const validatePricing = (data: PricingFormData): ValidationResult => {
  const errors: ValidationError[] = [];
  
  // Required price
  const priceError = validatePrice(data.price);
  if (priceError) errors.push(priceError);
  
  // Required pickup location
  const pickupError = validateRequired(data.pickupLocation, 'Pickup location');
  if (pickupError) errors.push(pickupError);
  
  // Shipping cost validation (if shipping available)
  if (data.shippingAvailable && data.shippingCost !== undefined && data.shippingCost !== null) {
    if (data.shippingCost < 0) {
      errors.push({ field: 'shippingCost', message: 'Shipping cost cannot be negative' });
    }
    if (data.shippingCost > 10000) {
      errors.push({ field: 'shippingCost', message: 'Shipping cost seems unreasonably high' });
    }
  }
  
  // Contact preference validation
  if (data.sellerContactPreference === 'phone' && !data.sellerPhone) {
    errors.push({ field: 'sellerPhone', message: 'Phone number required for phone contact preference' });
  }
  
  if (data.sellerContactPreference === 'email' && !data.sellerEmail) {
    errors.push({ field: 'sellerEmail', message: 'Email required for email contact preference' });
  }
  
  // Optional length validations
  const accessoriesError = validateMaxLength(data.includedAccessories, 500, 'Included accessories');
  if (accessoriesError) errors.push(accessoriesError);
  
  return { isValid: errors.length === 0, errors };
};

// ============================================================
// Complete Listing Validation (for publish)
// ============================================================

export const validateCompleteListing = (data: ListingFormData): ValidationResult => {
  const errors: ValidationError[] = [];
  
  // Item type
  const itemTypeError = validateRequired(data.itemType, 'Item type');
  if (itemTypeError) errors.push(itemTypeError);
  
  // Images
  const imagesError = validateImages(data.images);
  if (imagesError) errors.push(imagesError);
  
  // Price
  const priceError = validatePrice(data.price);
  if (priceError) errors.push(priceError);
  
  // Condition
  const conditionError = validateRequired(data.conditionRating, 'Condition rating');
  if (conditionError) errors.push(conditionError);
  
  const detailsError = validateRequired(data.conditionDetails, 'Condition details');
  if (detailsError) errors.push(detailsError);
  
  // Pickup location
  const pickupError = validateRequired(data.pickupLocation, 'Pickup location');
  if (pickupError) errors.push(pickupError);
  
  // Type-specific validation
  if (data.itemType === 'bike') {
    const bikeResult = validateBikeDetails({
      title: data.title,
      brand: data.brand,
      model: data.model,
      modelYear: data.modelYear,
      bikeType: data.bikeType,
      frameSize: data.frameSize,
      frameMaterial: data.frameMaterial,
      colorPrimary: data.colorPrimary,
      colorSecondary: data.colorSecondary,
      groupset: data.groupset,
      wheelSize: data.wheelSize,
      suspensionType: data.suspensionType,
      bikeWeight: data.bikeWeight,
      upgradesModifications: data.upgradesModifications,
    });
    errors.push(...bikeResult.errors);
  } else if (data.itemType === 'part') {
    const partResult = validatePartDetails({
      title: data.title,
      marketplace_subcategory: data.marketplace_subcategory,
      partTypeDetail: data.partTypeDetail,
      brand: data.brand,
      model: data.model,
      material: data.material,
      colorPrimary: data.colorPrimary,
      weight: data.weight,
      compatibilityNotes: data.compatibilityNotes,
    });
    errors.push(...partResult.errors);
  } else if (data.itemType === 'apparel') {
    const apparelResult = validateApparelDetails({
      title: data.title,
      marketplace_subcategory: data.marketplace_subcategory,
      brand: data.brand,
      model: data.model,
      size: data.size,
      genderFit: data.genderFit,
      colorPrimary: data.colorPrimary,
      apparelMaterial: data.apparelMaterial,
    });
    errors.push(...apparelResult.errors);
  }
  
  return { isValid: errors.length === 0, errors };
};

// ============================================================
// Helper: Get Field Error
// ============================================================

export const getFieldError = (errors: ValidationError[], field: string): string | undefined => {
  const error = errors.find(e => e.field === field);
  return error?.message;
};







