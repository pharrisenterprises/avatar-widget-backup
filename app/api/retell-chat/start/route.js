// app/api/retell-chat/start/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const apiKey = process.env.RETELL_API_KEY;
  const agentId = process.env.RETELL_CHAT_AGENT_ID;

  if (!apiKey || !agentId) {
    return Response.json(
      { ok: false, code: 'CONFIG', status: 500 },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    // Correct Retell endpoint for starting a chat
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
        { ok: false, code: 'RETELL_START_FAILED', status: r.status, detail: j },
        { status: r.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const chatId = j?.chat_id;
    if (!chatId) {
      return Response.json(
        { ok: false, code: 'NO_CHAT_ID', status: 502, detail: j },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return Response.json(
      { ok: true, chatId },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return Response.json(
      { ok: false, code: 'NETWORK', status: 500, detail: String(err?.message || err) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

