// app/lib/loadHeygenSdk.js
// Client-only dynamic import of HeyGen Streaming Avatar SDK.
export async function loadHeygenSdk() {
  if (typeof window === 'undefined') return null;
  try {
    const mod = await import('@heygen/streaming-avatar');
    const StreamingAvatar = mod.default || mod.StreamingAvatar;
    const { AvatarQuality, StreamingEvents, TaskType } = mod;
    return { StreamingAvatar, AvatarQuality, StreamingEvents, TaskType };
  } catch (e) {
    console.error('loadHeygenSdk failed:', e);
    return null;
  }
}
