// 바탕화면 위젯의 자리 계산(WGT). 창 없이 돈다 — widget-layout은 electron을 모른다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WIDGET_W, WIDGET_H, pickDisplay, clampPos, boundsFor, relativeTo, displayContaining, displayLabel, monthGrid } from '../main/widget-layout.mjs';

const D1 = { id: 1, label: 'DELL U2720Q', bounds: { x: 0, y: 0, width: 2560, height: 1440 }, workArea: { x: 0, y: 0, width: 2560, height: 1392 } };
const D2 = { id: 2, label: '', bounds: { x: 2560, y: 0, width: 1920, height: 1080 }, workArea: { x: 2560, y: 0, width: 1920, height: 1032 } };

test('저장된 모니터가 없거나 빠졌으면 주 모니터로 떨어진다 (WGT-04)', () => {
  assert.equal(pickDisplay([D1, D2], 2, 1), D2);
  assert.equal(pickDisplay([D1, D2], 99, 1), D1, '빠진 모니터 id');
  assert.equal(pickDisplay([D1, D2], undefined, 1), D1);
  assert.equal(pickDisplay([D2], 1, 1), D2, '주 모니터 id도 없으면 첫 번째');
  assert.equal(pickDisplay([], 1, 1), null);
});

test('기본 자리는 작업 영역 오른쪽 위, 저장된 자리는 영역 안으로 당긴다', () => {
  const wa = D1.workArea;
  assert.deepEqual(clampPos(null, wa), { x: 2560 - WIDGET_W - 24, y: 24 });
  assert.deepEqual(clampPos({ x: 100, y: 200 }, wa), { x: 100, y: 200 });
  // 해상도가 줄어 화면 밖으로 나간 자리
  assert.deepEqual(clampPos({ x: 5000, y: 5000 }, wa), { x: 2560 - WIDGET_W, y: 1392 - WIDGET_H });
  assert.deepEqual(clampPos({ x: -50, y: -50 }, wa), { x: 0, y: 0 });
  // 위젯보다 작은 영역이면 왼쪽 위
  assert.deepEqual(clampPos({ x: 10, y: 10 }, { x: 0, y: 0, width: 300, height: 200 }), { x: 0, y: 0 });
});

test('저장값과 화면 좌표는 모니터 작업 영역 기준으로 왕복한다', () => {
  const b = boundsFor({ x: 40, y: 60 }, D2);
  assert.deepEqual(b, { x: 2600, y: 60, width: WIDGET_W, height: WIDGET_H });
  assert.deepEqual(relativeTo(b, D2), { x: 40, y: 60 });
});

test('창 중심이 든 모니터를 찾는다 — 끌어서 옮긴 뒤 어느 모니터 기준으로 저장할지', () => {
  assert.equal(displayContaining([D1, D2], { x: 2400, y: 100, width: 400, height: 380 }), D2, '중심이 2600이면 둘째');
  assert.equal(displayContaining([D1, D2], { x: 2300, y: 100, width: 400, height: 380 }), D1);
  assert.equal(displayContaining([D1, D2], { x: 9000, y: 9000, width: 400, height: 380 }), null);
});

test('모니터 이름은 번호·이름·해상도·주 표시로 적는다', () => {
  assert.equal(displayLabel(D1, 0, 1), '1 · DELL U2720Q 2560×1440 (주)');
  assert.equal(displayLabel(D2, 1, 1), '2 · 1920×1080');
});

test('월 격자는 월요일에서 시작하고 그 달이 쓰는 주만 센다', () => {
  // 2026년 10월: 1일이 목요일 → 9/28(월)부터, 31일(토)까지 5주
  const oct = monthGrid(new Date(2026, 9, 8));
  assert.equal(oct.start.getTime(), new Date(2026, 8, 28).getTime());
  assert.equal(oct.weeks, 5);
  assert.equal(oct.end.getTime(), new Date(2026, 10, 2).getTime(), '끝은 배타적 — 마지막 주 다음 월요일');
  // 2026년 2월: 1일이 일요일 → 1/26(월)부터 2/28(토)까지 5주
  assert.equal(monthGrid(new Date(2026, 1, 10)).weeks, 5);
  // 2027년 2월: 1일이 월요일, 28일 → 딱 4주
  assert.equal(monthGrid(new Date(2027, 1, 1)).weeks, 4);
  // 2026년 8월: 1일이 토요일, 31일(월) → 6주
  assert.equal(monthGrid(new Date(2026, 7, 15)).weeks, 6);
});
