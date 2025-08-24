// app/api/retell-chat/send/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req) {
  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) {
    return Response.json(
      { ok: false, status: 500, error: 'CONFIG' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const { chatId, text } = (await req.json().catch(() => ({}))) || {};
  if (!chatId || !text) {
    return Response.json(
      { ok: false, status: 400, error: 'BAD_REQUEST' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    // NOTE: Keep your original endpoint/shape if different.
    const r = await fetch('https://api.retellai.com/v2/chat/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return Response.json(
        { ok: false, status: r.status, error: j },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const reply = j?.reply || j?.message || j?.text || '';
    if (!reply) {
      return Response.json(
        { ok: false, status: 502, error: 'NO_REPLY' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return Response.json(
      { ok: true, reply },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { ok: false, status: 500, error: 'NETWORK' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
