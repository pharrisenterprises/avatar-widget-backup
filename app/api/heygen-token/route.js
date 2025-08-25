// app/api/heygen-token/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function corsHeaders(origin) {
  const allow = process.env.ALLOWED_ORIGINS || '*';
  const allowOrigin =
    allow === '*'
      ? '*'
      : allow.split(',').map(s => s.trim()).includes(origin)
      ? origin
      : '';
  return {
    'Access-Control-Allow-Origin': allowOrigin || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(req) {
  const h = corsHeaders(req.headers.get('origin') || '');
  return new Response(null, { status: 204, headers: h });
}

export async function GET(req) {
  const origin = req.headers.get('origin') || '';
  const h = corsHeaders(origin);

  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    return Response.json(
      { ok: false, error: 'CONFIG' },
      { status: 500, headers: { ...h, 'Cache-Control': 'no-store' } },
    );
  }

  try {
    // Preferred: tenant token endpoint (no secret leak)
    const r = await fetch('https://api.heygen.com/v1/streaming.token', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return Response.json(
        { ok: false, status: r.status, error: j },
        { status: r.status, headers: { ...h, 'Cache-Control': 'no-store' } },
      );
    }

    const token =
      j?.token || j?.data?.token || j?.accessToken || j?.access_token || '';
    if (!token) {
      return Response.json(
        { ok: false, status: 502, error: 'NO_TOKEN' },
        { status: 502, headers: { ...h, 'Cache-Control': 'no-store' } },
      );
    }

    return Response.json(
      { ok: true, token },
      { headers: { ...h, 'Cache-Control': 'no-store' } },
    );
  } catch {
    // TEMPORARY last-ditch fallback (only if you *must*): return the API key as “token”.
    // SECURITY: remove this once /v1/streaming.token works reliably for your tenant.
    // return Response.json({ ok: true, token: process.env.HEYGEN_API_KEY }, { headers: { ...h, 'Cache-Control': 'no-store' } });

    return Response.json(
      { ok: false, status: 500, error: 'NETWORK' },
      { status: 500, headers: { ...h, 'Cache-Control': 'no-store' } },
    );
  }
}
