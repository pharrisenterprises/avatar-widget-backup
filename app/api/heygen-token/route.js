// app/api/heygen-token/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function json(data, init = {}) {
  const headers = { 'Cache-Control': 'no-store', ...(init.headers || {}) };
  return Response.json(data, { ...init, headers });
}

export async function GET() {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    return json({ ok: false, status: 500, code: 'CONFIG', detail: { hasApiKey: !!apiKey } }, { status: 500 });
  }

  try {
    // Preferred: HeyGen ephemeral streaming token
    const r = await fetch('https://api.heygen.com/v1/streaming.token', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({}),
    });

    let j = {};
    try { j = await r.json(); } catch { j = {}; }

    if (!r.ok) {
      // Fallback: still unblock by returning the direct API key (temporary; exposes a secret to the browser).
      // Remove this once v1/streaming.token works in your tenant.
      return json({ ok: true, token: apiKey, fallback: true, detail: j });
    }

    const token = j?.data?.token || j?.token || j?.accessToken;
    if (!token) {
      return json({ ok: false, status: 502, code: 'NO_TOKEN', detail: j }, { status: 502 });
    }

    return json({ ok: true, token });
  } catch (err) {
    // Fallback on network failure as well (temporary)
    return json({ ok: true, token: apiKey, fallback: true, detail: String(err || '') });
  }
}
