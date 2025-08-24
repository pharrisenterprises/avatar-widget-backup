// app/api/retell-chat/start/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const apiKey =
      process.env.RETELL_API_KEY ||
      process.env.NEXT_PUBLIC_RETELL_API_KEY ||
      '';
    const agentId =
      process.env.RETELL_CHAT_AGENT_ID ||
      process.env.RETELL_AGENT_ID ||
      process.env.NEXT_PUBLIC_RETELL_AGENT_ID ||
      '';

    if (!apiKey || !agentId) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Missing RETELL_API_KEY or RETELL_CHAT_AGENT_ID',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Correct Chat endpoint (no /v2 prefix)
    const r = await fetch('https://api.retellai.com/create-chat', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ agent_id: agentId }),
      cache: 'no-store',
    });

    const text = await r.text();
    let j = {};
    try { j = text ? JSON.parse(text) : {}; } catch {}

    if (!r.ok) {
      return new Response(
        JSON.stringify({ ok: false, status: r.status, body: j }),
        { status: r.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const chatId =
      j?.chat_id || j?.id || j?.data?.chat_id || j?.data?.id || null;

    return new Response(
      JSON.stringify({ ok: true, chatId, raw: j }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || 'start failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
