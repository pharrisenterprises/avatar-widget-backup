// app/lib/loadHeygenSdk.js
// Client-only dynamic import of HeyGen Streaming Avatar SDK, with a compatibility
// wrapper so your existing embed/page.jsx can stay unchanged.
//
// What this does:
// - Keeps your payload as-is first (avatarName)
// - If the API returns 400, it retries with avatarId
// - If that still fails, retries with avatarName: "default" (medium quality)
// - Normalizes language "en" -> "en-US"
// - Disables HeyGen's idle timeout by default (keeps stream alive longer)

export async function loadHeygenSdk() {
  if (typeof window === 'undefined') return null;
  try {
    const mod = await import('@heygen/streaming-avatar');
    const Base = mod.default || mod.StreamingAvatar;
    if (!Base) return null;

    class PatchedStreamingAvatar extends Base {
      async createStartAvatar(payload = {}) {
        // 0) Normalize a few things
        const p0 = { ...payload };
        if (p0.language && String(p0.language).toLowerCase() === 'en') {
          p0.language = 'en-US';
        }
        if (p0.avatar_name && !p0.avatarName) {
          p0.avatarName = p0.avatar_name;
          delete p0.avatar_name;
        }
        if (typeof p0.disableIdleTimeout === 'undefined') {
          p0.disableIdleTimeout = true;
        }

        // 1) Try as-is (avatarName)
        try {
          console.log('[HeyGen patched] start (avatarName):', p0.avatarName || p0.avatarId || '(none)');
          return await super.createStartAvatar(p0);
        } catch (e1) {
          console.warn('[HeyGen patched] start failed with avatarName; retry avatarId:', e1?.message || e1);
        }

        // 2) Retry using avatarId (some tenants expect this)
        try {
          const name = p0.avatarName || p0.avatarId;
          const p1 = { ...p0, avatarId: name };
          delete p1.avatarName;
          console.log('[HeyGen patched] start (avatarId):', p1.avatarId);
          return await super.createStartAvatar(p1);
        } catch (e2) {
          console.warn('[HeyGen patched] start failed with avatarId; retry default/medium:', e2?.message || e2);
        }

        // 3) Final fallback to a safe default avatar (medium quality)
        const p2 = { ...p0, avatarName: 'default' };
        delete p2.avatarId;
        if (mod.AvatarQuality) p2.quality = mod.AvatarQuality.Medium || 'medium';
        console.log('[HeyGen patched] start (fallback "default")');
        return await super.createStartAvatar(p2);
      }
    }

    return {
      StreamingAvatar: PatchedStreamingAvatar,
      AvatarQuality: mod.AvatarQuality,
      StreamingEvents: mod.StreamingEvents,
      TaskType: mod.TaskType,
    };
  } catch (e) {
    console.error('loadHeygenSdk failed:', e);
    return null;
  }
}
