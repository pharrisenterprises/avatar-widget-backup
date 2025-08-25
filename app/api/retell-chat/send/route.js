// app/api/retell-chat/send/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function json(data, init = {}) {
  const headers = { 'Cache-Control': 'no-store', ...(init.headers || {}) };
  return Response.json(data, { ...init, headers });
}

export async function POST(req) {
  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) {
    return json({ ok: false, status: 500, code: 'CONFIG', detail: { hasApiKey: !!apiKey } }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const chatId = body?.chatId;
  const text = (body?.text || '').toString();

  if (!chatId || !text) {
    return json({ ok: false, status: 400, code: 'BAD_INPUT', detail: { chatId: !!chatId, hasText: !!text } }, { status: 400 });
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

    let j = {};
    try { j = await r.json(); } catch { j = {}; }

    if (!r.ok) {
      return json({ ok: false, status: r.status, code: 'RETELL_SEND_FAILED', detail: j }, { status: r.status });
    }

    const reply = j?.messages?.[0]?.content || '';
    return json({ ok: true, reply });
  } catch (err) {
    return json({ ok: false, status: 500, code: 'NETWORK', detail: String(err || '') }, { status: 500 });
  }
}
