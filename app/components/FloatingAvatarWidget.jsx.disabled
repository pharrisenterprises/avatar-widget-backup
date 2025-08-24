'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadHeygenSdk } from '@/app/lib/loadHeygenSdk';

const AVATAR_NAME = process.env.NEXT_PUBLIC_HEYGEN_AVATAR_ID || '';
const MAX_RETRIES = 4;

function useDupeGuard(ms = 2500) {
  const last = useRef({ t: '', ts: 0 });
  return useCallback((s) => {
    const text = (s || '').trim();
    const now = Date.now();
    const dupe = text && text === last.current.t && now - last.current.ts < ms;
    if (!dupe) last.current = { t: text, ts: now };
    return dupe;
  }, [ms]);
}

export default function FloatingAvatarWidget() {
  // UI state
  const [open, setOpen] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [muted, setMuted] = useState(true);
  const [status, setStatus] = useState('idle'); // idle | connecting | ready | reconnecting | error
  const [hint, setHint] = useState(''); // vendor-agnostic error/status lines
  const [messages, setMessages] = useState([]); // {role,text}
  const [input, setInput] = useState('');

  // Refs
  const videoRef = useRef(null);
  const avatarRef = useRef(null);
  const startLockRef = useRef(null); // serialize createStartAvatar
  const retriesRef = useRef(0);
  const destroyRef = useRef(false);
  const hadGestureRef = useRef(false);

  // Mic & SR
  const micWantedRef = useRef(false);
  const micActiveRef = useRef(false);
  const recogRef = useRef(null);
  const micSessionIdRef = useRef(0);

  // Chat
  const guardUser = useDupeGuard(2500);
  const guardAssistant = useDupeGuard(2500);

  const push = useCallback((role, text) => {
    setMessages((p) => [...p, { role, text }]);
  }, []);

  // ======== RETELL HELPERS (uses your existing API routes) ========
  const ensureChat = useCallback(async () => {
    // try to resume prior chat
    try {
      const s = window.localStorage.getItem('retell_chat_id');
      if (s) return s;
    } catch {}
    const r = await fetch('/api/retell-chat/start', { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok || !j?.chatId) {
      const e = new Error('CHAT_START_FAILED');
      e.status = r.status || j?.status;
      e.detail = j;
      throw e;
    }
    try { window.localStorage.setItem('retell_chat_id', j.chatId); } catch {}
    return j.chatId;
  }, []);

  const sendToAgent = useCallback(async (text) => {
    const chatId = await ensureChat();
    const r = await fetch('/api/retell-chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ chatId, text }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) {
      const e = new Error('SEND_FAILED');
      e.status = r.status || j?.status;
      e.detail = j;
      throw e;
    }
    return j.reply || '';
  }, [ensureChat]);

  // ======== HEYGEN START/STOP (serialized + backoff) ========
  const stopAvatar = useCallback(async () => {
    try { await avatarRef.current?.stopAvatar?.(); } catch {}
    avatarRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const speak = useCallback(async (text) => {
    if (!text) return;
    const sdk = await loadHeygenSdk();
    const a = avatarRef.current;
    if (!a) return;
    // try to unmute (if the user tapped open, autoplay will allow)
    if (videoRef.current) {
      try { videoRef.current.muted = false; await videoRef.current.play(); setMuted(false); } catch {}
    }
    try {
      const payload = sdk.TaskType ? { text, taskType: sdk.TaskType.REPEAT } : { text, taskType: 'REPEAT' };
      await a.speak(payload);
    } catch {}
  }, []);

  const startAvatar = useCallback(async () => {
    if (startLockRef.current) return startLockRef.current; // serialize
    startLockRef.current = (async () => {
      setStatus(retriesRef.current ? 'reconnecting' : 'connecting');
      setHint('');
      // get token
      const tr = await fetch('/api/heygen-token', { cache: 'no-store' });
      const tj = await tr.json().catch(() => ({}));
      const token = tj?.token || tj?.data?.token || '';
      if (!token) throw new Error('NO_TOKEN');

      const sdk = await loadHeygenSdk();
      const { StreamingAvatar, StreamingEvents, AvatarQuality } = sdk || {};
      if (!StreamingAvatar) throw new Error('SDK');

      const avatar = new StreamingAvatar({ token, debug: false });
      avatarRef.current = avatar;

      avatar.on(StreamingEvents.STREAM_READY, (evt) => {
        const stream = evt?.detail;
        if (videoRef.current && stream instanceof MediaStream) {
          videoRef.current.srcObject = stream;
          // We opened the panel via user click. Try to unmute right away.
          (async () => {
            try { videoRef.current.muted = false; await videoRef.current.play(); setMuted(false); }
            catch { videoRef.current.muted = true; setMuted(true); }
            finally { setStatus('ready'); }
          })();
        } else {
          setStatus('error');
          setHint('Media not available. Please try again.');
        }
      });

      avatar.on(StreamingEvents.STREAM_DISCONNECTED, async () => {
        await stopAvatar();
        if (destroyRef.current) return;
        const attempt = retriesRef.current + 1;
        if (attempt > MAX_RETRIES) {
          setStatus('error');
          setHint('Connection lost. Please reopen.');
          return;
        }
        retriesRef.current = attempt;
        const jitter = Math.random() * 300;
        const backoff = Math.min(1200 * Math.pow(2, attempt - 1) + jitter, 9000);
        setTimeout(() => { startAvatar().catch(() => {}); }, backoff);
      });

      await avatar.createStartAvatar({
        avatarName: AVATAR_NAME,
        quality: AvatarQuality?.Medium || 'medium', // stable default
        welcomeMessage: '',
      });

      return avatar;
    })().finally(() => {
      // allow new starts only after the current promise resolves/rejects
      startLockRef.current = null;
    });

    return startLockRef.current;
  }, [stopAvatar]);

  // ======== MIC / SPEECH RECOGNITION ========
  const stopMic = useCallback(() => {
    micWantedRef.current = false;
    micActiveRef.current = false;
    try { recogRef.current?.stop?.(); } catch {}
    recogRef.current = null;
  }, []);

  const startMic = useCallback(async () => {
    if (micActiveRef.current) return;
    micWantedRef.current = true;

    // (1) user gesture guaranteed (came from click handler)
    // resume audio context and get mic permission
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) { const ctx = new Ctx(); await ctx.resume().catch(() => {}); }
    } catch {}
    try {
      const gum = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      try { gum.getTracks().forEach(t => t.stop()); } catch {}
    } catch {
      setHint('Mic permission blocked.');
      return;
    }

    // (2) start SR if supported
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setHint('Voice input not supported on this browser.'); return; }

    try { recogRef.current?.stop?.(); } catch {}
    const rec = new SR();
    recogRef.current = rec;
    micActiveRef.current = true;
    const mySession = ++micSessionIdRef.current;

    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = async (e) => {
      if (micSessionIdRef.current !== mySession) return;
      const last = e.results?.[e.results.length - 1];
      const text = (last?.[0]?.transcript || '').trim();
      if (!text || guardUser(text)) return;

      setMessages(p => [...p, { role: 'user', text }]);
      try {
        const reply = await sendToAgent(text);
        if (!guardAssistant(reply)) {
          setMessages(p => [...p, { role: 'assistant', text: reply }]);
          speak(reply);
        }
      } catch (err) {
        setMessages(p => [...p, { role: 'system', text: 'Message failed. Please try again.' }]);
      }
    };
    rec.onend = () => {
      if (micWantedRef.current && micSessionIdRef.current === mySession) {
        try { rec.start(); } catch {}
      }
    };
    rec.onerror = () => {
      if (micWantedRef.current && micSessionIdRef.current === mySession) {
        setTimeout(() => { try { rec.start(); } catch {} }, 400);
      }
    };

    try { rec.start(); } catch {}
  }, [guardAssistant, guardUser, sendToAgent, speak]);

  // ======== OPEN/CLOSE ========
  const handleOpen = useCallback(async () => {
    hadGestureRef.current = true;
    destroyRef.current = false;
    setOpen(true);
    setShowChat(false); // start in video-only view like D-ID
    setHint('');
    retriesRef.current = 0;

    // Use the same click gesture to unlock audio + mic and start avatar
    await startAvatar().catch(() => {
      setStatus('error');
      setHint('Unable to connect. Please try again.');
    });
    // Arm the mic after we kicked the stream start
    startMic();
  }, [startAvatar, startMic]);

  const handleClose = useCallback(async () => {
    destroyRef.current = true;
    setOpen(false);
    stopMic();
    await stopAvatar();
    setStatus('idle');
    setHint('');
  }, [stopAvatar, stopMic]);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    const next = !videoRef.current.muted;
    videoRef.current.muted = next;
    setMuted(next);
    if (!next) videoRef.current.play().catch(() => {});
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e?.preventDefault?.();
    const text = input.trim();
    if (!text) return;
    setInput('');
    if (!guardUser(text)) setMessages(p => [...p, { role: 'user', text }]);
    try {
      const reply = await sendToAgent(text);
      if (!guardAssistant(reply)) {
        setMessages(p => [...p, { role: 'assistant', text: reply }]);
        speak(reply);
      }
    } catch {
      setMessages(p => [...p, { role: 'system', text: 'Message failed. Please try again.' }]);
    }
  }, [input, guardUser, guardAssistant, sendToAgent, speak]);

  // Allow opening via custom event if you want to wire your site icon:
  useEffect(() => {
    const onOpen = () => handleOpen();
    const onClose = () => handleClose();
    window.addEventListener('avatar-widget:open', onOpen);
    window.addEventListener('avatar-widget:close', onClose);
    return () => {
      window.removeEventListener('avatar-widget:open', onOpen);
      window.removeEventListener('avatar-widget:close', onClose);
    };
  }, [handleOpen, handleClose]);

  // ========== RENDER ==========
  return (
    <>
      {/* Floating Action Button */}
      {!open && (
        <button
          onClick={handleOpen}
          aria-label="Open assistant"
          style={fabStyle}
        >
          <span style={{ fontSize: 22 }}>🧠</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div style={panelWrap}>
          <div style={panelCard}>
            {/* Header controls */}
            <div style={panelHeader}>
              <button title="Toggle captions" onClick={() => setShowChat((v) => !v)} style={iconBtn}>💬</button>
              <button title={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} style={iconBtn}>
                {muted ? '🔈' : '🔊'}
              </button>
              <button title="Close" onClick={handleClose} style={iconBtn}>✕</button>
            </div>

            {/* Video area */}
            <div style={videoBox}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={muted}
                style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
              />
              {status !== 'ready' && (
                <div style={overlay}>
                  {status === 'connecting' && 'Connecting…'}
                  {status === 'reconnecting' && 'Reconnecting…'}
                  {status === 'error' && 'Error'}
                </div>
              )}
              {!!hint && <div style={hintBadge}>{hint}</div>}
              <div style={micBadge}>{micActiveRef.current ? 'Mic on' : 'Mic off'}</div>
            </div>

            {/* Chat area (collapsible) */}
            {showChat && (
              <div style={chatWrap}>
                <div style={chatLog}>
                  {messages.length === 0 ? (
                    <div style={{ opacity: 0.75 }}>Say something or type below…</div>
                  ) : (
                    messages.map((m, i) => (
                      <div key={i} style={{ marginBottom: 8 }}>
                        <div style={{
                          fontWeight: 700, fontSize: 12,
                          color: m.role === 'user' ? '#60a5fa' : m.role === 'assistant' ? '#34d399' : '#e879f9'
                        }}>
                          {m.role}
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                      </div>
                    ))
                  )}
                </div>
                <form onSubmit={handleSubmit} style={chatForm}>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type your message…"
                    style={chatInput}
                  />
                  <button type="submit" style={sendBtn}>Send</button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- styles (inline to keep this self-contained) ---------- */
const fabStyle = {
  position: 'fixed', right: 16, bottom: 16,
  width: 56, height: 56, borderRadius: 9999,
  display: 'grid', placeItems: 'center',
  background: '#2563eb', color: '#fff',
  border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
  cursor: 'pointer', zIndex: 50
};

const panelWrap = {
  position: 'fixed', right: 16, bottom: 16,
  width: 420, maxWidth: '95vw', height: 520, maxHeight: '85vh',
  zIndex: 50
};

const panelCard = {
  width: '100%', height: '100%',
  background: '#0b0b0c', color: '#eaeaea',
  border: '1px solid #242428', borderRadius: 16,
  boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
  display: 'grid', gridTemplateRows: 'auto 1fr auto',
  overflow: 'hidden'
};

const panelHeader = {
  display: 'flex', gap: 8, justifyContent: 'flex-end',
  padding: 8, borderBottom: '1px solid #1f1f23'
};

const iconBtn = {
  width: 36, height: 36, borderRadius: 10,
  display: 'grid', placeItems: 'center',
  background: 'rgba(255,255,255,0.06)', color: '#fff',
  border: '1px solid rgba(255,255,255,0.15)',
  cursor: 'pointer'
};

const videoBox = { position: 'relative', width: '100%', height: 280, background: '#000' };

const overlay = {
  position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
  color: '#fff', background: 'rgba(0,0,0,0.35)', fontWeight: 700
};

const hintBadge = {
  position: 'absolute', bottom: 8, left: 8,
  background: 'rgba(0,0,0,0.6)', color: '#fff',
  padding: '4px 8px', borderRadius: 999, fontSize: 12
};

const micBadge = {
  position: 'absolute', bottom: 8, right: 8,
  background: 'rgba(0,0,0,0.6)', color: '#fff',
  padding: '4px 8px', borderRadius: 999, fontSize: 12
};

const chatWrap = { display: 'grid', gridTemplateRows: '1fr auto', height: '100%', borderTop: '1px solid #1f1f23' };
const chatLog  = { padding: 10, overflowY: 'auto', fontSize: 14 };
const chatForm = { display: 'flex', gap: 8, padding: 10, borderTop: '1px solid #1f1f23' };
const chatInput = {
  flex: 1, borderRadius: 10, border: '1px solid #2a2a30',
  background: '#15151a', color: '#eaeaea', padding: '10px 12px', outline: 'none'
};
const sendBtn = {
  padding: '10px 14px', borderRadius: 10, border: '1px solid #2563eb',
  background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer'
};
