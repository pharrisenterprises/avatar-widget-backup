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
  const q = (sp?.get('q') || 'medium').toLowerCase();

  const videoRef = useRef(null);
  const avatarRef = useRef(null);
  const chatScrollRef = useRef(null);
  const firstGestureDone = useRef(false);

  // Web Speech API
  const recognitionRef = useRef(null);

  const [status, setStatus] = useState('idle'); // idle | connecting | ready | error
  const [error, setError] = useState('');
  const [chatId, setChatId] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  // UI toggles
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [speakerMuted, setSpeakerMuted] = useState(false);

  const avatarName = process.env.NEXT_PUBLIC_HEYGEN_AVATAR_ID || '';

  const push = useCallback((role, text) => {
    setMessages((p) => [...p, { role, text }]);
  }, []);

  // auto-scroll chat to latest
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

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
        videoRef.current.muted = speakerMuted; // reflect toggle
        videoRef.current.onloadedmetadata = () => {
          // attempt playback (will succeed after first user gesture)
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
      q.startsWith('l') ? (AvatarQuality?.Low || 'low') :
      q.startsWith('h') ? (AvatarQuality?.High || 'high') :
                          (AvatarQuality?.Medium || 'medium');

    await avatar.createStartAvatar({
      avatarName,
      quality,
      welcomeMessage: '',
    });

    // expose speak() for internal use
    async function speak(text) {
      if (!text) return;
      const payload = TaskType
        ? { text, taskType: TaskType.REPEAT }
        : { text, taskType: 'REPEAT' };
      try { await avatar.speak(payload); } catch {}
    }
    window.__avatarSpeak = speak;
  }, [avatarName, q, speakerMuted]);

  // ------- Mic (browser SpeechRecognition) -------
  const hasSR = () =>
    typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  const startMic = useCallback(() => {
    if (!hasSR()) {
      setError('Voice input not supported on this browser.');
      setMicOn(false);
      return;
    }
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onresult = async (e) => {
        // Show interim in the input box
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) {
            const finalTxt = res[0].transcript.trim();
            if (finalTxt) {
              push('user', finalTxt);
              try {
                const id = await ensureChat();
                const reply = await send(id, finalTxt);
                push('assistant', reply);
                try { await window.__avatarSpeak?.(reply); } catch {}
              } catch (err) {
                push('system', `Message failed${err?.status ? ` (${err.status})` : ''}. Please try again.`);
              }
            }
          } else {
            interim += res[0].transcript;
          }
        }
        setInput(interim);
      };

      rec.onend = () => {
        // keep listening while micOn is true
        if (micOn) {
          try { rec.start(); } catch {}
        }
      };

      rec.start();
      recognitionRef.current = rec;
      setMicOn(true);
    } catch {
      setMicOn(false);
    }
  }, [micOn, ensureChat, send, push]);

  const stopMic = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
    setMicOn(false);
  }, []);

  // Gesture -> unmute + mic
  const ensureInteractive = useCallback(async () => {
    if (firstGestureDone.current) return;
    firstGestureDone.current = true;

    // unmute speaker (so avatar audio plays)
    try {
      if (videoRef.current) {
        videoRef.current.muted = false;
        setSpeakerMuted(false);
        await videoRef.current.play().catch(() => {});
      }
    } catch {}

    // start microphone if desired
    if (!recognitionRef.current) startMic();
  }, [startMic]);

  // global gesture capture inside widget root
  useEffect(() => {
    const onAny = () => ensureInteractive();
    window.addEventListener('pointerdown', onAny, { once: true, capture: true });
    window.addEventListener('keydown', onAny, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', onAny, { capture: true });
      window.removeEventListener('keydown', onAny, { capture: true });
    };
  }, [ensureInteractive]);

  // ------- Submit (typing) -------
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
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'Startup error');
          setStatus('error');
        }
      }
    })();
    return () => { cancelled = true; stopAvatar(); stopMic(); };
  }, [autostart, begin, ensureChat, stopAvatar, stopMic]);

  // ------- UI helpers -------
  const toggleSpeaker = useCallback(async () => {
    const next = !speakerMuted;
    setSpeakerMuted(next);
    if (videoRef.current) {
      videoRef.current.muted = next;
      if (!next) {
        try { await videoRef.current.play(); } catch {}
      }
    }
  }, [speakerMuted]);

  const toggleMic = useCallback(() => {
    if (micOn) stopMic();
    else startMic();
  }, [micOn, startMic, stopMic]);

  const restart = useCallback(async () => {
    // clear chat & restart session
    setMessages([]);
    try { window.localStorage.removeItem(LS_CHAT_KEY); } catch {}
    setChatId('');
    await stopAvatar();
    await begin();
    await ensureChat();
  }, [begin, ensureChat, stopAvatar]);

  const requestFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
  }, []);

  // ------- Layout -------
  // When chat is closed: one row (video only). When open: 50/50 split.
  const gridRows = isChatOpen ? '1fr 1fr' : '1fr';

  return (
    <div
      style={{
        width: 'min(960px, 98vw)',
        height: 'min(860px, calc(100vh - 24px))',
        margin: '0 auto',
        display: 'grid',
        gridTemplateRows: gridRows,
        gap: 12,
        padding: 12,
        boxSizing: 'border-box',
      }}
      onClick={ensureInteractive}
    >
      {/* Video area */}
      <div style={{ position:'relative', borderRadius:16, overflow:'hidden', background:'#000' }}>
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted={speakerMuted}
          style={{ width:'100%', height:'100%', objectFit:'cover', background:'#000' }}
        />
        {status !== 'ready' && (
          <div style={{
            position:'absolute', inset:0, display:'grid', placeItems:'center',
            color:'#fff', background:'rgba(0,0,0,.35)', fontWeight:700
          }}>
            {status === 'idle' ? 'Idle' : status === 'connecting' ? 'Connecting…' : `Error: ${error || 'Unknown'}`}
          </div>
        )}

        {/* Top-right: fullscreen & close (close just navigates back if in popup/iframe) */}
        <div style={{ position:'absolute', top:10, right:10, display:'flex', gap:8 }}>
          <IconBtn label="Fullscreen" onClick={requestFullscreen}>⛶</IconBtn>
          {/* If you want an X to close the embed page itself: */}
          {/* <IconBtn label="Close" onClick={() => window.close?.()}>✕</IconBtn> */}
        </div>

        {/* Bottom-center controls */}
        <div style={{
          position:'absolute', left:'50%', bottom:14, transform:'translateX(-50%)',
          display:'flex', gap:10
        }}>
          <IconBtn
            active={!speakerMuted}
            label={speakerMuted ? 'Unmute' : 'Mute'}
            onClick={toggleSpeaker}
          >
            {speakerMuted ? '🔇' : '🔊'}
          </IconBtn>

          <IconBtn
            active={micOn}
            label={micOn ? 'Mic on' : 'Mic off'}
            onClick={toggleMic}
          >
            {micOn ? '🎙️' : '🎤'}
          </IconBtn>

          <IconBtn label="Restart" onClick={restart}>↻</IconBtn>

          <IconBtn
            label={isChatOpen ? 'Hide chat' : 'Show chat'}
            onClick={() => setIsChatOpen((v) => !v)}
          >
            💬
          </IconBtn>
        </div>
      </div>

      {/* Chat (only rendered when open) */}
      {isChatOpen && (
        <div style={{
          borderRadius:16, overflow:'hidden', border:'1px solid #1f2430',
          background:'#0f1220', color:'#e9ecf1', display:'grid', gridTemplateRows:'1fr auto'
        }}>
          <div ref={chatScrollRef} style={{ padding:'10px 12px', overflowY:'auto', fontSize:14 }}>
            {messages.length === 0 ? (
              <div style={{ opacity:.75 }}>Speak or type to start the conversation.</div>
            ) : messages.map((m,i) => (
              <div key={i} style={{ marginBottom:10 }}>
                <div style={{
                  fontWeight:700, fontSize:12,
                  color: m.role==='user' ? '#60a5fa' : m.role==='assistant' ? '#34d399' : '#e879f9'
                }}>
                  {m.role === 'assistant' ? 'Assistant' : m.role[0].toUpperCase()+m.role.slice(1)}
                </div>
                <div style={{ whiteSpace:'pre-wrap' }}>{m.text}</div>
              </div>
            ))}
          </div>
          <form onSubmit={onSubmit} style={{ display:'flex', gap:8, padding:10, borderTop:'1px solid #1f2430' }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message… (or just talk)"
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
      )}
    </div>
  );
}

function IconBtn({ children, onClick, label, active }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        width:44, height:44,
        display:'grid', placeItems:'center',
        borderRadius:999,
        border:'1px solid rgba(255,255,255,.2)',
        background: active ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.45)',
        color:'#fff',
        backdropFilter:'blur(6px)',
        cursor:'pointer'
      }}
    >
      <span style={{ fontSize:18, lineHeight:1 }}>{children}</span>
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
