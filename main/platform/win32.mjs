// main/platform/win32.mjs — Windows가 하는 방식. v0.1.1까지 코드에 박혀 있던 그대로다 (PLAT-06).
//
// electron을 import하지 않는다. 여기는 "무엇을 할지"를 적은 표일 뿐이고, 부르는 것은
// lifecycle·overlay·update가 한다 — 그래야 창 없이 도는 테스트가 이 표를 읽을 수 있다(D-27).

export const win32 = {
  id: 'win32',

  tray: {
    // 트레이 아이콘은 밝은·어두운 작업 표시줄 양쪽에 서므로 아이콘의 파랑을 그대로 쓴다.
    icons: ['tray.png'],
    template: false,
    // 작업 표시줄의 트레이 아이콘은 왼쪽 클릭으로 창을 여는 것이 관습이다.
    clickOpensWindow: true,
  },

  // Dock이 없다. 응용 프로그램 메뉴도 두지 않는다 — 기본 메뉴의 단축키(F12·Ctrl+R)를
  // 그대로 남긴다. 여기서 null이 아닌 것을 돌려주면 그것을 지우게 된다.
  hideDock: false,
  appMenu: null,

  overlay: {
    // 화면 맨 위. 작업 표시줄이 위에 붙어 있어도 오버레이는 항상 위에 뜬다.
    top: (display) => display.bounds.y,
    // 창 종류는 기본값. `type`은 macOS 전용이다.
    windowType: null,
    // 전체화면·TopMost 창이 나중에 뜨면 같은 z-order 밴드에서 우리 위로 올라간다.
    // 레벨만으로는 풀리지 않아 1초마다 다시 잡는다 (D-14).
    keepTopMovesTop: true,
    workspaces: { visibleOnFullScreen: true },
  },

  update: {
    // 미서명이어도 NSIS는 설치된다. 내려받아 두고 종료할 때 설치한다 (REL-03).
    autoDownload: true,
    installOnQuit: true,
    manual: false,
  },

  // 본체 창을 보이고 숨기는 순서(D-34). **`hide()`만으로는 직전 창에 포커스가 돌아오지 않는다** —
  // 창을 숨기면 OS가 Z순서에서 아무 창이나 고른다(whencommand 실측 2026-09-21). 숨기기 전에 `minimize()`를
  // 거치면 최소화의 정규 활성화 경로가 직전 포그라운드 창을 복귀시킨다. 최소화된 창은 `isVisible()=false`라
  // 보일 때는 `restore()`가 먼저고, 그 뒤 `show()`를 **반드시** 부른다 — restore만으로는 렌더러가 프레임을
  // 내지 않아 직전 화면이 굳은 채 키를 안 받는다(whencommand D-29).
  window: {
    activate(win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    },
    deactivate(win) {
      if (!win.isMinimized()) win.minimize();
      win.hide();
    },
  },

  dataDirLabel: '%APPDATA%\\whencalendar',

  // 전역 단축키 기본값(PLAT-06). 사용자가 바꾼 값은 store의 setting 표(hotkeyWindow·hotkeyOverlay)에
  // 있다. 빈 문자열이면 그 자리는 잡지 않는다.
  // WHENWORK `Ctrl+Alt+Space`·WHENNOTE `Ctrl+Alt+M`·`N`·WHENMUSIC `Ctrl+Alt+S`·`P`·←·→와 겹치지 않는 조합.
  hotkeys: { window: 'Control+Alt+C', overlay: 'Control+Alt+O' },

  // 사람에게 보여줄 조합 표기 — 키캡에 새겨진 이름 그대로 적는다.
  hotkeyLabel: (accel) =>
    String(accel ?? '')
      .replace(/\bCommandOrControl\b/g, 'Ctrl')
      .replace(/\bControl\b/g, 'Ctrl')
      .replace(/\b(Command|Super)\b/g, 'Win'),

  // 형제 앱 연동(D-33) — WHENCOMMAND가 "정말 설치돼 있나"를 확인할 경로. 개발 실행이면 설치본의 관례 경로를 적고,
  // 패키징본이면 실제 실행 파일(bundleFromExe) — Windows는 exe 그 자체다.
  link: {
    verify: '%LOCALAPPDATA%\\Programs\\WHENCALENDAR\\WHENCALENDAR.exe',
    bundleFromExe: (exe) => exe,
  },
};
