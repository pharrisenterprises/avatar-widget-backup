// app/embed/page.jsx
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

function PageInner() {
  const sp = useSearchParams();
  const autostart = useMemo(() => (sp?.get('autostart') ?? '1') === '1', [sp]);
  const qualityParam = (sp?.get('q') || '').toLowerCase();

  // ---- Refs / state ----
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const avatarRef = useRef(null);

  const [status, setStatus] = useState('idle'); // idle | connecting | ready | error
  const [error, setError] = useState('');
  const [chatId, setChatId] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(true); // required for autoplay; we unmute on gesture

  const scrollPinRef = useRef(null); // auto-scroll anchor

  const avatarName = process.env.NEXT_PUBLIC_HEYGEN_AVATAR_ID || '';

  const push = useCallback((role, text) => {
    setMessages((p) => [...p, { role, text }]);
  }, []);

  // ---- Retell helpers ----
  const ensureChat = useCallback(async () => {
    if (chatId) return chatId;

    // resume if present
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
      throw new Error('CHAT_START_FAILED');
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

  // ---- HeyGen helpers ----
  const stopAvatar = useCallback(async () => {
    try {
      const a = avatarRef.current;
      if (a?.stopAvatar) await a.stopAvatar();
    } catch {}
    avatarRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus('idle');
  }, []);

  const begin = useCallback(async () => {
    setStatus('connecting');
    setError('');

    // 1) token
    const tr = await fetch('/api/heygen-token', { cache: 'no-store' });
    const tj = await tr.json().catch(() => ({}));
    const token = tj?.token || tj?.data?.token || tj?.accessToken || '';
    if (!token) throw new Error('TOKEN_MISSING');

    // 2) SDK
    const sdk = await loadHeygenSdk();
    if (!sdk?.StreamingAvatar) throw new Error('SDK_MISSING');
    const { StreamingAvatar, StreamingEvents, AvatarQuality, TaskType } = sdk;

    // 3) start
    const avatar = new StreamingAvatar({ token, debug: false });
    avatarRef.current = avatar;

    avatar.on(StreamingEvents.STREAM_READY, (evt) => {
      const stream = evt?.detail;
      if (videoRef.current && stream instanceof MediaStream) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = isMuted; // muted until user gesture
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch(() => {});
          setStatus('ready');
        };
      }
    });

    avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
      if (videoRef.current) videoRef.current.srcObject = null;
      setStatus('idle');
    });

    const quality =
      qualityParam.startsWith('l') ? (AvatarQuality?.Low || 'low') :
      qualityParam.startsWith('h') ? (AvatarQuality?.High || 'high') :
                                     (AvatarQuality?.Medium || 'medium');

    await avatar.createStartAvatar({
      avatarName,
      quality,
      welcomeMessage: '',
    });

    // expose speak helper
    async function speak(text) {
      if (!text) return;
      const payload = TaskType
        ? { text, taskType: TaskType.REPEAT }
        : { text, taskType: 'REPEAT' };
      try { await avatar.speak(payload); } catch {}
    }
    window.__avatarSpeak = speak;
  }, [avatarName, isMuted, qualityParam]);

  // ---- Submit ----
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
      push(
        'system',
        `Message failed${err?.status ? ` (${err.status})` : ''}. Please try again.`
      );
    }
  }, [input, ensureChat, send, push]);

  // ---- Autostart / cleanup ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        try {
          const s = window.localStorage.getItem(LS_CHAT_KEY);
          if (s) setChatId(s);
        } catch {}
        if (!autostart) return;
        await begin();
        if (!cancelled) await ensureChat();
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'Startup error');
          setStatus('error');
        }
      }
    })();
    return () => { cancelled = true; stopAvatar(); };
  }, [autostart, begin, ensureChat, stopAvatar]);

  // ---- Auto-scroll when chat is open ----
  useEffect(() => {
    if (!chatOpen) return;
    scrollPinRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, chatOpen]);

  // ---- Controls ----
  const toggleMute = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !isMuted;
    setIsMuted(next);
    v.muted = next;
    // ensure play is resumed after gesture
    try { await v.play(); } catch {}
  }, [isMuted]);

  const restart = useCallback(async () => {
    try { window.localStorage.removeItem(LS_CHAT_KEY); } catch {}
    setChatId('');
    setMessages([]);
    await stopAvatar();
    await begin();
    await ensureChat();
  }, [begin, ensureChat, stopAvatar]);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  const closePanel = useCallback(() => {
    // if embedded in an iframe, let the parent close the overlay
    try { window.parent?.postMessage({ type: 'avatar-widget:close' }, '*'); } catch {}
    // also navigate away if opened directly
    try { window.history.length > 1 ? window.history.back() : window.close(); } catch {}
  }, []);

  // ---- UI ----
  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: 'min(900px, 96vw)',
        height: 'min(600px, calc(100vh - 48px))',
        margin: '16px auto',
        borderRadius: 16,
        overflow: 'hidden',
        background: '#000',
        boxShadow: '0 20px 60px rgba(0,0,0,.45)',
      }}
    >
      {/* Video fills panel */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted={isMuted}
        style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
      />

      {/* Dim overlay while not ready */}
      {status !== 'ready' && (
        <div
          style={{
            position: 'absolute', inset: 0,
            display: 'grid', placeItems: 'center',
            background: 'rgba(0,0,0,.35)',
            color: '#fff', fontWeight: 700
          }}
        >
          {status === 'idle' ? 'Idle' : status === 'connecting' ? 'Connecting…' : 'Error'}
          {error ? <div style={{ marginTop: 8, fontSize: 12, opacity: .9 }}>Error: {error}</div> : null}
        </div>
      )}

      {/* Top bar: expand + close */}
      <div style={{
        position: 'absolute', top: 10, left: 10, right: 10, display: 'flex',
        justifyContent: 'space-between', gap: 10, pointerEvents: 'none'
      }}>
        <div />
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          <IconBtn title={isFullscreen ? 'Exit full screen' : 'Full screen'} onClick={toggleFullscreen}>
            {/* square in square icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
          </IconBtn>
          <IconBtn title="Close" onClick={closePanel}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
          </IconBtn>
        </div>
      </div>

      {/* Bottom overlay controls */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 12,
        display: 'flex', justifyContent: 'center', gap: 10
      }}>
        <IconBtn
          title={isMuted ? 'Unmute' : 'Mute'}
          onClick={toggleMute}
          disabled={status !== 'ready'}
        >
          {/* speaker icon */}
          {isMuted ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M11 5l-4 4H4v6h3l4 4V5z" stroke="#fff" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M14.5 9.5l5 5M19.5 9.5l-5 5" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M11 5l-4 4H4v6h3l4 4V5z" stroke="#fff" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M16 8a5 5 0 010 8M18.5 5.5a8.5 8.5 0 010 13" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          )}
        </IconBtn>

        <IconBtn title="Chat" onClick={() => { setChatOpen(v => !v); }}>
          {/* chat bubble */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M21 12a8 8 0 1 1-15.3 3.6L3 21l2.4-2.7A8 8 0 1 1 21 12Z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M8 11h8M8 14h5" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </IconBtn>

        <IconBtn title="Restart conversation" onClick={restart}>
          {/* refresh */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M20 6v6h-6M4 18v-6h6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M6 12a6 6 0 0111-3M18 12a6 6 0 01-11 3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </IconBtn>
      </div>

      {/* Slide-in chat drawer */}
      <div style={{
        position: 'absolute',
        top: 0, right: 0, height: '100%',
        width: 'min(360px, 85vw)',
        transform: `translateX(${chatOpen ? '0' : '100%'})`,
        transition: 'transform .25s ease',
        background: 'rgba(15,18,32,.96)',
        borderLeft: '1px solid #1f2430',
        display: 'grid',
        gridTemplateRows: '1fr auto',
      }}>
        <div style={{ padding: 12, overflowY: 'auto', color: '#e9ecf1', fontSize: 14 }}>
          {messages.length === 0 ? (
            <div style={{ opacity: .75 }}>Type a message to start the conversation.</div>
          ) : messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{
                fontWeight: 700, fontSize: 12,
                color: m.role==='user' ? '#60a5fa' : m.role==='assistant' ? '#34d399' : '#e879f9'
              }}>
                {m.role === 'assistant' ? 'Assistant' : m.role[0].toUpperCase()+m.role.slice(1)}
              </div>
              <div style={{ whiteSpace:'pre-wrap' }}>{m.text}</div>
            </div>
          ))}
          <div ref={scrollPinRef} />
        </div>
        <form onSubmit={onSubmit} style={{ display:'flex', gap:8, padding:10, borderTop:'1px solid #1f2430', background:'#0f1220' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message…"
            style={{
              flex:1, borderRadius:10, border:'1px solid #2a3142',
              background:'#12172a', color:'#e9ecf1', padding:'10px 12px', outline:'none'
            }}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            style={{
              padding:'10px 14px', borderRadius:10, border:'1px solid #2563eb',
              background:'#2563eb', color:'#fff', fontWeight:700,
              cursor: input.trim() ? 'pointer' : 'default'
            }}
          >Send</button>
        </form>
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title, disabled }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={!!disabled}
      style={{
        width: 38, height: 38, borderRadius: 19,
        border: '1px solid rgba(255,255,255,.25)',
        background: 'rgba(0,0,0,.45)',
        color: '#fff', display: 'grid', placeItems: 'center',
        backdropFilter: 'blur(6px)',
        cursor: disabled ? 'default' : 'pointer'
      }}
    >
      {children}
    </button>
  );
}

export default function EmbedPage() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
      <PageInner />
    </Suspense>
  );
}
