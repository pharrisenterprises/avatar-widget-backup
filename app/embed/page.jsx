'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { loadHeygenSdk } from '../lib/loadHeygenSdk';

const PANEL_W = 360;
const PANEL_H = 420;
const IDLE_MS = 30_000; // 30 seconds
const LS_CHAT_KEY = 'retell_chat_id';

function EmbedPageInner() {
  const searchParams = useSearchParams();
  const autostart = useMemo(() => searchParams?.get('autostart') === '1', [searchParams]);

  const videoRef = useRef(null);
  const avatarRef = useRef(null); // StreamingAvatar instance

  const [status, setStatus] = useState('idle'); // idle | connecting | ready | error
  const [error, setError] = useState('');
  const [logs, setLogs] = useState([]);

  const [retellChatId, setRetellChatId] = useState('');
  const [messages, setMessages] = useState([]); // {role:'user'|'assistant'|'system', text:string}
  const [input, setInput] = useState('');

  const idleTimerRef = useRef(null);

  const avatarId = useMemo(() => process.env.NEXT_PUBLIC_HEYGEN_AVATAR_ID || '', []);

  const log = useCallback((...args) => {
    const line = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    setLogs(prev => [...prev.slice(-150), `[${new Date().toLocaleTimeString()}] ${line}`]);
    // eslint-disable-next-line no-console
    console.log('[EMBED]', ...args);
  }, []);

  const pushMessage = useCallback((role, text) => {
    setMessages(prev => [...prev, { role, text }]);
  }, []);

  // ---------- Idle control ----------
  const clearIdle = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const armIdle = useCallback(() => {
    clearIdle();
    idleTimerRef.current = setTimeout(async () => {
      log('Idle timeout: pausing session to save cost.');
      pushMessage('system', 'Session paused after 30 seconds of inactivity. Click Start to continue.');
      await stopAll();
    }, IDLE_MS);
  }, [clearIdle, log, pushMessage]);

  const markActivity = useCallback(() => {
    armIdle();
    try { window.parent?.postMessage({ type: 'avatar:activity' }, '*'); } catch {}
  }, [armIdle]);

  // ---------- RETELL ----------
  const ensureRetellChat = useCallback(async () => {
    if (retellChatId) return retellChatId;

    // attempt resume from localStorage
    const stored = (typeof window !== 'undefined') ? window.localStorage.getItem(LS_CHAT_KEY) : '';
    if (stored) {
      setRetellChatId(stored);
      log('Retell: resumed existing chatId from localStorage:', stored);
      return stored;
    }

    log('Retell: starting chat…');
    const r = await fetch('/api/retell-chat/start', { method: 'GET', cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    log('Retell start response:', j);
    if (!r.ok || !j?.ok || !j?.chatId) {
      throw new Error(`Failed to start Retell chat: ${j?.error || j?.status || 'unknown'}`);
    }
    setRetellChatId(j.chatId);
    try { window.localStorage.setItem(LS_CHAT_KEY, j.chatId); } catch {}
    return j.chatId;
  }, [retellChatId, log]);

  const sendToRetell = useCallback(async (chatId, text) => {
    log('Retell: sending message…', { chatId, text });
    const r = await fetch('/api/retell-chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ chatId, text }),
    });
    const j = await r.json().catch(() => ({}));
    log('Retell send response:', j);
    if (!r.ok || !j?.ok) {
      throw new Error(`Retell send failed: ${j?.status || j?.error || 'unknown'}`);
    }
    return j.reply || '';
  }, [log]);

  // ---------- HEYGEN (StreamingAvatar) ----------
  const initHeygen = useCallback(async () => {
    setStatus('connecting');
    setError('');
    log('HeyGen: fetching token…');

    const tokenResp = await fetch('/api/heygen-token', { method: 'GET', cache: 'no-store' });
    const tokenJson = await tokenResp.json().catch(() => ({}));
    log('HeyGen token response:', tokenJson);
    const token = tokenJson?.token || tokenJson?.data?.token || tokenJson?.accessToken || '';
    if (!token) {
      throw new Error('Missing HeyGen token from /api/heygen-token');
    }

    log('HeyGen: loading SDK…');
    const sdk = await loadHeygenSdk();
    if (!sdk) throw new Error('HeyGen SDK failed to load.');
    const { StreamingAvatar, AvatarQuality, StreamingEvents } = sdk;
    if (!StreamingAvatar) throw new Error('StreamingAvatar class not found in SDK.');

    const avatar = new StreamingAvatar({ token, debug: true });
    avatarRef.current = avatar;

    avatar.on(StreamingEvents.STREAM_READY, (evt) => {
      log('HeyGen: STREAM_READY.');
      const mediaStream = evt?.detail;
      if (videoRef.current && mediaStream instanceof MediaStream) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.muted = true; // required for autoplay
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch((e) => log('Video play() error:', e?.message || e));
        };
      }
    });

    avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
      log('HeyGen: STREAM_DISCONNECTED.');
      if (videoRef.current) videoRef.current.srcObject = null;
      setStatus('idle');
    });

    log('HeyGen: createStartAvatar()…', { avatarId });
    const sessionData = await avatar.createStartAvatar({
      avatarName: avatarId,
      quality: AvatarQuality?.High || 'high',
      welcomeMessage: ''
    });
    log('HeyGen: session started:', sessionData);

    setStatus('ready');
    markActivity();
  }, [avatarId, log, markActivity]);

  // Speak Retell reply EXACTLY (REPEAT mode)
  const speak = useCallback(async (text) => {
    const avatar = avatarRef.current;
    if (!avatar || !text) return;

    const sdk = await loadHeygenSdk();
    const { TaskType } = sdk || {};
    const payload = TaskType ? { text, taskType: TaskType.REPEAT } : { text, taskType: 'REPEAT' };

    log('HeyGen: speak ->', payload);
    try {
      await avatar.speak(payload);
      markActivity();
    } catch (e) {
      log('HeyGen speak error:', e?.message || e);
    }
  }, [log, markActivity]);

  // Unmute video (user gesture)
  const unmuteAudio = useCallback(async () => {
    try {
      if (videoRef.current) {
        videoRef.current.muted = false;
        await videoRef.current.play().catch(() => {});
        log('Video: unmuted & play() called.');
      }
    } catch (e) {
      log('Video unmute/play error:', e?.message || e);
    }
  }, [log]);

  // Submit handler (text chat)
  const onSubmit = useCallback(async (e) => {
    e?.preventDefault?.();
    const text = input.trim();
    if (!text) return;

    setInput('');
    pushMessage('user', text);
    markActivity();

    try {
      const chatId = await ensureRetellChat();
      const reply = await sendToRetell(chatId, text);
      const safeReply = (reply || '').toString();
      pushMessage('assistant', safeReply);
      await speak(safeReply); // REPEAT mode makes audio == captions
    } catch (err) {
      const msg = err?.message || 'Send failed';
      setError(msg);
      setStatus(s => (s === 'ready' ? s : 'error'));
      pushMessage('system', `Error: ${msg}`);
      log('Send error:', msg);
    }
  }, [input, ensureRetellChat, sendToRetell, pushMessage, speak, markActivity, log]);

  // Autostart if requested + try to resume chatId from LS
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // restore chat id if present
        try {
          const stored = window.localStorage.getItem(LS_CHAT_KEY);
          if (stored) setRetellChatId(stored);
        } catch {}

        if (!autostart) return;
        await initHeygen();
        if (!cancelled) {
          await ensureRetellChat();
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e?.message || 'Startup error';
          setError(msg);
          setStatus('error');
          log('Autostart error:', msg);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [autostart, initHeygen, ensureRetellChat, log]);

  const stopAll = useCallback(async () => {
    clearIdle();
    try {
      const avatar = avatarRef.current;
      if (avatar && typeof avatar.stopAvatar === 'function') {
        await avatar.stopAvatar();
      }
      avatarRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    } catch (e) {
      log('Stop error:', e?.message || e);
    } finally {
      setStatus('idle');
    }
  }, [clearIdle, log]);

  const startAll = useCallback(async () => {
    try {
      await initHeygen();
      await ensureRetellChat();
    } catch (e) {
      const msg = e?.message || 'Start failed';
      setError(msg);
      setStatus('error');
      log('Start error:', msg);
    }
  }, [initHeygen, ensureRetellChat, log]);

  // Clean up timer
  useEffect(() => () => clearIdle(), [clearIdle]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, padding: 16 }}>
      <div style={{ width: PANEL_W, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            width: PANEL_W,
            height: PANEL_H,
            background: '#000',
            borderRadius: 8,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <video
            ref={videoRef}
            width={PANEL_W}
            height={PANEL_H}
            playsInline
            autoPlay
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
          />
          {status !== 'ready' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                background: 'rgba(0,0,0,0.35)',
                fontWeight: 600,
                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
              }}
            >
              {status === 'idle' && 'Idle'}
              {status === 'connecting' && 'Connecting…'}
              {status === 'error' && 'Error'}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={startAll}
            disabled={status === 'connecting' || status === 'ready'}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #ddd',
              background: status === 'ready' ? '#e8f5e9' : '#f6f6f6',
              cursor: status === 'ready' ? 'default' : 'pointer',
              fontWeight: 600,
            }}
          >
            Start
          </button>
          <button
            onClick={stopAll}
            disabled={status !== 'ready'}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #ddd',
              background: '#fff3f3',
              cursor: status === 'ready' ? 'pointer' : 'default',
              fontWeight: 600,
            }}
          >
            Stop
          </button>
        </div>

        <button
          onClick={unmuteAudio}
          disabled={status !== 'ready'}
          style={{
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid #ddd',
            background: '#fff',
            fontWeight: 600,
            cursor: status === 'ready' ? 'pointer' : 'default',
          }}
        >
          Unmute
        </button>

        {error ? (
          <div
            style={{
              background: '#fff5f5',
              border: '1px solid #ffd7d7',
              color: '#b00020',
              borderRadius: 8,
              padding: 8,
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            {error}
          </div>
        ) : null}

        <div
          style={{
            fontSize: 12,
            color: '#666',
            marginTop: 4,
            textAlign: 'left',
            wordBreak: 'break-word',
          }}
        >
          <div><strong>Avatar ID</strong>: {avatarId || 'N/A'}</div>
          <div><strong>Retell Chat ID</strong>: {retellChatId || 'N/A'}</div>
          <div><strong>Status</strong>: {status}</div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateRows: '1fr auto',
          height: PANEL_H,
          maxWidth: 640,
          border: '1px solid #eee',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: 12,
            overflowY: 'auto',
            background: '#fafafa',
          }}
        >
          {messages.length === 0 ? (
            <div style={{ color: '#777', fontSize: 14 }}>
              Start a conversation. Type a message below—Retell will reply and the avatar will speak it.
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 12,
                    minWidth: 72,
                    textTransform: 'capitalize',
                    color:
                      m.role === 'user'
                        ? '#1565c0'
                        : m.role === 'assistant'
                        ? '#2e7d32'
                        : '#8e24aa',
                  }}
                >
                  {m.role}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{m.text}</div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, padding: 8, background: '#fff' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={status === 'ready' ? 'Type your message…' : 'Click Start to begin…'}
            disabled={status !== 'ready'}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #ddd',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={status !== 'ready' || !input.trim()}
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #0b72e7',
              background: '#0b72e7',
              color: '#fff',
              fontWeight: 700,
              cursor: status === 'ready' && input.trim() ? 'pointer' : 'default',
            }}
          >
            Send
          </button>
        </form>
      </div>

      {/* Debug panel */}
      <div style={{ gridColumn: '1 / span 2', border: '1px dashed #ddd', borderRadius: 8, padding: 8 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Debug Log</div>
        <div style={{ maxHeight: 160, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>
          {logs.length === 0 ? 'No logs yet…' : logs.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
    </div>
  );
}

export default function EmbedPage() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
      <EmbedPageInner />
    </Suspense>
  );
}
