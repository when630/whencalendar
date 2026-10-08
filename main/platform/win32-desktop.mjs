// main/platform/win32-desktop.mjs — Windows에서 창을 바탕화면 창 바로 위에 붙들어 두는 일(D-35).
//
// 이 파일만 koffi를 안다. Windows에서 위젯을 켰을 때만 읽힌다 — platform 표의 widget.pin이 동적 import로 부른다.
// 실측(2026-10-08, poc/widget-bottom.js): HWND_BOTTOM은 Win+D 때 Progman이 위로 올라와 위젯이 가려진다.
// 바탕화면 아이콘(SHELLDLL_DefView)을 품은 창 바로 위에 끼우고, 그 창이 우리 위로 올라오면 다시 끼운다.
let api = null;

async function load() {
  if (api) return api;
  const { default: koffi } = await import('koffi');
  const user32 = koffi.load('user32.dll');
  const dwmapi = koffi.load('dwmapi.dll');
  api = {
    koffi,
    IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(void *hWnd)'),
    IsIconic: user32.func('bool __stdcall IsIconic(void *hWnd)'),
    GetClassNameW: user32.func('int __stdcall GetClassNameW(void *hWnd, _Out_ uint16 *buf, int max)'),
    DwmGetWindowAttribute: dwmapi.func('int __stdcall DwmGetWindowAttribute(void *hWnd, uint attr, _Out_ int *out, uint size)'),
    SetWindowPos: user32.func('bool __stdcall SetWindowPos(void *hWnd, intptr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags)'),
    GetWindowLongPtrW: user32.func('intptr __stdcall GetWindowLongPtrW(void *hWnd, int nIndex)'),
    SetWindowLongPtrW: user32.func('intptr __stdcall SetWindowLongPtrW(void *hWnd, int nIndex, intptr dwNewLong)'),
    GetWindow: user32.func('void * __stdcall GetWindow(void *hWnd, uint uCmd)'),
    FindWindowW: user32.func('void * __stdcall FindWindowW(str16 cls, str16 title)'),
    FindWindowExW: user32.func('void * __stdcall FindWindowExW(void *parent, void *after, str16 cls, str16 title)'),
  };
  return api;
}

const HWND_BOTTOM = 1;
const HWND_TOP = 0;
const WS_EX_TOPMOST = 0x00000008;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const GWL_EXSTYLE = -20;
const WS_EX_TOOLWINDOW = 0x00000080;
const WS_EX_NOACTIVATE = 0x08000000;
const GW_HWNDPREV = 3;
const GW_HWNDNEXT = 2;
const DWMWA_CLOAKED = 14;
// 바탕화면의 일부이거나 자기 z-order 밴드가 따로 있는 창들 — 우리 아래 있어도 "가려진 창"이 아니다
const SHELL_CLASSES = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd']);

function className(a, h) {
  const buf = new Uint16Array(64);
  const n = a.GetClassNameW(h, buf, 64);
  return String.fromCharCode(...buf.subarray(0, Math.max(0, n)));
}

// 사람 눈에 보이는 보통 창인가 — 숨김·최소화·클로킹(다른 가상 데스크톱)·도구 창은 아니다
function isRealWindow(a, h) {
  if (!a.IsWindowVisible(h) || a.IsIconic(h)) return false;
  const cloaked = [0];
  a.DwmGetWindowAttribute(h, DWMWA_CLOAKED, cloaked, 4);
  if (cloaked[0]) return false;
  if (Number(a.GetWindowLongPtrW(h, GWL_EXSTYLE)) & WS_EX_TOOLWINDOW) return false;
  return !SHELL_CLASSES.has(className(a, h));
}

// 우리와 바탕화면 창 사이에 보통 창이 끼어 있는가 — Win+D 왕복 뒤 복귀하지 않은 창이 거기 남는다(실측 2026-10-08).
// 그 창은 위젯에 가려지므로 우리가 그 아래로 내려가야 한다
function strayBelow(a, hwnd, host) {
  let h = a.GetWindow(hwnd, GW_HWNDNEXT);
  let guard = 0;
  while (h && h !== host && guard++ < 2000) {
    if (isRealWindow(a, h)) return true;
    h = a.GetWindow(h, GW_HWNDNEXT);
  }
  return false;
}

