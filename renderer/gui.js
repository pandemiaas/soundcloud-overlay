'use strict';
/* Local bridge UI: shows whatever the browser extension reports, keeps it synced. */
const $ = (id) => document.getElementById(id);
const els = {
  dot: $('stateDot'), art: $('art'), info: $('info'),
  title: $('trackTitle'), artist: $('trackArtist'),
  prevLine: $('prevLine'), nextLine: $('nextLine'),
  btnPrev: $('btnPrev'), btnPlay: $('btnPlay'), btnNext: $('btnNext'),
  bar: $('bar'), fill: $('fill'), timePos: $('timePos'), timeDur: $('timeDur'), status: $('status'),
  volTube: $('volTube'), volFill: $('volFill'),
  btnLike: $('btnLike'), likeGlyph: $('likeGlyph'),
  btnRepeat: $('btnRepeat'),
};

let ws = null;
let snapshot = null;
let currentTrackKey = null;     // title|artist — detect track change
let swapBusy = false;           // swap animation in progress
let queuedSnapshot = null;      // snapshot that arrived during swap
const trackKeyOf = (s) => `${s.title || ''}|${s.artist || ''}`;
const SWAP_MS = 380;            // 0.35s anim + margin

const fmt = (sec) => {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const mono = (s, len = 28) => {
  const t = (s || '').replace(/\s+/g, ' ');
  return t.length > len ? t.slice(0, len - 1) + '…' : t;
};

function setStatus(text, state) {
  els.dot.className = 'dot' + (state ? ' ' + state : '');
  els.status.textContent = text;
}

/* Render snapshot content without the swap animation */
function renderSnapInner(s) {
  els.title.textContent = mono(s.title) || '—';
  els.artist.textContent = mono(s.artist) || '—';
  const a = s.artwork || s.avatar || '';
  if (a) { els.art.style.backgroundImage = `url("${a}")`; els.art.textContent = ''; }
  else { els.art.style.backgroundImage = ''; els.art.textContent = '♪'; }
  if (!els.imgPlay) els.imgPlay = document.getElementById('imgPlay');
  if (els.imgPlay) els.imgPlay.src = s.playing ? 'icons/pause.png' : 'icons/play.png';
  els.prevLine.textContent = s.prevTitle ? '◂ ' + mono(s.prevTitle) : '◂ prev —';
  els.nextLine.textContent = s.nextTitle ? mono(s.nextTitle) + ' ▸' : 'next — ▸';
  if (s.duration) els.timeDur.textContent = fmt(s.duration);
  else els.timeDur.textContent = '--:--';
  if (s.position != null && s.duration) {
    els.timePos.textContent = fmt(s.position);
    els.fill.style.width = Math.min(100, (s.position / s.duration) * 100) + '%';
  } else {
    els.timePos.textContent = '--:--';
    els.fill.style.width = '0%';
  }
  els.btnPrev.disabled = false;
  els.btnNext.disabled = false;

  // volume (read-only indicator)
  if (typeof s.volume === 'number') {
    els.volFill.style.height = Math.round(Math.max(0, Math.min(1, s.volume)) * 100) + '%';
  }

  // like (heart) state
  els.btnLike.classList.toggle('active', !!s.liked);
  els.likeGlyph.textContent = s.liked ? '♥' : '♡';

  // repeat state: SC modes off / one (single) / all (playlist)
  const svg = els.btnRepeat.querySelector('svg');
  const badge = els.btnRepeat.querySelector('#repeatBadge') || els.btnRepeat.querySelector('.r-badge');
  const rm = (typeof s.repeat === 'string') ? s.repeat : (s.repeat ? 'all' : 'off');
  const on = rm !== 'off';
  els.btnRepeat.classList.toggle('active', on);
  if (svg) svg.style.color = on ? '#f97316' : '#c8cbd1';
  if (badge) {
    badge.textContent = rm === 'one' ? '1' : '';
    badge.style.display = rm === 'one' ? '' : 'none';
  }
}

/* Track-change swap: info+art slide out left, new slides in from right */
function renderSnap(d) {
  const s = d || {};
  const key = trackKeyOf(s);

  if (swapBusy) { queuedSnapshot = s; return; }          // swallow during swap

  if (currentTrackKey !== null && key !== currentTrackKey && (s.title || s.artist)) {
    // Track changed → animate
    swapBusy = true;
    currentTrackKey = key;
    els.info.classList.add('track-swap-out');
    els.art.classList.add('track-swap-out');
    setTimeout(() => {
      renderSnapInner(s);
      snapshot = s;
      els.info.classList.remove('track-swap-out');
      els.art.classList.remove('track-swap-out');
      els.info.classList.add('track-swap-in');
      els.art.classList.add('track-swap-in');
      setTimeout(() => {
        els.info.classList.remove('track-swap-in');
        els.art.classList.remove('track-swap-in');
        swapBusy = false;
        if (queuedSnapshot) { const q = queuedSnapshot; queuedSnapshot = null; renderSnap(q); }
      }, SWAP_MS);
    }, SWAP_MS / 2);
    return;
  }

  currentTrackKey = key;
  renderSnapInner(s);
  snapshot = s;
}

function rawSend(obj) {
  if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch (_) {} }
}

function sendCmd(cmdType) {
  rawSend({ scope: 'overlay_control', type: 'cmd', cmd: cmdType });
  if (cmdType === 'playpause' && snapshot) {
    snapshot.playing = !snapshot.playing;
    renderSnap(snapshot);
  }
  if (cmdType === 'like' && snapshot) {
    snapshot.liked = !snapshot.liked;
    renderSnap(snapshot);
  }
}

els.btnPrev.addEventListener('click', () => sendCmd('prev'));
els.btnPlay.addEventListener('click', () => sendCmd('playpause'));
els.btnNext.addEventListener('click', () => sendCmd('next'));
els.btnLike.addEventListener('click', () => sendCmd('like'));
els.btnRepeat.addEventListener('click', () => sendCmd('repeat'));

els.bar.addEventListener('click', (ev) => {
  if (!snapshot || !snapshot.duration || !ws || ws.readyState !== 1) return;
  const r = els.bar.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
  rawSend({ scope: 'overlay_control', type: 'cmd', cmd: 'seek', position: Math.round(ratio * snapshot.duration) });
});

// Volume is READ-ONLY indicator: SoundCloud does not expose its volume to
// scripts, so we only reflect its current level (no click handler).

function connect() {
  const params = new URLSearchParams(location.search);
  const port = params.get('port') || '8765';
  try { ws = new WebSocket(`ws://127.0.0.1:${port}/`); }
  catch (_) { setStatus('ws failed', 'err'); return; }
  ws.onopen = () => {
    setStatus('overlay connected — playing?', 'busy');
    rawSend({ type: 'getState' });
  };
  ws.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data);
      if (d.type === 'snapshot' || d.type === 'state') renderSnap(d.data || {});
    } catch (_) { /* ignore */ }
  };
  ws.onclose = () => { setStatus('no connection — run extension in Chrome', 'err'); setTimeout(connect, 2500); };
  ws.onerror = () => { try { ws.close(); } catch (_) {} };
}
connect();
setInterval(() => { if (ws && ws.readyState === 1) rawSend({ type: 'getState' }); }, 1500);
