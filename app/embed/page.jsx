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
  const layout = useMemo(() => (sp?.get('layout') || '').toLowerCase(), [sp]);
  const videoFirst = useMemo(() => sp?.get('videoFirst') === '1', [sp]);
  const qualityQuery = useMemo(() => (sp?.get('q') || 'medium').toLowerCase(), [sp]);

  const videoRef = useRef(null);
  const avatarRef = useRef(null);

  const chatScrollRef = useRef(null);

  const [status, setStatus] = useState('idle'); // idle | connecting | ready | error
  const [error, setError] = useState('');
  const [chatId, setChatId] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const avatarName = process.env.NEXT_PUBLIC_HEYGEN_AVATAR_ID || '';

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

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
      const d = j?.detail ? ` — ${JSON.stringify(j.detail)}` : '';
      const s = r?.status ? ` [${r.status}]` : '';
      throw new Error('CHAT_START_FAILED' + s + d);
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
        // Keep muted=true for autoplay; browser will prompt for mic automatically
        videoRef.current.muted = true;
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

    const q =
      qualityQuery.startsWith('l') ? (AvatarQuality?.Low || 'low') :
      qualityQuery.startsWith('h') ? (AvatarQuality?.High || 'high') :
                                     (AvatarQuality?.Medium || 'medium');

    await avatar.createStartAvatar({
      avatarName,
      quality: q,
      welcomeMessage: '',
    });

    // helper to speak (REPEAT mode)
    async function speak(text) {
      if (!text) return;
      const payload = TaskType
        ? { text, taskType: TaskType.REPEAT }
        : { text, taskType: 'REPEAT' };
      try { await avatar.speak(payload); } catch {}
    }

    window.__avatarSpeak = speak; // quick manual test hook
  }, [avatarName, qualityQuery]);

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
      // lip-sync: speak exactly reply
      try { await window.__avatarSpeak?.(reply); } catch {}
    } catch (err) {
      const note = `Message failed${err?.status ? ` (${err.status})` : ''}. Please try again.`;
      push('system', note);
      setError(note);
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
    return () => { cancelled = true; stopAvatar(); };
  }, [autostart, begin, ensureChat, stopAvatar]);

  // ------- Layout calculations -------
  const isCompact = layout === 'compact';
  const rows = isCompact && videoFirst ? '60% 40%' : '55% 45%';

  return (
    <div style={{
      width: '100%',
      height: '100%',
      boxSizing: 'border-box',
      display: 'grid',
      gridTemplateRows: rows,
      gap: 10,
      padding: 10,
      background: '#0f1220',
      color: '#e9ecf1',
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji'
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
          <div style={{
            position:'absolute', inset:0, display:'grid', placeItems:'center',
            color:'#fff', background:'rgba(0,0,0,.35)', fontWeight:700
          }}>
            {status === 'idle' ? 'Idle' : status === 'connecting' ? 'Connecting…' : 'Error'}
          </div>
        )}
      </div>

      {/* Chat */}
      <div style={{
        borderRadius:12, overflow:'hidden', border:'1px solid #1f2430',
        background:'#0f1220', display:'grid', gridTemplateRows:'1fr auto'
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

export default function EmbedPage() {
  return (
    <Suspense fallback={<div style={{ padding: 16, color: '#e9ecf1' }}>Loading…</div>}>
      <PageInner />
    </Suspense>
  );
}
