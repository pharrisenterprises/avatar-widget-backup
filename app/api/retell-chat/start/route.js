// app/api/retell-chat/start/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const apiKey = process.env.RETELL_API_KEY;
  const agentId = process.env.RETELL_CHAT_AGENT_ID;

  const noStore = { headers: { 'Cache-Control': 'no-store' } };

  if (!apiKey || !agentId) {
    return Response.json(
      { ok: false, status: 500, error: 'CONFIG', detail: 'Missing RETELL_API_KEY or RETELL_CHAT_AGENT_ID' },
      noStore
    );
  }

  try {
    // Primary (v2) start
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
      // Return what Retell actually said so the frontend shows a useful error
      return Response.json(
        { ok: false, status: r.status, error: 'RETELL_START_FAILED', detail: j },
        noStore
      );
    }

    const chatId = j?.chat_id || j?.id;
    if (!chatId) {
      return Response.json(
        { ok: false, status: 502, error: 'NO_CHAT_ID', detail: j },
        noStore
      );
    }

    return Response.json({ ok: true, chatId }, noStore);
  } catch (err) {
    return Response.json(
      { ok: false, status: 500, error: 'NETWORK', detail: (err && err.message) || 'Request failed' },
      noStore
    );
  }
}
