// ============================================================
// FAQs API Route
// ============================================================
// GET: Get FAQs filtered by category

import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// FAQ Data
// ============================================================

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
}

const FAQS: FAQ[] = [
  // Item Not Received
  {
    id: 'inr-1',
    category: 'item_not_received',
    question: 'How long does shipping usually take?',
    answer: 'Shipping times vary depending on the seller\'s location and shipping method. Most domestic orders arrive within 3-7 business days. Check your order details for the estimated delivery date and tracking information.',
  },
  {
    id: 'inr-2',
    category: 'item_not_received',
    question: 'How can I track my order?',
    answer: 'Once the seller ships your item, you\'ll receive tracking information in your order details. Go to Orders → click on your order → look for the tracking number. You can use this to track your package on the courier\'s website.',
  },
  {
    id: 'inr-3',
    category: 'item_not_received',
    question: 'What if my tracking shows delivered but I haven\'t received it?',
    answer: 'First, check around your property, with neighbours, or at your building\'s mail room. If you still can\'t find it, contact the courier with your tracking number. If the package is confirmed lost, file a claim and we\'ll help resolve it.',
  },
  {
    id: 'inr-4',
    category: 'item_not_received',
    question: 'How long should I wait before reporting non-delivery?',
    answer: 'We recommend waiting at least 7 business days after the expected delivery date before filing a claim. Delays can occur during busy periods or due to courier issues. You can always message the seller to ask for updates.',
  },

  // Item Not As Described
  {
    id: 'inad-1',
    category: 'item_not_as_described',
    question: 'What counts as "not as described"?',
    answer: 'An item is not as described if it differs significantly from the listing in terms of condition, size, colour, functionality, or missing components that were advertised. Minor variations that weren\'t mentioned may not qualify.',
  },
  {
    id: 'inad-2',
    category: 'item_not_as_described',
    question: 'Should I message the seller first?',
    answer: 'Yes, we recommend messaging the seller first to explain the issue. Many sellers will offer a resolution directly. If you can\'t reach an agreement, then file a formal claim for our team to review.',
  },
  {
    id: 'inad-3',
    category: 'item_not_as_described',
    question: 'What evidence should I provide?',
    answer: 'Take clear photos showing the issue and compare them to the listing photos. Include photos of the item from multiple angles, any damage or defects, and packaging if relevant. The more evidence you provide, the faster we can resolve your case.',
  },

  // Damaged Items
  {
    id: 'dmg-1',
    category: 'damaged',
    question: 'What should I do if my item arrives damaged?',
    answer: 'Take photos of the damage immediately, including the packaging. Don\'t throw away the packaging as it may be needed for a courier claim. Contact the seller first, then file a claim if you can\'t reach a resolution.',
  },
  {
    id: 'dmg-2',
    category: 'damaged',
    question: 'Is the seller responsible for shipping damage?',
    answer: 'Sellers are responsible for ensuring items are properly packaged to survive transit. If an item arrives damaged due to inadequate packaging, the seller is typically liable. However, if the courier caused extreme damage despite proper packaging, a courier claim may be needed.',
  },
  {
    id: 'dmg-3',
    category: 'damaged',
    question: 'Can I get a partial refund for minor damage?',
    answer: 'Yes, partial refunds are possible for minor damage that doesn\'t significantly affect the item\'s use or value. The amount is typically negotiated between you and the seller, or determined by our support team.',
  },

  // Wrong Item
  {
    id: 'wrong-1',
    category: 'wrong_item',
    question: 'I received the wrong item. What should I do?',
    answer: 'Take photos of what you received and compare to what you ordered. Contact the seller immediately as this is usually a genuine mistake. They should arrange for the correct item to be sent or offer a full refund.',
  },
  {
    id: 'wrong-2',
    category: 'wrong_item',
    question: 'Do I need to return the wrong item?',
    answer: 'Yes, you\'ll typically need to return the wrong item to receive your refund or correct item. The seller should provide a prepaid return label. Don\'t send the item back until you\'ve agreed on the return process.',
  },

  // Refund Requests
  {
    id: 'ref-1',
    category: 'refund_request',
    question: 'How long does a refund take?',
    answer: 'Once approved, refunds typically process within 3-5 business days. The time it takes to appear in your account depends on your payment method and bank.',
  },
  {
    id: 'ref-2',
    category: 'refund_request',
    question: 'Can I get a refund if I changed my mind?',
    answer: 'Yellow Jersey doesn\'t offer change-of-mind refunds as standard. However, some sellers may accept returns. Check the listing or message the seller to ask about their return policy.',
  },
  {
    id: 'ref-3',
    category: 'refund_request',
    question: 'What happens to my payment during a dispute?',
    answer: 'Your payment is held securely in escrow during any dispute. It won\'t be released to the seller until the dispute is resolved. If you\'re entitled to a refund, the funds will be returned to you.',
  },

  // Shipping Issues
  {
    id: 'ship-1',
    category: 'shipping_issue',
    question: 'The seller hasn\'t shipped my item yet. What should I do?',
    answer: 'First, check when you made the purchase. Sellers typically have 3-5 business days to ship. If it\'s been longer, message the seller for an update. If they don\'t respond, you can file a claim.',
  },
  {
    id: 'ship-2',
    category: 'shipping_issue',
    question: 'Tracking hasn\'t updated in days. Is my package lost?',
    answer: 'Tracking delays are common, especially during busy periods or when packages are in transit between hubs. Wait a few more days before assuming it\'s lost. If there\'s no update after 7 days, contact the courier or file a claim.',
  },

  // General Questions
  {
    id: 'gen-1',
    category: 'general_question',
    question: 'How does Yellow Jersey Buyer Protection work?',
    answer: 'When you make a purchase, your payment is held securely until you confirm receipt of the item. If there\'s an issue, you can file a claim within the protection period and we\'ll help resolve it. Funds are only released to the seller after you confirm or the protection period ends.',
  },
  {
    id: 'gen-2',
    category: 'general_question',
    question: 'How do I contact the seller?',
    answer: 'Go to your order details and click "Message Seller". You can also find the message option on the product page. Keep all communication on Yellow Jersey for your protection.',
  },
  {
    id: 'gen-3',
    category: 'general_question',
    question: 'What is the protection period?',
    answer: 'The buyer protection period typically lasts 7 days from when you receive the item (or from the expected delivery date). During this time, you can file a claim if there\'s an issue with your order.',
  },
];

// ============================================================
// GET: Get FAQs by category
// ============================================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const category = searchParams.get('category');

  let filteredFaqs = FAQS;

  if (category && category !== 'all') {
    filteredFaqs = FAQS.filter((faq) => faq.category === category);
  }

  return NextResponse.json({
    faqs: filteredFaqs,
  });
}

