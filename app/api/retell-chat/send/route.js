// app/api/retell-chat/send/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

// If start used a local dev id, this echoes back for testing.
function isLocalChatId(id) {
  return typeof id === 'string' && id.startsWith('local-');
}

export async function POST(req) {
  const apiKey = process.env.RETELL_API_KEY || '';

  let body = {};
  try { body = await req.json(); } catch {}
  const { chatId, text } = body || {};

  if (!chatId || !text) {
    return Response.json(
      { ok: false, status: 400, error: 'BAD_REQUEST' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Dev echo path when using local chat ids
  if (isLocalChatId(chatId) || !apiKey) {
    const reply = `Echo: ${text}`;
    return Response.json(
      { ok: true, reply, dev: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const r = await fetch(
      `https://api.retellai.com/v2/chat/${encodeURIComponent(chatId)}/send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
        cache: 'no-store',
      },
    );

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return Response.json(
        { ok: false, status: r.status, error: j },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const reply = j?.reply ?? j?.message ?? j?.text ?? '';
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
