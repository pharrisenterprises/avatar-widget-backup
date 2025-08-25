// app/api/heygen-token/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) {
    return Response.json(
      { ok: false, status: 500, code: 'CONFIG', detail: 'Missing HEYGEN_API_KEY' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const r = await fetch('https://api.heygen.com/v1/streaming.token', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
      cache: 'no-store',
    });

    const j = await r.json().catch(() => ({}));
    const token = j?.data?.token || j?.token || '';
    if (r.ok && token) {
      return Response.json({ ok: true, token }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Fallback: allow using the API key directly as token for now
    return Response.json(
      { ok: true, token: key, fallback: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    // Network issue -> fallback to API key as token
    return Response.json(
      { ok: true, token: key, fallback: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
