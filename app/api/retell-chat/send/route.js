// app/api/retell-chat/send/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const apiKey =
      process.env.RETELL_API_KEY ||
      process.env.NEXT_PUBLIC_RETELL_API_KEY ||
      '';
    if (!apiKey) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing RETELL_API_KEY' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let body = {};
    try { body = await req.json(); } catch {}

    const chatId = (body?.chatId || body?.id || '').toString().trim();
    const text = (body?.text || '').toString().trim();

    if (!chatId || !text) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing chatId or text' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Correct Chat Completion endpoint (no /v2 prefix)
    const r = await fetch('https://api.retellai.com/create-chat-completion', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ chat_id: chatId, content: text }),
      cache: 'no-store',
    });

    const respText = await r.text();
    let j = {};
    try { j = respText ? JSON.parse(respText) : {}; } catch {}

    if (!r.ok) {
      return new Response(
        JSON.stringify({ ok: false, status: r.status, body: j }),
        { status: r.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Normalize assistant reply
    let reply = '';
    if (Array.isArray(j?.messages)) {
      const last = [...j.messages].reverse()
        .find(m => (m?.role === 'agent' || m?.role === 'assistant' || m?.role === 'model'));
      reply = (last?.content || last?.text || '').toString();
    } else if (j?.message) {
      reply = (j.message?.content || j.message?.text || '').toString();
    } else if (j?.content) {
      reply = (j.content || '').toString();
    }

    return new Response(
      JSON.stringify({ ok: true, reply, raw: j }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || 'send failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
