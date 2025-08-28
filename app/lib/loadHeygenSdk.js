// app/lib/loadHeygenSdk.js
// Client-only dynamic import of HeyGen Streaming Avatar SDK + tiny start shim.
// Works with @heygen/streaming-avatar 2.x line.

export async function loadHeygenSdk() {
  if (typeof window === 'undefined') return null;

  try {
    const mod = await import('@heygen/streaming-avatar');
    const StreamingAvatar = mod.default || mod.StreamingAvatar;
    const { AvatarQuality, StreamingEvents, TaskType } = mod;

    // --- Patch createStartAvatar to try avatarId/avatarName & add long idle timeout ---
    if (StreamingAvatar && !StreamingAvatar.__patchedByInfinity) {
      const _orig = StreamingAvatar.prototype.createStartAvatar;

      StreamingAvatar.prototype.createStartAvatar = async function (opts = {}) {
        // pull the env (baked at build)
        const envName = process.env.NEXT_PUBLIC_HEYGEN_AVATAR_ID || process.env.HEYGEN_AVATAR_ID || '';
        const envId = envName; // your env holds the "Dexter_..._public" id

        // base options the server likes
        const base = {
          quality: (mod.AvatarQuality?.High || 'high'),
          language: 'en',
          // keep session alive longer (seconds). Docs allow 30–3600.
          activityIdleTimeout: 1800,
          welcomeMessage: '',
        };

        // ORDERS we try (cover both API shapes without touching your embed code):
        //  A) avatarId (public ID)  -> preferred for /v1/streaming.new
        //  B) avatarName (same value) -> some SDK versions map this internally
        //  C) default fallback (lets us see if token/plan is the issue)
        const attempts = [
          { label: 'avatarId',    payload: { ...base, ...(envId ? { avatarId: envId } : {}) } },
          { label: 'avatarName',  payload: { ...base, ...(envName ? { avatarName: envName } : {}) } },
          { label: 'default',     payload: { ...base, avatarName: 'default' } },
        ];

        let lastErr = null;
        for (const a of attempts) {
          try {
            // eslint-disable-next-line no-console
            console.log('[HeyGen patched] start (%s)', a.label, { avatarId: a.payload.avatarId, avatarName: a.payload.avatarName });
            const res = await _orig.call(this, a.payload);
            return res;
          } catch (e) {
            lastErr = e;
            // eslint-disable-next-line no-console
            console.warn('[HeyGen patched] start failed (%s): %s', a.label, e?.message || e);
          }
        }

        // everything failed – surface a clearer error for the UI
        const code = (lastErr && (lastErr.status || lastErr.code)) || 400;
        throw new Error(`API request failed while starting avatar (${code}). Check avatar id/name, plan, or token.`);
      };

      StreamingAvatar.__patchedByInfinity = true;
    }

    return { StreamingAvatar, AvatarQuality, StreamingEvents, TaskType };
  } catch (e) {
    console.error('loadHeygenSdk failed:', e);
    return null;
  }
}
