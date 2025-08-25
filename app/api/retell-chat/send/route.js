// app/api/retell-chat/send/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { corsHeaders, preflight } from '../../_cors';

export async function OPTIONS(req) {
  return preflight(req);
}

export async function POST(req) {
  const origin = req.headers.get('origin') || '';
  const h = corsHeaders(origin);

  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) {
    return Response.json(
      { ok: false, status: 500, error: 'CONFIG' },
      { headers: { ...h, 'Cache-Control': 'no-store' } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const chatId = body?.chatId;
  const text = (body?.text || '').toString();

  if (!chatId || !text) {
    return Response.json(
      { ok: false, status: 400, error: 'BAD_INPUT' },
      { headers: { ...h, 'Cache-Control': 'no-store' } }
    );
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
      return Response.json(
        { ok: false, status: r.status, error: j },
        { headers: { ...h, 'Cache-Control': 'no-store' } }
      );
    }

    const reply = j?.messages?.[0]?.content || '';
    return Response.json(
      { ok: true, reply },
      { headers: { ...h, 'Cache-Control': 'no-store' } }
    );
  } catch {
    return Response.json(
      { ok: false, status: 500, error: 'NETWORK' },
      { headers: { ...h, 'Cache-Control': 'no-store' } }
    );
  }
}
