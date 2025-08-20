export const dynamic = 'force-dynamic';

export async function GET() {
  const env = {
    HAS_RETELL_API_KEY: !!(process.env.RETELL_API_KEY || process.env.NEXT_PUBLIC_RETELL_API_KEY),
    HAS_RETELL_CHAT_AGENT_ID: !!(process.env.RETELL_CHAT_AGENT_ID || process.env.RETELL_AGENT_ID || process.env.NEXT_PUBLIC_RETELL_AGENT_ID),
    HAS_HEYGEN_API_KEY: !!process.env.HEYGEN_API_KEY,
    HAS_PUBLIC_AVATAR: !!process.env.NEXT_PUBLIC_HEYGEN_AVATAR_ID,
  };
  return Response.json({ ok: true, env, now: new Date().toISOString() });
}
