export const ORBEA = {
  brand: 'Orbea',
  cat: 'Road · Aero',
  name: 'Orca Aero M30i',
  full: 'Orbea Orca Aero M30i',
  variant: 'Shimano 105 Di2',
  year: '2024',
  price: '$8,499',
  was: '$9,200',
  off: '8%',
  condition: 'Like New',
  size: '53 cm',
  frame: 'OMX Carbon Aero',
  groupset: 'Shimano 105 Di2',
  wheels: 'OQUO RP45 Pro',
  weight: '7.9 kg',
  seller: 'Melbourne Cycle Collective',
  location: 'Melbourne, VIC',
  rating: '4.9',
  sales: '87',
  heritage: 'Basque Country, Spain · Est. 1840',
  blurb:
    'The Orca Aero M30i channels Orbea\'s WorldTour aero programme into a rideable, race-ready package. OMX carbon layup, integrated cockpit and OQUO RP45 wheels — employee-owned craftsmanship from the Basque Country, immaculately maintained and ready for its next rider.',
  highlights: [
    { label: 'Frame', value: 'OMX Carbon Aero', detail: 'Monocoque aero tubeset tuned for sprint stability and climbing compliance.' },
    { label: 'Aero', value: '−12W @ 40km/h', detail: 'Validated in the wind tunnel against the previous Orca generation.' },
    { label: 'Groupset', value: '105 Di2', detail: 'Wireless shifting with race-day reliability and clean cable routing.' },
    { label: 'Wheels', value: 'OQUO RP45', detail: '45mm depth carbon — fast on flats, manageable in crosswinds.' },
  ],
  colors: [
    { id: 'carbon', name: 'Carbon Black', hex: '#1a1a1a', accent: '#e63946' },
    { id: 'basque', name: 'Basque Red', hex: '#8b1a1a', accent: '#ffde59' },
    { id: 'ocean', name: 'Ocean Mist', hex: '#2d4a5e', accent: '#7eb8da' },
    { id: 'silver', name: 'Titanium Raw', hex: '#8a8f98', accent: '#ffffff' },
  ],
} as const;

export const ORBEA_IMAGES = {
  hero: 'https://images.unsplash.com/photo-1576435728678-68d0fbf94e91?auto=format&fit=crop&w=1600&q=85',
  side: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1600&q=85',
  detail: 'https://images.unsplash.com/photo-1571333250630-f0230c320b6d?auto=format&fit=crop&w=1600&q=85',
  wheel: 'https://images.unsplash.com/photo-1502744688674-c619d1586c9e?auto=format&fit=crop&w=1600&q=85',
  cockpit: 'https://images.unsplash.com/photo-1511994298241-608e28f14fde?auto=format&fit=crop&w=1600&q=85',
};

export type OrbeaColor = (typeof ORBEA.colors)[number];
