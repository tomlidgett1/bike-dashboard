/**
 * Enterprise Interaction Tracker
 * 
 * Tracks user interactions (views, clicks, searches, likes, etc.) and batches them
 * to reduce API calls. Uses localStorage for session management.
 * 
 * Features:
 * - Automatic batching (sends every 5 seconds or when 20 events accumulated)
 * - Session management with UUID
 * - Dwell time tracking for product views
 * - Offline queue support
 * - Debouncing and throttling
 */

import { useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// Types
// ============================================================

export type InteractionType =
  // original vocabulary
  | 'view' | 'click' | 'search' | 'add_to_cart' | 'like' | 'unlike'
  // product surfaces
  | 'impression' | 'gallery_view' | 'photo_zoom' | 'share'
  // non-product surfaces
  | 'store_view' | 'category_view' | 'filter' | 'sort' | 'location_change' | 'scroll_depth'
  // carousels
  | 'carousel_impression' | 'carousel_click' | 'carousel_dismiss'
  // high intent
  | 'enquiry' | 'message' | 'offer' | 'buy_intent'
  // explicit negative
  | 'dismiss';

export interface Interaction {
  productId?: string;
  interactionType: InteractionType;
  dwellTimeSeconds?: number;
  metadata?: Record<string, any>;
  timestamp: string;
}

interface QueuedInteraction extends Interaction {
  sessionId: string;
  anonymousId?: string;
  userId?: string;
}

// ============================================================
// Session Management
// ============================================================

const SESSION_KEY = 'yj_session_id';
const SESSION_DURATION = 30 * 60 * 1000; // 30 minutes
const LAST_ACTIVITY_KEY = 'yj_last_activity';
const ANON_KEY = 'yj_anon_id';
const ANON_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

/**
 * Persistent anonymous identity (survives sessions, unlike yj_session_id).
 * Mirrored into a cookie so server components can personalise the first render
 * for logged-out users.
 */
export function getOrCreateAnonymousId(): string {
  let anonId = localStorage.getItem(ANON_KEY);
  if (!anonId || !isValidUUID(anonId)) {
    // Cookie may survive a cleared localStorage (or vice versa)
    const cookieMatch = document.cookie.match(/(?:^|;\s*)yj_anon_id=([0-9a-f-]{36})/i);
    anonId = cookieMatch && isValidUUID(cookieMatch[1]) ? cookieMatch[1] : uuidv4();
    localStorage.setItem(ANON_KEY, anonId);
  }
  // Refresh the cookie on every read so it doesn't expire for active browsers
  document.cookie = `yj_anon_id=${anonId}; path=/; max-age=${ANON_COOKIE_MAX_AGE}; samesite=lax`;
  return anonId;
}

function getOrCreateSessionId(): string {
  const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
  const now = Date.now();

  // Check if session expired (30 minutes of inactivity)
  if (lastActivity && now - parseInt(lastActivity) > SESSION_DURATION) {
    // Create new session
    const newSessionId = uuidv4();
    localStorage.setItem(SESSION_KEY, newSessionId);
    localStorage.setItem(LAST_ACTIVITY_KEY, now.toString());
    return newSessionId;
  }

  // Get existing or create new session
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = uuidv4();
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  // Update last activity
  localStorage.setItem(LAST_ACTIVITY_KEY, now.toString());

  return sessionId;
}

// ============================================================
// Interaction Queue
// ============================================================

class InteractionQueue {
  private queue: QueuedInteraction[] = [];
  private batchSize = 20;
  private batchInterval = 5000; // 5 seconds
  private timer: NodeJS.Timeout | null = null;
  private isSending = false;

  constructor() {
    // Load offline queue from localStorage
    this.loadOfflineQueue();
    
    // Start batch timer
    this.startBatchTimer();

    // Send remaining events before page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.flush();
      });

      // Also send on visibility change (mobile Safari)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.flush();
        }
      });
    }
  }

  private loadOfflineQueue() {
    try {
      const offline = localStorage.getItem('yj_offline_interactions');
      if (offline) {
        const parsed = JSON.parse(offline);
        
        // Filter out invalid product IDs before loading
        const validQueue = parsed.filter((item: QueuedInteraction) => {
          if (!item.productId) return true; // Allow null/undefined
          return isValidUUID(item.productId);
        });
        
        if (validQueue.length < parsed.length) {
          console.warn('[Tracker] Removed', parsed.length - validQueue.length, 'invalid interactions from offline queue');
        }
        
        this.queue = [...this.queue, ...validQueue];
        localStorage.removeItem('yj_offline_interactions');
      }
    } catch (error) {
      console.error('[Tracker] Failed to load offline queue:', error);
      // Clear corrupt queue
      localStorage.removeItem('yj_offline_interactions');
    }
  }

  private saveOfflineQueue() {
    try {
      if (this.queue.length > 0) {
        localStorage.setItem('yj_offline_interactions', JSON.stringify(this.queue));
      }
    } catch (error) {
      console.error('[Tracker] Failed to save offline queue:', error);
    }
  }

  private startBatchTimer() {
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.timer = setInterval(() => {
      if (this.queue.length > 0 && !this.isSending) {
        this.flush();
      }
    }, this.batchInterval);
  }

  add(interaction: QueuedInteraction) {
    this.queue.push(interaction);

    // Auto-flush if batch size reached
    if (this.queue.length >= this.batchSize && !this.isSending) {
      this.flush();
    }
  }

  async flush() {
    if (this.queue.length === 0 || this.isSending) {
      return;
    }

    this.isSending = true;
    const batch = [...this.queue];
    this.queue = [];

    try {
      const response = await fetch('/api/tracking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ interactions: batch }),
        // Use keepalive for beforeunload events
        keepalive: true,
      });

      if (!response.ok) {
        // Get detailed error from response
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[Tracker] ❌ Failed to send interactions');
        console.error('[Tracker] Status:', response.status, response.statusText);
        console.error('[Tracker] Error details:', errorData);
        console.error('[Tracker] Batch size:', batch.length);
        console.error('[Tracker] Sample interaction:', batch[0]);
        
        // Re-add to queue if failed
        this.queue = [...batch, ...this.queue];
        this.saveOfflineQueue();
      } else {
        console.log('[Tracker] ✅ Successfully sent', batch.length, 'interactions');
      }
    } catch (error) {
      console.error('[Tracker] Network error sending interactions:', error);
      // Save to localStorage for retry
      this.queue = [...batch, ...this.queue];
      this.saveOfflineQueue();
    } finally {
      this.isSending = false;
    }
  }

  destroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush();
  }
}

