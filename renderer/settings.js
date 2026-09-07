/* settings.js — логика окна настроек SC Overlay */
const $ = (id) => document.getElementById(id);
const fields = ['opacity', 'scale', 'offsetX', 'offsetY', 'animMs'];
const defaults = {
  opacity: 1.0, scale: 1.0, offsetX: 5.5, offsetY: 0, animMs: 250,
  discordClientId: '',
};
let current = { ...defaults };
let prevDiscordId = '';

// Load current settings
fetch('/api/settings')
  .then(r => r.json())
  .then(s => {
    current = { ...defaults, ...s };
    prevDiscordId = current.discordClientId || '';
    updateUI();
  })
  .catch(() => updateUI());

function updateUI() {
  $('opacity').value = Math.round(current.opacity * 100);
  $('v-opacity').textContent = Math.round(current.opacity * 100) + '%';
  $('scale').value = Math.round(current.scale * 100);
  $('v-scale').textContent = Math.round(current.scale * 100) + '%';
  $('offsetX').value = current.offsetX;
  $('v-offsetX').textContent = current.offsetX + '%';
  $('offsetY').value = current.offsetY;
  $('v-offsetY').textContent = current.offsetY + ' px';
  $('animMs').value = current.animMs;
  $('v-animMs').textContent = current.animMs + ' ms';
  $('discordClientId').value = current.discordClientId || '';
}

// Live preview on slider change
fields.forEach(f => {
  $(f).addEventListener('input', () => {
    const v = $(f).value;
    if (f === 'opacity') current.opacity = v / 100;
    else if (f === 'scale') current.scale = v / 100;
    else if (f === 'offsetX') current.offsetX = parseFloat(v);
    else if (f === 'offsetY') current.offsetY = parseInt(v);
    else if (f === 'animMs') current.animMs = parseInt(v);
    updateUI();
    // Live-apply (debounced)
    clearTimeout(window._t);
    window._t = setTimeout(() => post(current, false), 300);
  });
});

// Discord Client ID — save on blur / Enter (reconnect happens in main)
$('discordClientId').addEventListener('change', () => {
  current.discordClientId = $('discordClientId').value.trim();
  post(current);
});

function post(data, showMessage = true) {
  fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  .then(r => r.json())
  .then(r => {
    if (r.ok && showMessage) {
      $('msg').textContent = '✓ Сохранено';
      setTimeout(() => $('msg').textContent = '', 1500);
    }
  })
  .catch(() => {});
}

function save() { post(current); }

function reset() {
  current = { ...defaults };
  updateUI();
  post(current);
  $('msg').textContent = '↺ Сброшено';
  setTimeout(() => $('msg').textContent = '', 1500);
}
