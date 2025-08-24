export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = process.env.RETELL_API_KEY;
  const agentId = process.env.RETELL_CHAT_AGENT_ID;
  if (!apiKey || !agentId) {
    return Response.json({ ok: false, status: 500, error: 'CONFIG' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // Create a chat session with your Retell agent.
  // NOTE: Replace the URL/body below with your actual Retell REST call.
  const r = await fetch('https://api.retellai.com/v2/chat/start', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ agent_id: agentId }),
  });

  const j = await r.json().catch(() => ({}));
  const chatId = j?.chat_id || j?.id;
  if (!r.ok || !chatId) {
    return Response.json({ ok: false, status: r.status || 500, error: j }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return Response.json({ ok: true, chatId }, { headers: { 'Cache-Control': 'no-store' } });
}
