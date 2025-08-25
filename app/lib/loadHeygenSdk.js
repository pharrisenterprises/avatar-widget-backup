// app/lib/loadHeygenSdk.js
// Client-only, tolerant loader for @heygen/streaming-avatar across export shapes.
export async function loadHeygenSdk() {
  if (typeof window === 'undefined') return null;
  try {
    const mod = await import('@heygen/streaming-avatar');

    // The package has shipped with different export shapes:
    // - default is the class
    // - default is an object that contains StreamingAvatar
    // - named export StreamingAvatar
    let StreamingAvatar =
      (typeof mod?.default === 'function' ? mod.default : null) ||
      (mod?.default && mod.default.StreamingAvatar) ||
      mod?.StreamingAvatar;

    const AvatarQuality =
      mod?.AvatarQuality || mod?.default?.AvatarQuality || { Low:'low', Medium:'medium', High:'high' };

    const StreamingEvents =
      mod?.StreamingEvents || mod?.default?.StreamingEvents || {
        STREAM_READY: 'stream-ready',
        STREAM_DISCONNECTED: 'stream-disconnected',
        ERROR: 'error',
      };

    const TaskType = mod?.TaskType || mod?.default?.TaskType;

    if (!StreamingAvatar) {
      console.error('[loadHeygenSdk] Could not resolve StreamingAvatar from module keys:', Object.keys(mod || {}));
      return null;
    }
    return { StreamingAvatar, AvatarQuality, StreamingEvents, TaskType };
  } catch (e) {
    console.error('loadHeygenSdk failed:', e);
    return null;
  }
}
