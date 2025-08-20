export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const apiKey = process.env.RETELL_API_KEY || '';
    if (!apiKey) {
      return Response.json({ ok: false, error: 'Missing RETELL_API_KEY' }, { status: 500 });
    }

    const r = await fetch('https://api.retellai.com/list-agents', {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return Response.json({ ok: false, status: r.status, body: j }, { status: r.status });
    }

    // Return a compact list with name + agent_id
    const list = (Array.isArray(j) ? j : []).map(a => ({
      agent_name: a.agent_name,
      agent_id: a.agent_id, // <- this is the value create-chat expects
      version: a.version,
    }));

    return Response.json({ ok: true, count: list.length, agents: list });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || 'list failed' }, { status: 500 });
  }
}
