// app/embed/page.jsx
'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { loadHeygenSdk } from '../lib/loadHeygenSdk';

const LS_CHAT_KEY = 'retell_chat_id';

// icons
const Icon = {
  MicOn: (p) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...p}><path d="M12 15a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4Z" stroke="currentColor" strokeWidth="2"/><path d="M19 11a7 7 0 0 1-14 0M12 18v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  MicOff:(p) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...p}><path d="M1.5 1.5l21 21" stroke="currentColor" strokeWidth="2"/><path d="M12 15a4 4 0 0 0 4-4V7a4 4 0 0 0-6.8-2.8" stroke="currentColor" strokeWidth="2"/><path d="M5 11a7 7 0 0 0 11.5 5.3M12 18v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  Volume:(p) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...p}><path d="M11 5 6 9H3v6h3l5 4V5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M15 9a4 4 0 0 1 0 6M18 7a7 7 0 0 1 0 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  Mute:  (p) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...p}><path d="M1.5 1.5l21 21" stroke="currentColor" strokeWidth="2"/><path d="M11 5 6 9H3v6h3l5 4V5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M18 7a7 7 0 0 1 2 5 7 7 0 0 1-1.3 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  Full:  (p) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...p}><path d="M8 3H3v5M16 3h5v5M3 16v5h5M16 21h5v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  Restart:(p) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...p}><path d="M3 4v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 20a9 9 0 1 1-3-13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
};

// Web Speech API for dictation -> Retell
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
  rec.onerror = () => {};
  return rec;
}

