/*
 * background.js — service worker.
 * Keeps ONE WebSocket to the Electron overlay.
 * Port is configurable via chrome.storage (see popup).
 */
let ws = null;
let retry = 0;
let currentPort = 8760 + 5; // 8765 default

function getPort() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['wsPort'], (s) => {
      resolve(s.wsPort || 8765);
    });
  });
}

function wsUrl() {
  return `ws://127.0.0.1:${currentPort}`;
}

function connect() {
  getPort().then((port) => {
    currentPort = port;
    try { ws = new WebSocket(wsUrl()); } catch (e) { setTimeout(connect, 2500); return; }
    ws.onopen = () => { retry = 0; console.log('[sc-overlay] ws connected to', wsUrl()); };
    ws.onclose = () => { ws = null; setTimeout(connect, Math.min(4000, 1000 + retry++ * 700)); };
    ws.onerror = () => { try { ws.close(); } catch (_) {} };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (!m) return;
      if (m.scope === 'overlay_control' && m.type === 'cmd') {
        forwardToTab({ scope: 'overlay_control', type: 'cmd', cmd: m.cmd, position: m.position, volume: m.volume });
      }
    };
  });
}

// Reconnect if port setting changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.wsPort) {
    currentPort = changes.wsPort.newValue || 8765;
    console.log('[sc-overlay] port changed to', currentPort, '— reconnecting');
    if (ws) { try { ws.close(); } catch (_) {} }
    connect();
  }
});

async function findScTab() {
  const tabs = await chrome.tabs.query({ url: ['https://soundcloud.com/*', 'https://www.soundcloud.com/*'] });
  return tabs.find((t) => t.id != null) || null;
}

async function forwardToTab(msg) {
  const tab = await findScTab();
  if (!tab) { console.log('[sc-overlay] no soundcloud tab'); return; }
  try {
    await chrome.tabs.sendMessage(tab.id, msg);
  } catch (e) { console.log('[sc-overlay] send to tab failed', e.message); }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && (msg.type === 'snapshot' || msg.type === 'state')) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: msg.type, data: msg.data || {} }));
    }
  }
  sendResponse({ ok: true });
  return false;
});

connect();
