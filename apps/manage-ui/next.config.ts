import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Skip type-checking and linting during build to stay within Vercel's
  // free-tier 1GB memory limit. Types are still checked locally via IDE.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
