// app/api/heygen-token/route.js
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const apiKey = process.env.HEYGEN_API_KEY || '';
    if (!apiKey) {
      return Response.json(
        { ok: false, error: 'Missing HEYGEN_API_KEY' },
        { status: 500 }
      );
    }

    // 1) Try to mint a short-lived streaming token
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

      const j = await r.json().catch(() => ({}));
      const token = j?.data?.token || j?.token || null;

      if (r.ok && token) {
        return Response.json({ ok: true, token, method: 'create_token' });
      } else {
        // fall through to #2
      }
    } catch {
      // fall through to #2
    }

    // 2) Fallback — return API key as token (temporary unblock)
    return Response.json({ ok: true, token: apiKey, method: 'api_key_fallback' });
  } catch (e) {
    return Response.json(
      { ok: false, error: e?.message || 'token failed' },
      { status: 500 }
    );
  }
}
