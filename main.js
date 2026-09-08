'use strict';
/**
 * SoundCloud Overlay — local bridge main process
 *
 *  - frameless transparent always-on-top window (over games)
 *  - Alt+D toggles overlay (with animation)
 *  - Alt+C toggles click-through mode
 *  - Alt+Space = play/pause, Alt+←/→ = prev/next (media hotkeys, no overlay needed)
 *  - Alt+S = settings window (opacity, scale, position, animation speed)
 *  - system tray: menu with all toggles
 *  - local WebSocket server on 127.0.0.1:8765
 *  - settings persisted to userData/settings.json
 */
const { app, BrowserWindow, globalShortcut, screen, Tray, Menu, nativeImage } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const WebSocketServer = require('ws').Server;

const RENDERER_DIR = path.join(__dirname, 'renderer');
const TRAY_ICON = path.join(__dirname, 'renderer', 'icons', 'tray.png');
const WS_PORT = Number(process.env.OVERLAY_PORT || 8765);
const SMOKE = process.env.SMOKE === '1';

let win = null;
let settingsWin = null;
let wsSrv = null;
let httpSrv = null;
let httpPortNum = 0;
let tray = null;
let clients = new Set();
let isClickThrough = false;
let isHiding = false;
let lastSnapshot = null;

/* ---------- settings ---------- */
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const DEFAULT_SETTINGS = {
  opacity: 1.0,
  scale: 1.0,
  offsetX: 5.5,   // % of screen width from center
  offsetY: 0,     // px from center
  animMs: 250,
  discordClientId: '1546828521874264174', // SoundCloud Overlay Dev App
};

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

function saveSettings(s) {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2)); } catch (e) { console.error('[settings] save failed:', e.message); }
}

/* ---------- Discord Rich Presence ---------- */
let rpc = null;
let rpcConnected = false;
let rpcClientId = null;
let rpcConnecting = false;
let rpcRetryTimer = null;
let rpcWarned = false;        // log failure only once until success
let lastTrackKey = null;      // title+artist — to detect track change
let trackStartedAt = null;    // epoch ms when current track started (for RPC timer)

function rpcScheduleRetry() {
  if (rpcRetryTimer) return;
  rpcRetryTimer = setTimeout(() => { rpcRetryTimer = null; rpcInit(rpcClientId); }, 60000);
}

function rpcInit(clientId) {
  clientId = String(clientId || '').trim();
  if (!clientId) {                          // empty id = feature off
    rpcDestroy();
    rpcClientId = null;
    lastTrackKey = null;
    return;
  }
  if (rpcConnected && rpcClientId === clientId) return;
  if (rpcConnecting) return;

  // (re)create connection
  rpcDestroy();
  rpcConnecting = true;
  rpcClientId = clientId;

  try { const DiscordRPC = require('discord-rpc'); DiscordRPC.register(clientId); } catch (_) {}
  try { rpc = new (require('discord-rpc').Client)({ transport: 'ipc' }); }
  catch (e) { console.error('[rpc] create failed:', e.message); rpcConnecting = false; return; }

  rpc.on('ready', () => {
    rpcConnected = true;
    rpcConnecting = false;
    rpcWarned = false;
    console.log('[rpc] connected to Discord as', rpc.user ? rpc.user.username : '?');
    if (lastSnapshot) updatePresence(lastSnapshot); // push current track immediately
  });
  rpc.on('disconnected', () => {
    rpcConnected = false;
    rpcConnecting = false;
    if (rpcWarned) console.log('[rpc] disconnected — будет ретрай (молча)');
    rpcScheduleRetry();
  });

  rpc.login({ clientId }).catch((e) => {
    rpcConnected = false;
    rpcConnecting = false;
    if (!rpcWarned) {
      console.log('[rpc] Discord не подключён — RPC выключен до перезапуска Discord.');
      console.log('[rpc] (нужен ДЕСКТОПНЫЙ Discord; ретраи каждые 60с, в лог больше не пишу)');
      rpcWarned = true;
    }
    rpcScheduleRetry();
  });
}

function rpcDestroy() {
  if (rpcRetryTimer) { clearTimeout(rpcRetryTimer); rpcRetryTimer = null; }
  if (rpc) {
    try { rpc.destroy(); } catch (_) {}
    rpc = null;
  }
  rpcConnected = false;
  rpcConnecting = false;
}

