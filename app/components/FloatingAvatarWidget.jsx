'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { loadHeygenSdk } from '../lib/loadHeygenSdk';

const LS_CHAT_KEY = 'retell_chat_id';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function makeDupeGuard(windowMs = 2500) {
  const last = { text: '', ts: 0 };
  return (t) => {
    const now = Date.now();
    const s = (t || '').trim();
    const dupe = s && s === last.text && now - last.ts < windowMs;
    if (!dupe) { last.text = s; last.ts = now; }
    return dupe;
  };
}

export default function FloatingAvatarWidget({
  defaultOpen = false,
  defaultShowChat = true,
  quality = 'medium', // 'low' | 'medium' | 'high'
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showChat, setShowChat] = useState(defaultShowChat);

  const avatarId = useMemo(
    () => process.env.NEXT_PUBLIC_HEYGEN_AVATAR_ID || '',
    []
  );

  // video/audio
  const videoRef = useRef(null);
  const playPromiseRef = useRef(null);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | connecting | ready | reconnecting | error
  const [uiMsg, setUiMsg] = useState('');

  // avatar lifecycle
  const avatarRef = useRef(null);
  const startLockRef = useRef(false);
  const stopOnceRef = useRef(false);

  // speak queue
  const speakQueueRef = useRef([]);
  const flushingRef = useRef(false);

  // chat + mic
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [micState, setMicState] = useState('off'); // off | starting | on | blocked | unsupported
  const micWantedRef = useRef(false);
  const micActiveRef = useRef(false);
  const recogRef = useRef(null);
  const micSessionIdRef = useRef(0);
  const guardUser = useRef(makeDupeGuard(2500));
  const guardAssistant = useRef(makeDupeGuard(2500));
  const [chatId, setChatId] = useState('');

  // ---------- Retell helpers ----------
  const friendlyFail = (code) =>
    code ? `Message failed (${code}). Please try again.` : 'Message failed. Please try again.';

  const pushMsg = useCallback((role, text) => {
    setMessages((p) => [...p, { role, text }]);
  }, []);

  const ensureChat = useCallback(
    async (forceNew = false) => {
      if (!forceNew && chatId) return chatId;
      if (!forceNew) {
        try {
          const s = localStorage.getItem(LS_CHAT_KEY);
          if (s) { setChatId(s); return s; }
        } catch {}
      }
      const r = await fetch('/api/retell-chat/start', { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok || !j?.chatId) {
        const err = new Error('CHAT_START_FAILED');
        err.status = r.status || j?.status;
        throw err;
      }
      setChatId(j.chatId);
      try { localStorage.setItem(LS_CHAT_KEY, j.chatId); } catch {}
      return j.chatId;
    },
    [chatId]
  );

  const sendOnce = useCallback(async (id, text) => {
    const r = await fetch('/api/retell-chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ chatId: id, text }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) {
      const err = new Error('SEND_FAILED');
      err.status = r.status || j?.status;
      err.detail = j;
      throw err;
    }
    return j.reply || '';
  }, []);

  const sendWithRetry = useCallback(
    async (text) => {
      try {
        const id = await ensureChat(false);
        return await sendOnce(id, text);
      } catch (err) {
        const code = Number(err?.status || 0);
        const maybeExpired =
          code === 400 ||
          /expired|invalid|not.*ongoing|bad request/i.test(
            String(err?.detail || err?.message || '')
          );
        if (maybeExpired) {
          const fresh = await ensureChat(true);
          try { localStorage.setItem(LS_CHAT_KEY, fresh); } catch {}
          return await sendOnce(fresh, text);
        }
        throw err;
      }
    },
    [ensureChat, sendOnce]
  );

  // ---------- Avatar helpers ----------
  const stopAvatar = useCallback(async () => {
    if (stopOnceRef.current) return;
    stopOnceRef.current = true;
    try { const a = avatarRef.current; if (a?.stopAvatar) await a.stopAvatar(); } catch {}
    avatarRef.current = null;
    const v = videoRef.current;
    if (v) { try { v.pause?.(); } catch {}; v.srcObject = null; }
  }, []);

  const speak = useCallback(async (text) => {
    if (!text) return;
    const sdk = await loadHeygenSdk();
    const a = avatarRef.current;
    if (!sdk || !a) { speakQueueRef.current.push(text); return; }

    const v = videoRef.current;
    if (v) {
      try {
        v.muted = false;
        setMuted(false);
        if (!playPromiseRef.current) {
          playPromiseRef.current = v.play().catch(() => {});
          await playPromiseRef.current;
          playPromiseRef.current = null;
        }
      } catch {}
    }

    const payload = sdk.TaskType
      ? { text, taskType: sdk.TaskType.REPEAT }
      : { text, taskType: 'REPEAT' };

    try { await a.speak(payload); }
    catch { speakQueueRef.current.push(text); }
  }, []);

  const flushSpeakQueue = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    while (speakQueueRef.current.length) {
      const t = speakQueueRef.current.shift();
      await speak(t);
    }
    flushingRef.current = false;
  }, [speak]);

  const beginAvatar = useCallback(async () => {
    if (startLockRef.current) return;
    startLockRef.current = true;
    stopOnceRef.current = false;

    let attempt = 0;
    const maxAttempts = 5;

    while (attempt < maxAttempts) {
      attempt += 1;
      setStatus(attempt === 1 ? 'connecting' : 'reconnecting');
      setUiMsg(attempt === 1 ? 'Connecting…' : 'Reconnecting…');

      try {
        const tr = await fetch('/api/heygen-token', { cache: 'no-store' });
        const tj = await tr.json().catch(() => ({}));
        const token = tj?.token || tj?.data?.token || tj?.accessToken || '';
        if (!token) throw new Error('TOKEN_MISSING');

        const sdk = await loadHeygenSdk();
        if (!sdk?.StreamingAvatar) throw new Error('SDK_LOAD_FAILED');

        const { StreamingAvatar, AvatarQuality, StreamingEvents } = sdk;
        const avatar = new StreamingAvatar({ token, debug: false });
        avatarRef.current = avatar;

        const onReady = (evt) => {
          const stream = evt?.detail;
          const v = videoRef.current;
          if (v && stream instanceof MediaStream) {
            v.srcObject = stream;
            v.muted = true;
            (async () => {
              try {
                if (!playPromiseRef.current) {
                  playPromiseRef.current = v.play().catch(() => {});
                  await playPromiseRef.current;
                  playPromiseRef.current = null;
                }
              } catch {}
              setMuted(true);
              setStatus('ready');
              setUiMsg('');
              flushSpeakQueue();
            })();
          }
        };

        const onDisconnected = async () => {
          try { avatar.off(StreamingEvents.STREAM_READY, onReady); } catch {}
          try { avatar.off(StreamingEvents.STREAM_DISCONNECTED, onDisconnected); } catch {}
          await stopAvatar();
          throw new Error('DISCONNECTED');
        };

        avatar.on(StreamingEvents.STREAM_READY, onReady);
        avatar.on(StreamingEvents.STREAM_DISCONNECTED, onDisconnected);

        const qmap = {
          low: sdk.AvatarQuality?.Low || 'low',
          medium: sdk.AvatarQuality?.Medium || 'medium',
          high: sdk.AvatarQuality?.High || 'high',
        };

        await avatar.createStartAvatar({
          avatarName: avatarId,
          quality: qmap[quality] || qmap.medium,
          welcomeMessage: '',
        });

        const readyCheck = (async () => {
          await sleep(10000);
          if (status !== 'ready') throw new Error('NOT_READY_TIMEOUT');
        })();

        await readyCheck;
        startLockRef.current = false;
        return;
      } catch {
        const base = 600 * Math.pow(2, attempt - 1);
        const jitter = Math.floor(Math.random() * 300);
        const wait = Math.min(6000, base + jitter);
        setUiMsg('Reconnecting…');
        await sleep(wait);
        continue;
      }
    }

    setStatus('error');
    setUiMsg('Network unstable. Please try again.');
    startLockRef.current = false;
  }, [avatarId, flushSpeakQueue, quality, status, stopAvatar]);

  // ---------- Mic (Web Speech) ----------
  const stopMic = useCallback(() => {
    micWantedRef.current = false;
    micActiveRef.current = false;
    try { recogRef.current?.stop?.(); } catch {}
    recogRef.current = null;
    setMicState('off');
  }, []);

  const startMic = useCallback(async () => {
    if (micActiveRef.current) return;

    const SR =
      typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) { setMicState('unsupported'); return; }

    try {
      const gum = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      try { gum.getTracks().forEach((t) => t.stop()); } catch {}
    } catch {
      setMicState('blocked');
      return;
    }

    try { recogRef.current?.stop?.(); } catch {}
    const rec = new SR();
    recogRef.current = rec;
    const mySession = ++micSessionIdRef.current;

    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = async (e) => {
      if (micSessionIdRef.current !== mySession) return;
      const last = e.results?.[e.results.length - 1];
      const text = (last?.[0]?.transcript || '').trim();
      if (!text || guardUser.current(text)) return;

      pushMsg('user', text);
      try {
        const reply = await sendWithRetry(text);
        if (!guardAssistant.current(reply)) {
          pushMsg('assistant', reply);
          await speak(reply);
        }
      } catch (err) {
        pushMsg('system', friendlyFail(Number(err?.status || 0)));
      }
    };
    rec.onend = () => {
      if (micWantedRef.current && micSessionIdRef.current === mySession) {
        try { rec.start(); } catch {}
      }
    };
    rec.onerror = () => {
      if (micWantedRef.current && micSessionIdRef.current === mySession) {
        setTimeout(() => { try { rec.start(); } catch {} }, 350);
      }
    };

    try {
      rec.start();
      micWantedRef.current = true;
      micActiveRef.current = true;
      setMicState('on');
    } catch {
      setMicState('blocked');
    }
  }, [pushMsg, sendWithRetry, speak]);

  // ---------- Open / Close ----------
  const openWidget = useCallback(async () => {
    setIsOpen(true);
    // treat button click as user gesture: resume AudioContext
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      await ac.resume();
      ac.close?.();
    } catch {}
    setStatus('connecting'); setUiMsg('Connecting…');
    await beginAvatar();
    await ensureChat(false);
    await startMic();
  }, [beginAvatar, ensureChat, startMic]);

  const closeWidget = useCallback(async () => {
    setIsOpen(false);
    setIsFullscreen(false);
    setShowChat(false);
    await stopAvatar();
    stopMic();
    setStatus('idle');
    setUiMsg('');
  }, [stopAvatar, stopMic]);

  // ---------- Manual actions ----------
  const toggleMute = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    setMuted(next);
    if (!next) {
      try {
        if (!playPromiseRef.current) {
          playPromiseRef.current = v.play().catch(() => {});
          await playPromiseRef.current;
          playPromiseRef.current = null;
        }
      } catch {}
    }
  }, []);

  const sendManual = useCallback(async (e) => {
    e?.preventDefault?.();
    const text = (input || '').trim();
    if (!text) return;
    setInput('');
    if (!guardUser.current(text)) pushMsg('user', text);
    try {
      const reply = await sendWithRetry(text);
      if (!guardAssistant.current(reply)) {
        pushMsg('assistant', reply);
        await speak(reply);
      }
    } catch (err) {
      pushMsg('system', friendlyFail(Number(err?.status || 0)));
    }
  }, [input, pushMsg, sendWithRetry, speak]);

  // cleanup
  useEffect(() => () => { stopAvatar(); stopMic(); }, [stopAvatar, stopMic]);

  // UI sizing
  const baseW = isFullscreen ? 'min(100vw, 1200px)' : 'min(92vw, 720px)';
  const baseH = isFullscreen ? 'min(100vh, 720px)' : 'min(70vh, 520px)';

  return (
    <>
      {!isOpen && (
        <button
          onClick={openWidget}
          aria-label="Open assistant"
          style={{
            position: 'fixed', right: 18, bottom: 18,
            width: 56, height: 56, borderRadius: 999, border: 'none',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)', background: '#0ea5e9',
            color: '#fff', fontSize: 22, cursor: 'pointer', zIndex: 1000,
          }}
        >
          ✨
        </button>
      )}

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            right: isFullscreen ? '50%' : 18,
            bottom: isFullscreen ? '50%' : 18,
            transform: isFullscreen ? 'translate(50%, 50%)' : 'none',
            width: baseW, height: baseH,
            borderRadius: isFullscreen ? 0 : 16, overflow: 'hidden',
            background: '#0f0f10', border: '1px solid #1f242c',
            boxShadow: '0 18px 60px rgba(0,0,0,0.45)',
            display: 'grid',
            gridTemplateColumns: showChat ? '1fr 340px' : '1fr',
            zIndex: 1000,
          }}
        >
          {/* Video */}
          <div style={{ position: 'relative', background: '#000' }}>
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted={muted}
              style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
            />

            {/* Controls */}
            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 8, zIndex: 2 }}>
              <button onClick={() => setIsFullscreen((v) => !v)} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} style={btn()}>🗖</button>
              <button onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} style={btn()}>{muted ? '🔈' : '🔊'}</button>
              <button onClick={() => setShowChat((v) => !v)} title={showChat ? 'Hide chat' : 'Show chat'} style={btn()}>💬</button>
              <button onClick={closeWidget} title="Close" style={btn()}>✕</button>
            </div>

            {/* Mic chip */}
            <div style={{ position: 'absolute', left: 10, bottom: 10, zIndex: 2 }}>
              <span style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 12, padding: '6px 10px', borderRadius: 999 }}>
                {micState === 'on' ? '🎙️ Mic on'
                  : micState === 'blocked' ? 'Tap “Allow mic”'
                  : micState === 'unsupported' ? 'Voice not supported'
                  : micState === 'starting' ? 'Mic starting…'
                  : 'Mic off'}
              </span>
            </div>

            {/* Status overlay */}
            {status !== 'ready' && (
              <div style={{
                position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                color: '#fff', background: 'rgba(0,0,0,0.35)', fontWeight: 700,
              }}>
                {uiMsg || 'Connecting…'}
              </div>
            )}
          </div>

          {/* Chat */}
          {showChat && (
            <div
              role="region"
              aria-label="Chat"
              style={{
                background: '#0f0f10',
                color: '#eaeaea',
                borderLeft: '1px solid #1f242c',
                display: 'grid',
                gridTemplateRows: '1fr auto',
              }}
            >
              <div style={{ overflowY: 'auto', padding: 12, fontSize: 14 }}>
                {messages.length === 0 ? (
                  <div style={{ opacity: 0.7 }}>Say something to get started…</div>
                ) : (
                  messages.map((m, i) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{
                        fontWeight: 700, fontSize: 12,
                        color: m.role === 'user' ? '#60a5fa' : m.role === 'assistant' ? '#34d399' : '#e879f9',
                      }}>
                        {m.role === 'assistant' ? 'Assistant' : m.role[0].toUpperCase() + m.role.slice(1)}
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={sendManual} style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid #1f242c' }}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message…"
                  style={{
                    flex: 1, borderRadius: 10, border: '1px solid #2a2a30',
                    background: '#15151a', color: '#eaeaea', padding: '10px 12px', outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  disabled={!input.trim()}
                  style={{
                    padding: '10px 14px', borderRadius: 10,
                    border: '1px solid #2563eb', background: '#2563eb', color: '#fff', fontWeight: 700,
                    cursor: input.trim() ? 'pointer' : 'default',
                  }}
                >
                  Send
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function btn() {
  return {
    border: 'none',
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    width: 34,
    height: 34,
    borderRadius: 10,
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
  };
}
