# 🎯 Advanced Category Filtering System

A sleek, 3-level hierarchical filtering system for the marketplace with 120+ categories.

## ✨ Features

### **3-Level Taxonomy**
- **Level 1** (Main Categories): 17 major categories
  - Bicycles, E-Bikes, Frames & Framesets, Wheels & Tyres, Drivetrain, Brakes, Cockpit, Seat & Seatposts, Pedals, Accessories, Apparel, Protection, Maintenance & Workshop, Tech & Electronics, Nutrition, Shop Services, Marketplace Specials

- **Level 2** (Subcategories): Specific types within each category
  - E.g., Bicycles → Road, Gravel, Mountain, BMX, Kids, etc.

- **Level 3** (Refinements): Granular options for specific subcategories
  - E.g., Mountain → XC, Trail, Enduro, Downhill

### **Smart UI Design**
- ✅ **Progressive Disclosure** - Only shows relevant options
- ✅ **Breadcrumb Navigation** - Shows active filter path
- ✅ **Smooth Animations** - 400ms ease transitions
- ✅ **White Backgrounds** - Clean, professional look
- ✅ **Rounded Borders** - Medium radius (rounded-md)
- ✅ **Horizontal Scrolling** - Mobile-friendly
- ✅ **Visual Hierarchy** - Indented levels with border guides

## 🎨 How It Looks

```
┌─────────────────────────────────────────────────────────────┐
│ Browse by Category                                           │
│                                                              │
│ [All Products] [🚴 Bicycles] [⚡ E-Bikes] [📦 Frames] ...  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ │ Select Type                                               │
│ │                                                           │
│ │ [Road] [Gravel] [Mountain] [BMX] [Kids] ...             │
└─┴───────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ │ │ Refine Selection                                        │
│ │ │                                                         │
│ │ │ [XC] [Trail] [Enduro] [Downhill]                      │
└─┴─┴─────────────────────────────────────────────────────────┘
```

## 📂 Files Created

### **1. Category Taxonomy** (`src/lib/constants/categories.ts`)
- Complete 120+ category definitions
- Helper functions for querying categories
- `getLevel1Categories()`, `getLevel2Categories()`, `getLevel3Categories()`

### **2. Advanced Filter Component** (`src/components/marketplace/advanced-category-filter.tsx`)
- Main filter UI component
- 3-level progressive disclosure
- Smooth animations with Framer Motion
- Breadcrumb navigation

### **3. Updated Marketplace Page** (`src/app/marketplace/page.tsx`)
- Integrated new filter component
- URL state management (level1, level2, level3 params)
- Clean, simple implementation

### **4. Updated API Routes**
- `src/app/api/marketplace/products/route.ts` - Supports level1/2/3 filtering
- `src/lib/hooks/use-marketplace-products.ts` - Updated hook
- `src/lib/types/marketplace.ts` - New filter types

## 🚀 Usage

### **Frontend (React/Next.js)**

```tsx
import { AdvancedCategoryFilter } from '@/components/marketplace/advanced-category-filter';

<AdvancedCategoryFilter
  selectedLevel1={level1}
  selectedLevel2={level2}
  selectedLevel3={level3}
  onLevel1Change={setLevel1}
  onLevel2Change={setLevel2}
  onLevel3Change={setLevel3}
/>
```

### **API Filtering**

```typescript
// Fetch products with 3-level filtering
const params = new URLSearchParams({
  level1: "Bicycles",
  level2: "Mountain",
  level3: "Trail"
});

fetch(`/api/marketplace/products?${params}`);
```

### **URL State**

The filters are automatically synced to URL params:

```
/marketplace?level1=Bicycles&level2=Mountain&level3=Trail
```

## 🎯 User Experience

### **Step 1: Select Main Category**
- User clicks "Bicycles"
- Level 2 options smoothly animate in below

### **Step 2: Select Subcategory**
- User clicks "Mountain"
- Level 3 options animate in (if available)

### **Step 3: Refine (Optional)**
- User clicks "Trail"
- Products filtered to Mountain Trail bikes

### **Clear Filters**
- Click the X in breadcrumb to reset all filters
- Click active filter again to deselect

## 🔧 Integration with AI Categorization

The categories match exactly with the AI categorization system:

1. **AI Cleans Product Name** → "Trek Fuel EX 9.8 XT 29\" Mountain Bike"
2. **AI Categorizes** → Bicycles > Mountain > Trail
3. **User Filters** → Sees product in correct category
4. **Perfect Match** → Products appear in their AI-assigned categories

## 🎨 Design System Compliance

✅ **White backgrounds** on active filters  
✅ **`rounded-md`** border radius everywhere  
✅ **400ms duration** with cubic-bezier easing  
✅ **Gray color palette** (100, 200, 600, 800)  
✅ **Shadow-sm** on active states  
✅ **Smooth animations** with AnimatePresence  
✅ **Horizontal scrolling** on mobile  
✅ **No blue backgrounds** - all gray/white

## 📊 Performance

- **Lazy Loading**: Level 2/3 only loaded when needed
- **Memoization**: Prevents unnecessary re-renders
- **URL State**: Shareable, bookmarkable filter states
- **Efficient Queries**: Database indexed on all 3 levels

## 🔮 Future Enhancements

- [ ] Category counts (e.g., "Bicycles (127)")
- [ ] Popular categories quick access
- [ ] Recent searches
- [ ] Saved filter presets
- [ ] Mobile drawer/modal view
- [ ] Category icons for all Level 1
- [ ] Keyboard navigation

## 🐛 Troubleshooting

### No categories showing?
- Run the AI cleaning function to categorize products
- Check database: `SELECT DISTINCT marketplace_category FROM products WHERE marketplace_category IS NOT NULL`

### Filters not working?
- Check URL params are being passed correctly
- Verify API route is receiving parameters
- Check database columns exist: `marketplace_category`, `marketplace_subcategory`, `marketplace_level_3_category`

### Animations janky?
- Ensure `overflow-hidden` is on the AnimatePresence parent
- Check for conflicting CSS transitions
- Verify Framer Motion is installed: `npm ls framer-motion`

---

**Built with:** React, Next.js, Framer Motion, Tailwind CSS  
**Design:** Clean, professional, mobile-first  
**Performance:** Optimized, indexed, efficient







