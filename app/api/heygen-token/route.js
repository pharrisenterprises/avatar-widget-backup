export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const apiKey = process.env.HEYGEN_API_KEY || '';
    if (!apiKey) {
      return Response.json({ ok: false, error: 'Missing HEYGEN_API_KEY' }, { status: 500 });
    }

    // Create a short-lived streaming session token
    const r = await fetch('https://api.heygen.com/v1/streaming.create_token', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      // No special fields required; server returns { data: { token } }
      body: JSON.stringify({}),
      cache: 'no-store',
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return Response.json({ ok: false, status: r.status, body: j }, { status: r.status });
    }

    const token = j?.data?.token || j?.token || null;
    return Response.json(
      { ok: true, token, raw: j },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return Response.json(
      { ok: false, error: e?.message || 'token failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
