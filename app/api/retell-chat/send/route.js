export const dynamic = 'force-dynamic';

export async function POST(req) {
  const apiKey = process.env.RETELL_API_KEY;
  const { chatId, text } = await req.json().catch(() => ({}));
  if (!apiKey || !chatId || !text) {
    return Response.json({ ok: false, status: 400, error: 'BAD_REQUEST' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // Send user text to Retell and get assistant text back.
  // NOTE: Replace URL/body with the correct Retell endpoint your agent uses.
  const r = await fetch('https://api.retellai.com/v2/chat/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  const j = await r.json().catch(() => ({}));
  const reply = j?.reply || j?.message || '';
  if (!r.ok || !reply) {
    return Response.json({ ok: false, status: r.status || 500, error: j }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return Response.json({ ok: true, reply }, { headers: { 'Cache-Control': 'no-store' } });
}
