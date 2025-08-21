/** @type {import('next').NextConfig} */

// Base CSP directives (without frame-ancestors; we append per route)
const BASE_CSP_DIRECTIVES = [
  "default-src 'self'",
  // Inline/eval are needed because Next and many SDKs rely on them for client bundles
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://ga.jspm.io https://esm.sh data:",
  // Make sure ALL real-time endpoints are allowed (https + wss)
  "connect-src 'self' https://api.heygen.com https://api.retellai.com https://*.livekit.cloud https://*.heygen.com https://*.heygen.io https://*.retellai.com wss://*.livekit.cloud wss://*.heygen.com wss://*.heygen.io wss://*.retellai.com",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "media-src 'self' blob: data:"
];

// WordPress domains allowed to frame ONLY /embed
const ALLOWED_ANCESTORS_EMBED = [
  "'self'",
  "https://pharrisenterprises-qjmtx.wpcomstaging.com",
  "https://*.wpcomstaging.com",
  "https://*.wordpress.com",
  "https://*.wp.com",
  "https://infinitysales.ai",
  "https://*.infinitysales.ai"
].join(' ');

// Final CSP strings
const CSP_FOR_EMBED = [...BASE_CSP_DIRECTIVES, `frame-ancestors ${ALLOWED_ANCESTORS_EMBED}`].join('; ');
const CSP_FOR_OTHERS = [...BASE_CSP_DIRECTIVES, "frame-ancestors 'self'"].join('; ');

const nextConfig = {
  async headers() {
    return [
      // Allow embedding ONLY for /embed (and children)
      {
        source: '/embed(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: CSP_FOR_EMBED },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' }
        ]
      },
      // Everywhere else, deny embedding (self only).
      // Use negative lookahead so /embed doesn't receive two CSP headers.
      {
        source: '/((?!embed).*)',
        headers: [
          { key: 'Content-Security-Policy', value: CSP_FOR_OTHERS },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' }
        ]
      }
    ];
  }
};

export default nextConfig;
