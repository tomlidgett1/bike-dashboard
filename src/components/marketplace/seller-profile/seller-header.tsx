"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { 
  MapPin, 
  Calendar, 
  Package, 
  ChevronDown,
  Instagram,
  Facebook,
  ExternalLink,
  UserPlus,
  UserMinus,
  MessageCircle,
  Users,
  CheckCircle,
  Loader2,
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { SellerProfile } from "@/app/api/marketplace/seller/[sellerId]/route";

// ============================================================
// Seller Profile Header
// Clean layout with profile photo, stats, Follow + Message buttons
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
  onFollowToggle?: () => Promise<void>;
}

export function SellerHeader({ seller, isOwnProfile, onEditClick, onFollowToggle }: SellerHeaderProps) {
  const router = useRouter();
  const [bioExpanded, setBioExpanded] = React.useState(false);
  const bioRef = React.useRef<HTMLParagraphElement>(null);
  const [showReadMore, setShowReadMore] = React.useState(false);
  const [isFollowing, setIsFollowing] = React.useState(seller.is_following);
  const [followerCount, setFollowerCount] = React.useState(seller.stats.follower_count);
  const [isFollowLoading, setIsFollowLoading] = React.useState(false);

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

  // Handle follow/unfollow
  const handleFollowClick = async () => {
    if (isFollowLoading) return;
    
    setIsFollowLoading(true);
    try {
      const response = await fetch('/api/marketplace/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: seller.id }),
      });

      if (response.ok) {
        const data = await response.json();
        setIsFollowing(data.isFollowing);
        setFollowerCount(data.followerCount);
        if (onFollowToggle) await onFollowToggle();
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
    } finally {
      setIsFollowLoading(false);
    }
  };

  // Handle message click - navigate to messages with this seller
  const handleMessageClick = () => {
    // Navigate to messages and start conversation with this seller
    router.push(`/messages?newConversation=${seller.id}`);
  };

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="max-w-[1920px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="flex flex-col gap-4">
          {/* Top Row: Profile Photo + Name/Location + Action Buttons on Desktop */}
          <div className="flex items-start gap-3 sm:gap-4">
            {/* Profile Photo */}
            <div className="flex-shrink-0">
              <div className="relative h-20 w-20 sm:h-24 sm:w-24 lg:h-28 lg:w-28 rounded-full overflow-hidden bg-gray-100 border-2 border-gray-200">
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
                    <span className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-400">
                      {seller.display_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Name, Location & Action Buttons */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
                {/* Name, Location & Bio */}
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                    {seller.display_name}
                  </h1>
                  {seller.location && (
                    <div className="flex items-center gap-1.5 text-gray-600 mt-1">
                      <MapPin className="h-4 w-4 flex-shrink-0" />
                      <span className="text-sm font-medium truncate">{seller.location}</span>
                    </div>
                  )}
                  {/* Bio - Below Location */}
                  {seller.bio && (
                    <div className="mt-2">
                      <p 
                        ref={bioRef}
                        className={cn(
                          "text-gray-600 text-xs sm:text-sm leading-relaxed transition-all duration-300",
                          !bioExpanded && "line-clamp-2"
                        )}
                      >
                        {seller.bio}
                      </p>
                      {showReadMore && (
                        <button
                          onClick={() => setBioExpanded(!bioExpanded)}
                          className="flex items-center gap-1 mt-1 text-xs sm:text-sm font-medium text-gray-900 hover:text-gray-700 transition-colors"
                        >
                          {bioExpanded ? 'Show less' : 'Read more'}
                          <ChevronDown 
                            className={cn(
                              "h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform duration-200",
                              bioExpanded && "rotate-180"
                            )} 
                          />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Buttons - Show on Desktop Only */}
                <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                  {isOwnProfile ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onEditClick}
                      className="rounded-md"
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Edit Profile
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant={isFollowing ? "outline" : "default"}
                        size="sm"
                        onClick={handleFollowClick}
                        disabled={isFollowLoading}
                        className="rounded-md min-w-[100px]"
                      >
                        {isFollowLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isFollowing ? (
                          <>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Following
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-4 w-4 mr-2" />
                            Follow
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleMessageClick}
                        className="rounded-md"
                      >
                        <MessageCircle className="h-4 w-4 mr-2" />
                        Message
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Action Buttons - Full Width Below Profile */}
          <div className="flex sm:hidden items-center gap-2">
            {isOwnProfile ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onEditClick}
                className="rounded-md flex-1"
              >
                <Settings className="h-4 w-4 mr-2" />
                Edit Profile
              </Button>
            ) : (
              <>
                <Button
                  variant={isFollowing ? "outline" : "default"}
                  size="sm"
                  onClick={handleFollowClick}
                  disabled={isFollowLoading}
                  className="rounded-md flex-1"
                >
                  {isFollowLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isFollowing ? (
                    <>
                      <CheckCircle className="h-4 w-4 mr-1.5" />
                      <span className="text-sm">Following</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-1.5" />
                      <span className="text-sm">Follow</span>
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMessageClick}
                  className="rounded-md flex-1"
                >
                  <MessageCircle className="h-4 w-4 mr-1.5" />
                  <span className="text-sm">Message</span>
                </Button>
              </>
            )}
          </div>

          {/* Stats Row - Optimised for Mobile */}
          <div className="flex items-center flex-wrap gap-3 sm:gap-4 lg:gap-6 text-xs sm:text-sm">
            <div className="flex items-center gap-1.5 text-gray-600">
              <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span className="font-medium">{seller.stats.total_items}</span>
              <span className="text-gray-500 hidden xs:inline">for sale</span>
            </div>
            {seller.stats.sold_items > 0 && (
              <div className="flex items-center gap-1.5 text-gray-600">
                <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                <span className="font-medium">{seller.stats.sold_items}</span>
                <span className="text-gray-500 hidden xs:inline">sold</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-gray-600">
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span className="font-medium">{followerCount}</span>
              <span className="text-gray-500 hidden xs:inline">followers</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-500">
              <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Joined {memberSince}</span>
              <span className="sm:hidden">{memberSince}</span>
            </div>
          </div>

          {/* Social Links */}
          {hasSocialLinks && (
            <div className="flex items-center gap-2">
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
                  <Instagram className="h-4 w-4" />
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
                  <Facebook className="h-4 w-4" />
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
                  <StravaIcon className="h-3.5 w-3.5" />
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
    </div>
  );
}
