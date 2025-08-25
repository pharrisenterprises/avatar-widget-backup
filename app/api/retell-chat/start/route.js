// app/api/retell-chat/start/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function json(data, init = {}) {
  const headers = { 'Cache-Control': 'no-store', ...(init.headers || {}) };
  return Response.json(data, { ...init, headers });
}

export async function GET() {
  const apiKey = process.env.RETELL_API_KEY;
  const agentId = process.env.RETELL_CHAT_AGENT_ID;

  if (!apiKey || !agentId) {
    return json({ ok: false, status: 500, code: 'CONFIG', detail: {
      hasApiKey: !!apiKey, hasAgentId: !!agentId,
      hint: 'Set RETELL_API_KEY and RETELL_CHAT_AGENT_ID in Vercel → Settings → Environment Variables.'
    }}, { status: 500 });
  }

  try {
    // Your previously-working endpoint/shape
    const r = await fetch('https://api.retellai.com/v2/chat/start', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({ agent_id: agentId }),
    });

    let j = {};
    try { j = await r.json(); } catch { j = {}; }

    // If Retell returns non-2xx, surface exactly what came back.
    if (!r.ok) {
      return json({ ok: false, status: r.status, code: 'RETELL_START_FAILED', detail: j }, { status: r.status });
    }

    // Accept a few possible shapes for the id
    const chatId = j?.chat_id || j?.id || j?.chatId || null;
    if (!chatId) {
      return json({ ok: false, status: 502, code: 'NO_CHAT_ID', detail: j }, { status: 502 });
    }

    return json({ ok: true, chatId });
  } catch (err) {
    return json({ ok: false, status: 500, code: 'NETWORK', detail: String(err || '') }, { status: 500 });
  }
}
