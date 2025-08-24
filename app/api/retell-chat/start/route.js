// app/api/retell-chat/start/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const apiKey = process.env.RETELL_API_KEY;
  const agentId = process.env.RETELL_CHAT_AGENT_ID;

  if (!apiKey || !agentId) {
    return Response.json(
      { ok: false, status: 500, error: 'CONFIG' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const r = await fetch('https://api.retellai.com/create-chat', {
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
      return Response.json(
        { ok: false, status: r.status, error: j },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const chatId = j?.chat_id || j?.id;
    if (!chatId) {
      return Response.json(
        { ok: false, status: 502, error: 'NO_CHAT_ID' },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return Response.json(
      { ok: true, chatId },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return Response.json(
      { ok: false, status: 500, error: 'NETWORK' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
