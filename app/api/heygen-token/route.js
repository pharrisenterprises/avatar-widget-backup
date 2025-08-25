// app/api/heygen-token/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const apiKey = process.env.HEYGEN_API_KEY;

  if (!apiKey) {
    return Response.json(
      { ok: false, status: 500, error: 'CONFIG' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    // Preferred: request a short-lived streaming token.
    const r = await fetch('https://api.heygen.com/v1/streaming.token', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({}),
    });

    const j = await r.json().catch(() => ({}));

    // Typical shapes seen from HeyGen:
    //   { data: { token: "..." } }   or   { accessToken: "..." }
    const token =
      j?.data?.token ||
      j?.accessToken ||
      j?.token ||
      (typeof j === 'string' ? j : '');

    if (r.ok && token) {
      return Response.json(
        { ok: true, token },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // Fallback: return API key as token (works with SDK).
    // NOTE: This exposes a secret to the browser. Use only to unblock.
    // Remove this fallback once /v1/streaming.token works on your tenant.
    return Response.json(
      { ok: true, token: apiKey, note: 'KEY_FALLBACK' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    // As a last resort, still fall back so the widget can function.
    return Response.json(
      { ok: true, token: apiKey, note: 'KEY_FALLBACK_NETWORK' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
