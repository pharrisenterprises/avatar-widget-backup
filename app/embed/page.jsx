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

// Simple SVG icons (inline)
const Icon = {
  MicOn:   (props) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M12 15a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4Z" stroke="currentColor" strokeWidth="2"/>
      <path d="M19 11a7 7 0 0 1-14 0M12 18v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  MicOff:  (props) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M1.5 1.5l21 21" stroke="currentColor" strokeWidth="2"/>
      <path d="M12 15a4 4 0 0 0 4-4V7a4 4 0 0 0-6.8-2.8" stroke="currentColor" strokeWidth="2"/>
      <path d="M5 11a7 7 0 0 0 11.5 5.3M12 18v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Volume:  (props) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M15 9a4 4 0 0 1 0 6M18 7a7 7 0 0 1 0 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Mute:    (props) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M1.5 1.5l21 21" stroke="currentColor" strokeWidth="2"/>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M18 7a7 7 0 0 1 2 5 7 7 0 0 1-1.3 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Full:    (props) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M8 3H3v5M16 3h5v5M3 16v5h5M16 21h5v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Restart: (props) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M3 4v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21 20a9 9 0 1 1-3-13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
};

// Speech-to-text using Web Speech API (Chrome)
function makeRecognizer(onText) {
  const SR = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = 'en-US';
  rec.continuous = true;
  rec.interimResults = false;
  rec.onresult = (e) => {
    const i = e.results.length - 1;
    const txt = e.results[i]?.[0]?.transcript || '';
    if (txt.trim()) onText(txt.trim());
  };
  rec.onerror = () => {}; // swallow errors; we surface status elsewhere
  return rec;
}

