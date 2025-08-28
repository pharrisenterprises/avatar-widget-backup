// app/api/heygen-probe/start/route.js
// Server-side probe to reveal real 4xx bodies from HeyGen "streaming.new".
// Usage (local):  /api/heygen-probe/start?avatar=Dexter_Lawyer_Sitting_public

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const apiKey = process.env.HEYGEN_API_KEY || '';
    if (!apiKey) {
      return Response.json({ ok: false, error: 'Missing HEYGEN_API_KEY' }, { status: 500 });
    }

    const url = new URL(req.url);
    const avatar = (url.searchParams.get('avatar') || '').trim() ||
                   process.env.NEXT_PUBLIC_HEYGEN_AVATAR_ID ||
                   process.env.HEYGEN_AVATAR_ID ||
                   'default';

    // 1) get a session token
    const t = await fetch('https://api.heygen.com/v1/streaming.create_token', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      cache: 'no-store',
    });
    const tj = await t.json().catch(() => ({}));
    if (!t.ok) return Response.json({ ok:false, step:'create_token', status:t.status, body:tj }, { status:t.status });

    const token = tj?.data?.token || tj?.token;
    if (!token) return Response.json({ ok:false, step:'create_token', error:'no token in response', raw:tj }, { status:500 });

    // 2) call streaming.new directly with the session token
    //    IMPORTANT: try avatar_id first (most current backends expect this).
    const bodyA = {
      version: 'v2',
      avatar_id: avatar, // your "Dexter_..._public"
      quality: 'high',
      language: 'en',
      activity_idle_timeout: 1800,
    };
    const s1 = await fetch('https://api.heygen.com/v1/streaming.new', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyA),
      cache: 'no-store',
    });
    const s1text = await s1.text();
    let s1json = {};
    try { s1json = s1text ? JSON.parse(s1text) : {}; } catch {}

    if (s1.ok) return Response.json({ ok:true, mode:'avatar_id', status:s1.status, body:s1json });

    // 3) fallback: avatar_name
    const bodyB = { ...bodyA, avatar_name: avatar };
    delete bodyB.avatar_id;
    const s2 = await fetch('https://api.heygen.com/v1/streaming.new', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyB),
      cache: 'no-store',
    });
    const s2text = await s2.text();
    let s2json = {};
    try { s2json = s2text ? JSON.parse(s2text) : {}; } catch {}

    const out = { ok:false, tried:['avatar_id','avatar_name'], s1:{ status:s1.status, body:s1json }, s2:{ status:s2.status, body:s2json } };
    return Response.json(out, { status: 400 });

  } catch (e) {
    return Response.json({ ok:false, error:e?.message || 'probe failed' }, { status: 500 });
  }
}
