import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeepLink, fromArgv, buildManifest, COMMANDS } from '../main/deeplink.mjs';

test('딥링크: whencalendar://<명령>?<인자> 를 푼다, 값은 URL 디코딩', () => {
  assert.deepEqual(parseDeepLink('whencalendar://add?text=%EB%8B%B4%EC%A3%BC%20%ED%99%94%203%EC%8B%9C'), { command: 'add', args: { text: '담주 화 3시' } });
  assert.deepEqual(parseDeepLink('whencalendar://search?q=%ED%9A%8C%EC%9D%98'), { command: 'search', args: { q: '회의' } });
  assert.deepEqual(parseDeepLink('whencalendar://open/'), { command: 'open', args: {} });
  assert.deepEqual(parseDeepLink('WHENCALENDAR://Add'), { command: 'add', args: {} }); // 빈 인자 — 대화상자만 연다
});

test('딥링크: 다른 스킴·모르는 명령·쓰레기는 null', () => {
  assert.equal(parseDeepLink('whenwork://today'), null);
  assert.equal(parseDeepLink('whencalendar://delete-all'), null);
  assert.equal(parseDeepLink('https://example.com'), null);
  assert.equal(parseDeepLink(''), null);
  assert.equal(parseDeepLink(null), null);
});

test('fromArgv: argv 어디에 있든 첫 whencalendar:// 를 집는다', () => {
  assert.equal(fromArgv(['C:\\WHENCALENDAR.exe', '--x', 'whencalendar://open']), 'whencalendar://open');
  assert.equal(fromArgv(['electron', '.', '--smoke']), null);
  assert.equal(fromArgv(undefined), null);
});

test('매니페스트: 규약 v1 모양이고 광고한 명령을 앱이 전부 받는다 (when-protocol)', () => {
  const m = buildManifest({ platformName: 'win32', exePath: null, packaged: false });
  assert.equal(m.protocol, 1);
  assert.equal(m.id, 'whencalendar');
  assert.equal(m.scheme, 'whencalendar');
  assert.match(m.verify.win32, /WHENCALENDAR\.exe$/);
  assert.match(m.verify.darwin, /\.app$/);
  assert.equal(m.commands.length, COMMANDS.length);
  for (const c of m.commands) {
    assert.match(c.id, /^[a-z][a-z0-9-]{1,31}$/);
    assert.ok(c.title.trim());
    for (const a of c.args ?? []) assert.equal(a.type, 'string');
    assert.equal(parseDeepLink(`whencalendar://${c.id}`)?.command, c.id);
  }
});

test('매니페스트: 패키징본은 실제 실행 파일을 verify에 적는다', () => {
  assert.equal(buildManifest({ platformName: 'win32', exePath: 'D:\\Apps\\WC\\WHENCALENDAR.exe', packaged: true }).verify.win32, 'D:\\Apps\\WC\\WHENCALENDAR.exe');
  assert.equal(buildManifest({ platformName: 'darwin', exePath: '/Applications/WHENCALENDAR.app/Contents/MacOS/WHENCALENDAR', packaged: true }).verify.darwin, '/Applications/WHENCALENDAR.app');
  assert.match(buildManifest({ platformName: 'win32', exePath: 'D:\\x\\electron.exe', packaged: false }).verify.win32, /%LOCALAPPDATA%/);
});
