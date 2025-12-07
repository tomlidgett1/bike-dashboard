"use client";

import { useEffect } from 'react';
import { useReportWebVitals } from 'next/web-vitals';

// ============================================================
// Web Vitals Performance Monitoring
// Tracks Core Web Vitals and custom metrics
// ============================================================

interface PerformanceMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  navigationType: string;
  delta: number;
}

// Thresholds based on Google's Core Web Vitals
const THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },  // Largest Contentful Paint
  FID: { good: 100, poor: 300 },    // First Input Delay
  CLS: { good: 0.1, poor: 0.25 },   // Cumulative Layout Shift
  FCP: { good: 1800, poor: 3000 },  // First Contentful Paint
  TTFB: { good: 800, poor: 1800 },  // Time to First Byte
  INP: { good: 200, poor: 500 },    // Interaction to Next Paint
};

function getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const threshold = THRESHOLDS[name as keyof typeof THRESHOLDS];
  if (!threshold) return 'good';
  
  if (value <= threshold.good) return 'good';
  if (value <= threshold.poor) return 'needs-improvement';
  return 'poor';
}

function logMetric(metric: PerformanceMetric) {
  const emoji = metric.rating === 'good' ? '✅' : metric.rating === 'needs-improvement' ? '⚠️' : '❌';
  console.log(
    `${emoji} [Web Vitals] ${metric.name}:`,
    `${metric.value.toFixed(2)}ms`,
    `(${metric.rating})`
  );

  // Send to analytics (implement your own analytics integration)
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', metric.name, {
      value: Math.round(metric.value),
      metric_rating: metric.rating,
      metric_delta: Math.round(metric.delta),
    });
  }
}

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    const performanceMetric: PerformanceMetric = {
      name: metric.name,
      value: metric.value,
      rating: getRating(metric.name, metric.value),
      navigationType: metric.navigationType,
      delta: metric.delta,
    };

    logMetric(performanceMetric);
  });

  // Additional custom metrics
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Track page load time
    window.addEventListener('load', () => {
      const loadTime = performance.now();
      console.log(`⚡ [Performance] Page Load: ${loadTime.toFixed(2)}ms`);
    });

    // Track marketplace-specific metrics
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.entryType === 'measure') {
          // Custom metric logging removed
        }
      });
    });

    observer.observe({ entryTypes: ['measure'] });

    return () => observer.disconnect();
  }, []);

  return null;
}

// Utility function to mark custom performance measurements
export function measurePerformance(name: string, startMark: string, endMark: string) {
  if (typeof window === 'undefined') return;

  try {
    performance.measure(name, startMark, endMark);
  } catch (error) {
    console.warn(`Failed to measure ${name}:`, error);
  }
}

// Utility to track marketplace-specific operations
export function trackMarketplaceOperation(operation: string, callback: () => void | Promise<void>) {
  const startMark = `${operation}-start`;
  const endMark = `${operation}-end`;
  
  performance.mark(startMark);
  
  const result = callback();
  
  if (result instanceof Promise) {
    return result.finally(() => {
      performance.mark(endMark);
      measurePerformance(operation, startMark, endMark);
    });
  } else {
    performance.mark(endMark);
    measurePerformance(operation, startMark, endMark);
    return result;
  }
}




