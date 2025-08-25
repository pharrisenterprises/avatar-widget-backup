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

// Compact sizes (D-ID bottom-right vibe)
const PANEL_W = 360;
const PANEL_H = 560; // container height; video area takes ~60% when chat is open

function PageInner() {
  const sp = useSearchParams();
  const autostart = useMemo(() => (sp?.get('autostart') ?? '1') === '1', [sp]);

  const videoRef = useRef(null);
  const avatarRef = useRef(null);
  const chatScrollRef = useRef(null);

  const [status, setStatus] = useState('idle'); // idle | connecting | ready | error
  const [error, setError] = useState('');
  const [chatId, setChatId] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const [showChat, setShowChat] = useState(false);
  const [micOn, setMicOn] = useState(true);    // we’ll request mic on first gesture
  const [speakerOn, setSpeakerOn] = useState(true);

  const [needGesture, setNeedGesture] = useState(true); // “Tap to start” overlay
  const micStreamRef = useRef(null);

  const avatarName = process.env.NEXT_PUBLIC_HEYGEN_AVATAR_ID || '';

  // auto-scroll chat to bottom on new messages
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, showChat]);

  const pushMsg = useCallback((role, text) => {
    setMessages((p) => [...p, { role, text: String(text || '') }]);
  }, []);

  // ------- Retell helpers -------
  const ensureChat = useCallback(async () => {
    if (chatId) return chatId;
    // try restore
    try {
      const s = window.localStorage.getItem(LS_CHAT_KEY);
      if (s) {
        setChatId(s);
        return s;
      }
    } catch {}
    // start
    const r = await fetch('/api/retell-chat/start', { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok || !j?.chatId) {
      const d = j?.detail ? ` — ${JSON.stringify(j.detail)}` : '';
      throw Object.assign(new Error('CHAT_START_FAILED' + d), { cause: j });
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
      err.detail = j;
      throw err;
    }
    return j.reply || '';
  }, []);

  // ------- Audio / Mic helpers -------
  const acquireMic = useCallback(async () => {
    try {
      if (micStreamRef.current) return micStreamRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      return stream;
    } catch (e) {
      // If user denies, keep micOff but don’t crash
      setMicOn(false);
      return null;
    }
  }, []);

  const releaseMic = useCallback(() => {
    try {
      micStreamRef.current?.getTracks()?.forEach(t => t.stop());
    } catch {}
    micStreamRef.current = null;
  }, []);

  const resumeOutputAudio = useCallback(async () => {
    try {
      if (videoRef.current && speakerOn) {
        videoRef.current.muted = false;
        await videoRef.current.play().catch(() => {});
      }
    } catch {}
  }, [speakerOn]);

  // ------- HeyGen helpers -------
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
        videoRef.current.muted = !speakerOn; // default true, but we’ll unmute after gesture
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

    const quality = AvatarQuality?.High || 'high';

    await avatar.createStartAvatar({
      avatarName,
      quality,
      welcomeMessage: '',
    });

    // Helper to speak exactly the reply (lip-sync == captions)
    async function speak(text) {
      if (!text) return;
      const payload = TaskType
        ? { text, taskType: TaskType.REPEAT }
        : { text, taskType: 'REPEAT' };
      try { await avatar.speak(payload); } catch {}
    }
    window.__avatarSpeak = speak;
  }, [avatarName, speakerOn]);

  // ------- Gesture gate (autoplay/mic) -------
  const onFirstTap = useCallback(async () => {
    setNeedGesture(false);
    if (micOn) await acquireMic(); // prompt mic once
    await resumeOutputAudio();     // unmute video output
    try {
      // If autostart requested, kick the pipeline now that we have a gesture
      if (status === 'idle') await begin();
      await ensureChat();
    } catch (e) {
      setError(e?.message || 'Startup error');
      setStatus('error');
    }
  }, [micOn, acquireMic, resumeOutputAudio, status, begin, ensureChat]);

  // ------- Submit (text) -------
  const onSubmit = useCallback(async (e) => {
    e?.preventDefault?.();
    const text = (input || '').trim();
    if (!text) return;
    setInput('');
    pushMsg('user', text);
    try {
      const id = await ensureChat();
      const reply = await send(id, text);
      pushMsg('assistant', reply);
      try { await window.__avatarSpeak?.(reply); } catch {}
    } catch (err) {
      pushMsg('system', `Message failed${err?.status ? ` (${err.status})` : ''}. Please try again.`);
    }
  }, [input, ensureChat, send, pushMsg]);

  // Clean up mic on unmount
  useEffect(() => () => releaseMic(), [releaseMic]);

  // ------- UI -------
  // Layout: compact card; when showChat=false, full card is video
  // when showChat=true, video top (~60%), chat bottom (~40%)
  const videoArea = (
    <div style={{
      position:'relative',
      borderRadius:12,
      overflow:'hidden',
      background:'#000',
      minHeight: showChat ? Math.round(PANEL_H * 0.6) : PANEL_H - 56, // leave room for header if needed
    }}>
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted={!speakerOn}
        style={{ width:'100%', height:'100%', objectFit:'cover', background:'#000' }}
      />
      {status !== 'ready' && (
        <div style={{
          position:'absolute', inset:0, display:'grid', placeItems:'center',
          color:'#fff', background:'rgba(0,0,0,.35)', fontWeight:700
        }}>
          {status === 'idle' ? 'Idle' : status === 'connecting' ? 'Connecting…' : 'Error'}
        </div>
      )}

      {/* Floating controls (bottom-left) */}
      <div style={{
        position:'absolute', left:8, bottom:8, display:'flex', gap:8
      }}>
        <button
          onClick={() => setShowChat(s => !s)}
          title={showChat ? 'Hide chat' : 'Show chat'}
          style={btnStyle}
        >
          💬
        </button>
        <button
          onClick={() => {
            const next = !micOn;
            setMicOn(next);
            if (next) acquireMic(); else releaseMic();
          }}
          title={micOn ? 'Turn mic off' : 'Turn mic on'}
          style={btnStyle}
        >
          {micOn ? '🎙️' : '🔇'}
        </button>
        <button
          onClick={() => {
            const next = !speakerOn;
            setSpeakerOn(next);
            if (videoRef.current) videoRef.current.muted = !next;
            if (next) videoRef.current?.play?.();
          }}
          title={speakerOn ? 'Mute speaker' : 'Unmute speaker'}
          style={btnStyle}
        >
          {speakerOn ? '🔊' : '🔈'}
        </button>
      </div>

      {/* One-time “Tap to start” to satisfy autoplay/mic */}
      {needGesture && autostart && (
        <button
          onClick={onFirstTap}
          style={{
            position:'absolute', inset:0, display:'grid', placeItems:'center',
            background:'rgba(0,0,0,.55)', color:'#fff', fontWeight:800, border:'none', cursor:'pointer'
          }}
        >
          Tap to start audio & mic
        </button>
      )}
    </div>
  );

  return (
    <div style={{
      width: PANEL_W,
      height: PANEL_H,
      boxSizing:'border-box',
      margin:'0 auto',
      padding:10,
      background:'transparent',
      display:'grid',
      gridTemplateRows: showChat ? '60% 40%' : '1fr',
      gap:10,
      borderRadius: 14,
    }}>
      {videoArea}

      {showChat && (
        <div style={{
          borderRadius:12, overflow:'hidden', border:'1px solid #1f2430',
          background:'#0f1220', color:'#e9ecf1', display:'grid', gridTemplateRows:'1fr auto'
        }}>
          <div ref={chatScrollRef} style={{ padding:'10px 12px', overflowY:'auto', fontSize:14 }}>
            {messages.length === 0 ? (
              <div style={{ opacity:.75 }}>Type a message to start the conversation.</div>
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
      )}

      {error && (
        <div style={{
          position:'absolute', left:10, right:10, bottom:10,
          background:'#2a1215', border:'1px solid #5c1a1e',
          color:'#ffd4d6', borderRadius:10, padding:'8px 10px', fontSize:12
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  background:'rgba(255,255,255,.15)',
  color:'#fff',
  border:'1px solid rgba(255,255,255,.25)',
  borderRadius:10,
  padding:'8px 10px',
  cursor:'pointer',
  backdropFilter:'blur(4px)',
};

export default function EmbedPage() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
      <PageInner />
    </Suspense>
  );
}
