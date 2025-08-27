// app/lib/loadHeygenSdk.js
// Client-only dynamic import of HeyGen Streaming Avatar SDK,
// with a small compatibility shim so your existing embed page
// (unchanged) works across tenant/SDK variations.

export async function loadHeygenSdk() {
  if (typeof window === 'undefined') return null;

  try {
    const mod = await import('@heygen/streaming-avatar');
    const BaseStreamingAvatar = mod.default || mod.StreamingAvatar;
    const { AvatarQuality, StreamingEvents, TaskType } = mod;

    if (!BaseStreamingAvatar) {
      console.error('[HeyGenShim] StreamingAvatar missing in module', mod);
      return null;
    }

    // Patched class that retries createStartAvatar with common variants
    class PatchedStreamingAvatar extends BaseStreamingAvatar {
      async createStartAvatar(opts = {}) {
        const envName = (typeof process !== 'undefined' &&
                         process?.env?.NEXT_PUBLIC_HEYGEN_AVATAR_ID) || '';
        const name = (opts.avatarName || opts.avatarId || envName || 'default');

        // Normalize options
        const base = {
          language: (opts.language || 'en-US'),      // some tenants reject "en"
          quality:  (opts.quality || AvatarQuality?.Medium || 'medium'),
          welcomeMessage: (opts.welcomeMessage ?? ''),
          disableIdleTimeout: (opts.disableIdleTimeout ?? true),
          ...opts,
        };

        // Attempt 1: avatarName
        try {
          // eslint-disable-next-line no-console
          console.log('[HeyGenShim] start (avatarName)', { name, quality: base.quality, language: base.language });
          return await super.createStartAvatar({
            ...base,
            avatarName: name,
            // ensure we don't pass both name + id
            avatarId: undefined,
          });
        } catch (e1) {
          // eslint-disable-next-line no-console
          console.warn('[HeyGenShim] avatarName failed:', e1?.message || e1);
          // If it wasn't a 400 validation problem, just rethrow
          if (!String(e1?.message || '').includes('400')) throw e1;
        }

        // Attempt 2: avatarId (some tenants/APIs expect this key)
        try {
          // eslint-disable-next-line no-console
          console.log('[HeyGenShim] retry (avatarId)', { id: name, quality: base.quality, language: base.language });
          return await super.createStartAvatar({
            ...base,
            avatarId: name,
            avatarName: undefined,
          });
        } catch (e2) {
          // eslint-disable-next-line no-console
          console.warn('[HeyGenShim] avatarId failed:', e2?.message || e2);
          if (!String(e2?.message || '').includes('400')) throw e2;
        }

        // Attempt 3: fallback to a universally-available default + medium quality
        try {
          // eslint-disable-next-line no-console
          console.log('[HeyGenShim] fallback (default avatar, medium)');
          return await super.createStartAvatar({
            ...base,
            avatarName: 'default',
            avatarId: undefined,
            quality: AvatarQuality?.Medium || 'medium',
          });
        } catch (e3) {
          // final failure — surface the 400 so you can see it in logs
          // eslint-disable-next-line no-console
          console.error('[HeyGenShim] fallback failed:', e3?.message || e3);
          throw e3;
        }
      }
    }

    return {
      StreamingAvatar: PatchedStreamingAvatar,
      AvatarQuality,
      StreamingEvents,
      TaskType,
    };
  } catch (e) {
    console.error('loadHeygenSdk failed:', e);
    return null;
  }
}
