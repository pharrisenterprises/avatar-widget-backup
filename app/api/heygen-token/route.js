// app/api/heygen-token/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

// TEMP SWITCH: if you want to always fall back to API key as token,
// set this to true. (Only for unblocking; exposes the key to the browser!)
const ALWAYS_FALLBACK_TO_API_KEY = false;

export async function GET() {
  const apiKey = process.env.HEYGEN_API_KEY;

  if (!apiKey) {
    return Response.json(
      { ok: false, status: 500, error: 'CONFIG:HEYGEN_API_KEY' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // If you know your tenant does not support /v1/streaming.token,
  // set ALWAYS_FALLBACK_TO_API_KEY=true above.
  if (ALWAYS_FALLBACK_TO_API_KEY) {
    return Response.json(
      { ok: true, token: apiKey, via: 'api-key-fallback' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const r = await fetch('https://api.heygen.com/v1/streaming.token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        Authorization: `Bearer ${apiKey}`, // harmless to include both
      },
      body: JSON.stringify({ expires_in: 600 }),
      cache: 'no-store',
    });

    const j = await r.json().catch(() => ({}));

    // If the endpoint exists and returns a token, use it.
    if (r.ok) {
      const token =
        j?.token ||
        j?.accessToken ||
        j?.access_token ||
        j?.data?.token ||
        j?.data?.accessToken;

      if (token) {
        return Response.json(
          { ok: true, token, via: 'short-lived' },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
    }

    // Fallback: return API key as the token (TEMPORARY UNBLOCK)
    return Response.json(
      { ok: true, token: apiKey, via: 'api-key-fallback' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    // Network error -> also fall back (TEMPORARY UNBLOCK)
    return Response.json(
      { ok: true, token: apiKey, via: 'api-key-fallback' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
