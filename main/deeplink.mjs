// main/deeplink.mjs — 형제 앱 연동의 순수 부분(D-33). 규약은 when630/when-protocol, 구현은 WHENNOTE·WHENWORK를 따랐다.
//
//   parseDeepLink   whencalendar://add?text=담주 화 3시 미팅 → { command: 'add', args: { text: '…' } }. 모르는 스킴·명령은 null
//   fromArgv        Windows/Linux는 URL이 argv로 온다(첫 실행이면 process.argv, 떠 있으면 second-instance)
//   buildManifest   ~/.when/apps/whencalendar.json에 쓸 명령 목록 — WHENCOMMAND가 읽어 입력줄에 합친다

import { win32, darwin } from './platform/index.mjs'; // OS 이름은 표에서 읽는다(PLAT-06) — 이 파일에 'darwin'·'win32'를 적지 않는다

export const SCHEME = 'whencalendar';
export const APP_ID = 'whencalendar';

// 이 앱이 받는 명령. title은 WHENCOMMAND 입력줄에 보이는 이름이고, 그 뒤에 띄어 쓴 것이 첫 인자로 온다.
export const COMMANDS = [
  { id: 'add', title: '일정 추가', description: '한 줄로 — 담주 화 3시 김부장 미팅 1시간. 읽은 결과를 보고 Enter로 확정한다', args: [{ name: 'text', type: 'string', optional: true }] },
  { id: 'search', title: '일정 검색', description: '제목으로 찾는다', args: [{ name: 'q', type: 'string' }] },
  { id: 'open', title: '일정 보기', description: '오늘 · 주 · 월' },
];

const KNOWN = new Set(COMMANDS.map((c) => c.id));

export function parseDeepLink(raw) {
  let u;
  try { u = new URL(String(raw ?? '')); } catch { return null; }
  if (u.protocol !== `${SCHEME}:`) return null;
  const command = (u.host || u.pathname.replace(/^\/+/, '')).replace(/\/+$/, '').toLowerCase();
  if (!KNOWN.has(command)) return null;
  const args = {};
  for (const [k, v] of u.searchParams) if (v) args[k] = v;
  return { command, args };
}

export function fromArgv(argv) {
  return (argv ?? []).find((a) => typeof a === 'string' && a.toLowerCase().startsWith(`${SCHEME}://`)) ?? null;
}

// verify는 실제로 설치돼 있는지 WHENCOMMAND가 확인하는 경로다. 패키징본이면 지금 실행 파일(macOS는 .app 번들),
// 개발 실행이면 설치본의 관례 경로 — 개발용 electron.exe를 적으면 설치본이 없는 PC에서도 "있다"고 읽힌다.
export function buildManifest({ platformName, exePath, packaged }) {
  const verify = { [darwin.id]: darwin.link.verify, [win32.id]: win32.link.verify };
  if (packaged && exePath) {
    const table = platformName === darwin.id ? darwin : win32;
    const bundle = table.link.bundleFromExe(String(exePath));
    if (bundle) verify[table.id] = bundle;
  }
  return {
    protocol: 1,
    id: APP_ID,
    name: 'WHENCALENDAR',
    scheme: SCHEME,
    verify,
    commands: COMMANDS.map((c) => ({ ...c, args: c.args ? c.args.map((a) => ({ ...a })) : undefined })),
  };
}
