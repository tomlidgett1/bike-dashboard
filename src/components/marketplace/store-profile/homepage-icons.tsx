/**
 * Shared icon registry for store homepage highlights.
 * Keys are stored in homepage_config; components are resolved here so the
 * public renderer and the settings editor stay in sync.
 */
import {
  Wrench,
  Medal,
  Bike,
  Headset,
  Truck,
  ShieldCheck,
  Sparkles,
  Clock,
  Tag,
  Leaf,
  Zap,
  Heart,
  Gauge,
  MapPin,
  Award,
  ThumbsUp,
} from '@/components/layout/app-sidebar/dashboard-icons';
import type { DashboardIcon } from '@/components/layout/app-sidebar/dashboard-icons';

export const HOMEPAGE_ICONS: Record<string, DashboardIcon> = {
  wrench: Wrench,
  medal: Medal,
  bike: Bike,
  headset: Headset,
  truck: Truck,
  shield: ShieldCheck,
  sparkles: Sparkles,
  clock: Clock,
  tag: Tag,
  leaf: Leaf,
  zap: Zap,
  heart: Heart,
  gauge: Gauge,
  pin: MapPin,
  award: Award,
  thumbsup: ThumbsUp,
};

/** Ordered list for the icon picker in settings. */
export const HOMEPAGE_ICON_KEYS = Object.keys(HOMEPAGE_ICONS);

export function getHomepageIcon(key: string): DashboardIcon {
  return HOMEPAGE_ICONS[key] ?? Sparkles;
}
