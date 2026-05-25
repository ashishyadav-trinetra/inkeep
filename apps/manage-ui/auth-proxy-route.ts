/**
 * Auth Proxy Route Handler
 *
 * Injected into apps/manage-ui/src/app/api/auth/[...slug]/route.ts by
 * Dockerfile.agents-manage-ui after `pnpm inkeep dev --export` regenerates the app.
 *
 * Why this exists:
 *   Next.js rewrites in production strip Set-Cookie response headers from upstream
 *   responses. That means the browser never stores the session cookie after sign-in,
 *   so the middleware always redirects back to /login.
 *
 *   A Route Handler has no such restriction — it forwards the full upstream response
 *   including Set-Cookie, so the browser stores the cookie on manage-ui's origin
 *   (not agents-api's cross-site origin), and the middleware sees it on the next request.
 */

import { type NextRequest, NextResponse } from 'next/server';

// AGENTS_API_URL must be the direct agents-api URL (e.g. https://agents-api-xxx.up.railway.app).
// Do NOT set this to the manage-ui's own URL — that creates an infinite proxy loop.
// In Railway: add AGENTS_API_URL=https://agents-api-inkeep-agents.up.railway.app to the manage-ui service.
const AGENTS_API_URL =
  process.env.AGENTS_API_URL ||
  'http://localhost:3002';

async function proxyToAgentsApi(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const targetUrl = `${AGENTS_API_URL}${url.pathname}${url.search}`;

  // Forward all request headers except Host (the target sets its own)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete('host');

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers: requestHeaders,
    // Only attach body for methods that allow it
    ...(request.method !== 'GET' && request.method !== 'HEAD'
      ? { body: request.body, duplex: 'half' as const }
      : {}),
  });

  // Copy ALL upstream response headers — critically Set-Cookie so the browser
  // stores the session cookie on manage-ui's domain rather than cross-site.
  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    responseHeaders.append(key, value);
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxyToAgentsApi;
export const POST = proxyToAgentsApi;
export const PUT = proxyToAgentsApi;
export const DELETE = proxyToAgentsApi;
export const PATCH = proxyToAgentsApi;
export const OPTIONS = proxyToAgentsApi;
