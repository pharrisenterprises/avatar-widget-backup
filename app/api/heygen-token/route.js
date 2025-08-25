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

  // Try short-lived streaming token first (not all tenants support this)
  try {
    const r = await fetch('https://api.heygen.com/v1/streaming.token', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({ ttl: 3600 }),
    });
    const j = await r.json().catch(() => ({}));
    const token = j?.token || j?.data?.token || (typeof j === 'string' ? j : '');
    if (r.ok && token) {
      return Response.json(
        { ok: true, token, fallback: false },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
  } catch {
    // ignore and fall through to fallback
  }

  // Fallback: return API key (SDK accepts it)
  return Response.json(
    { ok: true, token: apiKey, fallback: true },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
