// Works in all modern browsers, caches the module globally
export async function loadHeygenSdk() {
  if (typeof window === 'undefined') return {};
  if (window.__heygenSdk) return window.__heygenSdk;
  const mod = await import('@heygen/streaming-avatar');
  window.__heygenSdk = mod;
  return mod;
}
