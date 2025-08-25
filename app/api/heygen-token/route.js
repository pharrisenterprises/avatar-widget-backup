// app/api/heygen-token/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { corsHeaders, preflight } from '../_cors';

export async function OPTIONS(req) {
  return preflight(req);
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
    // Preferred: tenant token endpoint
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
    // NOTE: If your tenant doesn’t support the endpoint above yet,
    // you could temporarily return the API key as the token.
    // SECURITY: comment remains for reference—don’t enable in prod.
    // return Response.json({ ok: true, token: process.env.HEYGEN_API_KEY }, { headers: { ...h, 'Cache-Control': 'no-store' } });

    return Response.json(
      { ok: false, status: 500, error: 'NETWORK' },
      { status: 500, headers: { ...h, 'Cache-Control': 'no-store' } },
    );
  }
}
