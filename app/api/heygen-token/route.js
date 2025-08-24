export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'CONFIG' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
  const r = await fetch('https://api.heygen.com/v1/streaming.token.create', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
    cache: 'no-store',
    // Vercel edge/workers: keep it simple
  });
  const j = await r.json().catch(() => ({}));
  // Return a stable shape the client expects
  const token = j?.data?.token || j?.token || j?.accessToken || '';
  if (!r.ok || !token) {
    return Response.json({ error: 'TOKEN' }, { status: r.status || 500, headers: { 'Cache-Control': 'no-store' } });
  }
  return Response.json({ ok: true, token }, { headers: { 'Cache-Control': 'no-store' } });
}
