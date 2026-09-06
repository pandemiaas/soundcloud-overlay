/* popup.js — настройки расширения SC Overlay Bridge */

const $ = (id) => document.getElementById(id);

// Загрузка текущих настроек
chrome.storage.sync.get(['wsPort', 'pollInterval'], (s) => {
  $('port').value = s.wsPort || 8765;
  $('interval').value = s.pollInterval || 1200;
});

// Проверка соединения с оверлеем
function checkWs() {
  const port = Number($('port').value) || 8765;
  const url = `ws://127.0.0.1:${port}`;
  try {
    const ws = new WebSocket(url);
    const dot = $('wsDot');
    const st = $('wsStatus');
    ws.onopen = () => {
      dot.className = 'dot on';
      st.textContent = `подключено (порт ${port})`;
      ws.close();
    };
    ws.onerror = () => {
      dot.className = 'dot err';
      st.textContent = 'нет соединения с оверлеем';
    };
    ws.onclose = () => {
      if (dot.className !== 'dot on') {
        dot.className = 'dot err';
        st.textContent = 'нет соединения с оверлеем';
      }
    };
    // Таймаут
    setTimeout(() => { try { ws.close(); } catch {} }, 2000);
  } catch (e) {
    $('wsDot').className = 'dot err';
    $('wsStatus').textContent = 'ошибка подключения';
  }
}

$('port').addEventListener('change', checkWs);
checkWs();

function save() {
  const port = Number($('port').value) || 8765;
  const interval = Math.max(500, Math.min(5000, Number($('interval').value) || 1200));

  chrome.storage.sync.set({ wsPort: port, pollInterval: interval }, () => {
    $('msg').textContent = '✓ Сохранено — перезапусти вкладку SC';
    setTimeout(() => $('msg').textContent = '', 2500);
    checkWs();
  });
}
