/* public/embed.js */
(function () {
  const ORIGIN = (window.AVATAR_WIDGET_ORIGIN || 'https://avatar-widget-backup.vercel.app').replace(/\/$/, '');

  function css(el, styles){ Object.assign(el.style, styles); return el; }

  function makeOverlay() {
    const wrap = document.createElement('div');
    wrap.id = 'avatar-overlay';
    css(wrap, {
      position:'fixed', inset:'0', zIndex:'999999',
      background:'rgba(0,0,0,.65)', backdropFilter:'blur(2px)'
    });

    const panel = document.createElement('div');
    css(panel, {
      position:'absolute', inset:'5% 5% auto 5%', height:'90%',
      maxWidth:'980px', margin:'0 auto', left:'0', right:'0',
      background:'#0F1220', borderRadius:'16px',
      boxShadow:'0 20px 60px rgba(0,0,0,.5)', overflow:'hidden'
    });

    const bar = document.createElement('div');
    css(bar, {
      position:'absolute', top:'0', left:'0', right:'0', height:'48px',
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'0 12px', color:'#fff', background:'rgba(255,255,255,.05)',
      borderBottom:'1px solid rgba(255,255,255,.12)'
    });
    bar.innerHTML = `<strong>Infinity AI Agent</strong>`;
    const closeBtn = document.createElement('button');
    closeBtn.innerText = '✕';
    css(closeBtn, { color:'#fff', background:'transparent', border:'0', fontSize:'18px', cursor:'pointer' });
    closeBtn.onclick = close;
    bar.appendChild(closeBtn);

    const iframe = document.createElement('iframe');
    iframe.title = 'Avatar';
    iframe.src = ORIGIN + '/embed?autostart=1';
    iframe.allow = 'camera; microphone; autoplay; clipboard-read; clipboard-write; speaker-selection';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    css(iframe, { width:'100%', height:'calc(100% - 48px)', border:'0', marginTop:'48px' });

    panel.appendChild(bar);
    panel.appendChild(iframe);
    wrap.appendChild(panel);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    document.body.appendChild(wrap);
    return wrap;
  }

  function open() {
    if (document.getElementById('avatar-overlay')) return;
    makeOverlay();
  }
  function close() {
    const el = document.getElementById('avatar-overlay');
    if (el) el.remove();
  }
  function mount(opts = { floatingButton: true }) {
    if (!opts.floatingButton) return;
    if (document.getElementById('avatar-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'avatar-fab';
    fab.ariaLabel = 'Chat with the AI agent';
    fab.innerHTML = '💬';
    css(fab, {
      position:'fixed', right:'20px', bottom:'20px', zIndex:'999998',
      width:'56px', height:'56px', borderRadius:'999px', border:'0',
      background:'#4F46E5', color:'#fff', fontSize:'22px', cursor:'pointer',
      boxShadow:'0 10px 30px rgba(0,0,0,.35)'
    });
    fab.onclick = open;
    document.body.appendChild(fab);
  }

  window.AvatarWidget = { open, close, mount, ORIGIN };
})();
