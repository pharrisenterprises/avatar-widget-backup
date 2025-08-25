/* public/embed.js
   Tiny, dependency-free loader that exposes window.AvatarWidget with open()/close()/mount().
   It creates a centered overlay that iframes this widget’s /embed page.
*/
(() => {
  const THIS_ORIGIN = (() => {
    try {
      const s = document.currentScript;
      if (!s || !s.src) return '';
      const m = s.src.match(/^https?:\/\/[^/]+/i);
      return m ? m[0] : '';
    } catch { return ''; }
  })();

  const IFRAME_SRC = `${THIS_ORIGIN}/embed?autostart=1`; // the widget’s embed UI
  const Z = 999999;

  function createStyles() {
    if (document.getElementById('avatar-widget-styles')) return;
    const css = `
      .aw__backdrop {
        position: fixed; inset: 0; background: rgba(0,0,0,.65);
        display: flex; align-items: center; justify-content: center;
        z-index: ${Z};
        backdrop-filter: blur(2px);
      }
      .aw__panel {
        width: min(92vw, 980px);
        height: min(88vh, 760px);
        background: #0b0f1a;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,.08);
        overflow: hidden;
        box-shadow: 0 30px 80px rgba(0,0,0,.6);
        position: relative;
      }
      .aw__header {
        position: absolute; left: 0; right: 0; top: 0; height: 44px;
        display: flex; align-items: center; justify-content: space-between;
        padding: 0 12px; color: #e8ecf3; background: rgba(255,255,255,.04);
        border-bottom: 1px solid rgba(255,255,255,.08);
      }
      .aw__close {
        appearance: none; border: 0; background: transparent; color: #e8ecf3;
        font-size: 18px; cursor: pointer; padding: 4px 8px; border-radius: 8px;
      }
      .aw__iframe {
        position: absolute; top: 44px; left: 0; right: 0; bottom: 0;
        width: 100%; height: calc(100% - 44px); border: 0;
        background: #000;
      }
      .aw__fab {
        position: fixed; right: 18px; bottom: 18px; z-index: ${Z};
        width: 56px; height: 56px; border-radius: 50%; border: 0;
        background: #4f46e5; color: #fff; cursor: pointer;
        box-shadow: 0 10px 30px rgba(0,0,0,.35);
        display: flex; align-items: center; justify-content: center;
      }
      .aw__fab:hover { background: #6366f1; }
    `;
    const el = document.createElement('style');
    el.id = 'avatar-widget-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function makeOverlay() {
    createStyles();

    // Avoid duplicates: if already exists, just show it
    const existing = document.getElementById('aw__root');
    if (existing) {
      existing.style.display = 'flex';
      return existing;
    }

    const root = document.createElement('div');
    root.id = 'aw__root';
    root.className = 'aw__backdrop';

    root.addEventListener('click', (e) => {
      if (e.target === root) close();
    });

    const panel = document.createElement('div');
    panel.className = 'aw__panel';

    const header = document.createElement('div');
    header.className = 'aw__header';
    header.innerHTML = `<div style="font-weight:600">Infinity AI Agent</div>`;
    const btn = document.createElement('button');
    btn.className = 'aw__close';
    btn.setAttribute('aria-label', 'Close');
    btn.textContent = '✕';
    btn.onclick = () => close();
    header.appendChild(btn);

    const iframe = document.createElement('iframe');
    iframe.className = 'aw__iframe';
    iframe.title = 'Avatar';
    iframe.src = IFRAME_SRC;
    iframe.allow =
      'camera; microphone; autoplay; clipboard-read; clipboard-write; speaker-selection';
    iframe.referrerPolicy = 'no-referrer';

    panel.appendChild(header);
    panel.appendChild(iframe);
    root.appendChild(panel);
    document.body.appendChild(root);
    return root;
  }

  function open() {
    const root = makeOverlay();
    root.style.display = 'flex';
  }

  function close() {
    const root = document.getElementById('aw__root');
    if (root) root.style.display = 'none';
  }

  function mountFab() {
    createStyles();
    if (document.getElementById('aw__fab')) return;
    const fab = document.createElement('button');
    fab.id = 'aw__fab';
    fab.className = 'aw__fab';
    fab.setAttribute('aria-label', 'Chat with AI');
    fab.innerHTML =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M7 9h10M7 13h6" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M21 12a8 8 0 1 1-15.3 3.6L3 21l2.4-2.7A8 8 0 1 1 21 12Z" stroke="white" stroke-opacity=".25" stroke-width="2" fill="none"/></svg>';
    fab.onclick = () => open();
    document.body.appendChild(fab);
  }

  // Expose a tiny API
  window.AvatarWidget = {
    open,
    close,
    mount: mountFab,
    _origin: THIS_ORIGIN,
  };

  // Optional: allow sites to trigger with a global event
  window.addEventListener('avatar-widget:open', open);

  // ESC to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
})();
