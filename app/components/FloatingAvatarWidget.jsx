'use client';

import React, { useMemo, useState } from 'react';

export default function FloatingAvatarWidget({
  src = '/embed?autostart=1',
  initialSize = 'mini', // 'mini' | 'medium' | 'full'
}) {
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState(initialSize);

  const dims = useMemo(() => {
    switch (size) {
      case 'mini':   return { w: 320, h: 420 };
      case 'medium': return { w: 520, h: 720 };
      case 'full':   return { w: '100vw', h: '100vh' };
      default:       return { w: 320, h: 420 };
    }
  }, [size]);

  return (
    <>
      {/* FAB (chat icon) */}
      {!open && (
        <button
          aria-label="Open chat"
          onClick={() => { setOpen(true); setSize('mini'); }}
          style={{
            position: 'fixed', right: 20, bottom: 20, zIndex: 2147483646,
            width: 56, height: 56, borderRadius: 999, border: 'none',
            background: '#0b72e7', color: '#fff', boxShadow: '0 6px 18px rgba(0,0,0,.2)',
            cursor: 'pointer',
          }}
        >
          {/* chat bubble icon */}
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ marginTop: 2 }}>
            <path d="M21 12c0 3.866-3.806 7-8.5 7-1.03 0-2.014-.152-2.92-.43L3 20l1.58-3.162C3.594 15.604 3 13.86 3 12 3 8.134 6.806 5 11.5 5S21 8.134 21 12Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}

      {/* Backdrop for fullscreen */}
      {open && size === 'full' && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 2147483645,
          }}
        />
      )}

      {/* Panel */}
      {open && (
        <div
          style={{
            position: 'fixed',
            right: size === 'full' ? 0 : 20,
            bottom: size === 'full' ? 0 : 20,
            width: typeof dims.w === 'number' ? `${dims.w}px` : dims.w,
            height: typeof dims.h === 'number' ? `${dims.h}px` : dims.h,
            zIndex: 2147483647,
            borderRadius: size === 'full' ? 0 : 16,
            overflow: 'hidden',
            boxShadow: '0 12px 32px rgba(0,0,0,.35)',
            background: '#fff',
          }}
        >
          {/* Header overlay */}
          <div
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 8px', background: 'linear-gradient(to bottom, rgba(0,0,0,.5), transparent)',
              color: '#fff', zIndex: 2,
            }}
          >
            <div style={{ fontWeight: 700, paddingLeft: 6 }}>Assistant</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                aria-label="Mini"
                onClick={() => setSize('mini')}
                style={btnStyle}
                title="Mini"
              >▢</button>
              <button
                aria-label="Expand"
                onClick={() => setSize(size === 'medium' ? 'mini' : 'medium')}
                style={btnStyle}
                title="Expand"
              >⤢</button>
              <button
                aria-label="Fullscreen"
                onClick={() => setSize(size === 'full' ? 'medium' : 'full')}
                style={btnStyle}
                title="Fullscreen"
              >⛶</button>
              <button
                aria-label="Close"
                onClick={() => setOpen(false)}
                style={btnStyle}
                title="Close"
              >✕</button>
            </div>
          </div>

          {/* Iframe: loads your /embed app which runs HeyGen+Retell */}
          <iframe
            src={src}
            title="Avatar"
            allow="microphone; autoplay; clipboard-read; clipboard-write; encrypted-media"
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none',
              background: '#000',
            }}
          />
        </div>
      )}
    </>
  );
}

const btnStyle = {
  background: 'rgba(255,255,255,.15)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,.35)',
  borderRadius: 8,
  padding: '6px 8px',
  cursor: 'pointer',
  backdropFilter: 'blur(2px)',
};
