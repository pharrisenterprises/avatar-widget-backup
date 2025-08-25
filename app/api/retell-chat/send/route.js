// app/api/retell-chat/send/route.js
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
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(req) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin') || '') });
}

export async function POST(req) {
  const origin = req.headers.get('origin') || '';
  const headers = { ...corsHeaders(origin), 'Cache-Control': 'no-store' };

  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, status: 500, error: 'CONFIG' }, { headers });
  }

  const body = await req.json().catch(() => ({}));
  const chatId = body?.chatId;
  const text = (body?.text || '').toString();

  if (!chatId || !text) {
    return Response.json({ ok: false, status: 400, error: 'BAD_INPUT' }, { headers });
  }

  try {
    const r = await fetch('https://api.retellai.com/create-chat-completion', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({ chat_id: chatId, content: text }),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return Response.json({ ok: false, status: r.status, error: j }, { headers });
    }

    const reply = j?.messages?.[0]?.content || '';
    return Response.json({ ok: true, reply }, { headers });
  } catch {
    return Response.json({ ok: false, status: 500, error: 'NETWORK' }, { headers });
  }
}
