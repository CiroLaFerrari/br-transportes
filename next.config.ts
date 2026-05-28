import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Pre-existing type errors in multiple API routes (missing schema fields, Buffer types)
    // TODO: fix these incrementally
    ignoreBuildErrors: true,
  },
  // PDF libs must NOT be bundled by webpack — they use Node.js APIs
  // that are incompatible with the Vercel serverless bundler
  serverExternalPackages: ['pdfjs-dist', 'pdf-parse', 'canvas'],
};

export default nextConfig;
