import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['web-haptics'],
  // Allow an isolated build dir (e.g. for a parallel preview server) without
  // clobbering the primary `.next` dir used by a concurrently running dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The repository has a parent lockfile used for unrelated tooling. Keep file
  // tracing scoped to this app so production builds do not infer the parent as
  // the workspace root.
  outputFileTracingRoot: process.cwd(),
  typescript: {
    ignoreBuildErrors: process.env.NEXT_IGNORE_TYPESCRIPT === "1",
  },
  async redirects() {
    // OAuth PKCE cookies are host-specific; mixing www and apex breaks sign-in.
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.yellowjersey.store" }],
        destination: "https://yellowjersey.store/:path*",
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      // Supabase Storage
      {
        protocol: 'https',
        hostname: 'frjcluhuictnbimitvrm.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'frjcluhuictnbimitvrm.supabase.co',
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
      // Google account profile photos (OAuth)
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh4.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh5.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh6.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.bike24.com',
        port: '',
        pathname: '/**',
      },
      // eBay (online product / Serper image sources)
      {
        protocol: 'https',
        hostname: 'i.ebayimg.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'thumbs.ebayimg.com',
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
