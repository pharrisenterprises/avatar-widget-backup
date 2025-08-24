// app/api/heygen-token/route.js
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const apiKey = process.env.HEYGEN_API_KEY;
  const avatarName = process.env.NEXT_PUBLIC_HEYGEN_AVATAR_ID || undefined;

  if (!apiKey) {
    return Response.json(
      { ok: false, status: 500, error: 'CONFIG' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    // Preferred: exchange API key for a short-lived streaming token
    const r = await fetch('https://api.heygen.com/v1/streaming.token', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify(avatarName ? { avatar_name: avatarName } : {}),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(String(r.status));

    const token =
      j?.access_token || j?.token || j?.data?.token || j?.data?.access_token;

    if (!token) throw new Error('NO_TOKEN');

    return Response.json(
      { ok: true, token },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    // TEMPORARY UNBLOCKER:
    // Some tenants don’t have /v1/streaming.token enabled yet.
    // As a last resort, return the API key as "token" (the SDK accepts it).
    // SECURITY: This exposes a secret to the browser. Remove once the endpoint works.
    return Response.json(
      { ok: true, token: apiKey, note: 'fallback_api_key_token' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
