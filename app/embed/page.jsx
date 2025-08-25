'use client';

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { loadHeygenSdk } from '../lib/loadHeygenSdk';

const LS_CHAT_KEY = 'retell_chat_id';

// Reconnect schedule: try fast, then back off a bit
const RECONNECT_MS = [1500, 2500, 4000, 6000, 8000];

function PageInner() {
  const sp = useSearchParams();
  const autostart = useMemo(() => (sp?.get('autostart') ?? '1') === '1', [sp]);
  const compact = useMemo(() => sp?.get('layout') === 'compact', [sp]);
  const videoFirst = useMemo(() => sp?.get('videoFirst') === '1', [sp]);

  // ---- element refs
  const shellRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);     // freeze frame canvas during reconnect
  const avatarRef = useRef(null);     // HeyGen StreamingAvatar
  const reconnectIdxRef = useRef(0);
  const reconnectTRef = useRef(null);
  const keepTryingRef = useRef(true);

  // ---- state
  const [status, setStatus] = useState('idle'); // idle | connecting | ready | error | reconnecting
  const [error, setError] = useState('');
  const [chatId, setChatId] = useState('');
  const [messages, setMessages] = useState([]); // {role, text}
  const [input, setInput] = useState('');
  const [speakerMuted, setSpeakerMuted] = useState(false);

  // env
  const avatarName = process.env.NEXT_PUBLIC_HEYGEN_AVATAR_ID || '';

  // util
  const push = useCallback((role, text) => {
    setMessages((p) => [...p, { role, text }]);
  }, []);

  const scrollChatToBottom = useCallback(() => {
    const scroller = document.getElementById('chat-scroll');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, []);
  useEffect(() => {
    scrollChatToBottom();
  }, [messages, scrollChatToBottom]);

  // ---- Retell helpers
  const ensureChat = useCallback(async () => {
    if (chatId) return chatId;
    try {
      const s = window.localStorage.getItem(LS_CHAT_KEY);
      if (s) {
        setChatId(s);
        return s;
      }
    } catch {}
    const r = await fetch('/api/retell-chat/start', { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok || !j?.chatId) {
      const code = j?.code || 'RETELL_START_FAILED';
      const msg = typeof j?.detail === 'string' ? j.detail : '';
      throw new Error(code + (msg ? `: ${msg}` : ''));
    }
    setChatId(j.chatId);
    try { window.localStorage.setItem(LS_CHAT_KEY, j.chatId); } catch {}
    return j.chatId;
  }, [chatId]);

  const send = useCallback(async (id, text) => {
    const r = await fetch('/api/retell-chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ chatId: id, text }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) {
      const err = new Error('SEND_FAILED');
      err.status = r.status;
      throw err;
    }
    return j.reply || '';
  }, []);

  // ---- freeze frame helpers
  const showFreezeFrame = useCallback(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;

    const w = v.videoWidth || v.clientWidth || 640;
    const h = v.videoHeight || v.clientHeight || 360;
    c.width = w;
    c.height = h;

    try {
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.drawImage(v, 0, 0, w, h);
        c.style.opacity = '1';
        c.style.visibility = 'visible';
      }
    } catch {}
  }, []);

  const hideFreezeFrame = useCallback(() => {
    const c = canvasRef.current;
    if (c) {
      c.style.opacity = '0';
      c.style.visibility = 'hidden';
    }
  }, []);

  // ---- HeyGen: stop & reconnect loop
  const clearReconnectTimer = useCallback(() => {
    clearTimeout(reconnectTRef.current);
    reconnectTRef.current = null;
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!keepTryingRef.current) return;
    const delay = RECONNECT_MS[Math.min(reconnectIdxRef.current, RECONNECT_MS.length - 1)];
    reconnectIdxRef.current += 1;
    setStatus('reconnecting');
    showFreezeFrame();
    clearReconnectTimer();
    reconnectTRef.current = setTimeout(async () => {
      try {
        await begin(true); // soft begin (don’t clear UI)
      } catch {
        scheduleReconnect();
      }
    }, delay);
  }, [begin, clearReconnectTimer, showFreezeFrame]);

  // ---- HeyGen: begin
  const begin = useCallback(async (soft = false) => {
    setError('');
    setStatus(soft ? 'reconnecting' : 'connecting');

    // Token
    const tr = await fetch('/api/heygen-token', { cache: 'no-store' });
    const tj = await tr.json().catch(() => ({}));
    const token = tj?.token || tj?.data?.token || tj?.accessToken || '';
    if (!token) throw new Error('TOKEN');

    const sdk = await loadHeygenSdk();
    if (!sdk?.StreamingAvatar) throw new Error('SDK');
    const { StreamingAvatar, StreamingEvents, AvatarQuality, TaskType } = sdk;

    // Clean any prior instance without blanking the video (we’ll freeze frame)
    try { await avatarRef.current?.stopAvatar?.(); } catch {}
    avatarRef.current = null;

    const avatar = new StreamingAvatar({ token, debug: false });
    avatarRef.current = avatar;

    avatar.on(StreamingEvents.STREAM_READY, (evt) => {
      const stream = evt?.detail;
      const v = videoRef.current;
      if (v && stream instanceof MediaStream) {
        v.srcObject = stream;
        v.muted = speakerMuted; // reflect current state
        v.onloadedmetadata = () => {
          v.play().catch(() => {});
          hideFreezeFrame();
          setStatus('ready');
          reconnectIdxRef.current = 0;
        };
      }
    });

    avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
      // keep last frame visible and try to come back
      scheduleReconnect();
    });

    const quality = AvatarQuality?.Medium || 'medium';
    await avatar.createStartAvatar({
      avatarName,
      quality,
      welcomeMessage: '',
    });

    // Speak helper (REPEAT exact captions)
    async function speak(text) {
      if (!text) return;
      const payload = TaskType
        ? { text, taskType: TaskType.REPEAT }
        : { text, taskType: 'REPEAT' };
      try { await avatar.speak(payload); } catch {}
    }
    // expose for local testing
    window.__avatarSpeak = speak;
  }, [avatarName, hideFreezeFrame, scheduleReconnect, speakerMuted]);

  // ---- mic permission (show native prompt once)
  const ensureMicPermission = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch {
      // user may decline; avatar still works with text, audio may be muted by browser
    }
  }, []);

  // ---- submit
  const onSubmit = useCallback(async (e) => {
    e?.preventDefault?.();
    const text = (input || '').trim();
    if (!text) return;
    setInput('');
    push('user', text);
    try {
      const id = await ensureChat();
      const reply = await send(id, text);
      push('assistant', reply);
      try { await window.__avatarSpeak?.(reply); } catch {}
    } catch (err) {
      push('system', `Message failed${err?.status ? ` (${err.status})` : ''}. Please try again.`);
    }
  }, [input, ensureChat, send, push]);

  // ---- lifecycle: autostart + teardown
  useEffect(() => {
    keepTryingRef.current = true;
    (async () => {
      // restore chat id if present
      try {
        const s = window.localStorage.getItem(LS_CHAT_KEY);
        if (s) setChatId(s);
      } catch {}
      if (!autostart) return;
      await ensureMicPermission();
      try {
        await begin();
        await ensureChat();
      } catch (e) {
        setError(e?.message || 'Startup error');
        setStatus('error');
      }
    })();
    return () => {
      keepTryingRef.current = false;
      clearTimeout(reconnectTRef.current);
      try { avatarRef.current?.stopAvatar?.(); } catch {}
    };
  }, [autostart, begin, ensureChat, ensureMicPermission]);

  // ---- controls
  const toggleSpeaker = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !speakerMuted;
    setSpeakerMuted(next);
    try {
      v.muted = next;
      await v.play().catch(() => {});
    } catch {}
  }, [speakerMuted]);

  const restart = useCallback(async () => {
    clearTimeout(reconnectTRef.current);
    reconnectIdxRef.current = 0;
    showFreezeFrame();
    try {
      await begin(true);
    } catch {
      scheduleReconnect();
    }
  }, [begin, scheduleReconnect, showFreezeFrame]);

  const fullscreen = useCallback(async () => {
    const el = shellRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {}
  }, []);

  // ---- classes for requested layout hint
  const rootClass = [
    'avatar-shell',
    compact ? 'layout-compact' : '',
    videoFirst ? 'video-first' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={shellRef}
      className={rootClass}
      style={{
        width: 'min(980px, 96vw)',
        height: 'min(720px, 86vh)',
        display: 'grid',
        gridTemplateRows: '1fr 1fr', // 50/50 split
        gap: 12,
        padding: 12,
        boxSizing: 'border-box',
      }}
    >
      {/* VIDEO AREA */}
      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
        {/* controls (top-left) */}
        <div style={{
          position: 'absolute', top: 10, left: 10, display: 'flex', gap: 8, zIndex: 3,
          background: 'rgba(15,18,32,.55)', padding: '6px 8px', borderRadius: 10, backdropFilter: 'blur(4px)'
        }}>
          {/* mic badge (visual only; permission happens automatically) */}
          <button title="Microphone allowed" style={iconBtnStyle} aria-label="Mic">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v4a3 3 0 0 0 3 3Z" stroke="#fff" strokeWidth="2"/><path d="M5 11a7 7 0 0 0 14 0" stroke="#fff" strokeWidth="2"/></svg>
          </button>
          {/* speaker mute/unmute */}
          <button onClick={toggleSpeaker} title={speakerMuted ? 'Unmute speaker' : 'Mute speaker'} style={iconBtnStyle} aria-label="Speaker">
            {speakerMuted ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 9v6h4l5 4V5L8 9H4Z" stroke="#fff" strokeWidth="2"/><path d="m19 5-14 14" stroke="#fff" strokeWidth="2"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 9v6h4l5 4V5L8 9H4Z" stroke="#fff" strokeWidth="2"/><path d="M16 7a5 5 0 0 1 0 10" stroke="#fff" strokeWidth="2"/></svg>
            )}
          </button>
          {/* restart */}
          <button onClick={restart} title="Restart session" style={iconBtnStyle} aria-label="Restart">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 12a9 9 0 1 0 3-6.7" stroke="#fff" strokeWidth="2"/><path d="M3 5v4h4" stroke="#fff" strokeWidth="2"/></svg>
          </button>
          {/* fullscreen */}
          <button onClick={fullscreen} title="Fullscreen" style={iconBtnStyle} aria-label="Fullscreen">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="#fff" strokeWidth="2"/></svg>
          </button>
        </div>

        {/* freeze frame canvas (under controls, over video while reconnecting) */}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transition: 'opacity .2s',
            opacity: 0,
            visibility: 'hidden',
            zIndex: 1,
          }}
        />

        {/* live video */}
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted={speakerMuted}
          className="avatar-video"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />

        {/* status badge (no blackout) */}
        {status !== 'ready' && (
          <div style={{
            position: 'absolute', right: 10, top: 10, zIndex: 3,
            background: 'rgba(0,0,0,.5)', color: '#fff', padding: '6px 10px',
            borderRadius: 10, fontWeight: 700
          }}>
            {status === 'connecting' ? 'Connecting…' :
             status === 'reconnecting' ? 'Reconnecting…' :
             status === 'error' ? 'Error' : 'Idle'}
          </div>
        )}
      </div>

      {/* CHAT AREA */}
      <div style={{
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid #1f2430',
        background: '#0f1220',
        color: '#e9ecf1',
        display: 'grid',
        gridTemplateRows: '1fr auto',
        minHeight: 180
      }}>
        <div id="chat-scroll" style={{ padding: '10px 12px', overflowY: 'auto', fontSize: 14 }}>
          {messages.length === 0 ? (
            <div style={{ opacity: .75 }}>
              Talk to the agent — we’re listening. You can also type below.
            </div>
          ) : messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{
                fontWeight: 700, fontSize: 12,
                color: m.role === 'user' ? '#60a5fa'
                    : m.role === 'assistant' ? '#34d399'
                    : '#e879f9'
              }}>
                {m.role === 'assistant' ? 'Assistant'
                  : m.role === 'system' ? 'System'
                  : 'User'}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
            </div>
          ))}
        </div>

        <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid #1f2430' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message…"
            style={{
              flex: 1, borderRadius: 10, border: '1px solid #2a3142',
              background: '#12172a', color: '#e9ecf1', padding: '10px 12px', outline: 'none'
            }}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            style={{
              padding: '10px 14px', borderRadius: 10, border: '1px solid #2563eb',
              background: '#2563eb', color: '#fff', fontWeight: 700,
              cursor: input.trim() ? 'pointer' : 'default'
            }}
          >Send</button>
        </form>
      </div>

      {/* error toast */}
      {error && (
        <div style={{
          position: 'absolute', left: 16, right: 16, bottom: 16,
          background: '#2a1215', border: '1px solid #5c1a1e',
          color: '#ffd4d6', borderRadius: 10, padding: '8px 10px', fontSize: 12
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

// tiny style object for overlay buttons
const iconBtnStyle = {
  width: 32,
  height: 32,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 8,
  background: 'transparent',
  border: '1px solid rgba(255,255,255,.2)',
  color: '#fff',
  cursor: 'pointer'
};

export default function EmbedPage() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
      <PageInner />
    </Suspense>
  );
}
