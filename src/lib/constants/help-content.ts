// ============================================================
// Help Centre Content
// Static content for the Help & Support page
// ============================================================

export interface HelpCategory {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string; // Lucide icon name
  order: number;
}

export interface HelpArticle {
  id: string;
  slug: string;
  categoryId: string;
  title: string;
  description: string;
  content: string;
  keywords: string[];
  order: number;
}

// ============================================================
// Categories
// ============================================================

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: "buying",
    slug: "buying",
    title: "Buying on Yellow Jersey",
    description: "Browse, search, make offers, and complete purchases",
    icon: "ShoppingBag",
    order: 1,
  },
  {
    id: "selling",
    slug: "selling",
    title: "Selling on Yellow Jersey",
    description: "List items, manage your store, and get paid",
    icon: "Store",
    order: 2,
  },
  {
    id: "orders",
    slug: "orders-shipping",
    title: "Orders & Shipping",
    description: "Track orders, shipping times, and delivery info",
    icon: "Truck",
    order: 3,
  },
  {
    id: "disputes",
    slug: "disputes-returns",
    title: "Disputes & Returns",
    description: "Resolve issues, returns, and refunds",
    icon: "Shield",
    order: 4,
  },
  {
    id: "payments",
    slug: "payments-payouts",
    title: "Payments & Payouts",
    description: "Payment methods, fees, and getting paid",
    icon: "CreditCard",
    order: 5,
  },
  {
    id: "account",
    slug: "account-security",
    title: "Account & Security",
    description: "Profile settings, privacy, and security",
    icon: "User",
    order: 6,
  },
];

// ============================================================
// Articles
// ============================================================

