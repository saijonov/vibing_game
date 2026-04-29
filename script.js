/* EMBER — countdown logic */
(() => {
  'use strict';

  const stage      = document.querySelector('.stage');
  const segM       = document.getElementById('segM');
  const segS       = document.getElementById('segS');
  const ringStroke = document.getElementById('ringStroke');
  const ringHead   = document.getElementById('ringHead');
  const ringTicks  = document.getElementById('ringTicks');
  const primaryBtn = document.getElementById('primaryBtn');
  const primaryLbl = document.getElementById('primaryLabel');
  const resetBtn   = document.getElementById('resetBtn');
  const addBtn     = document.getElementById('addBtn');
  const presetsEl  = document.getElementById('presets');
  const statusLbl  = document.querySelector('#statusLabel .status__text');
  const metaLeft   = document.getElementById('metaLeft');
  const metaRight  = document.getElementById('metaRight');
  const burstCanvas = document.getElementById('burst');

  const RING_CIRC = 2 * Math.PI * 138;
  const MAX_TOTAL = 99 * 60 + 59;
  const STORAGE_KEY = 'ember.lastDurationSec';
  const BASE_TITLE = 'Ember — a countdown that breathes';

  const state = {
    mode: 'idle',
    totalMs: 25 * 60 * 1000,
    remainMs: 25 * 60 * 1000,
    lastTick: 0,
    rafId: 0,
  };

  // Build ticks
  (function buildTicks() {
    const cx = 160, cy = 160;
    const rOuter = 152, rMinor = 148, rMajor = 144;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
      const major = i % 5 === 0;
      const r2 = major ? rMajor : rMinor;
      const x1 = cx + Math.cos(a) * rOuter;
      const y1 = cy + Math.sin(a) * rOuter;
      const x2 = cx + Math.cos(a) * r2;
      const y2 = cy + Math.sin(a) * r2;
      const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('x1', x1.toFixed(2));
      ln.setAttribute('y1', y1.toFixed(2));
      ln.setAttribute('x2', x2.toFixed(2));
      ln.setAttribute('y2', y2.toFixed(2));
      if (major) ln.classList.add('major');
      frag.appendChild(ln);
    }
    ringTicks.appendChild(frag);
  })();

  ringStroke.setAttribute('stroke-dasharray', RING_CIRC.toFixed(2));
  ringStroke.setAttribute('stroke-dashoffset', '0');

  const pad = n => String(n).padStart(2, '0');
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function parseSeg(el) {
    const v = parseInt((el.textContent || '').replace(/\D+/g, ''), 10);
    return Number.isFinite(v) ? v : 0;
  }
  function readSegments() {
    const m = clamp(parseSeg(segM), 0, 99);
    const s = clamp(parseSeg(segS), 0, 59);
    return m * 60 + s;
  }
  function writeSegments(totalSec) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    segM.textContent = pad(m);
    segS.textContent = pad(s);
  }
  function setStatus(text) { statusLbl.textContent = text; }

  function saveDuration(sec) {
    try { localStorage.setItem(STORAGE_KEY, String(sec)); } catch (_) { /* storage blocked */ }
  }
  function loadDuration() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw == null) return null;
      const n = parseInt(raw, 10);
      if (!Number.isFinite(n) || n <= 0 || n > MAX_TOTAL) return null;
      return n;
    } catch (_) { return null; }
  }

  function setTitle(remainMs) {
    if (state.mode === 'running' || state.mode === 'paused') {
      const totalSec = Math.ceil(Math.max(0, remainMs) / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      const prefix = state.mode === 'paused' ? '❚❚ ' : '';
      document.title = `${prefix}${pad(m)}:${pad(s)} · Ember`;
    } else if (state.mode === 'done') {
      document.title = '✦ time · Ember';
    } else {
      document.title = BASE_TITLE;
    }
  }

  function setPhaseFromRemaining() {
    if (state.mode === 'done')   { stage.dataset.phase = 'done';    return; }
    if (state.mode === 'idle')   { stage.dataset.phase = 'idle';    return; }
    if (state.mode === 'paused') { stage.dataset.phase = 'paused';  return; }

    const ratio = state.totalMs > 0 ? state.remainMs / state.totalMs : 0;
    const remainSec = state.remainMs / 1000;

    let phase = 'running';
    if (remainSec <= 10)       phase = 'critical';
    else if (ratio <= 0.25)    phase = 'urgent';
    else if (ratio <= 0.50)    phase = 'warming';
    else                       phase = 'running';
    stage.dataset.phase = phase;
  }

  function render(remainMs) {
    const ms = Math.max(0, remainMs);
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;

    if (state.mode !== 'idle' || document.activeElement !== segM) {
      const newM = pad(m);
      if (segM.textContent !== newM) segM.textContent = newM;
    }
    if (state.mode !== 'idle' || document.activeElement !== segS) {
      const newS = pad(s);
      if (segS.textContent !== newS) segS.textContent = newS;
    }

    const ratio = state.totalMs > 0 ? clamp(ms / state.totalMs, 0, 1) : 0;
    const offset = RING_CIRC * (1 - ratio);
    ringStroke.setAttribute('stroke-dashoffset', offset.toFixed(2));

    const angle = ratio * Math.PI * 2;
    const cx = 160, cy = 160, r = 138;
    const hx = cx + Math.cos(angle - Math.PI / 2) * r;
    const hy = cy + Math.sin(angle - Math.PI / 2) * r;
    ringHead.setAttribute('transform', `translate(${hx.toFixed(2)} ${hy.toFixed(2)})`);
    ringHead.style.opacity = ratio > 0.005 && ratio < 0.999 ? 1 : 0;

    const elapsedPct = state.totalMs > 0 ? Math.round((1 - ratio) * 100) : 0;
    metaRight.textContent = state.mode === 'done' ? 'complete' : `elapsed ${elapsedPct}%`;

    if (state.mode === 'idle') {
      const totalSecAll = Math.round(state.totalMs / 1000);
      metaLeft.textContent = `duration ${pad(Math.floor(totalSecAll/60))}:${pad(totalSecAll%60)}`;
    } else if (state.mode === 'paused') {
      metaLeft.textContent = 'paused';
    } else if (state.mode === 'done') {
      metaLeft.textContent = 'done';
    } else {
      metaLeft.textContent = 'running';
    }

    setTitle(ms);
  }

  function tick(now) {
    if (state.mode !== 'running') return;
    const dt = now - state.lastTick;
    state.lastTick = now;
    state.remainMs -= dt;

    if (state.remainMs <= 0) {
      state.remainMs = 0;
      render(0);
      complete();
      return;
    }
    setPhaseFromRemaining();
    render(state.remainMs);
    state.rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (state.mode === 'running') return;
    if (state.mode === 'idle' || state.mode === 'done') {
      const sec = readSegments();
      if (sec <= 0) { nudgeInvalid(); return; }
      state.totalMs = sec * 1000;
      state.remainMs = state.totalMs;
      hideBurst();
    }
    state.mode = 'running';
    state.lastTick = performance.now();
    primaryLbl.textContent = 'pause';
    primaryBtn.setAttribute('aria-label', 'pause');
    setStatus('running');
    setPhaseFromRemaining();
    state.rafId = requestAnimationFrame(tick);
  }
  function pause() {
    if (state.mode !== 'running') return;
    state.mode = 'paused';
    cancelAnimationFrame(state.rafId);
    primaryLbl.textContent = 'resume';
    primaryBtn.setAttribute('aria-label', 'resume');
    setStatus('paused');
    setPhaseFromRemaining();
  }
  function reset() {
    cancelAnimationFrame(state.rafId);
    state.mode = 'idle';
    const totalSec = Math.round(state.totalMs / 1000);
    writeSegments(totalSec);
    state.remainMs = state.totalMs;
    primaryLbl.textContent = 'start';
    primaryBtn.setAttribute('aria-label', 'start');
    setStatus('ready');
    hideBurst();
    setPhaseFromRemaining();
    render(state.remainMs);
  }
  function complete() {
    cancelAnimationFrame(state.rafId);
    state.mode = 'done';
    primaryLbl.textContent = 'restart';
    primaryBtn.setAttribute('aria-label', 'restart');
    setStatus('done');
    setPhaseFromRemaining();
    render(0);
    fireBurst();
  }
  function togglePrimary() {
    if (state.mode === 'running') pause();
    else start();
  }

  function makeEditable(el, max) {
    el.contentEditable = 'true';
    el.spellcheck = false;
    el.inputMode = 'numeric';

    el.addEventListener('focus', () => {
      requestAnimationFrame(() => {
        const r = document.createRange();
        r.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
      });
    });

    el.addEventListener('beforeinput', (e) => {
      if (state.mode === 'running') { e.preventDefault(); return; }
      if (e.inputType && e.inputType.startsWith('insert')) {
        const data = e.data || '';
        if (!/^\d$/.test(data)) { e.preventDefault(); return; }
        const sel = window.getSelection();
        const isAllSelected = sel && sel.toString() === el.textContent;
        if (!isAllSelected && el.textContent.length >= 2) {
          e.preventDefault(); return;
        }
      }
    });

    el.addEventListener('input', () => {
      const cleaned = (el.textContent || '').replace(/\D+/g, '').slice(0, 2);
      if (cleaned !== el.textContent) el.textContent = cleaned;
      const n = parseInt(cleaned, 10);
      if (Number.isFinite(n) && n > max) {
        el.textContent = String(max);
        placeCaretAtEnd(el);
      }
      onDurationEdited();
    });

    el.addEventListener('blur', () => {
      const n = clamp(parseSeg(el), 0, max);
      el.textContent = pad(n);
      onDurationEdited(true);
    });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); start(); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); nudge(el, +1, max); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(el, -1, max); }
    });

    el.addEventListener('wheel', (e) => {
      if (state.mode === 'running') return;
      e.preventDefault();
      nudge(el, e.deltaY < 0 ? +1 : -1, max);
    }, { passive: false });
  }
  function placeCaretAtEnd(el) {
    const r = document.createRange();
    r.selectNodeContents(el); r.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(r);
  }
  function nudge(el, dir, max) {
    const cur = clamp(parseSeg(el), 0, max);
    const next = clamp(cur + dir, 0, max);
    el.textContent = pad(next);
    onDurationEdited(true);
  }
  function onDurationEdited(snap = false) {
    if (state.mode === 'running' || state.mode === 'paused') return;
    let sec = clamp(readSegments(), 0, MAX_TOTAL);
    state.totalMs = sec * 1000;
    state.remainMs = state.totalMs;
    if (snap) writeSegments(sec);
    state.mode = 'idle';
    hideBurst();
    setPhaseFromRemaining();
    render(state.remainMs);
    syncPresetActive();
    if (sec > 0) saveDuration(sec);
  }

  function nudgeInvalid() {
    const el = document.querySelector('.display__time');
    el.animate(
      [{ transform: 'translateX(0)' },
       { transform: 'translateX(-6px)' },
       { transform: 'translateX(6px)' },
       { transform: 'translateX(-3px)' },
       { transform: 'translateX(0)' }],
      { duration: 300, easing: 'ease-in-out' }
    );
  }

  presetsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.preset');
    if (!btn) return;
    const m = parseInt(btn.dataset.min, 10) || 0;
    const s = parseInt(btn.dataset.sec, 10) || 0;
    const sec = clamp(m * 60 + s, 0, MAX_TOTAL);
    writeSegments(sec);
    onDurationEdited(true);
  });
  function syncPresetActive() {
    const cur = readSegments();
    [...presetsEl.querySelectorAll('.preset')].forEach(b => {
      const m = parseInt(b.dataset.min, 10) || 0;
      const s = parseInt(b.dataset.sec, 10) || 0;
      b.classList.toggle('is-active', (m*60 + s) === cur);
    });
  }

  // Particle burst
  const burstCtx = burstCanvas.getContext('2d');
  let burstParticles = [];
  let burstRaf = 0;

  function sizeBurstCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = burstCanvas.getBoundingClientRect();
    burstCanvas.width  = Math.round(rect.width  * dpr);
    burstCanvas.height = Math.round(rect.height * dpr);
    burstCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', sizeBurstCanvas);

  function fireBurst() {
    sizeBurstCanvas();
    const rect = burstCanvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const ringR = (rect.width / 2) * (138 / 320);

    burstParticles = [];
    const count = 110;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
      const speed = 1.6 + Math.random() * 3.2;
      const startR = ringR + (Math.random() - 0.5) * 6;
      burstParticles.push({
        x: cx + Math.cos(angle) * startR,
        y: cy + Math.sin(angle) * startR,
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 0.4,
        vy: Math.sin(angle) * speed + (Math.random() - 0.5) * 0.4,
        life: 0,
        ttl: 1200 + Math.random() * 900,
        size: 1 + Math.random() * 2.4,
        hue: 38 + Math.random() * 22,
      });
    }
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.4 + Math.random() * 1.6;
      burstParticles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        ttl: 900 + Math.random() * 700,
        size: 0.8 + Math.random() * 1.6,
        hue: 48 + Math.random() * 12,
      });
    }
    cancelAnimationFrame(burstRaf);
    burstRaf = requestAnimationFrame(burstStep);
  }
  function burstStep() {
    const dt = 16;
    const rect = burstCanvas.getBoundingClientRect();
    burstCtx.clearRect(0, 0, rect.width, rect.height);
    burstCtx.globalCompositeOperation = 'lighter';

    let alive = 0;
    for (const p of burstParticles) {
      p.life += dt;
      if (p.life > p.ttl) continue;
      alive++;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.vy += 0.012;
      p.x += p.vx;
      p.y += p.vy;
      const t = p.life / p.ttl;
      const alpha = (1 - t) * 0.95;
      const grad = burstCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 6);
      grad.addColorStop(0, `hsla(${p.hue}, 95%, 75%, ${alpha})`);
      grad.addColorStop(0.4, `hsla(${p.hue}, 95%, 60%, ${alpha * 0.5})`);
      grad.addColorStop(1, `hsla(${p.hue}, 95%, 50%, 0)`);
      burstCtx.fillStyle = grad;
      burstCtx.beginPath();
      burstCtx.arc(p.x, p.y, p.size * 6, 0, Math.PI * 2);
      burstCtx.fill();
      burstCtx.fillStyle = `hsla(${p.hue}, 100%, 88%, ${alpha})`;
      burstCtx.beginPath();
      burstCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      burstCtx.fill();
    }
    burstCtx.globalCompositeOperation = 'source-over';
    if (alive > 0) burstRaf = requestAnimationFrame(burstStep);
  }
  function hideBurst() {
    cancelAnimationFrame(burstRaf);
    if (!burstCanvas.width) return;
    burstCtx.clearRect(0, 0, burstCanvas.width, burstCanvas.height);
  }

  primaryBtn.addEventListener('click', togglePrimary);
  resetBtn.addEventListener('click', reset);
  addBtn.addEventListener('click', () => {
    if (state.mode === 'idle' || state.mode === 'done') {
      const sec = clamp(readSegments() + 30, 0, MAX_TOTAL);
      writeSegments(sec);
      onDurationEdited(true);
      bumpDisplay();
      return;
    }
    const add = 30 * 1000;
    state.totalMs = Math.min(state.totalMs + add, MAX_TOTAL * 1000);
    state.remainMs = Math.min(state.remainMs + add, state.totalMs);
    setPhaseFromRemaining();
    render(state.remainMs);
    bumpDisplay();
  });
  function bumpDisplay() {
    const el = document.querySelector('.display__time');
    el.animate(
      [{ transform: 'scale(1)' },
       { transform: 'scale(1.04)' },
       { transform: 'scale(1)' }],
      { duration: 240, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
    );
  }

  document.addEventListener('keydown', (e) => {
    const inSeg = e.target === segM || e.target === segS;
    if (e.code === 'Space' && !inSeg) {
      e.preventDefault();
      togglePrimary();
    } else if ((e.key === 'r' || e.key === 'R') && !inSeg) {
      reset();
    }
  });

  makeEditable(segM, 99);
  makeEditable(segS, 59);

  const savedSec = loadDuration();
  if (savedSec != null) {
    state.totalMs = savedSec * 1000;
    state.remainMs = state.totalMs;
    writeSegments(savedSec);
  }

  syncPresetActive();
  render(state.remainMs);
  setPhaseFromRemaining();
  requestAnimationFrame(sizeBurstCanvas);
})();
