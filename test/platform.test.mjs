// OS 분기는 main/platform/ 안에만 있다 (PLAT-06). 그리고 두 표가 서로 같은 모양인지.
//
// 계약 테스트를 따로 두는 이유 — 분기는 언제나 "여기 한 줄만"으로 시작한다. 한 줄이
// lifecycle에, 또 한 줄이 overlay에 생기고 나면 어느 쪽 OS에서만 도는 코드가 몇 줄인지
// 아무도 세지 못한다. 세는 일을 테스트에 맡긴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { platformFor, platform, win32, darwin } from '../main/platform/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAIN = path.join(HERE, '..', 'main');
const ALLOWED = path.join(MAIN, 'platform');

function sources(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sources(full));
    else if (/\.(mjs|cjs|js)$/.test(e.name)) out.push(full);
  }
  return out;
}

test('OS 이름은 main/platform/ 밖에서 나오지 않는다 (PLAT-06)', () => {
  const smell = /process\.platform|os\.platform\(|['"]darwin['"]|['"]win32['"]|['"]linux['"]/;
  const leaked = [];
  for (const file of sources(MAIN)) {
    if (file.startsWith(ALLOWED + path.sep)) continue;
    fs.readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (smell.test(line)) leaked.push(`${path.relative(MAIN, file)}:${i + 1} ${line.trim()}`);
      });
  }
  assert.deepEqual(leaked, [], `OS 분기는 main/platform/ 안에만 둔다:\n${leaked.join('\n')}`);
});

