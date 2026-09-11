# 🎧 SoundCloud Overlay

> ## ⚠️ Бета-тест
> Приложение находится на стадии **открытой беты** — могут быть баги и нестабильность. Используй осторожно и присылай найденные проблемы (issue на GitHub / `pandemias` в Discord).

[![License: MIT](https://img.shields.io/badge/License-MIT-f97316.svg)](LICENSE)
[![Platform: Windows + Linux](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-0078D6.svg)]()
[![Electron](https://img.shields.io/badge/Electron-33-9feaf9.svg)]()
[![Vibe Coded](https://img.shields.io/badge/Vibe%20Coded-100%25-ff00ff.svg)]()
[![Beta](https://img.shields.io/badge/Status-Beta-f39c12.svg)]()

Игровой музыкальный оверлей для SoundCloud в стиле Discord: показывает текущий трек поверх любой игры и позволяет управлять воспроизведением, не сворачивая игру.

**Работает на Windows и Linux** (AppImage / .deb / любой Chromium-браузер).

---

## ✨ Возможности

| Фича | Описание |
|---|---|
| 🎮 Оверлей поверх игр | Полупрозрачная карточка всегда поверх всех окон |
| 🐧 Кроссплатформенность | Windows (.exe) и Linux (AppImage, .deb) |
| ⌨️ Горячие клавиши | `Alt+D` — показать/скрыть, `Alt+C` — кликсквозь, `Alt+S` — настройки, `Alt+M` — мини-режим |
| 🎵 Медиа-управление | `Alt+Space` — play/pause, `Alt+←`/`→` — prev/next |
| 🔳 Мини-режим | Компактная капсула вверху экрана: круглая обложка, трек, play/pause/next |
| 🔄 Автозапуск | Windows — реестр; Linux — `~/.config/autostart` |
| 📌 Системный трей | Иконка в трее с полным меню управления |
| ✨ Анимации | Плавное появление карточки + смена трека в обоих режимах |
| 🖱 Кликсквозь | Режим, где клики проходят сквозь оверлей в игру |
| ⚙ Настройки | Прозрачность, размер, позиция, скорость анимации |
| 🎮 Discord Rich Presence | Трек в профиле Discord: название, исполнитель, обложка, таймер + кнопки «Слушать на SoundCloud» и GitHub |
| 🔒 Приватность | Всё локально (`127.0.0.1`), никаких серверов |

---

## Установка

### 🪟 Windows

Скачай и запусти **`SoundCloud Overlay-Setup-2.0.0.exe`** из [Releases](../../releases).

> ⚠️ Windows может показать «Неизвестный издатель» — нажмите «Подробнее → Выполнить в любом случае». Установщик не подписан сертификатом (это стоит ~$200/год).

### 🐧 Linux

Два варианта на выбор:

**AppImage** (рекомендуется — работает везде):
```bash
chmod +x "SoundCloud Overlay-2.0.0.AppImage"
./"SoundCloud Overlay-2.0.0.AppImage"
```

**.deb** (Debian / Ubuntu / Mint / Pop!_OS):
```bash
sudo dpkg -i soundcloud-overlay_2.0.0_amd64.deb
# если не хватило зависимостей:
sudo apt-get install -f
```

**Arch / Manjaro / CachyOS:**
```bash
# AppImage работает из коробки, либо распакуй deb:
bsdtar -xf soundcloud-overlay_2.0.0_amd64.deb
```

> 💡 На Linux автозапуск работает через `~/.config/autostart/soundcloud-overlay.desktop` —
> включи галочку «Автозапуск с системой» в меню трея.

### Шаг 2 — Расширение Chrome (все платформы)

1. Открой `chrome://extensions`
2. Включи **«Режим разработчика»** (переключатель справа вверху)
3. Нажми **«Загрузить распакованное расширение»**
4. Выбери папку `extension` — она лежит рядом с программой:
   - **Windows:** `%LOCALAPPDATA%\Programs\soundcloud-overlay\extension`
   - **Linux AppImage:** распакуй AppImage (`./App.AppImage --appimage-extract`) → `squashfs-root/extension`
   - **Linux deb:** `/opt/SoundCloud Overlay/extension`

> Работает в Chrome, Chromium, Brave, Edge, Vivaldi и Opera (все на Chromium).

### Шаг 3 — Запуск

1. Открой **soundcloud.com**, запусти трек
2. Запусти **SoundCloud Overlay**
3. Нажми **`Alt+D`** — карточка появится поверх всего

---

## ⌨️ Горячие клавиши

| Клавиша | Действие |
|---|---|
| `Alt+D` | Показать / скрыть оверлей |
| `Alt+C` | Кликсквозь вкл/выкл (клики идут в игру) |
| `Alt+S` | Открыть настройки |
| `Alt+M` | Мини-режим вкл/выкл (капсула вверху экрана) |
| `Alt+Space` | Play / Pause (работает без показа оверлея!) |
| `Alt+←` | Предыдущий трек |
| `Alt+→` | Следующий трек |

---

## ⚙ Настройки

### Окно настроек (`Alt+S` или через трей)

- **Прозрачность** — 20%–100%
- **Размер** — 50%–150%
- **Позиция** — сдвиг от центра по X/Y
- **Скорость анимации** — 100–500 мс
- **Discord Rich Presence** — Application ID из [Discord Developer Portal](https://discord.com/developers/applications). Пусто = выключено.

### Настройки расширения (popup при клике на иконку)

- **Порт WebSocket** — по умолчанию 8765
- **Интервал опроса** — как часто читать состояние трека (500–5000 мс)

> 💡 **Про Discord RPC:** Discord-приложение должно быть запущено. Кнопка «Слушать на SoundCloud» видна **другим пользователям** в твоём профиле (ограничение Discord API — себе её кликнуть нельзя). Для своей иконки-приложения: создай приложение в Developer Portal, скопируй Application ID в настройки оверлея.

---

## 🔧 Сборка из исходников

```bash
git clone https://github.com/pandemiaas/soundcloud-overlay.git
cd soundcloud-overlay

# установить зависимости
npm install

# ---- Windows ----
npm run dist              # NSIS-установщик (.exe)

# ---- Linux ----
npm run dist:linux        # AppImage + .deb

# ---- обе платформы ----
npm run dist:all

# портативная версия (без установщика)
npm run pack
```

Результат в `dist/`.

> ⚠️ **Каждую платформу нужно собирать на своей ОС.** AppImage и `.deb` не собираются
> на Windows (нужны `mksquashfs` и `dpkg-deb`). Если работаешь на Windows —
> используй готовые сборки из [Releases](../../releases) или GitHub Actions.

### Автоматическая сборка

В репозитории настроен **GitHub Actions**: при пуше тега `v*` собираются
**все три артефакта** (Windows .exe + Linux AppImage + .deb) и прикрепляются к релизу.

```bash
git tag v2.0.0
git push origin v2.0.0     # → CI соберёт и опубликует всё автоматически
```

---

## 🏗 Архитектура

```
┌─────────────┐   WebSocket    ┌──────────────┐
│   Chrome    │◄──────────────►│  Electron    │
│  extension  │  127.0.0.1:8765│  overlay     │
│             │                 │              │
│ content.js  │  snapshot ────►│  gui.js      │
│ bg worker   │◄──── cmd ──────│  (карточка)  │
└─────────────┘                 └──────────────┘
```

- **Electron** (`main.js`) — окно, трей, хоткеи, WS-сервер, настройки
- **Chrome Extension MV3** (`extension/`) — читает DOM soundcloud.com, шлёт снапшоты, применяет команды
- **Renderer** (`renderer/`) — GUI карточки + страница настроек

---

## 🐛 Решение проблем

<details>
<summary>Оверлей показывает «no connection»</summary>

1. Проверь, что расширение включено в `chrome://extensions`
2. Проверь, что вкладка soundcloud.com открыта
3. Перезапусти программу
4. Переоткрой вкладку SoundCloud
</details>

<details>
<summary>Кнопки не работают</summary>

- Убедись, что кликсквозь выключен (`Alt+C`)
- Проверь, что вкладка SoundCloud не заморожена Chrome
</details>

<details>
<summary>Alt+D не работает</summary>

- Проверь, что процесс `SoundCloud Overlay.exe` запущен
- Возможно, `Alt+D` перехватывает другая программа
</details>

---

## 🤖 Кредиты (обязательно к прочтению)

Почти **весь** этот проект написан благодаря искусственному интеллекту. Да, вы не ослышались — **почти весь**. Даже этот README, который вы сейчас читаете, написан ИИ.

Автор этого репозитория — балбес, который сам ничего не умеет делать. Он просто сидел, разговаривал с нейросетью, говорил ей «сделай вот так» и «а теперь исправь вот это», а она пахала за него. Все идеи, весь код, вся документация, все решения по архитектуре — это заслуга ИИ, а не человека. Человек тут выполнял роль очень дорогой кнопки «Enter».

Если вы нашли баг — это потому что автор не читал код, который копировал. Если вам понравилась архитектура — это ИИ постарался. Если вам понравился README — его тоже написал ИИ. Автор просто нажал Ctrl+C, Ctrl+V.

Модели, которые делали всю работу, пока автор «руководил»:

- **[GLM-5.3](https://z.ai)** (Z.ai) — архитектура, основной код, расширение Chrome, система настроек, установщик
- **[DeepSeek-V4-Flash](https://deepseek.com)** — отладка, рефакторинг, итеративная доработка

Вайб-кодинг в чистом виде. 💊

---

## 📄 Лицензия

[MIT](LICENSE) — делай что хочешь, только копирайт оставь.

---

## 👤 Автор

**pandemias** — балбес и просто кнопка Enter

- Discord: `pandemias`
- GitHub: [pandemiaas](https://github.com/pandemiaas)
