"use client";

import * as React from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { 
  MapPin, 
  Calendar, 
  Package, 
  ChevronDown,
  Instagram,
  Facebook,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SellerProfile } from "@/app/api/marketplace/seller/[sellerId]/route";

// ============================================================
// Seller Profile Header (Depop-style)
// Cover image, profile photo, bio, social links, and stats
// ============================================================

// Strava icon component (not in lucide)
function StravaIcon({ className }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="currentColor" 
      className={className}
    >
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}

interface SellerHeaderProps {
  seller: SellerProfile;
  isOwnProfile?: boolean;
  onEditClick?: () => void;
}

export function SellerHeader({ seller, isOwnProfile, onEditClick }: SellerHeaderProps) {
  const [bioExpanded, setBioExpanded] = React.useState(false);
  const bioRef = React.useRef<HTMLParagraphElement>(null);
  const [showReadMore, setShowReadMore] = React.useState(false);

  // Check if bio needs "read more" button
  React.useEffect(() => {
    if (bioRef.current) {
      setShowReadMore(bioRef.current.scrollHeight > bioRef.current.clientHeight);
    }
  }, [seller.bio]);

  // Format member since date
  const memberSince = React.useMemo(() => {
    if (!seller.stats.member_since) return 'Recently joined';
    const date = new Date(seller.stats.member_since);
    return date.toLocaleDateString('en-AU', { 
      month: 'long', 
      year: 'numeric' 
    });
  }, [seller.stats.member_since]);

  // Check if any social links exist
  const hasSocialLinks = seller.social_links && (
    seller.social_links.instagram ||
    seller.social_links.facebook ||
    seller.social_links.strava ||
    seller.social_links.twitter ||
    seller.social_links.website
  );

  return (
    <div className="bg-white">
      {/* Cover Image Section */}
      <div className="relative h-48 sm:h-56 md:h-64 w-full bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
        {seller.cover_image_url ? (
          <>
            <Image
              src={seller.cover_image_url}
              alt={`${seller.display_name}'s cover`}
              fill
              className="object-cover"
              priority
            />
            {/* Gradient overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          </>
        ) : (
          /* Default gradient background when no cover image */
          <div className="absolute inset-0 bg-gradient-to-br from-gray-800 via-gray-700 to-gray-900">
            {/* Subtle pattern overlay */}
            <div 
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              }}
            />
          </div>
        )}
      </div>

      {/* Profile Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {/* Profile Photo - Overlapping cover */}
        <div className="relative -mt-16 sm:-mt-20 mb-4">
          <div className="relative h-28 w-28 sm:h-32 sm:w-32 rounded-full overflow-hidden bg-white border-4 border-white shadow-lg">
            {seller.logo_url ? (
              <Image
                src={seller.logo_url}
                alt={seller.display_name}
                fill
                className="object-cover"
                priority
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                <span className="text-4xl sm:text-5xl font-bold text-gray-400">
                  {seller.display_name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* Edit Button (if own profile) */}
          {isOwnProfile && onEditClick && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onEditClick}
              className="absolute top-20 sm:top-24 right-0 px-4 py-2 bg-white border border-gray-200 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
            >
              Edit Profile
            </motion.button>
          )}
        </div>

        {/* Name and Location */}
        <div className="mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
            {seller.display_name}
          </h1>
          {seller.location && (
            <div className="flex items-center gap-1.5 text-gray-500">
              <MapPin className="h-4 w-4" />
              <span className="text-sm">{seller.location}</span>
            </div>
          )}
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-6 mb-4 text-sm">
          <div className="flex items-center gap-1.5 text-gray-600">
            <Package className="h-4 w-4" />
            <span className="font-medium">{seller.stats.total_items}</span>
            <span className="text-gray-500">items</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-500">
            <Calendar className="h-4 w-4" />
            <span>Joined {memberSince}</span>
          </div>
        </div>

        {/* Bio Section */}
        {seller.bio && (
          <div className="mb-4">
            <p 
              ref={bioRef}
              className={cn(
                "text-gray-700 text-sm leading-relaxed transition-all duration-300",
                !bioExpanded && "line-clamp-3"
              )}
            >
              {seller.bio}
            </p>
            {showReadMore && (
              <button
                onClick={() => setBioExpanded(!bioExpanded)}
                className="flex items-center gap-1 mt-1 text-sm font-medium text-gray-900 hover:text-gray-700 transition-colors"
              >
                {bioExpanded ? 'Show less' : 'Read more'}
                <ChevronDown 
                  className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    bioExpanded && "rotate-180"
                  )} 
                />
              </button>
            )}
          </div>
        )}

        {/* Social Links */}
        {hasSocialLinks && (
          <div className="flex items-center gap-3 pb-6">
            {seller.social_links?.instagram && (
              <a
                href={seller.social_links.instagram.startsWith('http') 
                  ? seller.social_links.instagram 
                  : `https://instagram.com/${seller.social_links.instagram.replace('@', '')}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center h-9 w-9 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="h-4.5 w-4.5" />
              </a>
            )}
            {seller.social_links?.facebook && (
              <a
                href={seller.social_links.facebook.startsWith('http')
                  ? seller.social_links.facebook
                  : `https://facebook.com/${seller.social_links.facebook}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center h-9 w-9 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors"
                aria-label="Facebook"
              >
                <Facebook className="h-4.5 w-4.5" />
              </a>
            )}
            {seller.social_links?.strava && (
              <a
                href={seller.social_links.strava.startsWith('http')
                  ? seller.social_links.strava
                  : `https://strava.com/athletes/${seller.social_links.strava}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center h-9 w-9 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors"
                aria-label="Strava"
              >
                <StravaIcon className="h-4 w-4" />
              </a>
            )}
            {seller.social_links?.website && (
              <a
                href={seller.social_links.website.startsWith('http')
                  ? seller.social_links.website
                  : `https://${seller.social_links.website}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center h-9 w-9 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors"
                aria-label="Website"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