test('process.platform을 읽는 곳은 index.mjs 한 곳뿐이다', () => {
  const hits = sources(ALLOWED).filter((f) => /process\.platform/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(hits.map((f) => path.basename(f)), ['index.mjs']);
});

test('모르는 OS는 Windows 표로 떨어진다 — 개발 실행이 죽지 않는다', () => {
  assert.equal(platformFor('darwin'), darwin);
  assert.equal(platformFor('win32'), win32);
  assert.equal(platformFor('linux'), win32);
  assert.equal(platformFor(undefined), win32);
  assert.ok(platform === darwin || platform === win32);
});

// 한쪽 표에만 열쇠를 더하면 다른 OS에서 `undefined`를 읽고 조용히 다르게 군다.
test('두 표의 열쇠가 같다', () => {
  const keys = (o) => Object.keys(o).sort();
  assert.deepEqual(keys(darwin), keys(win32));
  for (const group of ['tray', 'overlay', 'update', 'window', 'widget']) {
    assert.deepEqual(keys(darwin[group]), keys(win32[group]), group);
  }
});

// Windows는 hide()만으로는 직전 창에 포커스가 돌아오지 않는다 — minimize()를 거쳐 숨기고, 그래서 보일 때 restore()가 먼저다.
// restore() 뒤에 show()를 빼면 렌더러가 프레임을 내지 않아 화면이 굳는다(whencommand D-29). 호출 순서를 가짜 창으로 센다.
test('Windows는 minimize→hide로 숨기고 restore→show→focus로 보인다 (D-34)', () => {
  const fake = (minimized) => {
    const calls = [];
    return {
      calls,
      isMinimized: () => minimized,
      minimize: () => { calls.push('minimize'); minimized = true; },
      restore: () => { calls.push('restore'); minimized = false; },
      show: () => calls.push('show'),
      hide: () => calls.push('hide'),
      focus: () => calls.push('focus'),
    };
  };

  let w = fake(false);
  win32.window.deactivate(w);
  assert.deepEqual(w.calls, ['minimize', 'hide']);
  w = fake(true);
  win32.window.deactivate(w);
  assert.deepEqual(w.calls, ['hide'], '이미 최소화된 창은 다시 최소화하지 않는다 — blur 핸들러가 재진입해도 안전해야 한다');
  w = fake(true);
  win32.window.activate(w);
  assert.deepEqual(w.calls, ['restore', 'show', 'focus']);
  w = fake(false);
  win32.window.activate(w);
  assert.deepEqual(w.calls, ['show', 'focus']);

  // macOS는 hide()로 직전 앱에 돌아간다 — app.hide()는 오버레이까지 숨기므로 쓰지 않는다
  w = fake(false);
  darwin.window.deactivate(w);
  assert.deepEqual(w.calls, ['hide']);
  w = fake(true);
  darwin.window.activate(w);
  assert.deepEqual(w.calls, ['restore', 'show', 'focus']);
});

test('메뉴 막대는 Template 아이콘을 먼저 찾고, 트레이는 색이 든 것을 쓴다', () => {
  assert.equal(darwin.tray.icons[0], 'tray-Template.png');
  assert.ok(darwin.tray.icons.includes('tray.png'), '없으면 아무것도 안 뜬다 — 색 아이콘이라도 뜬다');
  assert.equal(darwin.tray.template, true);
  assert.equal(win32.tray.icons[0], 'tray.png');
  assert.equal(win32.tray.template, false);
});

test('오버레이는 macOS에서만 메뉴 막대 아래로 내려간다', () => {
  // 노치가 있는 맥: 화면은 0부터인데 쓸 수 있는 자리는 38부터다
  const display = { bounds: { x: 0, y: 0, width: 1512, height: 982 }, workArea: { x: 0, y: 38, width: 1512, height: 944 } };
  assert.equal(darwin.overlay.top(display), 38);
  assert.equal(win32.overlay.top(display), 0);
});

test('macOS 오버레이는 NSPanel이다 — 보통 창은 전체화면 위로 못 올라간다 (OVL-02)', () => {
  assert.equal(darwin.overlay.windowType, 'panel');
  assert.equal(win32.overlay.windowType, null, 'type은 macOS 전용이다');
});

test('1초 주기 moveTop은 Windows에서만 (D-14)', () => {
  assert.equal(win32.overlay.keepTopMovesTop, true);
  assert.equal(darwin.overlay.keepTopMovesTop, false);
  // 이것이 빠지면 호출할 때마다 Dock 아이콘이 깜빡인다
  assert.equal(darwin.overlay.workspaces.skipTransformProcessType, true);
  assert.equal(darwin.overlay.workspaces.visibleOnFullScreen, true);
  assert.equal(win32.overlay.workspaces.visibleOnFullScreen, true);
});

test('미서명 macOS는 스스로 갈아끼우지 않는다 (D-31)', () => {
  assert.equal(darwin.update.autoDownload, false);
  assert.equal(darwin.update.installOnQuit, false);
  assert.equal(darwin.update.manual, true);

  assert.equal(win32.update.autoDownload, true);
  assert.equal(win32.update.installOnQuit, true);
  assert.equal(win32.update.manual, false);
});

test('macOS는 Dock에서 빠지고, 그래서 응용 프로그램 메뉴를 들고 있다', () => {
  assert.equal(darwin.hideDock, true);
  // Dock에서 빠진 앱은 이 메뉴가 없으면 입력 칸에서 Cmd+C·V가 죽는다
  const roles = darwin.appMenu().map((m) => m.role);
  assert.ok(roles.includes('editMenu'), `편집 메뉴가 있어야 한다: ${roles}`);

  assert.equal(win32.hideDock, false);
  assert.equal(win32.appMenu, null, 'Windows 기본 메뉴를 지우지 않는다');
});

// 바탕화면 위젯(D-35) — macOS는 창 종류 하나로 바탕화면 레벨에 놓이지만 입력을 못 받고, Windows는 Win32로 붙들어 두되 마우스는 받는다.
test('위젯은 macOS에서 desktop 창, Windows에서 toolbar 창 + Win32 고정이다 (D-35)', () => {
  assert.equal(darwin.widget.windowType, 'desktop');
  assert.equal(darwin.widget.interactive, false, 'desktop 창은 마우스를 못 받는다 — 끌기는 위치 조정 모드로');
  assert.equal(darwin.widget.pin, null);

  assert.equal(win32.widget.windowType, 'toolbar', 'WS_EX_TOOLWINDOW — 작업 표시줄·Alt+Tab에서 빠진다');
  assert.equal(win32.widget.interactive, true);
  assert.equal(typeof win32.widget.pin, 'function');
  assert.ok(win32.widget.pollMs > 0 && win32.widget.pollMs <= 1000, 'Win+D 뒤 가려진 시간이 눈에 띄지 않을 만큼 짧아야 한다');
});
