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

  const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const split = (s) => s.split(':').map(Number);

  function readState() {
    const out = { title: '', artist: '', artwork: '', playing: false,
      url: location.href, duration: 0, position: 0, prevTitle: '', nextTitle: '',
      liked: false, repeat: false, volume: 0.8 };
    const badge = q('.playbackSoundBadge');
    if (!badge) return out;

    // Title: the label inside .playbackSoundBadge__title holds "Current track: X".
    // SC renders it duplicated (e.g. "FooFoo") so we collapse that reliably.
    const tEl = q('.playbackSoundBadge__title');
    let raw = (tEl ? tEl.getAttribute('aria-label') || tEl.textContent : '').replace(/\s+/g, ' ').trim();
    raw = raw.replace(/^Current track\s*:/i, '').trim();
    // if the second half repeats the first, keep only the first half
    const half = Math.floor(raw.length / 2);
    const a0 = raw.slice(0, half);
    const b0 = raw.slice(half);
    if (half >= 4 && (b0 === a0 || b0.endsWith(a0) || a0.endsWith(b0))) {
      raw = a0.length >= b0.length ? a0 : b0;
    }
    out.title = raw;

    const artistEl = q('.playbackSoundBadge__lightLink');
    out.artist = text(artistEl);

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

    // Time: aria-valuenow/aria-valuemax on wrapper
    const wrap = q('.playbackTimeline__progressWrapper');
    if (wrap) {
      const now = wrap.getAttribute('aria-valuenow');
      const max = wrap.getAttribute('aria-valuemax');
      if (max) { out.duration = Number(max) || 0; out.position = Number(now) || 0; }
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

    return out;
  }

  function post() {
    const s = readState();
    if (!s.title && !s.duration) return;
    chrome.runtime.sendMessage({ type: 'snapshot', data: s }).catch?.(() => {});
  }

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
