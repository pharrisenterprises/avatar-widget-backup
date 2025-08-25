// app/embed/page.jsx
'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { loadHeygenSdk } from '../lib/loadHeygenSdk';

const LS_CHAT_KEY = 'retell_chat_id';

function PageInner() {
  const sp = useSearchParams();
  const autostart = useMemo(() => (sp?.get('autostart') ?? '1') === '1', [sp]);
  const q = (sp?.get('q') || 'medium').toLowerCase();

  const videoRef = useRef(null);
  const avatarRef = useRef(null);

  const [status, setStatus] = useState('idle'); // idle | connecting | ready | error
  const [error, setError] = useState('');
  const [chatId, setChatId] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const avatarName = process.env.NEXT_PUBLIC_HEYGEN_AVATAR_ID || '';

  const push = useCallback((role, text) => {
    setMessages((p) => [...p, { role, text }]);
  }, []);

  // ------------ Retell helpers ------------
  const ensureChat = useCallback(async () => {
    if (chatId) return chatId;
    try {
      const s = window.localStorage.getItem(LS_CHAT_KEY);
      if (s) {
        setChatId(s);
        console.log('[EMBED] Resumed Retell chat from LS:', s);
        return s;
      }
    } catch {}
    console.log('[EMBED] Starting Retell chat…');
    const r = await fetch('/api/retell-chat/start', { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    console.log('[EMBED] /api/retell-chat/start ->', j);
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
    console.log('[EMBED] /api/retell-chat/send ->', j);
    if (!r.ok || !j?.ok) {
      const err = new Error('SEND_FAILED');
      err.status = r.status;
      throw err;
    }
    return j.reply || '';
  }, []);

  // ------------ HeyGen helpers ------------
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

    // 1) Token
    const tr = await fetch('/api/heygen-token', { cache: 'no-store' });
    const tj = await tr.json().catch(() => ({}));
    console.log('[EMBED] /api/heygen-token ->', tj);
    const token = tj?.token || tj?.data?.token || tj?.accessToken || '';
    if (!token) throw new Error('TOKEN_MISSING');

    // 2) SDK
    const sdk = await loadHeygenSdk();
    console.log('[EMBED] HeyGen SDK loaded:', !!sdk, sdk && Object.keys(sdk));
    if (!sdk?.StreamingAvatar) throw new Error('SDK_MISSING');

    const { StreamingAvatar, StreamingEvents, AvatarQuality, TaskType } = sdk;
    const avatar = new StreamingAvatar({ token, debug: true });
    avatarRef.current = avatar;

    avatar.on(StreamingEvents.STREAM_READY, (evt) => {
      console.log('[EMBED] STREAM_READY');
      const stream = evt?.detail;
      if (videoRef.current && stream instanceof MediaStream) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch((e) => console.warn('video.play() failed:', e?.message));
          setStatus('ready');
        };
      }
    });

    avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
      console.log('[EMBED] STREAM_DISCONNECTED');
      if (videoRef.current) videoRef.current.srcObject = null;
      setStatus('idle');
    });

    if (StreamingEvents.ERROR) {
      avatar.on(StreamingEvents.ERROR, (e) => {
        console.error('[EMBED] Streaming ERROR event:', e);
        setError(`HEYGEN_ERROR_EVENT: ${e?.detail?.message || e?.message || 'Unknown'}`);
        setStatus('error');
      });
    }

    const quality =
      q.startsWith('l') ? (AvatarQuality?.Low || 'low') :
      q.startsWith('h') ? (AvatarQuality?.High || 'high') :
                          (AvatarQuality?.Medium || 'medium');

    // 3) Start session
    console.log('[EMBED] createStartAvatar() with:', { avatarName, quality });
    try {
      const session = await avatar.createStartAvatar({
        avatarName,        // make sure this exists on your tenant
        quality,
        welcomeMessage: '',
      });
      console.log('[EMBED] Session started:', session);
    } catch (e) {
      console.error('[EMBED] createStartAvatar FAILED:', e);
      const msg = e?.message || (typeof e === 'string' ? e : JSON.stringify(e));
      setError(`HEYGEN_CREATE_FAILED: ${msg}`);
      setStatus('error');
      throw e; // surface to outer catch for good measure
    }

    // Helper to speak
    async function speak(text) {
      if (!text) return;
      const payload = TaskType ? { text, taskType: TaskType.REPEAT } : { text, taskType: 'REPEAT' };
      try { await avatar.speak(payload); } catch (e) {
        console.warn('avatar.speak error:', e?.message || e);
      }
    }
    window.__avatarSpeak = speak;
  }, [avatarName, q]);

  // ------------ Submit ------------
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

  // ------------ Autostart & cleanup ------------
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

  // ------------ UI ------------
  return (
    <div style={{
      width: 'min(480px, 95vw)',
      height: 'min(720px, calc(100vh - 48px))',
      display: 'grid',
      gridTemplateRows: '55% 45%',
      gap: 10, padding: 10, boxSizing: 'border-box',
    }}>
      {/* Video */}
      <div style={{ position:'relative', borderRadius:12, overflow:'hidden', background:'#000' }}>
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          style={{ width:'100%', height:'100%', objectFit:'cover', background:'#000' }}
        />
        {status !== 'ready' && (
          <div style={{ position:'absolute', inset:0, display:'grid', placeItems:'center',
                        color:'#fff', background:'rgba(0,0,0,.35)', fontWeight:700, padding:12, textAlign:'center' }}>
            {status === 'idle' ? 'Idle' :
             status === 'connecting' ? 'Connecting…' :
             `Error${error ? `: ${error}` : ''}`}
          </div>
        )}
      </div>

      {/* Chat */}
      <div style={{
        borderRadius:12, overflow:'hidden', border:'1px solid #1f2430',
        background:'#0f1220', color:'#e9ecf1', display:'grid', gridTemplateRows:'1fr auto'
      }}>
        <div style={{ padding:'10px 12px', overflowY:'auto', fontSize:14 }}>
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
    </div>
  );
}

export default function EmbedPage() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
      <PageInner />
    </Suspense>
  );
}