function PageInner() {
  const sp = useSearchParams();
  const autostart = useMemo(() => (sp?.get('autostart') ?? '1') === '1', [sp]);
  const layoutCompact = useMemo(() => (sp?.get('layout') ?? 'compact') === 'compact', [sp]);
  const videoFirst = useMemo(() => (sp?.get('videoFirst') ?? '1') === '1', [sp]);

  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const avatarRef = useRef(null);
  const recRef = useRef(null); // SpeechRecognition

  const [status, setStatus] = useState('idle'); // idle | connecting | ready | error
  const [error, setError] = useState('');
  const [chatId, setChatId] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const [soundOn, setSoundOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [needGesture, setNeedGesture] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const avatarName = process.env.NEXT_PUBLIC_HEYGEN_AVATAR_ID || '';

  const push = useCallback((role, text) => {
    setMessages((p) => [...p, { role, text }]);
  }, []);

  // ------- Retell helpers -------
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

  // ------- HeyGen helpers -------
  const stopAvatar = useCallback(async () => {
    try {
      const a = avatarRef.current;
      if (a?.stopAvatar) await a.stopAvatar();
    } catch {}
    avatarRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const tryPlay = useCallback(async () => {
    try {
      if (!videoRef.current) return;
      if (soundOn) videoRef.current.muted = false;
      await videoRef.current.play();
      setNeedGesture(false);
    } catch {
      // Autoplay blocked — show “tap to enable” shim
      setNeedGesture(true);
    }
  }, [soundOn]);

  const begin = useCallback(async () => {
    setStatus('connecting');
    setError('');

    // token
    const tr = await fetch('/api/heygen-token', { cache: 'no-store' });
    const tj = await tr.json().catch(() => ({}));
    const token = tj?.token || tj?.data?.token || tj?.accessToken || '';
    if (!token) throw new Error('TOKEN');

    const sdk = await loadHeygenSdk();
    if (!sdk?.StreamingAvatar) throw new Error('SDK');

    const { StreamingAvatar, StreamingEvents, AvatarQuality, TaskType } = sdk;
    const avatar = new StreamingAvatar({ token, debug: false });
    avatarRef.current = avatar;

    avatar.on(StreamingEvents.STREAM_READY, (evt) => {
      const stream = evt?.detail;
      if (videoRef.current && stream instanceof MediaStream) {
        videoRef.current.srcObject = stream;
        videoRef.current.playsInline = true;
        // try to unmute (play) immediately
        tryPlay();
        setStatus('ready');
      }
    });

    avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
      if (videoRef.current) videoRef.current.srcObject = null;
      setStatus('idle');
    });

    await avatar.createStartAvatar({
      avatarName,
      quality: AvatarQuality?.High || 'high',
      welcomeMessage: '',
    });

    // helper to speak
    async function speak(text) {
      if (!text) return;
      const payload = TaskType
        ? { text, taskType: TaskType.REPEAT }
        : { text, taskType: 'REPEAT' };
      try { await avatar.speak(payload); } catch {}
    }
    // store on window for quick manual tests
    window.__avatarSpeak = speak;
  }, [avatarName, tryPlay]);

  // Speech recognition
  const startRec = useCallback(() => {
    if (recRef.current) return; // already running
    const rec = makeRecognizer(async (txt) => {
      push('user', txt);
      try {
        const id = await ensureChat();
        const reply = await send(id, txt);
        push('assistant', reply);
        try { await window.__avatarSpeak?.(reply); } catch {}
      } catch (err) {
        push('system', `Message failed${err?.status ? ` (${err.status})` : ''}. Please try again.`);
      }
    });
    if (!rec) return; // not supported
    recRef.current = rec;
    try { rec.start(); } catch {}
  }, [ensureChat, send, push]);

  const stopRec = useCallback(() => {
    try { recRef.current?.stop?.(); } catch {}
    recRef.current = null;
  }, []);

  // ------- Submit -------
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

  // ------- Autostart pipeline -------
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
        if (!cancelled && micOn) startRec();
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'Startup error');
          setStatus('error');
        }
      }
    })();
    return () => { cancelled = true; stopRec(); stopAvatar(); };
  }, [autostart, begin, ensureChat, stopAvatar, micOn, startRec]);

  // auto-scroll chat
  const chatEndRef = useRef(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  // ------- UI handlers -------
  const onToggleSound = useCallback(async () => {
    setSoundOn((s) => !s);
    if (videoRef.current) {
      videoRef.current.muted = soundOn; // toggle
      try { await videoRef.current.play(); } catch {}
    }
    setNeedGesture(false);
  }, [soundOn]);

  const onToggleMic = useCallback(() => {
    setMicOn((m) => !m);
    if (micOn) stopRec(); else startRec();
  }, [micOn, startRec, stopRec]);

  const onRestart = useCallback(async () => {
    try { window.localStorage.removeItem(LS_CHAT_KEY); } catch {}
    setChatId('');
    setMessages([]);
    await stopAvatar();
    await begin();
    await ensureChat();
    if (micOn) startRec();
  }, [begin, ensureChat, micOn, startRec, stopAvatar]);

  const onFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen?.();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen?.();
        setIsFullscreen(false);
      }
    } catch {}
  }, []);

  const onGestureEnable = useCallback(async () => {
    setNeedGesture(false);
    if (!videoRef.current) return;
    videoRef.current.muted = false;
    try { await videoRef.current.play(); } catch {}
  }, []);

  // ------- Layout classes -------
  const shellClass = [
    'avatar-shell',
    layoutCompact ? 'layout-compact' : '',
    videoFirst ? 'video-first' : ''
  ].join(' ').trim();

  // ------- Render -------
  return (
    <div
      ref={containerRef}
      className={shellClass}
      style={{
        width: 'min(480px, 95vw)',
        height: 'min(720px, calc(100vh - 24px))',
        display: 'grid',
        gridTemplateRows: '55% 45%', // video / chat
        gap: 10,
        padding: 10,
        boxSizing: 'border-box',
        background: '#0f1220',
        color: '#e9ecf1',
        borderRadius: 12,
      }}
    >
      {/* Video with controls overlay */}
      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted={!soundOn}
          style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
        />

        {/* Status veil */}
        {status !== 'ready' && (
          <div style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            color: '#fff', background: 'rgba(0,0,0,.35)', fontWeight: 700
          }}>
            {status === 'idle' ? 'Idle' : status === 'connecting' ? 'Connecting…' : 'Error'}
          </div>
        )}

        {/* “Tap to enable sound” if autoplay blocked */}
        {needGesture && (
          <button
            onClick={onGestureEnable}
            style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)',
              color: '#fff', fontWeight: 700, border: '0', cursor: 'pointer'
            }}
          >
            Tap to enable sound
          </button>
        )}

        {/* Controls row */}
        <div style={{
          position:'absolute', top:8, right:8, display:'flex', gap:6,
          background:'rgba(15,18,32,.55)', padding:'6px 8px',
          border:'1px solid rgba(255,255,255,.12)', borderRadius:10
        }}>
          <button
            title={micOn ? 'Mic on — click to stop listening' : 'Mic off — click to start listening'}
            onClick={onToggleMic}
            style={btnStyle}
          >
            {micOn ? <Icon.MicOn/> : <Icon.MicOff/>}
          </button>
          <button
            title={soundOn ? 'Mute' : 'Unmute'}
            onClick={onToggleSound}
            style={btnStyle}
          >
            {soundOn ? <Icon.Volume/> : <Icon.Mute/>}
          </button>
          <button title="Restart conversation" onClick={onRestart} style={btnStyle}><Icon.Restart/></button>
          <button title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'} onClick={onFullscreen} style={btnStyle}><Icon.Full/></button>
        </div>
      </div>

      {/* Chat */}
      <div style={{
        borderRadius: 12, overflow: 'hidden', border: '1px solid #1f2430',
        background: '#0f1220', display: 'grid', gridTemplateRows: '1fr auto'
      }}>
        <div style={{ padding: '10px 12px', overflowY: 'auto', fontSize: 14 }}>
          {messages.length === 0 ? (
            <div style={{ opacity: .75 }}>
              Talk to the agent — we’re listening. You can also type below.
            </div>
          ) : messages.map((m,i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{
                fontWeight: 700, fontSize: 12,
                color: m.role==='user' ? '#60a5fa' : m.role==='assistant' ? '#34d399' : '#e879f9'
              }}>
                {m.role === 'assistant' ? 'Assistant' : m.role[0].toUpperCase()+m.role.slice(1)}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
            </div>
          ))}
          <div ref={chatEndRef} />
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

      {error && (
        <div style={{
          position: 'absolute', left: 10, right: 10, bottom: 10,
          background: '#2a1215', border: '1px solid #5c1a1e',
          color: '#ffd4d6', borderRadius: 10, padding: '8px 10px', fontSize: 12
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  background: 'transparent',
  border: '1px solid rgba(255,255,255,.12)',
  color: '#fff',
  width: 36,
  height: 32,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 8,
  cursor: 'pointer'
};

export default function EmbedPage() {
  return (
    <Suspense fallback={<div style={{ padding: 16, color: '#e9ecf1' }}>Loading…</div>}>
      <PageInner />
    </Suspense>
  );
}
