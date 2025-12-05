// ============================================================
// AI Analysis Schemas for Structured Outputs
// ============================================================

export const LISTING_ANALYSIS_SCHEMA = {
  type: "object",
  required: ["item_type", "overall_confidence", "brand", "condition_rating"],
  properties: {
    // Meta Information
    item_type: {
      type: "string",
      enum: ["bike", "part", "apparel"],
      description: "Type of cycling product detected"
    },
    overall_confidence: {
      type: "number",
      description: "Overall confidence score 0-100"
    },
    
    // Basic Information
    brand: {
      type: "string",
      description: "Manufacturer brand name (e.g., Specialized, Trek, SRAM)"
    },
    model: {
      type: "string",
      description: "Specific model name or number"
    },
    model_year: {
      type: "string",
      description: "Manufacturing year (YYYY) or approximate era (e.g., '2020s', 'early 2010s')"
    },
    
    // Bike-Specific Fields
    bike_details: {
      type: "object",
      properties: {
        bike_type: {
          type: "string",
          enum: ["Road", "Mountain", "Gravel", "Hybrid", "Electric", "BMX", "Cruiser", "Kids", "Other"],
          description: "Type of bicycle"
        },
        frame_size: {
          type: "string",
          description: "Frame size (e.g., '54cm', 'Medium', '18 inch')"
        },
        frame_material: {
          type: "string",
          enum: ["Carbon", "Aluminium", "Steel", "Titanium", "Other"],
          description: "Frame material"
        },
        groupset: {
          type: "string",
          description: "Groupset brand and model (e.g., 'Shimano 105', 'SRAM GX Eagle')"
        },
        wheel_size: {
          type: "string",
          description: "Wheel size (e.g., '700c', '29 inch', '27.5 inch')"
        },
        suspension_type: {
          type: "string",
          enum: ["Hardtail", "Full Suspension", "Rigid", "N/A"],
          description: "Suspension type for mountain bikes"
        },
        color_primary: {
          type: "string",
          description: "Primary frame color"
        },
        color_secondary: {
          type: "string",
          description: "Secondary or accent color"
        },
        approximate_weight: {
          type: "string",
          description: "Approximate bike weight if determinable"
        }
      }
    },
    
    // Part-Specific Fields
    part_details: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["Frames", "Wheels", "Drivetrain", "Brakes", "Handlebars", "Saddles", "Pedals", "Other"],
          description: "Part category"
        },
        part_type: {
          type: "string",
          description: "Specific part type (e.g., 'Rear Derailleur', '11-speed Cassette')"
        },
        compatibility: {
          type: "string",
          description: "Compatibility notes (e.g., 'Shimano 11/12-speed', 'Road bikes only')"
        },
        material: {
          type: "string",
          description: "Material composition"
        },
        weight: {
          type: "string",
          description: "Part weight if visible or estimable"
        }
      }
    },
    
    // Apparel-Specific Fields
    apparel_details: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["Jerseys", "Shorts", "Jackets", "Gloves", "Shoes", "Helmets", "Other"],
          description: "Apparel category"
        },
        size: {
          type: "string",
          description: "Size from tags (e.g., 'M', 'Large', 'EU 42')"
        },
        gender_fit: {
          type: "string",
          enum: ["Men's", "Women's", "Unisex"],
          description: "Gender fit type"
        },
        material: {
          type: "string",
          description: "Primary fabric or material"
        },
        features: {
          type: "string",
          description: "Notable features (e.g., 'waterproof, reflective panels')"
        }
      }
    },
    
    // Condition Assessment
    condition_rating: {
      type: "string",
      enum: ["New", "Like New", "Excellent", "Good", "Fair", "Well Used"],
      description: "Overall condition rating"
    },
    condition_details: {
      type: "string",
      description: "Detailed condition description (2-3 paragraphs)"
    },
    wear_notes: {
      type: "string",
      description: "Specific wear, damage, or cosmetic issues"
    },
    usage_estimate: {
      type: "string",
      description: "Estimated usage (e.g., '500-1000km', '2 seasons', 'Light use')"
    },
    visible_issues: {
      type: "array",
      items: { type: "string" },
      description: "List of specific visible issues or damage"
    },
    
    // Detected Components (for complete bikes)
    detected_components: {
      type: "object",
      properties: {
        groupset: { type: "string", description: "Complete groupset identification" },
        shifters: { type: "string" },
        front_derailleur: { type: "string" },
        rear_derailleur: { type: "string" },
        crankset: { type: "string" },
        chain: { type: "string" },
        cassette: { type: "string" },
        brakes: { type: "string" },
        brake_rotors: { type: "string" },
        wheels: { type: "string" },
        tyres: { type: "string" },
        saddle: { type: "string" },
        handlebars: { type: "string" },
        stem: { type: "string" }
      }
    },
    
    // Price Estimation
    price_estimate: {
      type: "object",
      required: ["min_aud", "max_aud", "reasoning"],
      properties: {
        min_aud: {
          type: "number",
          description: "Minimum estimated value in AUD"
        },
        max_aud: {
          type: "number",
          description: "Maximum estimated value in AUD"
        },
        reasoning: {
          type: "string",
          description: "Explanation for the price estimate"
        }
      }
    },
    
    // Field Confidence Scores
    field_confidence: {
      type: "object",
      description: "Confidence scores 0-100 for each major field",
      properties: {
        brand: { type: "number" },
        model: { type: "number" },
        condition: { type: "number" },
        specifications: { type: "number" },
        pricing: { type: "number" }
      }
    },
    
    // Analysis Notes
    analysis_notes: {
      type: "string",
      description: "Additional observations or recommendations for the seller"
    }
  }
} as const;

export type ListingAnalysisResult = {
  item_type: "bike" | "part" | "apparel";
  overall_confidence: number;
  brand: string;
  model: string;
  model_year?: string;
  bike_details?: {
    bike_type?: string;
    frame_size?: string;
    frame_material?: string;
    groupset?: string;
    wheel_size?: string;
    suspension_type?: string;
    color_primary?: string;
    color_secondary?: string;
    approximate_weight?: string;
  };
  part_details?: {
    category?: string;
    part_type?: string;
    compatibility?: string;
    material?: string;
    weight?: string;
  };
  apparel_details?: {
    category?: string;
    size?: string;
    gender_fit?: string;
    material?: string;
    features?: string;
  };
  condition_rating: string;
  condition_details: string;
  wear_notes?: string;
  usage_estimate?: string;
  visible_issues?: string[];
  detected_components?: {
    [key: string]: string;
  };
  price_estimate: {
    min_aud: number;
    max_aud: number;
    reasoning: string;
  };
  field_confidence?: {
    brand?: number;
    model?: number;
    condition?: number;
    specifications?: number;
    pricing?: number;
  };
  analysis_notes?: string;
};



