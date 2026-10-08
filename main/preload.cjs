// 렌더러가 쓰는 유일한 통로. 오버레이와 본체 창이 같은 preload를 쓰되 각자 필요한 것만 부른다.
const { contextBridge, ipcRenderer } = require('electron');

// 오버레이 — 창이 클릭을 통과시키므로 CSS :hover가 걸리지 않는다.
// 렌더러가 mousemove로 직접 판정해 setHover로 알린다(D-04).
contextBridge.exposeInMainWorld('overlay', {
  onState: (fn) => ipcRenderer.on('overlay:state', (_e, payload) => fn(payload)),
  setHover: (on) => ipcRenderer.send('overlay:hover', !!on),
});

// 바탕화면 위젯(WGT) — 그리는 데이터는 main이 밀어 주고, 조작은 끌기·클릭·조정 완료 셋뿐이다.
// 끌기의 좌표는 main이 커서로 잰다 — 렌더러는 단계만 알린다.
contextBridge.exposeInMainWorld('widget', {
  onState: (fn) => ipcRenderer.on('widget:state', (_e, payload) => fn(payload)),
  drag: (phase) => ipcRenderer.send('widget:drag', phase),
  open: () => ipcRenderer.send('widget:open'),
  adjustDone: () => ipcRenderer.send('widget:adjustDone'),
});

// 본체 창 — 저장소에 닿는 것은 전부 여기를 지난다. 렌더러는 SQL을 모른다.
contextBridge.exposeInMainWorld('cal', {
  list: (opts) => ipcRenderer.invoke('cal:list', opts),
  parse: (line) => ipcRenderer.invoke('cal:parse', line),
  add: (line) => ipcRenderer.invoke('cal:add', line),
  remove: (id) => ipcRenderer.invoke('cal:delete', id),
  restore: (id) => ipcRenderer.invoke('cal:restore', id),
  get: (id) => ipcRenderer.invoke('cal:get', id),
  update: (id, patch) => ipcRenderer.invoke('cal:update', { id, patch }),
  reschedule: (id, line) => ipcRenderer.invoke('cal:reschedule', { id, line }),
  series: (payload) => ipcRenderer.invoke('cal:series', payload),
  info: () => ipcRenderer.invoke('app:info'),
  onChanged: (fn) => ipcRenderer.on('cal:changed', () => fn()),
  // 형제 앱 연동(D-33) — WHENCOMMAND가 whencalendar://<명령>으로 부른 것. { command, args }
  onDeepLink: (fn) => ipcRenderer.on('cal:deeplink', (_e, payload) => fn(payload)),
  hide: () => ipcRenderer.send('win:hide'),
  minimize: () => ipcRenderer.send('win:minimize'),
  search: (q) => ipcRenderer.invoke('cal:search', q),
  freeSlots: (opts) => ipcRenderer.invoke('find:slots', opts),
  formatSlots: (payload) => ipcRenderer.invoke('find:format', payload),
});

// 설정과 데이터
contextBridge.exposeInMainWorld('app', {
  settings: () => ipcRenderer.invoke('settings:get'),
  set: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
  // 전역 단축키 — 자리(window·overlay)와 Accelerator 문자열. 빈 문자열은 그 자리를 비운다
  hotkeySet: (key, accel) => ipcRenderer.invoke('hotkey:set', { key, accel }),
  // 바탕화면 위젯 — 위치 조정 모드로 들어간다(끌어 옮기고 위젯의 "완료"로 끝난다)
  widgetAdjust: () => ipcRenderer.invoke('widget:adjust'),
  // 업데이트 — 확인은 끝난 뒤 결과 줄을 돌려주고, 설치는 준비된 것이 있을 때만 재시작한다
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  openDataDir: () => ipcRenderer.invoke('app:openDataDir'),
  exportJson: () => ipcRenderer.invoke('data:export'),
  exportIcs: () => ipcRenderer.invoke('data:exportIcs'),
  importJson: () => ipcRenderer.invoke('data:import'),
});

// 구독 — .ics 주소를 붙이면 일정이 알아서 들어온다
contextBridge.exposeInMainWorld('subs', {
  list: () => ipcRenderer.invoke('sub:list'),
  add: (url) => ipcRenderer.invoke('sub:add', url),
  sync: (id) => ipcRenderer.invoke('sub:sync', id ?? null),
  toggle: (id) => ipcRenderer.invoke('sub:toggle', id),
  color: (id, color) => ipcRenderer.invoke('sub:color', { id, color }),
  remove: (id) => ipcRenderer.invoke('sub:delete', id),
});
