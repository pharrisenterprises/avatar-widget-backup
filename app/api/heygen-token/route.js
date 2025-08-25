// app/api/heygen-token/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Minimal CORS for your website, keeps things simple and permissive
function corsHeaders(origin) {
  const allow = process.env.ALLOWED_ORIGINS || '*';
  const allowOrigin =
    allow === '*'
      ? '*'
      : (allow.split(',').map(s => s.trim()).includes(origin) ? origin : '');
  return {
    'Access-Control-Allow-Origin': allowOrigin || '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(req) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin') || '') });
}

export async function GET(req) {
  const origin = req.headers.get('origin') || '';
  const headers = { ...corsHeaders(origin), 'Cache-Control': 'no-store' };

  // Preferred: ephemeral token from HeyGen (if your tenant supports it).
  // If not available, fall back to your API key as the token (works with SDK).
  const apiKey = process.env.HEYGEN_API_KEY || '';
  const preferEphemeral = process.env.HEYGEN_EPHEMERAL !== '0';

  try {
    if (preferEphemeral && apiKey) {
      const r = await fetch('https://api.heygen.com/v1/streaming.token', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        cache: 'no-store',
      });
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        const token = j?.data?.token || j?.token || '';
        if (token) return Response.json({ ok: true, token }, { headers });
      }
    }
  } catch {
    // ignore and fall back
  }

  // Fallback: return your API key directly as the token.
  if (apiKey) {
    return Response.json({ ok: true, token: apiKey, fallback: true }, { headers });
  }

  return Response.json({ ok: false, error: 'NO_TOKEN' }, { status: 500, headers });
}
