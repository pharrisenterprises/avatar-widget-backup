// app/api/retell-chat/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return new Response(
    JSON.stringify({
      ok: true,
      message: 'retell-chat root is live',
      endpoints: [
        '/api/retell-chat/start (GET)',
        '/api/retell-chat/send (POST)'
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