function PageInner() {
  const sp = useSearchParams();
  const autostart = useMemo(() => (sp?.get('autostart') ?? '1') === '1', [sp]);

  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null); // freeze-frame canvas
  const avatarRef = useRef(null);
  const recRef = useRef(null);
  const reconnectRef = useRef({ timer: null, tries: 0 });

  const [status, setStatus] = useState('idle');      // idle | connecting | ready | error | reconnecting
  const [error, setError] = useState('');
  const [chatId, setChatId] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const [soundOn, setSoundOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [needGesture, setNeedGesture] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const avatarIdentifier = (process.env.NEXT_PUBLIC_HEYGEN_AVATAR_ID || '').trim();
  const voiceId = (process.env.NEXT_PUBLIC_HEYGEN_VOICE_ID || '').trim();

  const push = useCallback((role, text) => setMessages((p) => [...p, { role, text }]), []);

  // ---------- Retell ----------
  const ensureChat = useCallback(async () => {
    if (chatId) return chatId;
    try { const s = window.localStorage.getItem(LS_CHAT_KEY); if (s) { setChatId(s); return s; } } catch {}
    const r = await fetch('/api/retell-chat/start', { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok || !j?.chatId) throw new Error('CHAT_START_FAILED');
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
    if (!r.ok || !j?.ok) { const err = new Error('SEND_FAILED'); err.status = r.status; throw err; }
    return j.reply || '';
  }, []);

  // ---------- Freeze frame helpers ----------
  const showFreeze = useCallback(() => {
    try {
      const v = videoRef.current, c = canvasRef.current;
      if (!v || !c) return;
      const w = v.videoWidth || v.clientWidth || 480;
      const h = v.videoHeight || v.clientHeight || 270;
      c.width = w; c.height = h;
      c.getContext('2d')?.drawImage(v, 0, 0, w, h);
      c.style.opacity = '1';
    } catch {}
  }, []);
  const hideFreeze = useCallback(() => { const c = canvasRef.current; if (c) c.style.opacity = '0'; }, []);

  // ---------- HeyGen ----------
  const stopAvatar = useCallback(async () => {
    try { await avatarRef.current?.stopAvatar?.(); } catch {}
    avatarRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const tryPlay = useCallback(async () => {
    try {
      const v = videoRef.current; if (!v) return;
      v.muted = !soundOn;
      await v.play();
      setNeedGesture(false);
    } catch {
      setNeedGesture(true); // browser blocked autoplay
    }
  }, [soundOn]);

  const scheduleReconnect = useCallback(() => {
    const s = reconnectRef.current;
    if (s.timer) return;
    const delay = Math.min(4000, 800 * Math.pow(2, s.tries || 0));
    s.timer = setTimeout(async () => {
      s.timer = null;
      s.tries = (s.tries || 0) + 1;
      try { await begin(true); } catch { scheduleReconnect(); }
    }, delay);
    setStatus('reconnecting');
  }, []); // begin below

  const begin = useCallback(async (soft = false) => {
    setError('');
    setStatus(soft ? 'reconnecting' : 'connecting');

    if (!avatarIdentifier) {
      setStatus('error'); setError('MISSING_AVATAR_ID');
      throw new Error('MISSING_AVATAR_ID');
    }

    // token
    const tr = await fetch('/api/heygen-token', { cache: 'no-store' });
    const tj = await tr.json().catch(() => ({}));
    const token = tj?.token || tj?.data?.token || tj?.accessToken || '';
    if (!token) throw new Error('TOKEN');

    const sdk = await loadHeygenSdk();
    if (!sdk?.StreamingAvatar) throw new Error('SDK');
    const { StreamingAvatar, StreamingEvents, AvatarQuality, TaskType } = sdk;

    // stop any prior
    try { await avatarRef.current?.stopAvatar?.(); } catch {}
    avatarRef.current = null;

    const avatar = new StreamingAvatar({ token, debug: false });
    avatarRef.current = avatar;

    avatar.on(StreamingEvents.STREAM_READY, (evt) => {
      const stream = evt?.detail;
      const v = videoRef.current;
      if (v && stream instanceof MediaStream) {
        v.srcObject = stream;
        v.playsInline = true;
        hideFreeze();
        tryPlay();
        setStatus('ready');
        if (reconnectRef.current.timer) { clearTimeout(reconnectRef.current.timer); reconnectRef.current.timer = null; }
        reconnectRef.current.tries = 0;
      }
    });

    avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
      showFreeze();
      scheduleReconnect();
    });

    const quality = AvatarQuality?.High || 'high';
    console.log('[EMBED] createStartAvatar payload baseline:', { avatarIdentifier, quality, voiceId });

    let started = false; let lastErr;

    async function tryStart(payload) {
      try {
        await avatar.createStartAvatar(payload);
        started = true;
      } catch (e) {
        lastErr = e;
        console.warn('[EMBED] createStartAvatar failed:', e?.message || e, payload);
      }
    }

    const common = { quality, welcomeMessage: '' };
    const withVoice = voiceId ? { voice: voiceId, voiceId } : {};

    await tryStart({ avatarName: avatarIdentifier, ...withVoice, ...common });
    if (!started) await tryStart({ avatarId: avatarIdentifier, ...withVoice, ...common });

    if (!started) {
      setStatus('error');
      const msg = (lastErr && (lastErr.message || lastErr.toString())) || 'START_FAILED';
      setError(`Avatar start failed: ${msg}`);
      throw lastErr || new Error(msg);
    }

    async function speak(text) {
      if (!text) return;
      const payload = TaskType ? { text, taskType: TaskType.REPEAT } : { text, taskType: 'REPEAT' };
      try { await avatar.speak(payload); } catch {}
    }
    window.__avatarSpeak = speak;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarIdentifier, voiceId, tryPlay, hideFreeze, showFreeze, scheduleReconnect]);

  // Dictation -> Retell -> speak
  const startRec = useCallback(() => {
    if (recRef.current) return;
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
    if (!rec) return;
    recRef.current = rec;
    try { rec.start(); } catch {}
  }, [ensureChat, send, push]);

  const stopRec = useCallback(() => {
    try { recRef.current?.stop?.(); } catch {}
    recRef.current = null;
  }, []);

  // Submit typed message
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

  // Autostart + auto mic
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        try { const s = window.localStorage.getItem(LS_CHAT_KEY); if (s) setChatId(s); } catch {}
        if (!autostart) return;
        await begin();
        if (!cancelled) await ensureChat();
        if (!cancelled && micOn) startRec();
      } catch (e) {
        if (!cancelled) { setError(e?.message || 'Startup error'); setStatus('error'); }
      }
    })();
    return () => {
      cancelled = true;
      if (reconnectRef.current.timer) { clearTimeout(reconnectRef.current.timer); reconnectRef.current.timer = null; }
      stopRec();
      stopAvatar();
    };
  }, [autostart, begin, ensureChat, stopAvatar, micOn, startRec]);

  // auto-scroll chat
  const chatEndRef = useRef(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length]);

  // UI handlers
  const onToggleSound = useCallback(async () => {
    const v = videoRef.current; if (!v) return;
    v.muted = !v.muted;
    setSoundOn(!soundOn);
    try { await v.play(); } catch {}
    setNeedGesture(false);
  }, [soundOn]);
  const onToggleMic = useCallback(() => {
    const next = !micOn;
    setMicOn(next);
    if (next) startRec(); else stopRec();
  }, [micOn, startRec, stopRec]);
  const onRestart = useCallback(async () => {
    try { window.localStorage.removeItem(LS_CHAT_KEY); } catch {}
    setChatId(''); setMessages([]);
    await stopAvatar();
    await begin();
    await ensureChat();
    if (micOn) startRec();
  }, [begin, ensureChat, micOn, startRec, stopAvatar]);
  const onFullscreen = useCallback(async () => {
    const el = containerRef.current; if (!el) return;
    try {
      if (!document.fullscreenElement) { await el.requestFullscreen?.(); setIsFullscreen(true); }
      else { await document.exitFullscreen?.(); setIsFullscreen(false); }
    } catch {}
  }, []);
  const onGestureEnable = useCallback(async () => {
    const v = videoRef.current; if (!v) return;
    v.muted = false; setSoundOn(true);
    try { await v.play(); } catch {}
    setNeedGesture(false);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: 'min(480px, 95vw)',
        height: 'min(720px, calc(100vh - 24px))',
        display: 'grid',
        gridTemplateRows: '55% 45%',
        gap: 10,
        padding: 10,
        boxSizing: 'border-box',
        background: '#0f1220',
        color: '#e9ecf1',
        borderRadius: 12,
        position: 'relative',
      }}
    >
      {/* Video + freeze frame */}
      <div style={{ position:'relative', borderRadius:12, overflow:'hidden', background:'#000' }}>
        <canvas ref={canvasRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity:0, transition:'opacity .2s ease' }} />
        <video ref={videoRef} playsInline autoPlay muted={!soundOn} style={{ width:'100%', height:'100%', objectFit:'cover', background:'#000' }} />

        {/* Status veil */}
        {status !== 'ready' && status !== 'reconnecting' && (
          <div style={{ position:'absolute', inset:0, display:'grid', placeItems:'center', color:'#fff', background:'rgba(0,0,0,.35)', fontWeight:700 }}>
            {status === 'idle' ? 'Idle' : status === 'connecting' ? 'Connecting…' : 'Error'}
          </div>
        )}
        {status === 'reconnecting' && (
          <div style={{ position:'absolute', inset:0, display:'grid', placeItems:'center', color:'#fff', background:'rgba(0,0,0,.25)', fontWeight:700 }}>
            Reconnecting…
          </div>
        )}

        {/* Autoplay shim */}
        {needGesture && (
          <button onClick={onGestureEnable} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.55)', color:'#fff', fontWeight:700, border:0, cursor:'pointer' }}>
            Tap to enable sound
          </button>
        )}

        {/* Overlay controls */}
        <div style={{ position:'absolute', top:8, right:8, display:'flex', gap:6, background:'rgba(15,18,32,.55)', padding:'6px 8px', border:'1px solid rgba(255,255,255,.12)', borderRadius:10 }}>
          <button title={micOn ? 'Mic on — click to stop listening' : 'Mic off — click to start listening'} onClick={onToggleMic} style={btnStyle}>
            {micOn ? <Icon.MicOn/> : <Icon.MicOff/>}
          </button>
          <button title={soundOn ? 'Mute' : 'Unmute'} onClick={onToggleSound} style={btnStyle}>
            {soundOn ? <Icon.Volume/> : <Icon.Mute/>}
          </button>
          <button title="Restart conversation" onClick={onRestart} style={btnStyle}><Icon.Restart/></button>
          <button title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'} onClick={onFullscreen} style={btnStyle}><Icon.Full/></button>
        </div>
      </div>

      {/* Chat */}
      <div style={{ borderRadius:12, overflow:'hidden', border:'1px solid #1f2430', background:'#0f1220', display:'grid', gridTemplateRows:'1fr auto' }}>
        <div style={{ padding:'10px 12px', overflowY:'auto', fontSize:14 }}>
          {messages.length === 0 ? (
            <div style={{ opacity:.75 }}>Talk to the agent — we’re listening. You can also type below.</div>
          ) : messages.map((m,i) => (
            <div key={i} style={{ marginBottom:10 }}>
              <div style={{ fontWeight:700, fontSize:12, color: m.role==='user' ? '#60a5fa' : m.role==='assistant' ? '#34d399' : '#e879f9' }}>
                {m.role === 'assistant' ? 'Assistant' : m.role[0].toUpperCase()+m.role.slice(1)}
              </div>
              <div style={{ whiteSpace:'pre-wrap' }}>{m.text}</div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={onSubmit} style={{ display:'flex', gap:8, padding:10, borderTop:'1px solid #1f2430' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message…"
            style={{ flex:1, borderRadius:10, border:'1px solid #2a3142', background:'#12172a', color:'#e9ecf1', padding:'10px 12px', outline:'none' }}
          />
          <button type="submit" disabled={!input.trim()} style={{ padding:'10px 14px', borderRadius:10, border:'1px solid #2563eb', background:'#2563eb', color:'#fff', fontWeight:700, cursor: input.trim() ? 'pointer' : 'default' }}>
            Send
          </button>
        </form>
      </div>

      {error && (
        <div style={{ position:'absolute', left:10, right:10, bottom:10, background:'#2a1215', border:'1px solid #5c1a1e', color:'#ffd4d6', borderRadius:10, padding:'8px 10px', fontSize:12 }}>
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
