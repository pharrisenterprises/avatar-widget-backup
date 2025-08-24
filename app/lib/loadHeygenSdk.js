// app/lib/loadHeygenSdk.js
export async function loadHeygenSdk() {
  if (typeof window === 'undefined') return null;
  if (window.__heygenSdk) return window.__heygenSdk;
  // ESM dynamic import (works in Next 15 client components)
  const mod = await import('@heygen/streaming-avatar');
  window.__heygenSdk = mod;
  return mod;
}
