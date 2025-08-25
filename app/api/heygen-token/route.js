// app/api/heygen-token/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    return Response.json(
      { ok: false, status: 500, error: 'MISSING_HEYGEN_API_KEY' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // 1) Try to mint a short-lived streaming token (best practice)
  try {
    const r = await fetch('https://api.heygen.com/v1/streaming.token', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({ ttl: 3600 }), // 1 hour
    });

    // Some tenants return 404/400 if not enabled — safely fall back
    const j = await r.json().catch(() => ({}));
    const token =
      j?.token ||
      j?.data?.token ||
      (typeof j === 'string' ? j : '');

    if (r.ok && token) {
      return Response.json(
        { ok: true, token, fallback: false },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
  } catch {
    // ignore and fall back below
  }

  // 2) Fallback: return API key (works with SDK, but exposes a secret to the browser)
  return Response.json(
    { ok: true, token: apiKey, fallback: true },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
