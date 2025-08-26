export const dynamic = 'force-dynamic';

// Returns a session token for HeyGen Streaming Avatar.
// Strategy:
// 1) Try the official create_token endpoint.
// 2) If it fails or returns no token, fall back to returning the API key as the "token"
//    (SDK accepts it; do NOT keep this long-term).
export async function GET() {
  const apiKey = process.env.HEYGEN_API_KEY || '';
  if (!apiKey) {
    return Response.json({ ok: false, error: 'Missing HEYGEN_API_KEY' }, { status: 500 });
  }

  try {
    const r = await fetch('https://api.heygen.com/v1/streaming.create_token', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
      cache: 'no-store',
    });

    // Try to parse either way (some errors return text)
    const text = await r.text();
    let j = {};
    try { j = text ? JSON.parse(text) : {}; } catch {}

    const token = j?.data?.token || j?.token || null;

    if (r.ok && token) {
      return Response.json({ ok: true, token, raw: j }, { status: 200 });
    }

    // Fallback: return API key as token (temporary unblock)
    return Response.json({ ok: true, token: apiKey, fallback: true, raw: j }, { status: 200 });

  } catch (e) {
    // Fallback on exception
    return Response.json(
      { ok: true, token: apiKey, fallback: true, error: e?.message || 'token exception' },
      { status: 200 }
    );
  }
}
