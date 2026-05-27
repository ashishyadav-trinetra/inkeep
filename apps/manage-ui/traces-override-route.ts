/**
 * Traces API Route Override
 *
 * Injected into apps/manage-ui/src/app/api/traces/route.ts by
 * Dockerfile.agents-manage-ui after `pnpm inkeep dev --export` regenerates the app.
 *
 * Why this exists:
 *   The default traces route uses fetchWithRetry (maxAttempts=2) when forwarding
 *   signoz queries to agents-api. When SigNoz is not deployed, agents-api returns
 *   500 "SigNoz is not configured". That 500 triggers server-side retries (×2)
 *   AND the browser-side fetchWithRetry also retries (×2), compounding to 4 requests
 *   per original query. With multiple chart components polling on every page load,
 *   this floods Railway's log quota (hundreds of errors/second) and causes rate-limit
 *   drops that make saves appear very slow.
 *
 *   This override:
 *   - POST: single fetch attempt (no retry), returns 200 with empty data on any
 *     5xx from agents-api → browser never retries → flooding stops.
 *   - GET (health check): forwards as-is — agents-api health endpoint returns 200
 *     {"configured":false} when SigNoz is unconfigured, which is safe.
 *
 *   Auth: session cookie is forwarded directly to agents-api, which validates it
 *   via its own session middleware (same cookie used by all /manage/* routes).
 */

import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const EMPTY_SIGNOZ_RESPONSE = {
  status: 'success',
  data: { data: { results: [] } },
};

const AGENTS_API_URL =
  process.env.AGENTS_API_URL ||
  process.env.INKEEP_AGENTS_API_URL ||
  'http://localhost:3002';

function buildForwardHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const cookie = request.headers.get('cookie');
  if (cookie) headers['cookie'] = cookie;
  // Forward bypass secret if set (allows server-to-server calls without a browser session)
  const bypass = process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET;
  if (bypass) headers['x-bypass-secret'] = bypass;
  return headers;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get('tenantId') || 'default';
  const mode = url.searchParams.get('mode');

  // Route to batch endpoint if mode=batch, otherwise single query endpoint
  const path = mode === 'batch' ? '/query-batch' : '/query';
  const endpoint = `${AGENTS_API_URL}/manage/tenants/${tenantId}/signoz${path}`;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(EMPTY_SIGNOZ_RESPONSE);
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: buildForwardHeaders(request),
      body: JSON.stringify(body),
      // Single attempt — no retry. AbortSignal.timeout is Node 18+ / Next 13+.
      signal: AbortSignal.timeout(30_000),
    });

    // 5xx means SigNoz is unavailable or not configured.
    // Return 200 with empty results so the browser does not retry.
    if (response.status >= 500) {
      return NextResponse.json(EMPTY_SIGNOZ_RESPONSE);
    }

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    // Network error (timeout, ECONNREFUSED) — return empty silently.
    return NextResponse.json(EMPTY_SIGNOZ_RESPONSE);
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Health check — forward directly to agents-api signoz/health endpoint.
  // That endpoint always returns 200 (configured: true/false) so no retry needed.
  const url = new URL(request.url);
  const tenantId = url.searchParams.get('tenantId') || 'default';
  const endpoint = `${AGENTS_API_URL}/manage/tenants/${tenantId}/signoz/health`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: buildForwardHeaders(request),
      signal: AbortSignal.timeout(5_000),
    });
    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({
      status: 'connection_failed',
      configured: false,
      error: 'Management API not reachable',
    });
  }
}