function updatePresence(snapshot) {
  if (!rpc || !rpcConnected || !snapshot) return;
  const s = snapshot;

  // Track change detection → reset elapsed timer
  const key = `${s.title || ''}|${s.artist || ''}`;
  if (key !== lastTrackKey) {
    lastTrackKey = key;
    // started = now - current position (so Discord timer reflects real progress)
    trackStartedAt = Date.now() - Math.round((Number(s.position) || 0) * 1000);
  }

  const playing = !!s.playing;
  const duration = Number(s.duration) || 0;
  const title = (s.title || '—').slice(0, 128);
  const artist = (s.artist || '—').slice(0, 128);

  // Track art (HTTP) works on any Application ID without uploading assets.
  const art = (s.artwork && /^https?:\/\//.test(s.artwork)) ? s.artwork : null;

  // === Build a CLEAN activity object (no `undefined` fields) ===
  const presence = {
    details: (playing ? 'Играет в SoundCloud' : 'Пауза'),
    state: `${artist} — ${title}`,
    // largeImage: HTTP art if present, else "sc_overlay" (upload in portal)
    largeImageKey: art || 'sc_overlay',
    largeImageText: `${title} — ${artist}`,
    instance: false,
  };

  // Show elapsed listen time while playing (like Spotify)
  if (playing && duration > 0) {
    presence.startTimestamp = trackStartedAt;
  } else if (duration > 0) {
    presence.startTimestamp = trackStartedAt;       // keep elapsed visible even paused
  }

  // Actions that your friends can click. Both URLs must be real HTTP(s).
  presence.buttons = [
    { label: 'GitHub проекта', url: 'https://github.com/pandemiaas/soundcloud-overlay' }
  ];
  const trackUrl = s.url && /^https:\/\/(www\.|m\.)?soundcloud\.com\//.test(s.url) ? s.url : null;
  if (trackUrl) {
    presence.buttons.push({ label: 'Слушать на SoundCloud', url: trackUrl });
  }

  rpc.setActivity(presence).catch((e) => console.warn('[rpc] setActivity:', e.message));
}

function applySettings(s) {
  if (!win) return;
  try {
    win.setOpacity(Math.max(0.1, Math.min(1.0, s.opacity)));
    const W = Math.round(500 * s.scale);
    const H = Math.round(278 * s.scale);
    const wa = screen.getPrimaryDisplay().workArea;
    const x = Math.min(Math.round(wa.x + wa.width / 2 + wa.width * (s.offsetX / 100)), wa.x + wa.width - W - 12);
    const y = Math.max(wa.y + 12, Math.round(wa.y + wa.height / 2 - H / 2 + s.offsetY));
    win.setBounds({ x, y, width: W, height: H });
  } catch (e) { console.error('[settings] apply failed:', e.message); }
}

/* ---------- local http: static files + settings API ---------- */
function startHttp() {
  return new Promise((resolve, reject) => {
    httpSrv = http.createServer((req, res) => {
      const urlPath = (req.url || '/').split('?')[0];

      /* Settings API */
      if (urlPath === '/api/settings') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        if (req.method === 'GET') {
          res.writeHead(200);
          res.end(JSON.stringify(loadSettings()));
          return;
        }
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (c) => {
            body += c;
            if (body.length > 4096) {
              res.writeHead(413); res.end('{"ok":false,"error":"payload too large"}');
              req.destroy();
            }
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const current = loadSettings();
              const merged = { ...current, ...data };
              saveSettings(merged);
              applySettings(merged);
              // Discord RPC: reconnect if clientId changed
              if (typeof data.discordClientId === 'string' && data.discordClientId.trim() !== rpcClientId) {
                lastTrackKey = null;
                rpcInit(merged.discordClientId);
              }
              res.writeHead(200);
              res.end(JSON.stringify({ ok: true, settings: merged }));
            } catch (e) {
              res.writeHead(400);
              res.end(JSON.stringify({ ok: false, error: e.message }));
            }
          });
          return;
        }
        res.writeHead(405); res.end('{}'); return;
      }

      /* Static files from renderer/ */
      let p;
      try { p = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath); }
      catch (_) { res.writeHead(400); res.end('bad request'); return; }
      const file = path.normalize(path.join(RENDERER_DIR, p));
      if (!file.startsWith(RENDERER_DIR)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('nf'); return; }
        const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
      });
    });
    httpSrv.on('error', reject);
    httpSrv.listen(0, '127.0.0.1', () => resolve(httpSrv.address().port));
  });
}