export const HELP_ARTICLES: HelpArticle[] = [
  // ============================================================
  // BUYING ON YELLOW JERSEY
  // ============================================================
  {
    id: "buying-browse-search",
    slug: "how-to-browse-and-search",
    categoryId: "buying",
    title: "How to browse and search the marketplace",
    description: "Find the perfect bike or parts using our search and filter tools",
    keywords: ["search", "browse", "find", "filter", "category"],
    order: 1,
    content: `
## Browsing the Marketplace

Yellow Jersey makes it easy to find exactly what you're looking for. Here's how to navigate:

### Using the Search Bar
- Click the search bar at the top of the page
- Type keywords like brand names, product types, or specific models
- Our AI-powered search understands natural language, so you can search things like "carbon road bike under $3000"

### Filtering Results
- Use the category pills to narrow down by product type (Bicycles, Parts, Apparel, etc.)
- Apply filters for price range, condition, location, and more
- Sort results by newest, price, or relevance

### Browsing by Category
- Click on main categories in the sidebar to explore
- Navigate through subcategories for more specific items
- Each category shows the number of available listings

### Viewing Bike Stores
- Switch to "Bike Stores" view to browse verified shops
- Store listings often include new items and professional service

### Tips for Finding Great Deals
- Check the "For You" section for personalised recommendations
- Save searches to get notified of new listings
- Look for items recently reduced in price
    `.trim(),
  },
  {
    id: "buying-make-offer",
    slug: "making-an-offer",
    categoryId: "buying",
    title: "Making an offer on an item",
    description: "Learn how to negotiate prices with sellers",
    keywords: ["offer", "negotiate", "price", "counter offer", "haggle"],
    order: 2,
    content: `
## Making an Offer

Many listings on Yellow Jersey accept offers, giving you the chance to negotiate a better price.

### How to Make an Offer
1. Find an item you're interested in
2. Click the "Make Offer" button on the product page
3. Enter your offer amount
4. Optionally add a message to the seller
5. Submit your offer

### What Happens Next
- The seller will be notified of your offer
- They can accept, reject, or counter your offer
- Offers typically expire after 48 hours if not responded to
- You'll receive a notification when the seller responds

### Counter Offers
- If the seller counters, you'll see their new price
- You can accept, reject, or counter again
- This process can continue until you reach an agreement

### Tips for Successful Offers
- Research similar items to make a fair offer
- Keep your offer reasonable (10-20% below asking is typical)
- Be polite in your message to the seller
- Respond quickly to counter offers to show you're serious

### When Offers Are Accepted
- Accepted offers become binding
- You'll be prompted to complete the purchase
- The item will be held for you during checkout
    `.trim(),
  },
  {
    id: "buying-buy-now",
    slug: "using-buy-now",
    categoryId: "buying",
    title: "Using Buy Now",
    description: "Complete an instant purchase at the listed price",
    keywords: ["buy now", "purchase", "instant", "checkout"],
    order: 3,
    content: `
## Using Buy Now

Buy Now allows you to purchase an item immediately at the listed price.

### How Buy Now Works
1. Click "Buy Now" on any product page
2. Confirm your shipping address
3. Select your payment method
4. Complete the purchase

### Payment Process
- We accept credit cards, debit cards, and Apple Pay
- Your payment is processed securely through Stripe
- Funds are held safely until you receive your item

### After Purchase
- You'll receive an order confirmation email
- The seller will be notified to ship your item
- Track your order in "My Purchases"

### Buyer Protection
When you use Buy Now, you're automatically covered by Yellow Jersey's Buyer Protection:
- Your payment is held until you confirm receipt
- If the item doesn't arrive or isn't as described, you can open a dispute
- We'll help resolve any issues between you and the seller
    `.trim(),
  },
  {
    id: "buying-buyer-protection",
    slug: "understanding-buyer-protection",
    categoryId: "buying",
    title: "Understanding Buyer Protection",
    description: "How we protect your purchases on Yellow Jersey",
    keywords: ["buyer protection", "guarantee", "safe", "secure", "refund"],
    order: 4,
    content: `
## Buyer Protection

Every purchase on Yellow Jersey is protected by our Buyer Protection programme.

### How It Works
When you make a purchase:
1. Your payment is held securely in escrow
2. The seller ships your item
3. You receive and inspect the item
4. Once satisfied, funds are released to the seller

### What's Covered
- **Item not received**: If your item never arrives
- **Not as described**: If the item differs significantly from the listing
- **Damaged in transit**: If the item arrives damaged
- **Wrong item**: If you receive something different

### Protection Period
- You have 7 days from delivery to report any issues
- During this time, your payment remains protected
- After 7 days (or if you confirm receipt), funds are released

### Filing a Claim
1. Go to "My Purchases"
2. Find the order in question
3. Click "Report a Problem"
4. Describe the issue and provide photos if applicable
5. Our team will review and respond within 24-48 hours

### What's Not Covered
- Change of mind (you no longer want the item)
- Minor variations that were disclosed in the listing
- Damage caused after delivery
- Issues reported after the protection period
    `.trim(),
  },
  {
    id: "buying-payment-methods",
    slug: "payment-methods-and-checkout",
    categoryId: "buying",
    title: "Payment methods and checkout",
    description: "Accepted payment methods and how checkout works",
    keywords: ["payment", "checkout", "credit card", "apple pay", "pay"],
    order: 5,
    content: `
## Payment Methods

Yellow Jersey accepts a variety of secure payment methods.

### Accepted Payment Methods
- **Credit Cards**: Visa, Mastercard, American Express
- **Debit Cards**: All major Australian bank cards
- **Digital Wallets**: Apple Pay, Google Pay

### Secure Checkout
- All payments are processed through Stripe
- Your card details are never stored on our servers
- We use industry-standard encryption (TLS 1.3)
- 3D Secure authentication may be required for some cards

### Checkout Process
1. Add items to your cart or click "Buy Now"
2. Confirm or update your shipping address
3. Select your payment method
4. Review the order total (including shipping)
5. Complete your purchase

### Order Confirmation
- You'll receive an email confirmation immediately
- The order appears in "My Purchases"
- You can track the shipping status from there

### Currency
- All prices are in Australian Dollars (AUD)
- International cards are accepted
- Exchange rates are determined by your card issuer
    `.trim(),
  },
  {
    id: "buying-track-purchase",
    slug: "tracking-your-purchase",
    categoryId: "buying",
    title: "Tracking your purchase",
    description: "How to track your order after purchase",
    keywords: ["track", "tracking", "delivery", "shipping", "status"],
    order: 6,
    content: `
## Tracking Your Purchase

Stay updated on your order from purchase to delivery.

### Finding Your Order
1. Go to "Order Management" in the sidebar (or "My Purchases" in settings)
2. Find your order in the "Purchases" tab
3. Click on the order to see details

### Order Statuses
- **Pending**: Payment confirmed, waiting for seller to ship
- **Shipped**: Seller has dispatched the item
- **In Transit**: Item is on its way to you
- **Delivered**: Item has been delivered
- **Completed**: You've confirmed receipt

### Tracking Information
- Once shipped, the seller will add tracking details
- Click the tracking number to follow your package
- You'll receive notifications at key milestones

### What If Tracking Doesn't Update?
- Tracking can take 24-48 hours to activate
- Some couriers update less frequently
- If stuck for more than 5 days, contact the seller
- You can report the issue if needed

### Delivery Issues
If your item shows as delivered but you haven't received it:
1. Check around your property and with neighbours
2. Contact the courier with your tracking number
3. Message the seller for assistance
4. Report a problem if the issue isn't resolved
    `.trim(),
  },
  {
    id: "buying-after-purchase",
    slug: "what-happens-after-you-buy",
    categoryId: "buying",
    title: "What happens after you buy",
    description: "The complete journey from purchase to delivery",
    keywords: ["after purchase", "next steps", "receive", "delivery"],
    order: 7,
    content: `
## After Your Purchase

Here's what happens once you complete a purchase on Yellow Jersey.

### Immediate Actions
1. **Confirmation Email**: You'll receive order details instantly
2. **Seller Notification**: The seller is notified to prepare your item
3. **Payment Held**: Your funds are held safely in escrow

### Seller Ships
- Sellers typically ship within 3-5 business days
- You'll be notified when your item is shipped
- Tracking information will be provided

### During Transit
- Track your package using the provided tracking number
- Estimated delivery times are shown in your order
- Contact the seller if you have questions

### Upon Delivery
1. Inspect the item carefully
2. Compare it to the listing description and photos
3. Test any functionality if applicable
4. If everything is correct, confirm receipt

### Confirming Receipt
- Go to your order and click "Confirm Receipt"
- This releases payment to the seller
- If you don't confirm within 7 days of delivery, payment is released automatically

### If Something's Wrong
- Don't confirm receipt if there's an issue
- Report the problem within 7 days
- Provide photos and details to support your case
- We'll work to resolve the issue fairly
    `.trim(),
  },

  // ============================================================
  // SELLING ON YELLOW JERSEY
  // ============================================================
  {
    id: "selling-getting-started",
    slug: "getting-started-as-a-seller",
    categoryId: "selling",
    title: "Getting started as a seller",
    description: "Everything you need to know to start selling",
    keywords: ["start selling", "become seller", "sell", "new seller"],
    order: 1,
    content: `
## Getting Started as a Seller

Selling on Yellow Jersey is easy and reaches thousands of cycling enthusiasts.

### Requirements to Sell
- A Yellow Jersey account (free to create)
- Stripe Connect setup for receiving payments
- Photos and details of the item you're selling

### Account Types
**Individual Seller**
- Perfect for selling personal items
- No business verification required
- Same buyer protection and features

**Bicycle Store**
- For registered bike shops and businesses
- Verified store badge on your profile
- Additional features like Lightspeed integration

### Setting Up Stripe Connect
Before you can list items:
1. Go to Settings > Payments & Payouts
2. Click "Connect with Stripe"
3. Follow the prompts to verify your identity
4. Link your bank account for payouts

### Creating Your First Listing
Once set up, you can:
- Use Smart Upload (AI-powered listing creation)
- Create listings manually
- Import from Facebook Marketplace

### Tips for New Sellers
- Take clear, well-lit photos from multiple angles
- Write detailed, honest descriptions
- Price competitively by checking similar listings
- Respond to inquiries promptly
    `.trim(),
  },
  {
    id: "selling-smart-upload",
    slug: "listing-with-smart-upload",
    categoryId: "selling",
    title: "Listing your first item (Smart Upload)",
    description: "Use AI to create listings quickly and accurately",
    keywords: ["smart upload", "ai", "quick listing", "easy", "automatic"],
    order: 2,
    content: `
## Smart Upload

Smart Upload uses AI to create listings from your photos in seconds.

### How It Works
1. Click "Sell" in the navigation
2. Choose "Smart Upload"
3. Upload photos of your item
4. Our AI analyses the images and identifies:
   - Brand and model
   - Category and type
   - Condition assessment
   - Suggested specifications

### What Gets Detected
- **Bicycles**: Brand, model, frame size, groupset, wheel size
- **Components**: Compatibility, specifications, condition
- **Apparel**: Brand, size, type, colour

### Review and Edit
After AI analysis:
1. Review the detected information
2. Correct any inaccuracies
3. Add additional details
4. Set your price
5. Choose shipping options
6. Publish your listing

### Tips for Best Results
- Take photos in good lighting
- Capture multiple angles
- Include close-ups of brand labels
- Photograph any wear or damage
- Include the component group/drivetrain for bikes

### When to Use Manual Listing
Use manual listing if:
- Smart Upload doesn't recognise your item
- You prefer full control over every detail
- You're listing custom or vintage items
    `.trim(),
  },
  {
    id: "selling-manual-vs-ai",
    slug: "manual-listing-vs-ai-upload",
    categoryId: "selling",
    title: "Manual listing vs AI-powered upload",
    description: "Choose the best method for your items",
    keywords: ["manual", "ai upload", "listing method", "choose"],
    order: 3,
    content: `
## Choosing Your Listing Method

Yellow Jersey offers multiple ways to list your items.

### Smart Upload (AI-Powered)
**Best for:**
- Common brands and models
- Quick listings with minimal effort
- Standard bikes and components

**Pros:**
- Fast (listings in under 2 minutes)
- Automatic brand/model detection
- Condition assessment
- Specification suggestions

**Cons:**
- May not recognise rare or custom items
- Requires good quality photos
- You should still verify the details

### Manual Listing
**Best for:**
- Custom or vintage items
- Rare or niche products
- When you need full control

**Pros:**
- Complete control over every field
- Works for any item type
- No dependency on photo quality

**Cons:**
- Takes longer to complete
- Requires more knowledge of specifications

### Bulk Upload
**Best for:**
- Multiple similar items
- Store inventory
- Clearing out a collection

**Pros:**
- Upload many items at once
- Efficient for large quantities
- Group similar items together

### Facebook Import
**Best for:**
- Items already listed on Facebook Marketplace
- Migrating existing listings

**Pros:**
- Imports photos and descriptions
- Saves re-creating listings
- Quick transfer of inventory
    `.trim(),
  },
  {
    id: "selling-pricing",
    slug: "setting-the-right-price",
    categoryId: "selling",
    title: "Setting the right price",
    description: "Tips for pricing your items to sell",
    keywords: ["price", "pricing", "value", "worth", "sell fast"],
    order: 4,
    content: `
## Pricing Your Items

Setting the right price helps your items sell faster while maximising your return.

### Research Similar Listings
- Search for the same or similar items on Yellow Jersey
- Note asking prices and what has sold
- Check completed sales if available
- Consider the condition difference

### Factors Affecting Price
**Condition**
- New/unused commands the highest price
- Like new (minimal use) is close to retail
- Good condition typically 50-70% of new
- Fair condition may be 30-50% of new

**Age and Model Year**
- Newer items hold value better
- Some vintage items can be collectible
- Older tech may depreciate faster

**Brand Premium**
- Premium brands (Shimano Dura-Ace, SRAM Red) hold value
- Popular brands sell faster
- Niche brands may take longer but find their buyer

### Pricing Strategies
**Price to Sell Fast**
- Set 10-15% below similar listings
- Good for items you need to move quickly

**Price for Maximum Return**
- Price at or slightly above comparable items
- Be prepared to wait longer
- Accept offers to negotiate

**Accept Offers**
- Enable offers on your listing
- Set a minimum you'd accept
- Counter offers can help find the right price

### Yellow Jersey Fees
- Selling fee: 10% of the final sale price
- Payment processing: Handled by Stripe
- No listing fees for standard listings
    `.trim(),
  },
  {
    id: "selling-shipping",
    slug: "shipping-options-and-costs",
    categoryId: "selling",
    title: "Shipping options and costs",
    description: "Set up shipping for your listings",
    keywords: ["shipping", "postage", "delivery", "courier", "send"],
    order: 5,
    content: `
## Shipping Options

Offering reliable shipping is key to successful selling.

### Setting Up Shipping
When creating a listing, you'll set:
- Shipping cost (flat rate or calculated)
- Shipping methods you offer
- Local pickup availability

### Shipping Methods
**Standard Shipping**
- Australia Post or courier services
- Typical delivery: 3-7 business days
- Most economical option

**Express Shipping**
- Faster delivery: 1-3 business days
- Higher cost
- Good for time-sensitive items

**Local Pickup**
- Buyer collects from your location
- No shipping cost
- Arrange a safe meeting place

### Calculating Shipping Costs
Consider:
- Package dimensions and weight
- Distance to common destinations
- Insurance for valuable items
- Packaging materials

### Packaging Tips
- Use sturdy boxes for fragile items
- Wrap components in bubble wrap
- Remove pedals and turn handlebars for bikes
- Include original boxes if available
- Mark fragile items clearly

### After the Sale
1. Ship within 3-5 business days
2. Add tracking to the order
3. Update the order status
4. Keep shipping receipts
    `.trim(),
  },
  {
    id: "selling-manage-listings",
    slug: "managing-your-listings-and-drafts",
    categoryId: "selling",
    title: "Managing your listings and drafts",
    description: "Edit, pause, or remove your listings",
    keywords: ["manage", "edit", "delete", "pause", "draft"],
    order: 6,
    content: `
## Managing Your Listings

Keep your listings up to date and organised.

### Viewing Your Listings
- Go to "My Store" in the sidebar
- Or visit Settings > My Listings
- See all active, sold, and draft listings

### Editing a Listing
1. Find the listing you want to edit
2. Click the edit icon or "Edit"
3. Update any fields (price, description, photos)
4. Save your changes

### Pausing a Listing
If you need to temporarily hide a listing:
- Click the menu on your listing
- Select "Pause" or "Deactivate"
- The listing won't appear in search
- Reactivate when ready

### Deleting a Listing
- Remove listings that are no longer available
- Go to the listing and select "Delete"
- Deleted listings can't be recovered

### Managing Drafts
**Saving Drafts**
- Unfinished listings are saved as drafts
- Continue editing anytime
- Find drafts in Settings > Drafts

**Completing Drafts**
- Open the draft to continue
- Add any missing information
- Publish when ready

### Bulk Actions
- Select multiple listings
- Apply actions like pause, delete, or price change
- Useful for managing larger inventories
    `.trim(),
  },
  {
    id: "selling-getting-paid",
    slug: "getting-paid-with-stripe-connect",
    categoryId: "selling",
    title: "Getting paid with Stripe Connect",
    description: "How and when you receive your earnings",
    keywords: ["paid", "stripe", "payout", "earnings", "money", "bank"],
    order: 7,
    content: `
## Getting Paid

Yellow Jersey uses Stripe Connect for secure, reliable seller payments.

### Setting Up Stripe Connect
1. Go to Settings > Payments & Payouts
2. Click "Connect with Stripe"
3. Complete identity verification
4. Add your bank account details
5. You're ready to receive payments

### When Funds Are Released
After a sale:
1. Payment is held in escrow initially
2. Buyer receives and inspects the item
3. After buyer confirmation (or 7 days), funds release
4. Stripe processes the payout to your bank

### Payout Schedule
- **Default**: Payouts process within 2-3 business days
- **Timing**: Funds typically arrive the next business day after processing
- Check your Stripe dashboard for exact timing

### Fees
- **Yellow Jersey Fee**: 10% of sale price
- **Stripe Processing**: Included in the platform fee
- **No hidden fees**: What you see is what you get

### Viewing Your Earnings
- Dashboard shows pending and available balance
- Transaction history in Settings
- Detailed breakdown in Stripe dashboard

### Tax Information
- You're responsible for your own tax obligations
- Keep records of all sales
- Stripe provides annual summaries
- Consult a tax professional for advice
    `.trim(),
  },
  {
    id: "selling-store-profile",
    slug: "store-profiles-for-sellers",
    categoryId: "selling",
    title: "Store profiles for sellers",
    description: "Build your reputation and seller profile",
    keywords: ["profile", "store", "reputation", "seller page", "brand"],
    order: 8,
    content: `
## Your Seller Profile

Your store profile helps build trust with buyers.

### Accessing Your Profile
- Click "My Store" in the sidebar
- Or go to Settings to edit details

### Profile Elements
**Display Name**
- How buyers see you
- Can be your name or a store name

**Profile Photo/Logo**
- Adds credibility
- For stores, use your business logo

**Bio**
- Tell buyers about yourself
- Mention your cycling experience
- Build trust and connection

**Location**
- Helps local buyers find you
- Required for pickup options

### Building Reputation
**Ratings and Reviews**
- Buyers can leave feedback after purchases
- High ratings attract more buyers
- Respond professionally to any issues

**Verified Status**
- Bicycle stores can apply for verification
- Shows a verified badge on your profile
- Requires business documentation

### Store Settings
For verified bicycle stores:
- Opening hours
- Business address
- Website and social links
- Lightspeed POS integration
- Store type categorisation
    `.trim(),
  },

  // ============================================================
  // ORDERS & SHIPPING
  // ============================================================
  {
    id: "orders-how-shipping-works",
    slug: "how-shipping-works",
    categoryId: "orders",
    title: "How shipping works",
    description: "Understanding the shipping process on Yellow Jersey",
    keywords: ["shipping", "how it works", "process", "courier"],
    order: 1,
    content: `
## How Shipping Works

Yellow Jersey connects buyers with sellers for shipping.

### The Shipping Process
1. **Purchase**: You buy an item
2. **Preparation**: Seller packages the item (1-3 days typically)
3. **Dispatch**: Seller ships and adds tracking
4. **Transit**: Courier delivers to your address
5. **Delivery**: You receive and inspect the item

### Shipping Costs
- Set by the seller at listing time
- Shown on the product page
- Added at checkout
- Some items may offer free shipping

### Courier Services
Sellers choose their preferred couriers:
- Australia Post
- Sendle
- Couriers Please
- DHL
- StarTrack
- Other registered couriers

### Shipping Address
- Provide accurate delivery details
- Include unit numbers and building names
- Add delivery instructions if needed
- Update your address in Settings

### Delivery Attempts
- Most couriers attempt delivery once
- Failed deliveries may go to a collection point
- Track your package for real-time updates
    `.trim(),
  },
  {
    id: "orders-track-order",
    slug: "tracking-your-order",
    categoryId: "orders",
    title: "Tracking your order",
    description: "How to track packages and get delivery updates",
    keywords: ["track", "tracking number", "where is", "delivery status"],
    order: 2,
    content: `
## Tracking Your Order

Stay informed about your delivery with tracking.

### Finding Tracking Information
1. Go to Order Management > Purchases
2. Click on your order
3. Look for the tracking number
4. Click to track on the courier's website

### Understanding Tracking Statuses
- **Label Created**: Shipment is registered
- **Picked Up**: Courier has collected the item
- **In Transit**: On the way to you
- **Out for Delivery**: Arriving today
- **Delivered**: Left at your address

### Tracking Updates
- Updates may take 24-48 hours to appear initially
- Some couriers update more frequently than others
- Check back periodically for updates

### If Tracking Doesn't Update
Wait a few days first, then:
1. Contact the courier directly
2. Message the seller
3. Report the issue through Yellow Jersey if needed

### Delivery Notifications
- Enable notifications in your account settings
- Receive updates via email
- Get notified of delivery attempts
    `.trim(),
  },
  {
    id: "orders-delivery-times",
    slug: "estimated-delivery-times",
    categoryId: "orders",
    title: "Estimated delivery times",
    description: "How long shipping typically takes",
    keywords: ["delivery time", "how long", "when", "estimate"],
    order: 3,
    content: `
## Delivery Times

Delivery times depend on several factors.

### Typical Timeframes
**Metro Areas (Sydney, Melbourne, Brisbane, etc.)**
- Standard: 3-5 business days
- Express: 1-2 business days

**Regional Areas**
- Standard: 5-10 business days
- Express: 2-4 business days

**Remote Areas**
- Standard: 7-14 business days
- Express: 3-7 business days

### Factors Affecting Delivery
- **Distance**: Further destinations take longer
- **Seller location**: Depends where they ship from
- **Shipping method**: Express is faster
- **Courier performance**: Varies by service
- **Peak periods**: Holidays may cause delays

### Seller Dispatch Time
Sellers typically ship within:
- 1-3 business days for most sellers
- Same day for some verified stores
- Check the listing for specifics

### Setting Expectations
- Estimated delivery shown at checkout
- This is an estimate, not a guarantee
- Allow extra time during busy periods
- Track your order for real updates
    `.trim(),
  },
  {
    id: "orders-not-arrived",
    slug: "item-hasnt-arrived",
    categoryId: "orders",
    title: "What if my item hasn't arrived",
    description: "Steps to take when your order is delayed or missing",
    keywords: ["not arrived", "missing", "lost", "delayed", "where is"],
    order: 4,
    content: `
## When Your Item Hasn't Arrived

Here's what to do if your order is delayed or missing.

### Before Reporting
1. **Check tracking**: Is it still in transit?
2. **Wait for updates**: Tracking can be delayed
3. **Check delivery location**: Look around your property
4. **Ask neighbours**: It may have been left with them
5. **Check mailbox**: Smaller items may be in letterbox

### When to Contact the Seller
- Tracking hasn't updated in 5+ business days
- Estimated delivery has passed by 3+ days
- Tracking shows issue (failed delivery, etc.)

### How to Contact the Seller
1. Go to your order in Purchases
2. Click "Message Seller"
3. Describe the issue politely
4. Ask for any additional information

### Opening a Dispute
If the seller can't resolve the issue:
1. Go to your order
2. Click "Report a Problem"
3. Select "Item not received"
4. Provide tracking and communication details
5. We'll investigate within 24-48 hours

### Resolution Options
- **Seller ships replacement**: If item confirmed lost
- **Full refund**: If item can't be delivered
- **Partial refund**: If significantly delayed

### Buyer Protection
Your payment is protected during this process. Funds won't release until the issue is resolved.
    `.trim(),
  },
  {
    id: "orders-shipping-seller",
    slug: "shipping-as-a-seller",
    categoryId: "orders",
    title: "Shipping as a seller",
    description: "How to ship items you've sold",
    keywords: ["ship", "send", "seller shipping", "dispatch", "post"],
    order: 5,
    content: `
## Shipping for Sellers

Guide to shipping your sold items quickly and safely.

### After a Sale
1. You'll receive a notification of the sale
2. View the order in Order Management > Sales
3. Prepare the item for shipping
4. Ship within 3-5 business days

### Packing Guidelines
**Bicycles**
- Use a bike box or heavy-duty carton
- Remove pedals and turn handlebars
- Protect the frame with padding
- Secure wheels to prevent movement

**Components**
- Use appropriate-sized boxes
- Wrap in bubble wrap
- Prevent items from shifting

**Apparel**
- Use postal bags or boxes
- Include tissue or plastic wrap
- Protect from water damage

### Adding Tracking
1. Ship the item and get tracking number
2. Go to the order in your dashboard
3. Click "Add Tracking"
4. Enter the courier and tracking number
5. Update order status to "Shipped"

### Shipping Tips
- Ship promptly for better ratings
- Use tracked services always
- Insure valuable items
- Keep shipping receipts
- Communicate with buyers
    `.trim(),
  },
  {
    id: "orders-update-tracking",
    slug: "updating-tracking-information",
    categoryId: "orders",
    title: "Updating tracking information",
    description: "How sellers add tracking to orders",
    keywords: ["update tracking", "add tracking", "tracking number", "seller"],
    order: 6,
    content: `
## Adding Tracking to Orders

Providing tracking keeps buyers informed and protects both parties.

### How to Add Tracking
1. Go to Order Management > Sales
2. Find the order you've shipped
3. Click the order to open details
4. Click "Add Tracking" or the edit icon
5. Select the courier service
6. Enter the tracking number
7. Save and update status to "Shipped"

### Supported Couriers
- Australia Post
- Sendle
- Couriers Please
- StarTrack
- DHL
- Other (enter courier name)

### Best Practices
- Add tracking as soon as you ship
- Double-check the tracking number
- The buyer receives notification automatically
- Keep your shipping receipt as backup

### Common Issues
**Wrong tracking number?**
- Edit the order to update it
- Notify the buyer of the change

**Tracking not found?**
- Wait 24-48 hours for activation
- Verify the number is correct
- Check with the courier

### Why Tracking Matters
- Protects you in disputes
- Keeps buyers happy
- Reduces support requests
- Faster payment release
    `.trim(),
  },

  // ============================================================
  // DISPUTES & RETURNS
  // ============================================================
  {
    id: "disputes-opening",
    slug: "opening-a-dispute",
    categoryId: "disputes",
    title: "Opening a dispute",
    description: "How to report a problem with your order",
    keywords: ["dispute", "report", "problem", "issue", "claim"],
    order: 1,
    content: `
## Opening a Dispute

If something's wrong with your order, here's how to get help.

### When to Open a Dispute
- Item hasn't arrived after reasonable time
- Item is significantly different from listing
- Item is damaged
- You received the wrong item
- Seller is unresponsive

### Before Opening a Dispute
1. **Message the seller first**: Many issues can be resolved directly
2. **Gather evidence**: Take photos, save messages
3. **Check the listing**: Review what was promised
4. **Wait for delivery**: Don't dispute while still in transit

### How to Open a Dispute
1. Go to Order Management > Purchases
2. Find the order with the issue
3. Click "Report a Problem"
4. Select the type of issue
5. Describe what happened
6. Upload photos if applicable
7. Submit your report

### What Happens Next
- Your payment remains protected
- The seller is notified
- You'll get a ticket number
- Our team reviews within 24-48 hours
- We may ask for additional information

### Dispute Categories
- Item not received
- Not as described
- Damaged item
- Wrong item
- Refund request
- Shipping issue
    `.trim(),
  },
  {
    id: "disputes-resolution",
    slug: "dispute-resolution-process",
    categoryId: "disputes",
    title: "The dispute resolution process",
    description: "What happens after you open a dispute",
    keywords: ["resolution", "process", "review", "outcome", "decision"],
    order: 2,
    content: `
## Dispute Resolution

How we resolve issues between buyers and sellers.

### The Process
**Step 1: Review**
- Our team reviews your case
- We examine evidence from both parties
- We check tracking and communication

**Step 2: Investigation**
- We may request additional information
- Both parties can submit evidence
- We assess against our policies

**Step 3: Decision**
- We aim to decide within 48-72 hours
- Complex cases may take longer
- Both parties are notified of the outcome

### Possible Outcomes
**Full Refund**
- You're refunded the full purchase price
- Applies when item not received or significantly misrepresented

**Partial Refund**
- Compensation for the issue
- Amount based on impact and evidence

**No Refund**
- If claim not supported by evidence
- If item was as described

**Return Required**
- You may need to return the item
- Seller may provide return label
- Refund issued upon return

### Your Responsibilities
- Respond to requests promptly
- Provide honest, accurate information
- Keep the item safe if return required
- Follow instructions from support
    `.trim(),
  },
  {
    id: "disputes-refunds",
    slug: "how-refunds-work",
    categoryId: "disputes",
    title: "How refunds work",
    description: "Understanding the refund process and timing",
    keywords: ["refund", "money back", "return money", "get refund"],
    order: 3,
    content: `
## How Refunds Work

When you're entitled to a refund, here's what happens.

### Refund Timing
**Processing**: 1-3 business days
**Bank credit**: 3-7 business days (depends on your bank)
**Total**: Usually 5-10 business days

### Refund Methods
- Refunds go to your original payment method
- Credit cards: Appears as a credit
- Debit cards: Returns to your account
- Digital wallets: Returns to wallet balance

### Full Refunds Include
- Item price
- Original shipping cost (if applicable)
- Any fees you paid

### Partial Refunds
- Amount depends on the issue
- May compensate for defects or damage
- Negotiated or decided by support

### Tracking Your Refund
1. You'll receive email confirmation
2. Check your bank statement
3. Allow processing time
4. Contact us if not received after 14 days

### Refund Reasons
- Item not received
- Significantly not as described
- Damaged in transit
- Wrong item received
- Seller agreed to cancel
    `.trim(),
  },
  {
    id: "disputes-returns-shipping",
    slug: "return-shipping",
    categoryId: "disputes",
    title: "Return shipping",
    description: "How to return items when required",
    keywords: ["return", "send back", "return shipping", "label"],
    order: 4,
    content: `
## Return Shipping

Sometimes items need to be returned as part of dispute resolution.

### When Returns Are Required
- Item not as described (you keep the item otherwise)
- Wrong item sent
- Seller agrees to accept return
- Support team requests return for verification

### Return Process
1. Wait for return instructions from support
2. Seller or Yellow Jersey provides return details
3. Package the item safely
4. Ship using the method specified
5. Add tracking and share with us

### Return Shipping Costs
**Seller's Fault**
- Seller typically pays for return shipping
- They may send a prepaid label
- Or reimburse your shipping costs

**Buyer's Choice (change of mind)**
- Not generally applicable on Yellow Jersey
- If seller agrees to accept return, you pay shipping

### Packaging for Returns
- Use original packaging if possible
- Pack securely to prevent damage
- Include all original accessories
- Document condition with photos before shipping

### Important Notes
- Don't return until instructed
- Use tracked shipping
- Keep shipping receipt
- Refund processes after item received
    `.trim(),
  },
  {
    id: "disputes-buyer-protection-claims",
    slug: "buyer-protection-claims",
    categoryId: "disputes",
    title: "Buyer Protection claims explained",
    description: "Understanding your protection as a buyer",
    keywords: ["buyer protection", "claim", "coverage", "protected"],
    order: 5,
    content: `
## Buyer Protection Claims

Your purchases on Yellow Jersey are protected.

### What's Protected
- **Non-delivery**: Item never arrives
- **Significant differences**: Item majorly differs from listing
- **Damage**: Item damaged during shipping
- **Wrong item**: Completely different item received

### Protection Period
- Coverage lasts 7 days from delivery
- Or 7 days from expected delivery date
- Starts from tracking showing "delivered"
- File claims within this window

### Filing a Claim
1. Go to your order
2. Click "Report a Problem"
3. Select the issue type
4. Provide evidence
5. Submit for review

### Evidence to Provide
**For not as described:**
- Photos showing the difference
- Comparison to listing photos
- Relevant measurements

**For damage:**
- Photos of the damage
- Photos of packaging
- Any visible impact marks

**For non-delivery:**
- Screenshots of tracking
- Any courier communications
- Confirmation of address

### Claim Limits
- Coverage up to the purchase price
- Original shipping included
- Processing fees not included
    `.trim(),
  },
  {
    id: "disputes-seller-protection",
    slug: "seller-protection-and-fair-policies",
    categoryId: "disputes",
    title: "Seller protection and fair policies",
    description: "How sellers are protected in disputes",
    keywords: ["seller protection", "fair", "seller rights", "protected seller"],
    order: 6,
    content: `
## Seller Protection

Yellow Jersey is fair to both buyers and sellers.

### How Sellers Are Protected
- **Tracking proves delivery**: Use tracked shipping always
- **Evidence matters**: Clear listings protect you
- **Fair review**: Both sides heard in disputes
- **Communication records**: Messages are saved

### Best Practices for Protection
**Accurate Listings**
- Describe items honestly
- Photograph any flaws
- List all specifications accurately
- Disclose known issues

**Proper Shipping**
- Use tracked services
- Package items securely
- Add tracking to orders promptly
- Insure valuable items

**Clear Communication**
- Respond to buyers promptly
- Keep all communication on platform
- Document any agreements

### When Sellers Win Disputes
- Item delivered as tracked
- Item matches listing description
- Buyer's claim unsupported
- Issue outside seller's control

### Dispute Best Practices
- Respond promptly to dispute notifications
- Provide evidence and your perspective
- Be professional and factual
- Propose fair resolutions

### Unfair Claims
If you believe a claim is unfair:
- Present your evidence clearly
- Show listing matched item sent
- Provide shipping documentation
- Our team reviews objectively
    `.trim(),
  },

  // ============================================================
  // PAYMENTS & PAYOUTS
  // ============================================================
  {
    id: "payments-methods",
    slug: "accepted-payment-methods",
    categoryId: "payments",
    title: "Accepted payment methods",
    description: "How to pay for purchases on Yellow Jersey",
    keywords: ["payment methods", "credit card", "how to pay", "accepted cards"],
    order: 1,
    content: `
## Payment Methods

Yellow Jersey accepts secure payments for all purchases.

### Accepted Methods
**Credit Cards**
- Visa
- Mastercard
- American Express

**Debit Cards**
- All major Australian banks
- International Visa/MC debit

**Digital Wallets**
- Apple Pay
- Google Pay

### Security
- All payments processed by Stripe
- PCI DSS compliant
- 3D Secure authentication
- No card data stored on our servers

### Adding Payment Methods
1. Go to checkout
2. Enter your card details
3. Optionally save for future use
4. Your details are encrypted

### Payment Issues
**Card declined?**
- Check available funds
- Verify card details
- Contact your bank
- Try a different card

**Processing errors?**
- Wait a moment and retry
- Clear browser cache
- Try a different browser
- Contact support if persistent
    `.trim(),
  },
  {
    id: "payments-funds-held",
    slug: "when-funds-are-held",
    categoryId: "payments",
    title: "When funds are held",
    description: "Understanding payment holds and escrow",
    keywords: ["funds held", "escrow", "payment hold", "protected"],
    order: 2,
    content: `
## Payment Holds

Understanding how Yellow Jersey protects purchases.

### Why Funds Are Held
- Protects buyers until items arrive
- Ensures sellers ship as promised
- Enables dispute resolution
- Creates trust in the marketplace

### How It Works
1. Buyer makes payment
2. Funds held by Stripe
3. Seller ships item
4. Buyer confirms receipt
5. Funds released to seller

### Hold Duration
**Standard Release**
- After buyer confirms receipt, or
- 7 days after delivery (auto-release)

**Extended Hold**
- If dispute is opened
- Funds stay protected until resolved

### For Buyers
- Your money is safe
- Can dispute if issues arise
- Not released until you're happy

### For Sellers
- Funds guaranteed once released
- Clear timeline for payment
- Protection from chargebacks

### Dispute Impact
- Funds remain held during disputes
- Released based on resolution
- Either to seller or refunded to buyer
    `.trim(),
  },
  {
    id: "payments-stripe-connect-setup",
    slug: "setting-up-stripe-connect",
    categoryId: "payments",
    title: "Setting up Stripe Connect",
    description: "Connect your bank account to receive payments",
    keywords: ["stripe connect", "setup", "bank account", "receive payments"],
    order: 3,
    content: `
## Setting Up Stripe Connect

Before you can sell on Yellow Jersey, you need to set up Stripe Connect.

### What Is Stripe Connect?
- Secure payment processing
- Handles seller payouts
- Manages tax compliance
- Industry-standard security

### Setup Process
1. Go to Settings > Payments & Payouts
2. Click "Connect with Stripe"
3. Create or log into Stripe account
4. Complete identity verification
5. Add your bank account
6. Accept terms and conditions

### Verification Requirements
**For Individuals**
- Full legal name
- Date of birth
- Address
- Last 4 digits of TFN (optional but recommended)
- Government ID (if requested)

**For Businesses**
- Business details
- ABN or ACN
- Authorised representative info
- Business address

### Bank Account Details
- Australian bank account required
- BSB and account number
- Account must be in your name

### After Setup
- You'll see "Connected" status
- Ready to list and sell items
- Payouts sent to your bank automatically
    `.trim(),
  },
  {
    id: "payments-when-paid",
    slug: "when-sellers-get-paid",
    categoryId: "payments",
    title: "When sellers get paid",
    description: "Understanding the payout timeline",
    keywords: ["when paid", "payout", "receive money", "timeline"],
    order: 4,
    content: `
## When Sellers Get Paid

Understanding your earnings and payout schedule.

### Payment Timeline
**After Sale**
1. Buyer completes purchase
2. Funds held in escrow

**After Delivery**
1. Buyer receives item
2. Buyer confirms receipt (or 7 days pass)
3. Funds released to your Stripe balance

**Payout Processing**
1. Stripe processes to your bank
2. Typically 2-3 business days
3. Arrives in your bank account

### Total Time
- Best case: 4-7 days from sale
- Typical: 7-14 days from sale
- If dispute: Resolved + payout time

### Checking Your Balance
- View in Settings > Payments & Payouts
- See pending and available amounts
- Track individual transactions
- Access full history in Stripe dashboard

### Payout Schedule
- Automatic payouts daily or weekly
- Minimum payout threshold may apply
- Bank holidays may delay processing
    `.trim(),
  },
  {
    id: "payments-fees",
    slug: "understanding-fees",
    categoryId: "payments",
    title: "Understanding fees",
    description: "Yellow Jersey fees and how they work",
    keywords: ["fees", "costs", "selling fees", "commission", "charges"],
    order: 5,
    content: `
## Understanding Fees

Clear breakdown of Yellow Jersey fees.

### Selling Fees
**Platform Fee**: 10% of sale price
- Charged when item sells
- Deducted from your payout
- Covers platform, support, and buyer protection

### What's Included
- Listing is free
- No monthly fees
- Payment processing included
- Buyer protection included
- Support included

### Fee Calculation Example
**Item sells for $500**
- Platform fee (10%): $50
- You receive: $450

**With shipping**
- Item: $500
- Shipping (paid by buyer): $20
- Platform fee (10% of item): $50
- You receive: $450 + $20 = $470

### No Hidden Fees
- No listing fees
- No insertion fees
- No monthly subscriptions
- No withdrawal fees

### Buyer Fees
- Buyers pay the listed price
- Plus shipping cost
- No additional buyer fees
    `.trim(),
  },
  {
    id: "payments-payout-schedule",
    slug: "payout-schedules",
    categoryId: "payments",
    title: "Payout schedules",
    description: "When and how often you receive payouts",
    keywords: ["payout schedule", "how often", "payment frequency"],
    order: 6,
    content: `
## Payout Schedules

How and when you receive your earnings.

### Default Schedule
- Automatic daily payouts
- Processed by Stripe
- Arrives in 2-3 business days

### Payout Options
Access Stripe dashboard for options:
- Daily payouts (default)
- Weekly payouts
- Monthly payouts

### Processing Times
**Standard Transfer**
- 2-3 business days to bank
- Sent to your linked account

**Weekends & Holidays**
- No bank processing
- Payouts queue for next business day

### Tracking Payouts
1. Go to Settings > Payments & Payouts
2. View payout history
3. See pending amounts
4. Access Stripe for details

### Payout Issues
**Delayed payout?**
- Check bank holidays
- Verify bank details correct
- Ensure Stripe account in good standing

**Missing payout?**
- Check Stripe dashboard
- Verify it was processed
- Contact Stripe support if needed
    `.trim(),
  },

  // ============================================================
  // ACCOUNT & SECURITY
  // ============================================================
  {
    id: "account-creating",
    slug: "creating-your-account",
    categoryId: "account",
    title: "Creating your account",
    description: "How to sign up for Yellow Jersey",
    keywords: ["create account", "sign up", "register", "new account"],
    order: 1,
    content: `
## Creating Your Account

Get started on Yellow Jersey in minutes.

### Sign Up Options
- **Email**: Register with your email address
- **Google**: Quick sign up with Google account
- **Apple**: Sign in with Apple ID

### Registration Steps
1. Click "Sign In" or "Get Started"
2. Choose your sign up method
3. Verify your email address
4. Complete your profile (optional but recommended)

### Profile Information
**Basic Details**
- Name
- Email
- Phone (optional)
- Location

**For Sellers**
- Display name or business name
- Profile photo or logo
- Bio

### Email Verification
- Check your inbox for verification email
- Click the link to verify
- Check spam if not received
- Request new link if expired

### Account Types
**Individual**
- For personal use
- Buy and sell items
- No business verification needed

**Bicycle Store**
- For registered businesses
- Additional features available
- Requires verification
    `.trim(),
  },
  {
    id: "account-settings",
    slug: "profile-settings",
    categoryId: "account",
    title: "Profile settings",
    description: "Managing your account preferences",
    keywords: ["settings", "profile", "preferences", "edit profile"],
    order: 2,
    content: `
## Profile Settings

Customise your Yellow Jersey experience.

### Accessing Settings
- Click your profile in the sidebar
- Or go to the Settings page
- Mobile: Tap menu > Settings

### Personal Information
- **Name**: Your display name
- **Email**: For notifications and login
- **Phone**: Optional, for account security
- **Location**: Helps with local search

### Seller Profile
- **Display Name**: How buyers see you
- **Bio**: Tell buyers about yourself
- **Profile Photo**: Adds trust and recognition
- **Social Links**: Connect your other profiles

### Preferences
- **Riding styles**: Help personalise recommendations
- **Preferred brands**: Get relevant suggestions
- **Experience level**: Tailored content

### Saving Changes
- Changes save when you click Save
- Some changes apply immediately
- Email changes may require verification
    `.trim(),
  },
  {
    id: "account-notifications",
    slug: "notification-preferences",
    categoryId: "account",
    title: "Notification preferences",
    description: "Control what notifications you receive",
    keywords: ["notifications", "emails", "alerts", "preferences"],
    order: 3,
    content: `
## Notification Preferences

Control how Yellow Jersey communicates with you.

### Email Notifications
**Order Alerts**
- Purchase confirmations
- Shipping updates
- Delivery notifications
- Order issues

**Sales Alerts** (for sellers)
- New sales
- Offer notifications
- Payout confirmations

**Marketing**
- Tips and guides
- New features
- Promotions (optional)

### Managing Preferences
1. Go to Settings
2. Find Notifications section
3. Toggle each preference
4. Changes save automatically

### Essential Notifications
Some notifications can't be turned off:
- Security alerts
- Important account information
- Dispute updates
- Policy changes

### Unsubscribing
- Click "Unsubscribe" in any email
- Or manage in Settings
- Essential emails still sent
    `.trim(),
  },
  {
    id: "account-types",
    slug: "account-types",
    categoryId: "account",
    title: "Account types (Individual vs Store)",
    description: "Understanding different account types",
    keywords: ["account type", "individual", "store", "business", "upgrade"],
    order: 4,
    content: `
## Account Types

Choose the right account for your needs.

### Individual Account
**Best for:**
- Personal selling
- Occasional buyers
- Cycling enthusiasts

**Features:**
- Buy and sell items
- Make and receive offers
- Buyer protection
- Seller payouts via Stripe
- Basic profile

### Bicycle Store Account
**Best for:**
- Registered bike shops
- Professional dealers
- High-volume sellers

**Features:**
- Everything in Individual, plus:
- Verified store badge
- Business profile
- Opening hours display
- Lightspeed POS integration
- Featured store placement
- Additional business tools

### Upgrading to Store
1. Go to Settings
2. Select "Upgrade to Store"
3. Provide business details
4. Submit for verification
5. Our team reviews (1-3 business days)

### Verification Requirements
- Valid ABN or ACN
- Business name registration
- Operating bicycle business
- Physical or online presence
    `.trim(),
  },
  {
    id: "account-privacy",
    slug: "privacy-and-data",
    categoryId: "account",
    title: "Privacy and data",
    description: "How we protect your information",
    keywords: ["privacy", "data", "information", "protect", "secure"],
    order: 5,
    content: `
## Privacy and Data

Your privacy matters to us.

### What We Collect
**Account Information**
- Name and email
- Phone (if provided)
- Address (for shipping)

**Activity Data**
- Listings you create
- Purchases and sales
- Messages between users
- Search and browsing

### How We Use Data
- Process transactions
- Improve recommendations
- Prevent fraud
- Provide support
- Send notifications

### Your Controls
- Update information in Settings
- Download your data
- Delete your account
- Manage cookies

### Data Security
- Encrypted connections (HTTPS)
- Secure payment processing
- Regular security audits
- Access controls

### Third Parties
- Stripe for payments
- Cloudinary for images
- Analytics services
- See Privacy Policy for details

### Your Rights
- Access your data
- Correct inaccuracies
- Request deletion
- Opt out of marketing
    `.trim(),
  },
  {
    id: "account-reporting",
    slug: "reporting-users-or-listings",
    categoryId: "account",
    title: "Reporting users or listings",
    description: "How to report inappropriate content",
    keywords: ["report", "flag", "inappropriate", "scam", "fake"],
    order: 6,
    content: `
## Reporting Issues

Help keep Yellow Jersey safe and trustworthy.

### What to Report
**Listings**
- Fake or misleading products
- Prohibited items
- Stolen goods
- Copyright violations
- Inappropriate content

**Users**
- Scam attempts
- Harassment
- Impersonation
- Suspicious behaviour

### How to Report a Listing
1. Go to the listing page
2. Click the menu (three dots)
3. Select "Report Listing"
4. Choose the reason
5. Add details if helpful
6. Submit

### How to Report a User
1. Go to their profile
2. Click the menu
3. Select "Report User"
4. Describe the issue
5. Submit

### What Happens Next
- Our team reviews reports
- Action taken within 24-48 hours
- You may be contacted for more info
- Report status updated

### Protecting Yourself
- Don't share personal information
- Keep transactions on platform
- Trust your instincts
- Report suspicious activity
    `.trim(),
  },
];

