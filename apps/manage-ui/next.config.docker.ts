import type { NextConfig } from 'next';

// Docker/Railway production config.
// This file is copied over the exported next.config.ts by Dockerfile.agents-manage-ui
// after `pnpm inkeep dev --export` runs, so it must include everything the build needs:
//  - transpilePackages: bundles @inkeep/agents-ui correctly
//  - turbopack SVG rule: transforms icons/*.svg files into React components via @svgr/webpack
//    (without this, `import Logo from './icon.svg?react'` resolves to a plain object and
//     React throws "Element type is invalid: got object" on every render)
//  - serverExternalPackages: keeps OpenTelemetry out of the server bundle
//  - rewrites: proxies /api, /manage, /run to agents-api so Better Auth session cookies
//    stay same-origin and Next.js middleware can read them server-side

const agentsApiUrl =
  process.env.AGENTS_API_URL ||
  process.env.INKEEP_AGENTS_API_URL ||
  'http://localhost:3002';

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },

  transpilePackages: ['@inkeep/agents-ui'],

  serverExternalPackages: [
    '@opentelemetry/api',
    '@opentelemetry/auto-instrumentations-node',
    '@opentelemetry/baggage-span-processor',
    '@opentelemetry/context-async-hooks',
    '@opentelemetry/core',
    '@opentelemetry/exporter-trace-otlp-http',
    '@opentelemetry/resources',
    '@opentelemetry/sdk-node',
    '@opentelemetry/sdk-trace-base',
    '@opentelemetry/semantic-conventions',
  ],

  turbopack: {
    rules: {
      // Transform SVG icon files into React components.
      // The exported app imports icons like: `export { default as InkeepLogo } from './inkeep.svg?react'`
      // Turbopack needs this rule to handle the ?react suffix and produce a React component.
      './**/icons/*.svg': {
        loaders: [
          {
            loader: '@svgr/webpack',
            options: {
              svgoConfig: {
                plugins: ['removeXMLNS'],
              },
            },
          },
        ],
        as: '*.js',
      },
    },
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },

  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${agentsApiUrl}/api/:path*` },
      { source: '/manage/:path*', destination: `${agentsApiUrl}/manage/:path*` },
      { source: '/run/:path*', destination: `${agentsApiUrl}/run/:path*` },
    ];
  },
};

export default nextConfig;
