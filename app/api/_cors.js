// app/api/_cors.js
export function corsHeaders(origin) {
  const allow = process.env.ALLOWED_ORIGINS || '*';
  const allowedList =
    allow === '*'
      ? '*'
      : allow
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);

  const allowOrigin =
    allow === '*'
      ? '*'
      : allowedList.includes(origin)
      ? origin
      : '';

  return {
    'Access-Control-Allow-Origin': allowOrigin || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export function preflight(req) {
  const h = corsHeaders(req.headers.get('origin') || '');
  return new Response(null, { status: 204, headers: h });
}