// ============================================================
// Helper Functions
// ============================================================

export function getCategoryById(id: string): HelpCategory | undefined {
  return HELP_CATEGORIES.find((cat) => cat.id === id);
}

export function getCategoryBySlug(slug: string): HelpCategory | undefined {
  return HELP_CATEGORIES.find((cat) => cat.slug === slug);
}

export function getArticlesByCategory(categoryId: string): HelpArticle[] {
  return HELP_ARTICLES
    .filter((article) => article.categoryId === categoryId)
    .sort((a, b) => a.order - b.order);
}

export function getArticleBySlug(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((article) => article.slug === slug);
}

export function getArticleById(id: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((article) => article.id === id);
}

export function searchArticles(query: string): HelpArticle[] {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return [];

  return HELP_ARTICLES.filter((article) => {
    const searchText = [
      article.title,
      article.description,
      ...article.keywords,
    ].join(" ").toLowerCase();
    
    return searchText.includes(lowerQuery);
  }).slice(0, 10);
}

export function getPopularArticles(): HelpArticle[] {
  // Return key articles for quick access
  const popularIds = [
    "buying-buyer-protection",
    "buying-track-purchase",
    "selling-getting-started",
    "disputes-opening",
    "payments-stripe-connect-setup",
    "orders-not-arrived",
  ];
  
  return popularIds
    .map((id) => getArticleById(id))
    .filter((article): article is HelpArticle => article !== undefined);
}

