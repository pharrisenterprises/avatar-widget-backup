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
    // Preferred: ephemeral token
    const r = await fetch('https://api.heygen.com/v1/streaming.token', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      // body can be {} – no special params required
      body: JSON.stringify({}),
      cache: 'no-store',
    });

    // Some tenants return { data: { token } }, some { token }
    const j = await r.json().catch(() => ({}));
    const token = j?.data?.token || j?.token || '';

    if (r.ok && token) {
      return Response.json(
        { ok: true, token },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Fallback: return API key as token (temporary unblock)
    return Response.json(
      { ok: true, token: key, fallback: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    // Network trouble -> fallback to API key as token
    return Response.json(
      { ok: true, token: key, fallback: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
