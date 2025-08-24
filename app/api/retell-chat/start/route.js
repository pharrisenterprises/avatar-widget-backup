// app/api/retell-chat/start/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

// DEV helper: flip to true to force a local chat id (no Retell call).
// Use only to unblock front-end while configuring env vars.
const DEV_FORCE_LOCAL_CHAT = false;

export async function GET() {
  const apiKey  = process.env.RETELL_API_KEY || '';
  const agentId = process.env.RETELL_CHAT_AGENT_ID || '';

  if (DEV_FORCE_LOCAL_CHAT) {
    return Response.json(
      { ok: true, chatId: `local-${Date.now()}`, dev: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (!apiKey || !agentId) {
    return Response.json(
      { ok: false, status: 500, error: 'CONFIG:RETELL_API_KEY_OR_AGENT_ID' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const r = await fetch('https://api.retellai.com/v2/chat/start', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ agent_id: agentId }),
      cache: 'no-store',
    });

    const j = await r.json().catch(() => ({}));

    if (r.ok) {
      const chatId = j?.chat_id || j?.id;
      if (chatId) {
        return Response.json(
          { ok: true, chatId },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
    }

    // If the shape or endpoint differs for your account, surface detail to inspect quickly
    return Response.json(
      { ok: false, status: r.status, error: j || 'UNEXPECTED_START_RESPONSE' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return Response.json(
      { ok: false, status: 500, error: 'NETWORK' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
