/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No custom headers or CSP. You've had issues with them; keep it clean.
  // If you ever reintroduce CSP later, do it carefully and only after QA.
};

export default nextConfig;
