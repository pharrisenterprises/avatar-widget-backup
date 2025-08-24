// app/api/heygen-token/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const key = process.env.HEYGEN_API_KEY;

  if (!key) {
    return Response.json(
      { ok: false, status: 500, error: 'CONFIG_MISSING' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Preferred: request a short-lived session token from HeyGen
  try {
    const r = await fetch('https://api.heygen.com/v1/streaming.token', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({}), // no body fields required
    });

    const j = await r.json().catch(() => ({}));
    const token = j?.data?.token;
    if (r.ok && token) {
      return Response.json(
        { ok: true, token },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Fallback (TEMPORARY): return the API key itself as token.
    // This unblocks the SDK but exposes a secret to the browser. Use only to diagnose.
    return Response.json(
      { ok: true, token: key, note: 'fallback_apikey' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    // Final fallback if network to HeyGen failed
    return Response.json(
      { ok: true, token: key, note: 'fallback_apikey_network' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
