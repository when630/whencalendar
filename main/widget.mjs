// main/widget.mjs — 바탕화면 달력 위젯 창(WGT). 오버레이와 반대다 — 오버레이는 모든 창 위, 위젯은 모든 창 아래.
//
// 어떻게 아래에 두는지는 platform이 안다(D-35) — macOS는 창 종류 하나로 끝나고 Windows는 Win32로 붙들어 둔다.
// 이 파일은 "언제 만들고 어디에 놓고 무엇을 보내는지"만 안다. 자리 계산은 widget-layout이 한다(테스트가 읽는다).
import { BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from './platform/index.mjs';
import { pickDisplay, boundsFor, relativeTo, displayContaining, displayLabel, sizeOf, zoomOf } from './widget-layout.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SETTING = 'widget'; // settings.json — { displayId, x, y }. 창 위치는 UI 상태라 DB가 아니라 여기다

export function createWidget({ settings, onOpen, size: readSize }) {
  let win = null;
  let pinner = null;
  let adjusting = false; // 위치 조정 모드 — 보통 창으로 잠시 바꿔 끌어 옮긴다(macOS는 이 길뿐이다)
  let drag = null; // { cursor, pos } — 끌기 시작 시점의 커서와 창 위치. 좌표는 전부 main이 잰다(DPI·모니터 경계를 렌더러가 몰라도 되게)
  let lastPayload = null;
  let generation = 0; // 만들고 부수기를 반복하므로 늦게 온 pin 결과가 새 창에 붙지 않게 센다

  const saved = () => settings.get(SETTING, null) ?? {};
  const size = () => sizeOf(readSize?.()); // 크기 단계는 앱 동작 값이라 store에 있다 — 부르는 쪽이 읽어 준다
  const primaryId = () => screen.getPrimaryDisplay().id;
  const targetDisplay = () => pickDisplay(screen.getAllDisplays(), saved().displayId, primaryId());

  function build() {
    const gen = ++generation;
    const bounds = boundsFor(saved(), targetDisplay(), size());
    const type = !adjusting && platform.widget.windowType ? { type: platform.widget.windowType } : {};
    win = new BrowserWindow({
      ...bounds,
      ...type,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false, // 끌기는 우리가 한다 — OS 드래그는 포커스 없는 창에서 플랫폼마다 다르게 군다
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      hasShadow: adjusting,
      // 평소엔 포커스를 받지 않는다(타이핑하던 창을 뺏지 않는다). 조정 모드에서는 보통 창 — 위로 띄워 눈에 띄게
      focusable: adjusting,
      alwaysOnTop: adjusting,
      show: false,
      webPreferences: { preload: path.join(HERE, 'preload.cjs') },
    });
    win.setMenu?.(null);

    // 붙들어 두기는 창을 보이기 **전에** 건다 — 숨은 창에도 z-order는 있다. 보인 뒤에 걸면 koffi를 읽는 동안
    // 위젯이 잠깐 모든 창 위에 떴다가 내려간다(2026-10-08 실측)
    const pinning =
      !adjusting && platform.widget.pin
        ? platform.widget.pin(win, { pollMs: platform.widget.pollMs }).catch((err) => {
            // koffi가 없거나 깨진 설치본 — 위젯은 그대로 뜬다. 다만 다른 창 아래로 내려가지 못한다
            console.error('[widget] pin failed:', err?.message ?? err);
            return null;
          })
        : Promise.resolve(null);

    win.loadFile(path.join(HERE, '..', 'renderer', 'widget.html'));
    win.webContents.once('did-finish-load', async () => {
      const p = await pinning;
      if (gen !== generation || !win || win.isDestroyed()) {
        p?.stop();
        return;
      }
      pinner = p;
      send();
      if (adjusting) win.show();
      else win.showInactive();
      pinner?.refresh(); // 보이는 순간 OS가 위로 올릴 수 있다 — 바로 되돌린다
    });
    win.on('closed', () => {
      if (gen === generation) win = null;
    });
  }

  function send() {
    if (!win || win.isDestroyed() || !lastPayload) return;
    win.webContents.send('widget:state', { ...lastPayload, zoom: zoomOf(size()), adjusting, interactive: adjusting || platform.widget.interactive });
  }

  function teardown() {
    generation++;
    pinner?.stop();
    pinner = null;
    drag = null;
    if (win && !win.isDestroyed()) win.destroy();
    win = null;
  }

  // 모니터가 바뀌면 저장된 자리로 다시 간다 — 빠진 모니터면 주 모니터로
  function relocate() {
    if (!win || win.isDestroyed()) return;
    win.setBounds(boundsFor(saved(), targetDisplay(), size()));
    pinner?.refresh();
  }

  function remember() {
    if (!win || win.isDestroyed()) return;
    const b = win.getBounds();
    const d = displayContaining(screen.getAllDisplays(), b) ?? screen.getPrimaryDisplay();
    settings.set(SETTING, { displayId: d.id, ...relativeTo(b, d) });
  }

  const mine = (e) => win && !win.isDestroyed() && e.sender === win.webContents;

  // 끌기 — 렌더러는 "시작·이동·끝"만 알리고 좌표는 main이 커서 위치로 잰다
  ipcMain.on('widget:drag', (e, phase) => {
    if (!mine(e)) return;
    if (phase === 'start') {
      const [x, y] = win.getPosition();
      drag = { cursor: screen.getCursorScreenPoint(), pos: { x, y } };
    } else if (phase === 'move' && drag) {
      const c = screen.getCursorScreenPoint();
      win.setPosition(drag.pos.x + (c.x - drag.cursor.x), drag.pos.y + (c.y - drag.cursor.y));
    } else if (phase === 'end' && drag) {
      drag = null;
      remember();
      pinner?.refresh();
    }
  });

  ipcMain.on('widget:open', (e) => {
    if (mine(e)) onOpen?.();
  });

  ipcMain.on('widget:adjustDone', (e) => {
    if (mine(e)) api.setAdjusting(false);
  });

  const api = {
    get active() {
      return !!win && !win.isDestroyed();
    },

    get adjusting() {
      return adjusting;
    },

    start() {
      if (win) return;
      build();
      screen.on('display-metrics-changed', relocate);
      screen.on('display-added', relocate);
      screen.on('display-removed', relocate);
    },

    stop() {
      if (!win) return;
      screen.removeListener('display-metrics-changed', relocate);
      screen.removeListener('display-added', relocate);
      screen.removeListener('display-removed', relocate);
      adjusting = false;
      teardown();
    },

    push(payload) {
      lastPayload = payload;
      send();
    },

    // 위치 조정 — 창을 부수고 보통 창으로 다시 만든다. 끝나면 다시 바탕화면 창으로 (D-35)
    setAdjusting(on) {
      if (!win || adjusting === !!on) return;
      adjusting = !!on;
      teardown();
      build();
    },

    // 설정 화면의 모니터 목록 — id와 사람이 읽을 이름
    displays() {
      const pid = primaryId();
      const cur = targetDisplay()?.id ?? pid;
      return screen.getAllDisplays().map((d, i) => ({ id: d.id, label: displayLabel(d, i, pid), current: d.id === cur }));
    },

    // 크기 단계가 바뀌었다 — 같은 자리에서 다시 재고(화면 밖이면 당긴다) 글자 배율도 다시 보낸다
    resize() {
      relocate();
      send();
    },

    // 모니터를 바꾸면 자리는 그 모니터의 기본 자리(오른쪽 위)로 돌아간다 — 이전 모니터 기준 좌표는 뜻이 없다
    setDisplay(id) {
      settings.set(SETTING, { displayId: id });
      relocate();
    },

    destroy() {
      api.stop();
    },
  };

  return api;
}
