import type { NextConfig } from 'next';

const agentsApiUrl =
  process.env.AGENTS_API_URL ||
  process.env.INKEEP_AGENTS_API_URL ||
  'http://localhost:3002';

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [
      // Proxy auth + manage + run API calls through the UI origin so that
      // Better Auth session cookies are same-origin and Next.js middleware
      // can read them server-side.
      { source: '/api/:path*', destination: `${agentsApiUrl}/api/:path*` },
      { source: '/manage/:path*', destination: `${agentsApiUrl}/manage/:path*` },
      { source: '/run/:path*', destination: `${agentsApiUrl}/run/:path*` },
    ];
  },
};

export default nextConfig;
