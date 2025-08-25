/* public/embed.js */
(function () {
  var ORIGIN = (window.AVATAR_WIDGET_ORIGIN || 'https://avatar-widget-backup.vercel.app').replace(/\/$/, '');

  var STATE = {
    mounted: false,
    mode: 'overlay',          // 'overlay' | 'dock'
    size: { width: 420, height: 560 },
    offset: { right: 20, bottom: 88 }, // clears a site FAB
    overlayEl: null,
    dockEl: null,
    targetSel: null,
    fabEl: null
  };

  function css(el, styles){ Object.assign(el.style, styles); return el; }
  function q(id){ return document.getElementById(id); }
  function lockScroll(lock){ document.documentElement.style.overflow = lock ? 'hidden' : ''; }
  function emit(name, detail){ window.dispatchEvent(new CustomEvent('avatar-widget:' + name, { detail })); }

  function makeCloseButton(onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerText = '✕';
    btn.setAttribute('aria-label', 'Close');
    css(btn, {
      color:'#fff', background:'transparent', border:'0',
      width: '32px', height: '32px', borderRadius: '999px',
      fontSize:'18px', cursor:'pointer'
    });
    btn.onclick = onClick;
    return btn;
  }

  function makeIframe() {
    const iframe = document.createElement('iframe');
    iframe.title = 'Avatar';
    // Hints for page layout (handled in /embed)
    iframe.src = ORIGIN + '/embed?autostart=1&layout=compact&videoFirst=1';
    iframe.allow = 'camera; microphone; autoplay; clipboard-read; clipboard-write; speaker-selection';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    css(iframe, { width:'100%', height:'100%', border:'0' });
    return iframe;
  }

  // ---------- OVERLAY ----------
  function createOverlay() {
    if (STATE.overlayEl) return STATE.overlayEl;

    const wrap = document.createElement('div');
    wrap.id = 'avatar-overlay';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.tabIndex = -1;
    css(wrap, { position:'fixed', inset:'0', zIndex:'999999',
      background:'rgba(0,0,0,.65)', backdropFilter:'blur(2px)', display:'flex',
      alignItems:'center', justifyContent:'center' });

    const panel = document.createElement('div');
    css(panel, {
      width:'min(980px,96vw)', height:'min(720px,86vh)',
      background:'#0F1220', borderRadius:'16px', boxShadow:'0 20px 60px rgba(0,0,0,.5)',
      overflow:'hidden', position:'relative'
    });

    const header = document.createElement('div');
    css(header, {
      position:'absolute', top:0, left:0, right:0, height:'48px',
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'0 12px', color:'#fff', background:'rgba(255,255,255,.05)',
      borderBottom:'1px solid rgba(255,255,255,.12)', zIndex:'2'
    });
    header.innerHTML = '<strong aria-label="Dialog title">Infinity AI Agent</strong>';
    header.appendChild(makeCloseButton(close));

    const iframe = makeIframe();
    css(iframe, { marginTop: '48px' });

    panel.appendChild(header);
    panel.appendChild(iframe);
    wrap.appendChild(panel);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });

    document.body.appendChild(wrap);
    lockScroll(true);
    STATE.overlayEl = wrap;
    return wrap;
  }

  // ---------- DOCK ----------
  function createDock() {
    if (STATE.dockEl) return STATE.dockEl;

    const w = Math.max(300, Math.min(720, +STATE.size.width || 420));
    const h = Math.max(360, Math.min(900, +STATE.size.height || 560));
    const right = Math.max(8, +STATE.offset.right || 20);
    const bottom = Math.max(8, +STATE.offset.bottom || 88);

    const wrap = document.createElement('div');
    wrap.id = 'avatar-dock';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'false');
    css(wrap, {
      position: 'fixed',
      zIndex: '999999',
      right: right + 'px',
      bottom: bottom + 'px',
      width: w + 'px',
      height: h + 'px',
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: '0 16px 48px rgba(0,0,0,.45)',
      background: '#0F1220',
      transform: 'translateY(24px)',
      opacity: '0',
      pointerEvents: 'none',
      transition: 'transform .18s ease, opacity .18s ease'
    });

    // mobile responsive
    const mq = window.matchMedia('(max-width: 640px)');
    const applyMobile = () => {
      if (mq.matches) {
        css(wrap, {
          right: '12px', left: '12px',
          bottom: '12px',
          width: 'auto',
          height: 'min(78vh, 720px)',
          borderRadius: '14px'
        });
      } else {
        css(wrap, {
          right: right + 'px', left: '',
          bottom: bottom + 'px',
          width: w + 'px',
          height: h + 'px',
          borderRadius: '16px'
        });
      }
    };
    mq.addEventListener?.('change', applyMobile);
    applyMobile();

    const header = document.createElement('div');
    css(header, {
      position:'absolute', top:0, left:0, right:0, height:'44px',
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'0 10px', color:'#fff', background:'rgba(255,255,255,.05)',
      borderBottom:'1px solid rgba(255,255,255,.12)', zIndex:'2'
    });
    header.innerHTML = '<strong style="font-size:13px">Infinity AI Agent</strong>';
    header.appendChild(makeCloseButton(close));

    const iframe = makeIframe();
    css(iframe, { marginTop: '44px' });

    wrap.appendChild(header);
    wrap.appendChild(iframe);
    document.body.appendChild(wrap);
    STATE.dockEl = wrap;
    return wrap;
  }

  // ---------- API ----------
  function open() {
    // inline target mode (reserved for future)
    if (STATE.targetSel) {
      const target = document.querySelector(STATE.targetSel);
      if (!target) return console.warn('[AvatarWidget] target not found:', STATE.targetSel);
      if (!target.querySelector('iframe[data-avatar-inline]')) {
        const iframe = makeIframe();
        iframe.setAttribute('data-avatar-inline', '1');
        target.appendChild(iframe);
      }
      emit('opened', { mode: 'inline' });
      return;
    }

    if (STATE.mode === 'dock') {
      const dock = createDock();
      requestAnimationFrame(() => {
        css(dock, { transform: 'translateY(0)', opacity: '1', pointerEvents: 'auto' });
      });
      emit('opened', { mode: 'dock' });
      return;
    }

    // default: overlay
    if (!q('avatar-overlay')) createOverlay().focus();
    emit('opened', { mode: 'overlay' });
  }

  function close() {
    if (STATE.mode === 'dock' && STATE.dockEl) {
      const el = STATE.dockEl;
      css(el, { transform: 'translateY(24px)', opacity: '0', pointerEvents: 'none' });
      emit('closed', {});
      return;
    }
    if (STATE.overlayEl) {
      STATE.overlayEl.remove();
      STATE.overlayEl = null;
      lockScroll(false);
      emit('closed', {});
    }
  }

  function mount(opts) {
    if (STATE.mounted) return; // idempotent
    opts = opts || {};
    STATE.mode = (opts.mode === 'dock' || opts.mode === 'overlay') ? opts.mode : 'overlay';
    if (opts.size)   STATE.size   = { ...STATE.size,   ...opts.size };
    if (opts.offset) STATE.offset = { ...STATE.offset, ...opts.offset };
    if (typeof opts.target === 'string') STATE.targetSel = opts.target;

    if (opts.floatingButton) {
      if (!q('avatar-fab')) {
        const fab = document.createElement('button');
        fab.id = 'avatar-fab';
        fab.ariaLabel = 'Chat with the AI agent';
        fab.type = 'button';
        fab.innerHTML = '💬';
        css(fab, {
          position:'fixed', right:'20px', bottom:'20px', zIndex:'999998',
          width:'56px', height:'56px', borderRadius:'999px', border:'0',
          background:'#4F46E5', color:'#fff', fontSize:'22px', cursor:'pointer',
          boxShadow:'0 10px 30px rgba(0,0,0,.35)'
        });
        fab.onclick = open;
        document.body.appendChild(fab);
        STATE.fabEl = fab;
      }
    }

    STATE.mounted = true;
    emit('ready', { origin: ORIGIN, version: '1.1.0' });
  }

  window.AvatarWidget = { open, close, mount, ORIGIN, VERSION: '1.1.0' };
})();