/* ---------- WebSocket server ---------- */
function startWs() {
  return new Promise((resolve, reject) => {
    wsSrv = new WebSocketServer({ host: '127.0.0.1', port: WS_PORT });
    wsSrv.on('listening', () => resolve(WS_PORT));
    wsSrv.on('error', (e) => { if (wsSrv) reject(e); });
    wsSrv.on('connection', (sock) => {
      clients.add(sock);
      sock.isOpen = true;
      sock.on('message', (raw) => {
        let d;
        try { d = JSON.parse(raw.toString()); } catch (_) { return; }
        if (!d || !d.type) return;
        if (d.type === 'cmd') { broadcast({ type: 'cmd', scope: d.scope || 'overlay_control', cmd: d.cmd, position: d.position, volume: d.volume }, sock); }
        else if (d.type === 'snapshot') {
          const data = d.data || {};
          lastSnapshot = data;
          try { updatePresence(data); } catch (e) { console.error('[rpc] presence error:', e.message); } // никогда не ломает broadcast
          broadcast({ type: 'snapshot', data });
        }
        else if (d.type === 'state') { broadcast({ type: 'state', data: d.data || {} }); }
        else if (d.type === 'getState') {
          // GUI переподключился — отдаём последнее известное состояние
          if (lastSnapshot) { try { sock.send(JSON.stringify({ type: 'snapshot', data: lastSnapshot })); } catch (_) {} }
        }
      });
      sock.on('close', () => { clients.delete(sock); });
    });
  });
}
function broadcast(msg, except) {
  const str = JSON.stringify(msg);
  for (const c of clients) {
    if (c === except) continue;
    try { if (c.readyState === 1) c.send(str); } catch (_) {}
  }
}

/* ---------- tray ---------- */
let _updateTrayMenu = null;

function createTray() {
  const icon = nativeImage.createFromPath(TRAY_ICON);
  tray = new Tray(icon);
  tray.setToolTip('SoundCloud Overlay — Alt+D (показ) | Alt+C (кликсквозь) | Alt+S (настройки)');

  _updateTrayMenu = () => {
    const autoStart = app.getLoginItemSettings().openAtLogin;
    const menu = Menu.buildFromTemplate([
      { label: 'Показать / скрыть (Alt+D)', click: () => toggle() },
      { type: 'separator' },
      { label: '⚙ Настройки (Alt+S)', click: () => openSettings() },
      {
        label: '🖱 Кликсквозь (Alt+C)',
        type: 'checkbox',
        checked: isClickThrough,
        click: () => toggleClickThrough()
      },
      {
        label: '🔄 Автозапуск с Windows',
        type: 'checkbox',
        checked: autoStart,
        click: (mi) => {
          app.setLoginItemSettings({ openAtLogin: mi.checked });
        }
      },
      { type: 'separator' },
      { label: '❌ Выход', click: () => { app.quit(); } }
    ]);
    tray.setContextMenu(menu);
  };

  tray.on('click', () => toggle());
  _updateTrayMenu();
}

/* ---------- click-through ---------- */
function toggleClickThrough() {
  isClickThrough = !isClickThrough;
  if (win) {
    win.setIgnoreMouseEvents(isClickThrough, { forward: true });
    win.webContents.executeJavaScript(
      `document.getElementById('card').classList.toggle('click-through', ${isClickThrough})`
    ).catch(() => {});
  }
  if (_updateTrayMenu) _updateTrayMenu();
}

/* ---------- show / hide with animation ---------- */
function showOverlay() {
  if (!win || win.isVisible()) return;
  isHiding = false;
  win.show();
  win.webContents.executeJavaScript(
    `document.getElementById('card').classList.remove('anim-out'); document.getElementById('card').classList.add('anim-in')`
  ).catch(() => {});
}

