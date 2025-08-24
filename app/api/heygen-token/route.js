// app/api/heygen-token/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    return Response.json(
      { ok: false, status: 500, error: 'CONFIG' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    // Creates a short-lived streaming token.
    // Keep this endpoint; HeyGen returns { token } or { data: { token } } depending on version.
    const r = await fetch('https://api.heygen.com/v1/streaming.create_token', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({}), // no body fields required
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return Response.json(
        { ok: false, status: r.status, error: j },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const token = j?.token || j?.data?.token || j?.accessToken || '';
    if (!token) {
      return Response.json(
        { ok: false, status: 502, error: 'NO_TOKEN' },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return Response.json(
      { ok: true, token },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return Response.json(
      { ok: false, status: 500, error: 'NETWORK' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
