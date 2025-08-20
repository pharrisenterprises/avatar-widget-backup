// Minimal, bullet-proof helper that always returns 200.
// It does NOT fetch from the server. It returns a small bootstrap that
// loads the SDK from CDNs in the browser. This avoids 5xx from your server.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOURCES = [
  'https://cdn.jsdelivr.net/npm/@heygen/streaming-avatar@2.0.16/dist/index.umd.js',
  'https://unpkg.com/@heygen/streaming-avatar@2.0.16/dist/index.umd.js',
  'https://ga.jspm.io/npm:@heygen/streaming-avatar@2.0.16/dist/index.umd.js',
];

export async function GET() {
  const bootstrap = `
    (function(){
      var sources = ${JSON.stringify(SOURCES)};
      function load(src){
        return new Promise(function(res, rej){
          var s = document.createElement('script');
          s.src = src; s.async = true;
          s.onload = function(){ res(src); };
          s.onerror = function(){ rej(new Error('script failed: '+src)); };
          document.head.appendChild(s);
        });
      }
      (async function(){
        for (var i=0;i<sources.length;i++){
          try {
            await load(sources[i]);
            if (window.HeyGenStreamingAvatar ||
                window.StreamingAvatar ||
                (window.HeyGen && window.HeyGen.StreamingAvatar) ||
                window.default) {
              console.log('[heygen-proxy] SDK loaded from', sources[i]);
              return;
            }
          } catch (e) {}
        }
        console.error('[heygen-proxy] all CDN sources failed');
      })();
    })();
  `;
  return new Response(bootstrap, {
    status: 200,
    headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
  });
}
