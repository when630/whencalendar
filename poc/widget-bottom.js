'use strict'

// 바탕화면 위젯 PoC — Windows에서 Electron 창을 z-order 맨 아래에 고정할 수 있는가 (버릴 코드)
// 검증 목표
//  1) koffi가 Electron 43 안에서 로드되는가
//  2) SetWindowPos(HWND_BOTTOM)로 다른 창 아래에 깔리고, 클릭해 포커스를 받아도 다시 내려가는가
//  3) 작업 표시줄·Alt+Tab에서 빠지는가 (WS_EX_TOOLWINDOW·WS_EX_NOACTIVATE)
//  4) 바탕화면 보기(Win+D) 뒤에도 남는가 — 남지 않는 것이 예상값. 로그로 확인

const { app, BrowserWindow, screen } = require('electron')
const koffi = require('koffi')

const user32 = koffi.load('user32.dll')
const SetWindowPos = user32.func('bool __stdcall SetWindowPos(void *hWnd, intptr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags)')
const GetWindowLongPtrW = user32.func('intptr __stdcall GetWindowLongPtrW(void *hWnd, int nIndex)')
const SetWindowLongPtrW = user32.func('intptr __stdcall SetWindowLongPtrW(void *hWnd, int nIndex, intptr dwNewLong)')
const GetWindow = user32.func('void * __stdcall GetWindow(void *hWnd, uint uCmd)')
const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(void *hWnd)')
const GetClassNameW = user32.func('int __stdcall GetClassNameW(void *hWnd, _Out_ uint16 *buf, int max)')
const GetWindowTextW = user32.func('int __stdcall GetWindowTextW(void *hWnd, _Out_ uint16 *buf, int max)')
const GetForegroundWindow = user32.func('void * __stdcall GetForegroundWindow()')
const IsIconic = user32.func('bool __stdcall IsIconic(void *hWnd)')
const FindWindowW = user32.func('void * __stdcall FindWindowW(str16 cls, str16 title)')
const FindWindowExW = user32.func('void * __stdcall FindWindowExW(void *parent, void *after, str16 cls, str16 title)')

// 바탕화면 아이콘(SHELLDLL_DefView)을 품은 최상위 창 — 보통 Progman, 배경 슬라이드쇼 등일 땐 WorkerW
function desktopHost () {
  const progman = FindWindowW('Progman', null)
  if (progman && FindWindowExW(progman, null, 'SHELLDLL_DefView', null)) return progman
  let w = FindWindowExW(null, null, 'WorkerW', null)
  let guard = 0
  while (w && guard++ < 200) {
    if (FindWindowExW(w, null, 'SHELLDLL_DefView', null)) return w
    w = FindWindowExW(null, w, 'WorkerW', null)
  }
  return progman
}

// 바탕화면 창 바로 위에 끼운다 — HWND_BOTTOM은 바탕화면보다 아래라 Win+D 때 가려진다(실측 2026-10-08)
function placeAboveDesktop (hwnd) {
  const host = desktopHost()
  if (!host) return SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)
  const prev = GetWindow(host, GW_HWNDPREV) // host 바로 위 창. 그 뒤에 끼우면 host 바로 위가 된다
  if (!prev || prev === hwnd) return true
  return SetWindowPos(hwnd, prev, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)
}
const GW_HWNDPREV = 3

// 바탕화면 창(Progman)이 우리보다 위에 있는가 — 위에 있으면 위젯은 바탕화면에 가려 안 보인다
function desktopAbove (hwnd) {
  const progman = FindWindowW('Progman', null)
  let h = GetWindow(hwnd, GW_HWNDPREV)
  let guard = 0
  while (h && guard++ < 2000) {
    if (h === progman) return true
    h = GetWindow(h, GW_HWNDPREV)
  }
  return false
}

const HWND_BOTTOM = 1
const SWP_NOSIZE = 0x0001
const SWP_NOMOVE = 0x0002
const SWP_NOACTIVATE = 0x0010
const GWL_EXSTYLE = -20
const WS_EX_TOOLWINDOW = 0x00000080
const WS_EX_NOACTIVATE = 0x08000000
const GW_HWNDNEXT = 2

