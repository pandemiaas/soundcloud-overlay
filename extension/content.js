/*
 * content.js — runs on soundcloud.com tab.
 * Reads the currently playing track from the SoundCloud DOM and applies the
 * overlay's transport commands. All times are SECONDS.
 * Talks to the Electron overlay through the background worker.
 *
 * NOTE: wiring tuned to the current soundcloud.com layout:
 *   - title: .playbackSoundBadge__title (text bits)
 *   - artist: .playbackSoundBadge__lightLink
 *   - artwork: CSS background-image url() on .playbackSoundBadge__avatar .image
 *   - time: aria-valuenow/aria-valuemax on .playbackTimeline__progressWrapper / :volume
 */
(function () {
  if (window.__scOverlayInjected) return;
  window.__scOverlayInjected = true;
  const q = (s) => document.querySelector(s);

  // Диагностика: включи в консоли вкладки SoundCloud
  //   localStorage.setItem('scOverlayDebug','1')
  // и перезагрузи страницу — в консоль полетит разбор состояния плеера.
  const DEBUG = (() => {
    try { return localStorage.getItem('scOverlayDebug') === '1'; } catch { return false; }
  })();

  const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const split = (s) => s.split(':').map(Number);

  function readState() {
    const out = { title: '', artist: '', artwork: '', playing: false,
      url: '', duration: 0, position: 0, prevTitle: '', nextTitle: '',
      liked: false, repeat: false, volume: 0.8 };
    const badge = q('.playbackSoundBadge');
    if (!badge) return out;

    // Title: the label inside .playbackSoundBadge__title holds "Current track: X".
    // SC renders it duplicated (e.g. "FooFoo") so we collapse that reliably.
    const tEl = q('.playbackSoundBadge__title');
    let raw = (tEl ? tEl.getAttribute('aria-label') || tEl.textContent : '').replace(/\s+/g, ' ').trim();
    raw = raw.replace(/^Current track\s*:/i, '').trim();
    // SC duplicates the WHOLE string (not halves): "FooFoo" = "Foo"+"Foo".
    // Split only when the two halves are EXACTLY equal AND the source looks
    // duplicated — otherwise different tracks ("Лето Лето", "Мама Мама") would
    // be collapsed into one and the overlay would appear "stuck".
    const half = Math.floor(raw.length / 2);
    if (half >= 3 && raw.length % 2 === 0) {
      const a0 = raw.slice(0, half);
      const b0 = raw.slice(half);
      // exact duplicate only — no "endsWith" heuristics (they merge real tracks)
      if (b0 === a0) raw = a0;
    }
    out.title = raw;

    const artistEl = q('.playbackSoundBadge__lightLink');
    out.artist = text(artistEl);

    // Track URL: the badge title is a link to the ACTUAL track (not the page
    // you happen to be on — /you/likes, home, search...). Prefer it; a real
    // track link is what the Discord "Listen on SoundCloud" button must open.
    let trackHref = '';
    const titleLink = q('.playbackSoundBadge__titleLink')
      || q('.playbackSoundBadge__title a[href*="soundcloud.com"]')
      || q('.playbackSoundBadge a[href*="soundcloud.com"]');
    if (titleLink) {
      trackHref = titleLink.getAttribute('href') || titleLink.href || '';
      // make absolute + strip query/hash noise
      try {
        const abs = new URL(trackHref, location.origin);
        if (/^https:\/\/[a-z0-9.-]*soundcloud\.com\//i.test(abs.href)) {
          trackHref = abs.origin + abs.pathname;
        } else {
          trackHref = '';
        }
      } catch (_) { trackHref = ''; }
    }
    // Fallback: if we're already ON a track page, use the current URL.
    if (!trackHref && /^\/[^/]+\/[^/]+\/?$/.test(location.pathname) &&
        !/^\/(you|feed|search|charts|discover|stream|library|upload|settings|messages)\b/.test(location.pathname)) {
      trackHref = location.origin + location.pathname;
    }
    out.url = trackHref || '';

    // Artwork: inline background-image on the artwork sub-element inside the avatar.
    const avatarBox = q('.playbackSoundBadge__avatar');
    if (avatarBox) {
      const holder = avatarBox.querySelector('span[style*="background-image"]')
        || avatarBox.querySelector('[style*="background-image"]');
      if (holder) {
        const st = holder.getAttribute('style') || '';
        const m = st.match(/url\(["']?(https?:[^)"']+)["']?\)/);
        if (m) {
          let u = m[1];
          // Try a larger (still valid) artwork size; sndcdn supports several.
          // If the -t.. upgrade is unknown for this asset a 404 would show,
          // so fall back to the original DOM url if the bigger one 404s.
          out.artwork = u; // keep original (guaranteed working now)
        }
      }
    }

    out.playing = !!q('.playControl.playing');

    // ===== ВРЕМЯ ТРЕКА =====
    // Пробуем несколько источников по очереди — SoundCloud меняет разметку,
    // поэтому полагаться на один селектор нельзя (иначе вечные 0:00).
    out.duration = 0;
    out.position = 0;

    // 1) aria-атрибуты на прогрессе (самый точный источник в SC)
    const wrap = q('.playbackTimeline__progressWrapper');
    if (wrap) {
      const now = Number(wrap.getAttribute('aria-valuenow'));
      const max = Number(wrap.getAttribute('aria-valuemax'));
      if (Number.isFinite(max) && max > 0) {
        out.duration = max;
        out.position = Number.isFinite(now) ? now : 0;
      }
    }

    // 2) Фолбэк: текстовые таймеры в плеере («1:23» / «4:05»)
    if (!out.duration) {
      const times = [];
      const timeEls = document.querySelectorAll(
        '.playbackTimeline__timePassed, .playbackTimeline__timeLeft, ' +
        '.playbackTimeline__duration, .playbackTimeline [class*="time"]'
      );
      timeEls.forEach((el) => {
        const t = (el.textContent || '').trim();
        const m = t.match(/^(\d{1,3}):(\d{2})$/);
        if (m) times.push(Number(m[1]) * 60 + Number(m[2]));
      });
      if (times.length >= 2) {
        // первое — прошедшее, второе — оставшееся/общее
        out.position = times[0];
        const second = times[1];
        out.duration = second > out.position ? second : out.position + second;
      } else if (times.length === 1) {
        out.duration = times[0];
        out.position = 0;
      }
    }

    // 3) Фолбэк: реальный <audio>/<video> элемент, если он есть в DOM
    if (!out.duration) {
      const media = document.querySelector('audio, video');
      if (media && Number.isFinite(media.duration) && media.duration > 0) {
        out.duration = media.duration;
        out.position = Number.isFinite(media.currentTime) ? media.currentTime : 0;
      }
    }

    if (out.duration) {
      out.position = Math.max(0, Math.min(out.position, out.duration));
    }

    // Volume: aria-valuenow/max on .volume__sliderWrapper (0..1)
    const volWrap = q('.volume__sliderWrapper');
    if (volWrap) {
      const va = Number(volWrap.getAttribute('aria-valuenow'));
      const vm = Number(volWrap.getAttribute('aria-valuemax')) || 1;
      if (Number.isFinite(va) && vm > 0) out.volume = Math.max(0, Math.min(1, va / vm));
    }

    // Like (heart) state: SC marks the active like button with sc-button-selected.
    const likeBtn = q('.playbackSoundBadge__like') || q('.playbackSoundBadge .sc-button-like');
    if (likeBtn) out.liked = likeBtn.classList.contains('sc-button-selected') || likeBtn.classList.contains('m-active');

    // Repeat mode state: SC uses m-none / m-one (single) / m-all (playlist).
    const rep = q('.repeatControl') || q('.repeat');
    let repeatMode = 'off';
    if (rep) {
      if (rep.classList.contains('m-one')) repeatMode = 'one';
      else if (rep.classList.contains('m-all')) repeatMode = 'all';
      // fallback to older selected marker for other builds
      else if (rep.classList.contains('sc-button-selected') || rep.classList.contains('m-active')) repeatMode = 'all';
    }
    out.repeat = repeatMode;

    if (DEBUG) {
      console.log('[SC-Overlay] состояние плеера:', {
        title: out.title,
        artist: out.artist,
        playing: out.playing,
        position: out.position,
        duration: out.duration,
        время: `${Math.floor(out.position / 60)}:${String(Math.floor(out.position % 60)).padStart(2, '0')} / ${Math.floor(out.duration / 60)}:${String(Math.floor(out.duration % 60)).padStart(2, '0')}`,
        _проверка_aria: (() => {
          const w = q('.playbackTimeline__progressWrapper');
          return w ? { now: w.getAttribute('aria-valuenow'), max: w.getAttribute('aria-valuemax') } : 'НЕТ .playbackTimeline__progressWrapper';
        })(),
        _текст_таймеров: Array.from(document.querySelectorAll('.playbackTimeline [class*="time"]'))
          .map((e) => (e.textContent || '').trim()).filter(Boolean),
        _audio: (() => {
          const a = document.querySelector('audio, video');
          return a ? { duration: a.duration, currentTime: a.currentTime } : 'нет <audio>';
        })(),
      });
    }

    return out;
  }

  let lastSent = '';      // последний отправленный ключ трека
  let lastSentAt = 0;     // время последней отправки

  function post(force) {
    const s = readState();
    if (!s.title && !s.duration) return;

    // Смена трека отправляется мгновенно. Но ВРЕМЯ и позицию нужно слать
    // регулярно, иначе прогресс в оверлее «застынет» на месте.
    const key = `${s.title}|${s.artist}|${s.url}`;
    const trackChanged = key !== lastSent;
    const stale = Date.now() - lastSentAt > 900;   // позиция обновляется ~раз в сек

    if (!force && !trackChanged && !stale) return;
    lastSent = key;
    lastSentAt = Date.now();

    chrome.runtime.sendMessage({ type: 'snapshot', data: s }).catch?.(() => {});
  }

  // SoundCloud — SPA: трек меняется без перезагрузки страницы.
  // Слушаем изменения DOM плеера, чтобы отправлять снапшот сразу же.
  function watchPlayer() {
    const badge = document.querySelector('.playbackSoundBadge');
    if (!badge) { setTimeout(watchPlayer, 2000); return; }
    try {
      const mo = new MutationObserver(() => post(true));
      mo.observe(badge, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-label', 'href', 'style', 'class'] });
    } catch (_) { /* ignore */ }
  }
  watchPlayer();

  // Плюс: следим за сменой URL (трек в title вкладки / history)
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) { lastHref = location.href; post(true); }
  }, 800);

  const click = (sel) => { const b = q(sel); if (b) { b.click(); return true; } return false; };

  function seekTo(secs) {
    // SoundCloud's timeline is not an <input>; send a keyboard-style change is
    // fragile, so seek via the progress wrapper by dispatching on the element
    // only if it supports pointer. Given no range input exists, we emulate a
    // click at the correct ratio of its bounding box.
    const wrap = q('.playbackTimeline__progressWrapper');
    const rect = wrap && wrap.getBoundingClientRect();
    if (!wrap || !rect || !rect.width) return;
    const max = Number(wrap.getAttribute('aria-valuemax')) || 0;
    if (!max) return;
    const ratio = Math.max(0, Math.min(1, secs / max));
    const y = rect.top + rect.height / 2;
    const x = rect.left + rect.width * ratio;
    const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };
    wrap.dispatchEvent(new MouseEvent('pointerdown', opts));
    wrap.dispatchEvent(new MouseEvent('mousedown', opts));
    wrap.dispatchEvent(new MouseEvent('pointerup', opts));
    wrap.dispatchEvent(new MouseEvent('mouseup', opts));
    wrap.dispatchEvent(new MouseEvent('click', opts));
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.scope !== 'overlay_control') return false;
    const c = msg.cmd;
    if (c === 'playpause') click('.playControl');
    else if (c === 'next') click('.skipControl__next');
    else if (c === 'prev') click('.skipControl__previous');
    else if (c === 'seek' && msg.position != null) seekTo(Number(msg.position));
    else if (c === 'like') clickReal('.playbackSoundBadge__like');
    else if (c === 'repeat') clickReal('.repeatControl');
    setTimeout(post, 200);
    if (sendResponse) sendResponse({ ok: true });
    return false;
  });

  // Real click: dispatch full pointer+mouse sequence at the element center, so
  // SoundCloud treats it like a genuine user tap (plain el.click() is ignored).
  function clickReal(sel) {
    let el = q(sel);
    if (!el) return false;
    // if the selector is an sc-button wrapper, prefer a real <button>/<a> inside
    if (el.tagName !== 'BUTTON' && el.tagName !== 'A') {
      const inner = el.querySelector('button, a');
      if (inner) el = inner;
    }
    const r = el.getBoundingClientRect();
    if (!r || !r.width || !r.height) { try { el.click(); } catch (_) {} return true; }
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const o = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, view: window };
    el.dispatchEvent(new MouseEvent('pointerdown', o));
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new MouseEvent('pointerup', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
    return true;
  }

  // Poll interval configurable via extension popup (chrome.storage)
  let pollMs = 1200;
  let pollTimer = null;

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(post, pollMs);
  }

  chrome.storage.sync.get(['pollInterval'], (s) => {
    if (s.pollInterval && s.pollInterval >= 500) {
      pollMs = s.pollInterval;
      startPolling();
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.pollInterval) {
      pollMs = Math.max(500, changes.pollInterval.newValue || 1200);
      startPolling();
    }
  });

  startPolling();
  setTimeout(post, 900);
})();