function hideOverlay() {
  if (!win || !win.isVisible() || isHiding) return;
  const s = loadSettings();
  isHiding = true;
  win.webContents.executeJavaScript(
    `document.getElementById('card').classList.remove('anim-in'); document.getElementById('card').classList.add('anim-out')`
  ).catch(() => {});
  setTimeout(() => {
    if (isHiding && win) {
      win.hide();
      win.webContents.executeJavaScript(
        `document.getElementById('card').classList.remove('anim-out')`
      ).catch(() => {});
    }
    isHiding = false;
  }, s.animMs || 250);
}

function toggle() {
  if (!win) return;
  if (win.isVisible()) hideOverlay();
  else showOverlay();
}

/* ---------- settings window ---------- */
function openSettings() {
  if (settingsWin) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 400, height: 480,
    title: 'SoundCloud Overlay — Настройки',
    frame: true, resizable: false, maximizable: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  settingsWin.loadURL(`http://127.0.0.1:${httpPortNum}/settings.html`);
  settingsWin.on('closed', () => { settingsWin = null; });
}

/* ---------- overlay window ---------- */
async function createWindow(httpPort) {
  const s = loadSettings();
  const wa = screen.getPrimaryDisplay().workArea;
  const W = Math.round(500 * s.scale);
  const H = Math.round(278 * s.scale);
  const x = Math.min(Math.round(wa.x + wa.width / 2 + wa.width * (s.offsetX / 100)), wa.x + wa.width - W - 12);
  const y = Math.max(wa.y + 12, Math.round(wa.y + wa.height / 2 - H / 2 + s.offsetY));
  win = new BrowserWindow({
    x, y, width: W, height: H,
    frame: false, transparent: true, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false,
    show: false, backgroundColor: '#00000000',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setOpacity(s.opacity);
  await win.loadURL(`http://127.0.0.1:${httpPort}/index.html?port=${WS_PORT}`);
  win.once('ready-to-show', () => {
    showOverlay();
  });
}

/* ---------- app lifecycle ---------- */
// Single-instance lock: second instance quits immediately
if (!app.requestSingleInstanceLock()) {
  console.log('[overlay] another instance running — quitting');
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance — show our overlay
    if (win) showOverlay();
  });
}

app.whenReady().then(async () => {
  httpPortNum = await startHttp();
  const wsPort = await startWs();
  console.log(`[overlay] http=127.0.0.1:${httpPortNum} ws=127.0.0.1:${wsPort}`);

  // Discord RPC (if clientId set in settings)
  const s0 = loadSettings();
  if (s0.discordClientId) rpcInit(s0.discordClientId);

  await createWindow(httpPortNum);
  createTray();

  // Overlay hotkeys
  const okD = globalShortcut.register('Alt+D', toggle);
  const okC = globalShortcut.register('Alt+C', toggleClickThrough);
  const okS = globalShortcut.register('Alt+S', openSettings);

  // Media hotkeys (work even when overlay is hidden)
  const okPP = globalShortcut.register('Alt+Space', () => {
    broadcast({ type: 'cmd', scope: 'overlay_control', cmd: 'playpause' });
    console.log('[hotkey] playpause');
  });
  const okPrev = globalShortcut.register('Alt+Left', () => {
    broadcast({ type: 'cmd', scope: 'overlay_control', cmd: 'prev' });
    console.log('[hotkey] prev');
  });
  const okNext = globalShortcut.register('Alt+Right', () => {
    broadcast({ type: 'cmd', scope: 'overlay_control', cmd: 'next' });
    console.log('[hotkey] next');
  });

  console.log('[overlay] hotkeys:',
    `Alt+D=${okD}`, `Alt+C=${okC}`, `Alt+S=${okS}`,
    `Alt+Space=${okPP}`, `Alt+←=${okPrev}`, `Alt+→=${okNext}`);

  if (SMOKE) setTimeout(() => { console.log('[overlay] smoke exit'); app.exit(0); }, 30000);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  try { if (rpc) { rpc.clearActivity().catch(() => {}); rpc.destroy(); } } catch (_) {}
  try { if (wsSrv) wsSrv.close(); } catch (_) {}
  try { if (httpSrv) httpSrv.close(); } catch (_) {}
  try { if (tray) tray.destroy(); } catch (_) {}
});