// Global singleton queue
let globalQueue: InteractionQueue | null = null;

function getQueue(): InteractionQueue {
  if (!globalQueue) {
    globalQueue = new InteractionQueue();
  }
  return globalQueue;
}

// ============================================================
// Tracking Functions
// ============================================================

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(uuid: string | undefined | null): boolean {
  if (!uuid) return false;
  return UUID_REGEX.test(uuid);
}

export function trackInteraction(
  interactionType: InteractionType,
  options: {
    productId?: string;
    dwellTimeSeconds?: number;
    metadata?: Record<string, any>;
    userId?: string;
  } = {}
) {
  try {
    const sessionId = getOrCreateSessionId();
    const anonymousId = getOrCreateAnonymousId();
    const queue = getQueue();

    // Validate product_id is a valid UUID or set to undefined
    const validProductId = options.productId && isValidUUID(options.productId) 
      ? options.productId 
      : undefined;

    // Log warning if invalid product_id was provided
    if (options.productId && !validProductId) {
      console.warn('[Tracker] Invalid product_id (not a UUID):', options.productId);
    }

    queue.add({
      sessionId,
      anonymousId,
      userId: options.userId,
      productId: validProductId,
      interactionType,
      dwellTimeSeconds: options.dwellTimeSeconds,
      metadata: options.metadata,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Tracker] Failed to track interaction:', error);
  }
}

// ============================================================
// Recommendation-signal helpers
// ============================================================

// Impressions are deduped per page load so a card scrolled past twice
// doesn't double-count.
const seenImpressions = new Set<string>();

export function trackProductImpression(
  productId: string,
  metadata?: Record<string, any>,
  userId?: string,
) {
  const dedupeKey = `${productId}:${metadata?.carousel_key || metadata?.source || ''}`;
  if (seenImpressions.has(dedupeKey)) return;
  seenImpressions.add(dedupeKey);
  trackInteraction('impression', { productId, metadata, userId });
}

export function trackCarouselImpression(
  carouselKey: string,
  metadata?: Record<string, any>,
  userId?: string,
) {
  const dedupeKey = `carousel:${carouselKey}`;
  if (seenImpressions.has(dedupeKey)) return;
  seenImpressions.add(dedupeKey);
  trackInteraction('carousel_impression', {
    metadata: { carousel_key: carouselKey, ...metadata },
    userId,
  });
}

export function trackCarouselClick(
  carouselKey: string,
  productId: string,
  position: number,
  metadata?: Record<string, any>,
  userId?: string,
) {
  trackInteraction('carousel_click', {
    productId,
    metadata: { carousel_key: carouselKey, position, ...metadata },
    userId,
  });
}

export function trackStoreView(storeId: string, userId?: string) {
  trackInteraction('store_view', { metadata: { store_id: storeId }, userId });
}

export function trackGalleryView(productId: string, imageIndex: number, userId?: string) {
  trackInteraction('gallery_view', {
    productId,
    metadata: { image_index: imageIndex },
    userId,
  });
}

export function trackFilterChange(
  filter: Record<string, any>,
  userId?: string,
) {
  trackInteraction('filter', { metadata: filter, userId });
}

/**
 * IntersectionObserver-based product impression tracking for feed surfaces.
 * Returns a ref callback; attach it to the card wrapper.
 */
export function useImpressionRef(
  productId: string,
  metadata?: Record<string, any>,
  userId?: string,
) {
  const metadataRef = useRef(metadata);
  metadataRef.current = metadata;

  return useCallback(
    (node: HTMLElement | null) => {
      if (!node || typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
              trackProductImpression(productId, metadataRef.current, userId);
              observer.disconnect();
            }
          }
        },
        { threshold: 0.5 },
      );
      observer.observe(node);
    },
    [productId, userId],
  );
}

