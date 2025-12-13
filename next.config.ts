import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Supabase Storage
      {
        protocol: 'https',
        hostname: 'lvsxdoyptioyxuwvvpgb.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'lvsxdoyptioyxuwvvpgb.supabase.co',
        port: '',
        pathname: '/storage/v1/render/image/public/**',
      },
      // Cloudinary CDN - for ultra-fast image delivery
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        port: '',
        pathname: '/**',
      },
      // Unsplash - for demo/test images
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
    ],
    // AVIF first for better compression (30% smaller than WebP)
    formats: ['image/avif', 'image/webp'],
    // Optimised device sizes for product grids
    // Smaller sizes for faster loading on card grids
    deviceSizes: [384, 640, 750, 828, 1080, 1200],
    imageSizes: [48, 96, 128, 256, 384],
    minimumCacheTTL: 31536000, // 1 year cache
  },
};

export default nextConfig;
