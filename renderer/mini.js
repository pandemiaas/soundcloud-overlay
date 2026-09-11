'use strict';
/* mini.js — компактный режим: круглая обложка, название, play/pause, next/prev */

const $ = (id) => document.getElementById(id);
const els = {
  mini: $('mini'),
  art: $('art'),
  info: document.querySelector('.info'),   // блок с title+artist (для анимации свапа)
  title: $('title'),
  artist: $('artist'),
  btnPrev: $('btnPrev'),
  btnPlay: $('btnPlay'),
  btnNext: $('btnNext'),
  fill: $('fill'),
  icoPlay: $('icoPlay'),
};

const ICO_PLAY = 'M4 2.5v11l9-5.5-9-5.5z';
const ICO_PAUSE = 'M4 2.5h3.2v11H4v-11zm4.8 0H12v11H8.8v-11z';

let ws = null;
let snapshot = null;
let currentKey = null;
let swapBusy = false;      // идёт анимация смены трека
let queuedSnap = null;     // снапшот, пришедший во время анимации

const mono = (s, len = 32) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > len ? t.slice(0, len - 1) + '…' : t;
};

function setPlayIcon(playing) {
  if (els.icoPlay) els.icoPlay.querySelector('path').setAttribute('d', playing ? ICO_PAUSE : ICO_PLAY);
}

function render(s) {
  snapshot = s || {};
  const d = snapshot;

  els.title.textContent = mono(d.title) || 'нет трека';
  els.artist.textContent = mono(d.artist, 34) || '—';

  const a = d.artwork || '';
  if (a) {
    els.art.style.backgroundImage = `url("${a}")`;
    els.art.textContent = '';
  } else {
    els.art.style.backgroundImage = '';
    els.art.textContent = '♪';
  }

  // Крутится только когда играет
  els.art.classList.toggle('spin', !!d.playing);

  setPlayIcon(!!d.playing);
  els.mini.classList.toggle('off', !d.title);

  // Прогресс
  if (d.duration && d.position != null) {
    els.fill.style.width = Math.min(100, (d.position / d.duration) * 100) + '%';
  } else {
    els.fill.style.width = '0%';
  }

  currentKey = `${d.title}|${d.artist}`;
}

/* Рендер контента без анимации (используется посередине свапа) */
function renderInner(d) {
  render(d);
}

/* ===== Смена трека с анимацией: старый уезжает влево, новый въезжает справа ===== */
const SWAP_HALF = 150;   // мс на половину анимации (0.3s / 2)

function renderAnimated(d) {
  const key = `${d.title || ''}|${d.artist || ''}`;

  // Первый трек или тот же самый — просто рендерим
  if (!currentKey || key === currentKey) {
    render(d);
    return;
  }

  // Трек сменился — запускаем свап
  if (swapBusy) { queuedSnap = d; return; }
  swapBusy = true;

  // Защита: если элементов нет (старая разметка), просто рендерим без анимации
  if (!els.info || !els.art) {
    renderInner(d);
    swapBusy = false;
    return;
  }

  try {
    els.info.classList.add('swap-out');
    els.art.classList.add('swap-out');
  } catch (_) {
    renderInner(d);
    swapBusy = false;
    return;
  }

  setTimeout(() => {
    try {
      renderInner(d);
      els.info.classList.remove('swap-out');
      els.art.classList.remove('swap-out');
      els.info.classList.add('swap-in');
      els.art.classList.add('swap-in');
      els.art.classList.add('art-pop');       // «вспышка» вокруг новой обложки
    } catch (_) { /* не роняем рендер из-за анимации */ }

    setTimeout(() => {
      try {
        els.info.classList.remove('swap-in');
        els.art.classList.remove('swap-in');
        els.art.classList.remove('art-pop');
      } catch (_) { /* ignore */ }
      swapBusy = false;
      if (queuedSnap) { const q = queuedSnap; queuedSnap = null; renderAnimated(q); }
    }, SWAP_HALF);
  }, SWAP_HALF);
}

function rawSend(obj) {
  if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch (_) {} }
}

function sendCmd(cmd) {
  // Local echo for instant feedback — mini stays responsive even if extension lags
  if (snapshot) {
    if (cmd === 'playpause') snapshot.playing = !snapshot.playing;
  }
  if (snapshot) render(snapshot);

  rawSend({ scope: 'overlay_control', type: 'cmd', cmd });
}

els.btnPrev.addEventListener('click', () => sendCmd('prev'));
els.btnPlay.addEventListener('click', () => sendCmd('playpause'));
els.btnNext.addEventListener('click', () => sendCmd('next'));

// Точка входа из main-процесса (если используется send)
window.__miniSnap = renderAnimated;

function connect() {
  const params = new URLSearchParams(location.search);
  const port = params.get('port') || '8765';
  try { ws = new WebSocket(`ws://127.0.0.1:${port}/`); }
  catch (_) { return; }
  ws.onopen = () => {
    rawSend({ type: 'getState' });
  };
  ws.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data);
      if (d.type === 'snapshot' || d.type === 'state') renderAnimated(d.data || {});
    } catch (_) { /* ignore */ }
  };
  ws.onclose = () => {
    els.mini.classList.add('off');
    els.title.textContent = 'нет подключения';
    els.artist.textContent = 'запусти расширение';
    setTimeout(connect, 2500);
  };
  ws.onerror = () => { try { ws.close(); } catch (_) {} };
}

connect();
// Периодически спрашиваем состояние (самовосстановление после разрыва)
setInterval(() => { if (ws && ws.readyState === 1) rawSend({ type: 'getState' }); }, 1500);
