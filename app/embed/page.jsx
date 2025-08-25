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
import { loadHeygenSdk } from '../lib/loadHeygenSdk';

const LS_CHAT_KEY = 'retell_chat_id';

// D-ID-like compact footprint
const PANEL_W = 360;
const PANEL_H = 600; // 50/50: top video ~300px, bottom chat ~300px

function PageInner() {
  const videoRef = useRef(null);
  const avatarRef = useRef(null);
  const chatScrollRef = useRef(null);

  const [status, setStatus] = useState('idle'); // idle | connecting | ready | error
  const [error, setError] = useState('');
  const [chatId, setChatId] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const [needUnmute, setNeedUnmute] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  // Always read once
  const avatarName = useMemo(
    () => process.env.NEXT_PUBLIC_HEYGEN_AVATAR_ID || '',
    []
  );

  // auto-scroll chat to bottom on new messages
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const pushMsg = useCallback((role, text) => {
    setMessages((p) => [...p, { role, text: String(text || '') }]);
  }, []);

  // ---------- RETELL ----------
  const restoreChat = useCallback(() => {
    try {
      const s = window.localStorage.getItem(LS_CHAT_KEY);
      if (s) {
        setChatId(s);
        return s;
      }
    } catch {}
    return '';
  }, []);

  const ensureChat = useCallback(async () => {
    if (chatId) return chatId;
    const restored = restoreChat();
    if (restored) return restored;

    const r = await fetch('/api/retell-chat/start', { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok || !j?.chatId) {
      const d = j?.detail ? ` — ${JSON.stringify(j.detail)}` : '';
      throw Object.assign(new Error('CHAT_START_FAILED' + d), { cause: j });
    }
    setChatId(j.chatId);
    try { window.localStorage.setItem(LS_CHAT_KEY, j.chatId); } catch {}
    return j.chatId;
  }, [chatId, restoreChat]);

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

  // ---------- Audio helpers ----------
  // Try to get mic permission at load (non-blocking if denied).
  useEffect(() => {
    (async () => {
      if (!micOn) return;
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        // If denied, keep going. We only needed the permission prompt early.
        setMicOn(false);
      }
    })();
  }, [micOn]);

  const tryUnmuteOutput = useCallback(async () => {
    try {
      if (!videoRef.current) return;
      videoRef.current.muted = !speakerOn;
      if (speakerOn) {
        await videoRef.current.play();
      } else {
        // If muted, play is usually allowed.
        await videoRef.current.play().catch(() => {});
      }
      setNeedUnmute(false);
    } catch (e) {
      // Autoplay with sound was blocked. Show a small unmute strip.
      setNeedUnmute(true);
    }
  }, [speakerOn]);

  // ---------- HeyGen ----------
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
    if (!token) {
      setStatus('error');
      throw new Error('TOKEN');
    }

    const sdk = await loadHeygenSdk();
    if (!sdk?.StreamingAvatar) {
      setStatus('error');
      throw new Error('SDK');
    }

    const { StreamingAvatar, StreamingEvents, AvatarQuality, TaskType } = sdk;
    const avatar = new StreamingAvatar({ token, debug: false });
    avatarRef.current = avatar;

    avatar.on(StreamingEvents.STREAM_READY, async (evt) => {
      const stream = evt?.detail;
      if (videoRef.current && stream instanceof MediaStream) {
        videoRef.current.srcObject = stream;
        // Attempt audible playback right away; fall back to “Enable sound” if blocked.
        await tryUnmuteOutput();
        setStatus('ready');
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

    // helper on window for lip-sync
    async function speak(text) {
      if (!text) return;
      const payload = TaskType
        ? { text, taskType: TaskType.REPEAT }
        : { text, taskType: 'REPEAT' };
      try { await avatar.speak(payload); } catch {}
    }
    window.__avatarSpeak = speak;
  }, [avatarName, tryUnmuteOutput]);

  // Kick everything off immediately.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await begin();
        if (alive) await ensureChat();
      } catch (e) {
        if (alive) {
          setError(e?.message || 'Startup error');
          setStatus('error');
        }
      }
    })();
    return () => { alive = false; stopAvatar(); };
  }, [begin, ensureChat, stopAvatar]);

  // ---------- Submit (text) ----------
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

  // ---------- UI ----------
  return (
    <div
      style={{
        width: PANEL_W,
        height: PANEL_H,
        display: 'grid',
        gridTemplateRows: '1fr 1fr', // 50/50 split
        gap: 10,
        padding: 10,
        boxSizing: 'border-box',
        background: 'transparent',
      }}
    >
      {/* Top: avatar video */}
      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
        <video
          ref={videoRef}
          playsInline
          autoPlay
          // We'll flip muted on/off inside tryUnmuteOutput
          muted={!speakerOn}
          style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
        />
        {status !== 'ready' && (
          <div
            style={{
              position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
              color: '#fff', background: 'rgba(0,0,0,.35)', fontWeight: 700
            }}
          >
            {status === 'idle' ? 'Idle' : status === 'connecting' ? 'Connecting…' : 'Error'}
          </div>
        )}

        {/* Small control chips (bottom-left) */}
        <div style={{ position: 'absolute', left: 8, bottom: 8, display: 'flex', gap: 8 }}>
          <button
            onClick={async () => {
              const next = !speakerOn;
              setSpeakerOn(next);
              if (videoRef.current) {
                videoRef.current.muted = !next;
                if (next) {
                  try { await videoRef.current.play(); setNeedUnmute(false); }
                  catch { setNeedUnmute(true); }
                }
              }
            }}
            title={speakerOn ? 'Mute' : 'Unmute'}
            style={chipBtn}
          >
            {speakerOn ? '🔊' : '🔈'}
          </button>
          <button
            onClick={async () => {
              const next = !micOn;
              setMicOn(next);
              if (next) {
                try { await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {}
              }
            }}
            title={micOn ? 'Mic on' : 'Mic off'}
            style={chipBtn}
          >
            {micOn ? '🎙️' : '🔇'}
          </button>
        </div>

        {/* If autoplay with sound was blocked, show slender “Enable sound” strip */}
        {needUnmute && (
          <button
            onClick={async () => {
              try {
                if (videoRef.current) {
                  videoRef.current.muted = false;
                  await videoRef.current.play();
                }
                setNeedUnmute(false);
                setSpeakerOn(true);
              } catch {}
            }}
            style={unmuteStrip}
            title="Enable sound"
          >
            Enable sound
          </button>
        )}
      </div>

      {/* Bottom: chat */}
      <div
        style={{
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid #1f2430',
          background: '#0f1220',
          color: '#e9ecf1',
          display: 'grid',
          gridTemplateRows: '1fr auto',
        }}
      >
        <div ref={chatScrollRef} style={{ padding: '10px 12px', overflowY: 'auto', fontSize: 14 }}>
          {messages.length === 0 ? (
            <div style={{ opacity: 0.75 }}>Type a message to start the conversation.</div>
          ) : (
            messages.map((m, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 12,
                    color: m.role === 'user' ? '#60a5fa' : m.role === 'assistant' ? '#34d399' : '#e879f9',
                  }}
                >
                  {m.role === 'assistant' ? 'Assistant' : m.role[0].toUpperCase() + m.role.slice(1)}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
              </div>
            ))
          )}
        </div>
        <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid #1f2430' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message…"
            st
