/** @type {import('next').NextConfig} */
const nextConfig = {
  // Intentionally do NOT add headers/CSP here.
  // This widget must be embeddable in an <iframe> on external sites.
  // If you later add a CSP, do NOT set X-Frame-Options and ensure
  //   Content-Security-Policy includes: frame-ancestors https://YOUR-SITE ...
  poweredByHeader: false,
};

export default nextConfig;
