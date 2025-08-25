// app/api/retell-chat/start/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

  const apiKey = process.env.RETELL_API_KEY;
  const agentId = process.env.RETELL_CHAT_AGENT_ID;

  if (!apiKey || !agentId) {
    return Response.json({ ok: false, status: 500, error: 'CONFIG' }, { headers });
  }

  try {
    const r = await fetch('https://api.retellai.com/v2/chat/start', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({ agent_id: agentId }),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return Response.json({ ok: false, status: r.status, error: j }, { headers });
    }

    const chatId = j?.chat_id || j?.id;
    if (!chatId) {
      return Response.json({ ok: false, status: 502, error: 'NO_CHAT_ID' }, { headers });
    }

    return Response.json({ ok: true, chatId }, { headers });
  } catch {
    return Response.json({ ok: false, status: 500, error: 'NETWORK' }, { headers });
  }
}
