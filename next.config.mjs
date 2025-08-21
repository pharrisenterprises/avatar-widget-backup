/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://ga.jspm.io https://esm.sh data:",
              // include both https and wss for LiveKit/HeyGen/Retell
              "connect-src 'self' https://api.heygen.com https://api.retellai.com https://*.livekit.cloud https://*.heygen.com https://*.retellai.com wss://*.livekit.cloud wss://*.heygen.com wss://*.retellai.com",
              "img-src 'self' data: blob:",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              "media-src 'self' blob: data:",
              "frame-ancestors 'self'",
            ].join('; ')
          }
        ]
      }
    ];
  }
};

export default nextConfig;
