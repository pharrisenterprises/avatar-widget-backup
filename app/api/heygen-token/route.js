// app/api/heygen-token/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;
// Use Node runtime to avoid Edge restrictions with some third-party APIs
export const runtime = 'nodejs';

export async function GET() {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    return Response.json(
      { ok: false, status: 500, error: 'CONFIG' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    // Ask HeyGen for a short-lived streaming token.
    // (The SDK accepts either a short-lived token or API key; we prefer a short-lived token.)
    const r = await fetch('https://api.heygen.com/v1/streaming.token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,           // HeyGen expects API key in this header
        // Some tenants use Authorization. Keeping both doesn’t hurt:
        Authorization: `Bearer ${apiKey}`,
      },
      // Small TTL if your tenant supports it; safe to omit if unsupported
      body: JSON.stringify({ expires_in: 600 }),
      cache: 'no-store',
    });

    const j = await r.json().catch(() => ({}));

    if (!r.ok) {
      return Response.json(
        { ok: false, status: r.status, error: j },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // Be liberal with shapes we accept from HeyGen:
    const token =
      j?.token ||
      j?.accessToken ||
      j?.access_token ||
      j?.data?.token ||
      j?.data?.accessToken;

    if (!token) {
      return Response.json(
        { ok: false, status: 502, error: 'NO_TOKEN' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return Response.json(
      { ok: true, token },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { ok: false, status: 500, error: 'NETWORK' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