// 바탕화면 아이콘을 품은 최상위 창. 보통 Progman이고, 배경 슬라이드쇼 같은 때는 WorkerW 하나가 그 역할을 맡는다.
function desktopHost(a) {
  const progman = a.FindWindowW('Progman', null);
  if (progman && a.FindWindowExW(progman, null, 'SHELLDLL_DefView', null)) return progman;
  let w = a.FindWindowExW(null, null, 'WorkerW', null);
  let guard = 0;
  while (w && guard++ < 200) {
    if (a.FindWindowExW(w, null, 'SHELLDLL_DefView', null)) return w;
    w = a.FindWindowExW(null, w, 'WorkerW', null);
  }
  return progman;
}

// 바탕화면 창이 우리보다 위에 있는가 — 위에 있으면 위젯은 바탕화면에 가려 안 보인다
function desktopAbove(a, hwnd, host) {
  let h = a.GetWindow(hwnd, GW_HWNDPREV);
  let guard = 0;
  while (h && guard++ < 2000) {
    if (h === host) return true;
    h = a.GetWindow(h, GW_HWNDPREV);
  }
  return false;
}

// 바탕화면 창에서 위로 올라가며 처음 만나는 **보이는 보통 창**. 그 바로 아래에 끼우면 바탕화면 바로 위가 된다.
// 바로 위 창(GW_HWNDPREV)을 그대로 쓰면 안 된다 — 거기엔 숨은 창·IME 창이 수십 개 있고, 숨은 창 뒤에 끼운
// SetWindowPos는 보이는 창들 사이의 순서를 바꾸지 못한다(2026-10-08 실측: 시작 직후 위젯이 모든 창 위에 떴다)
function anchorAbove(a, hwnd, host) {
  let h = a.GetWindow(host, GW_HWNDPREV);
  let guard = 0;
  while (h && guard++ < 5000) {
    if (h !== hwnd && isRealWindow(a, h) && !(Number(a.GetWindowLongPtrW(h, GWL_EXSTYLE)) & WS_EX_TOPMOST)) return h;
    h = a.GetWindow(h, GW_HWNDPREV);
  }
  return null;
}

function placeAboveDesktop(a, hwnd) {
  const host = desktopHost(a);
  const flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE;
  if (!host) return a.SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, flags);
  const anchor = anchorAbove(a, hwnd, host);
  // 보이는 보통 창이 하나도 없으면 보통 창 밴드의 맨 위가 곧 바탕화면 바로 위다
  return a.SetWindowPos(hwnd, anchor ?? HWND_TOP, 0, 0, 0, 0, flags);
}

/**
 * 창을 바탕화면 바로 위에 붙들어 둔다. 돌려주는 핸들의 stop()으로 그만둔다.
 * @param win BrowserWindow — getNativeWindowHandle()만 쓴다
 */
export async function pinAboveDesktop(win, { pollMs = 250 } = {}) {
  const a = await load();
  if (!win || win.isDestroyed()) return { refresh() {}, stop() {} };
  const hwnd = a.koffi.decode(win.getNativeWindowHandle(), 'void *');

  // Electron의 type:'toolbar'·focusable:false가 이미 거는 스타일이지만, 둘 중 하나가 바뀌어도 위젯은 그대로여야 한다
  const ex = a.GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
  a.SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE);

  const refresh = () => {
    if (win.isDestroyed()) return;
    placeAboveDesktop(a, hwnd);
  };
  refresh();

  const timer = pollMs
    ? setInterval(() => {
        if (win.isDestroyed()) return;
        const host = desktopHost(a);
        if (host && (desktopAbove(a, hwnd, host) || strayBelow(a, hwnd, host))) placeAboveDesktop(a, hwnd);
      }, pollMs)
    : null;

  return {
    refresh,
    stop() {
      if (timer) clearInterval(timer);
    },
  };
}