const W = 320
const H = 300

function hwndOf (win) {
  const buf = win.getNativeWindowHandle() // Windows x64: 8바이트 LE HWND
  return koffi.decode(buf, 'void *')
}

function nameOf (h) {
  const cls = ['\0'.repeat(64)]
  const title = ['\0'.repeat(128)]
  const c = new Array(64).fill(0)
  const t = new Array(128).fill(0)
  GetClassNameW(h, c, 64)
  GetWindowTextW(h, t, 128)
  const dec = (a) => String.fromCharCode(...a.filter((x) => x))
  return `${dec(c)}${dec(t) ? ` "${dec(t)}"` : ''}`
}

function sendToBottom (hwnd) {
  return placeAboveDesktop(hwnd)
}

// 우리 창 아래에 있는 보이는 창을 나열한다 — Progman·WorkerW(바탕화면) 말고 다른 것이 있으면 실패
function visibleBelow (hwnd) {
  const out = []
  let h = GetWindow(hwnd, GW_HWNDNEXT)
  let guard = 0
  while (h && guard++ < 2000) {
    if (IsWindowVisible(h)) out.push(nameOf(h))
    h = GetWindow(h, GW_HWNDNEXT)
  }
  return out
}

app.whenReady().then(() => {
  const d = screen.getPrimaryDisplay().workArea
  const win = new BrowserWindow({
    x: d.x + d.width - W - 24,
    y: d.y + 24,
    width: W,
    height: H,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
  })
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
    <body style="margin:0;font:14px system-ui;color:#eee;background:rgba(22,23,28,.85);border-radius:12px;height:100vh;box-sizing:border-box;padding:16px">
      <b>WIDGET PoC</b><br>다른 창을 띄우고 이 창을 클릭해 보세요.<br>항상 아래에 깔려 있어야 합니다.
    </body>`))

  const hwnd = hwndOf(win)
  console.log('[poc] hwnd', hwnd)

  // 작업 표시줄·Alt+Tab 제외 + 클릭해도 활성화되지 않음
  const ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE)
  SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE)

  const check = (label) => {
    const below = visibleBelow(hwnd)
    const bad = below.filter((n) => !/^(Progman|WorkerW)\b/.test(n))
    console.log(`[poc] ${label}: below=${below.length} other=${bad.length}`, bad.slice(0, 5))
    return bad.length === 0
  }

  win.once('ready-to-show', () => {
    win.showInactive()
    console.log('[poc] bottom ok =', sendToBottom(hwnd))
    check('after show')
  })

  // 포커스를 받으면(클릭) 다시 내린다 — WS_EX_NOACTIVATE가 막아주지만 보험
  win.on('focus', () => {
    sendToBottom(hwnd)
    check('after focus')
  })

  setTimeout(() => {
    const other = new BrowserWindow({ width: 400, height: 300, title: 'OTHER-POC' })
    other.loadURL('data:text/html,<h1>OTHER</h1>')
    console.log('[poc] opened OTHER window')
  }, 3000)
  setTimeout(() => { console.log('[poc] calling win.focus()'); win.focus(); win.show() }, 5000)

  // 1초마다 상태를 찍는다 — 사용자가 다른 창을 올리고 클릭하는 동안 관찰
  let n = 0
  const timer = setInterval(() => {
    n++
    const fg = GetForegroundWindow()
    const above = desktopAbove(hwnd)
    if (above || n % 4 === 0) {
      const ok = check(`t=${(n / 4).toFixed(2)} iconic=${IsIconic(hwnd)} desktopAbove=${above} fg=${fg ? nameOf(fg) : 'none'}`)
      if (!ok || above) { sendToBottom(hwnd); check(`re-place desktopAbove=${desktopAbove(hwnd)}`) }
    }
    if (n >= Number(process.env.POC_SECS || 20) * 4) { clearInterval(timer); app.quit() }
  }, 250)
})
