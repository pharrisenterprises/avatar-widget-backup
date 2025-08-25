// app/api/heygen-avatars/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) return Response.json({ ok:false, error:'CONFIG_MISSING' }, { headers: { 'Cache-Control': 'no-store' } });

  // Try v1, fall back to v2 if needed.
  for (const url of ['https://api.heygen.com/v1/avatars', 'https://api.heygen.com/v2/avatars']) {
    try {
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
        cache: 'no-store',
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        // Return a compact list of names/ids so it's easy to eyeball
        const items = (j?.data || j?.avatars || j?.items || []).map(a => ({
          id: a.id || a.avatar_id || a.character_id,
          name: a.name || a.avatar_name || a.character_name,
        }));
        return Response.json({ ok: true, items }, { headers: { 'Cache-Control': 'no-store' } });
      }
    } catch {}
  }
  return Response.json({ ok:false, error:'FETCH_FAILED' }, { headers: { 'Cache-Control': 'no-store' } });
}
