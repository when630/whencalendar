// main/widget-layout.mjs — 바탕화면 위젯의 자리 계산(WGT). electron을 import하지 않는다 — 테스트가 그대로 읽는다.
//
// 위치는 "어느 모니터의 작업 영역 왼쪽 위에서 얼마나"로 저장한다. 모니터가 빠지면 주 모니터로 떨어지고,
// 저장된 자리가 화면 밖이면 안으로 당긴다 — 해상도가 바뀌어 위젯이 영영 안 보이는 일이 없게.

// 크기 단계(WGT-05). 바탕화면은 넓다 — 보통이 760×600이다. 커질수록 글자도 커지되(zoom) 비례보다 덜 키워
// 칸에 더 많은 줄이 들어가게 한다. 가로 560(작게)이 zoom 1의 기준이다
export const SIZES = {
  small: { width: 560, height: 440 },
  normal: { width: 760, height: 600 },
  large: { width: 980, height: 780 },
  xlarge: { width: 1200, height: 960 },
};
export const DEFAULT_SIZE = 'normal';
export const WIDGET_W = SIZES[DEFAULT_SIZE].width;
export const WIDGET_H = SIZES[DEFAULT_SIZE].height;
const MARGIN = 24;

export function sizeOf(key) {
  return SIZES[key] ?? SIZES[DEFAULT_SIZE];
}

export function zoomOf(size) {
  return Math.round(Math.sqrt(size.width / SIZES.small.width) * 100) / 100;
}

/** 저장된 모니터 id가 있으면 그것, 없거나 사라졌으면 주 모니터. */
export function pickDisplay(displays, wantedId, primaryId) {
  const list = Array.isArray(displays) ? displays : [];
  if (!list.length) return null;
  return list.find((d) => d.id === wantedId) ?? list.find((d) => d.id === primaryId) ?? list[0];
}

/** 작업 영역 안으로 당긴다. 위젯이 영역보다 크면 왼쪽 위를 맞춘다. */
export function clampPos(pos, workArea, size = { width: WIDGET_W, height: WIDGET_H }) {
  const maxX = Math.max(0, workArea.width - size.width);
  const maxY = Math.max(0, workArea.height - size.height);
  const x = Number.isFinite(pos?.x) ? pos.x : maxX - MARGIN; // 기본은 오른쪽 위
  const y = Number.isFinite(pos?.y) ? pos.y : MARGIN;
  return { x: Math.min(Math.max(0, Math.round(x)), maxX), y: Math.min(Math.max(0, Math.round(y)), maxY) };
}

/** 저장값 → 화면 좌표. */
export function boundsFor(saved, display, size = { width: WIDGET_W, height: WIDGET_H }) {
  const wa = display.workArea;
  const rel = clampPos(saved, wa, size);
  return { x: wa.x + rel.x, y: wa.y + rel.y, width: size.width, height: size.height };
}

/** 화면 좌표 → 저장값. 창이 어느 모니터에 있는지는 부르는 쪽이 정한다(창 중심이 든 모니터). */
export function relativeTo(bounds, display) {
  return { x: bounds.x - display.workArea.x, y: bounds.y - display.workArea.y };
}

/** 창 중심을 품은 모니터. 없으면(화면 밖) 가장 가까운 것 대신 null — 부르는 쪽이 주 모니터로 떨어뜨린다. */
export function displayContaining(displays, bounds) {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  return (
    (displays ?? []).find((d) => {
      const b = d.bounds;
      return cx >= b.x && cx < b.x + b.width && cy >= b.y && cy < b.y + b.height;
    }) ?? null
  );
}

/** 설정 화면에 보일 이름 — "1 · 2560×1440 (주)". label이 있으면 앞에 둔다(Electron 43은 모니터 이름을 준다). */
export function displayLabel(d, index, primaryId) {
  const size = `${d.bounds?.width ?? d.workArea?.width ?? '?'}×${d.bounds?.height ?? d.workArea?.height ?? '?'}`;
  const name = d.label ? `${d.label} ` : '';
  return `${index + 1} · ${name}${size}${d.id === primaryId ? ' (주)' : ''}`;
}

// ── 격자 범위. 한 주 시작은 설정(weekStart: 0=일요일 기본, 1=월요일)이고, 그 달이 몇 주를 쓰는지에 따라 4~6줄이다
// (본체 월 탭은 늘 6줄, 위젯은 칸을 키우려 줄을 줄인다)
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function weekStartOf(d, weekStart = 0) {
  const x = startOfDay(d);
  return addDays(x, -((x.getDay() - weekStart + 7) % 7));
}

/** 이 달의 격자 — 시작(주 첫날 0시), 줄 수, 조회 범위(끝은 배타적). */
export function monthGrid(now, weekStart = 0) {
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const start = weekStartOf(first, weekStart);
  const days = Math.round((startOfDay(last) - start) / 86_400_000) + 1;
  const weeks = Math.ceil(days / 7);
  return { start, weeks, end: addDays(start, weeks * 7) };
}