// ============================================================
// React Hooks
// ============================================================

/**
 * Track product views with automatic dwell time calculation
 */
export function useProductView(productId: string | null | undefined, userId?: string) {
  const startTimeRef = useRef<number | null>(null);
  const hasTrackedViewRef = useRef(false);

  useEffect(() => {
    if (!productId) return;

    // Track view on mount
    if (!hasTrackedViewRef.current) {
      trackInteraction('view', { productId, userId });
      hasTrackedViewRef.current = true;
      startTimeRef.current = Date.now();
    }

    // Track dwell time on unmount
    return () => {
      if (startTimeRef.current) {
        const dwellTimeSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
        
        // Only track if user spent at least 1 second
        if (dwellTimeSeconds >= 1) {
          trackInteraction('view', { 
            productId, 
            dwellTimeSeconds,
            userId,
            metadata: { is_dwell_time_update: true }
          });
        }
      }
    };
  }, [productId, userId]);
}

/**
 * Track clicks on products, buttons, etc.
 */
export function useTrackClick() {
  return useCallback((
    interactionType: InteractionType,
    options: {
      productId?: string;
      metadata?: Record<string, any>;
      userId?: string;
    } = {}
  ) => {
    trackInteraction(interactionType, options);
  }, []);
}

/**
 * Track search queries
 */
export function useTrackSearch() {
  const lastSearchRef = useRef<string>('');
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback((query: string, userId?: string) => {
    // Debounce search tracking (wait 1 second after user stops typing)
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = setTimeout(() => {
      // Only track if query is different and non-empty
      if (query && query.trim() !== lastSearchRef.current) {
        trackInteraction('search', {
          metadata: { query: query.trim() },
          userId,
        });
        lastSearchRef.current = query.trim();
      }
    }, 1000);
  }, []);
}

/**
 * Track page visibility for engagement metrics
 */
export function usePageVisibility(userId?: string) {
  useEffect(() => {
    let startTime = Date.now();
    let isVisible = !document.hidden;

    const handleVisibilityChange = () => {
      if (document.hidden && isVisible) {
        // Page became hidden - track session time
        const sessionSeconds = Math.floor((Date.now() - startTime) / 1000);
        if (sessionSeconds >= 5) {
          trackInteraction('view', {
            metadata: { 
              page_visibility_session: true,
              session_seconds: sessionSeconds 
            },
            userId,
          });
        }
        isVisible = false;
      } else if (!document.hidden && !isVisible) {
        // Page became visible - reset timer
        startTime = Date.now();
        isVisible = true;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userId]);
}

/**
 * Main interaction tracker hook - combines all tracking capabilities
 */
export function useInteractionTracker(userId?: string) {
  const trackClick = useTrackClick();
  const trackSearch = useTrackSearch();

  // Track page visibility
  usePageVisibility(userId);

  return {
    trackProductView: (productId: string) => {
      trackInteraction('view', { productId, userId });
    },
    trackClick: (productId?: string, metadata?: Record<string, any>) => {
      trackClick('click', { productId, userId, metadata });
    },
    trackLike: (productId: string) => {
      trackClick('like', { productId, userId });
    },
    trackUnlike: (productId: string) => {
      trackClick('unlike', { productId, userId });
    },
    trackAddToCart: (productId: string) => {
      trackClick('add_to_cart', { productId, userId });
    },
    trackSearch: (query: string) => {
      trackSearch(query, userId);
    },
  };
}

// ============================================================
// Cleanup on app unmount
// ============================================================

if (typeof window !== 'undefined') {
  // Ensure queue is flushed before page unload
  window.addEventListener('beforeunload', () => {
    if (globalQueue) {
      globalQueue.flush();
    }
  });
}

