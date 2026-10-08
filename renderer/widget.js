// renderer/widget.js — 바탕화면 달력 위젯(WGT). main이 보내는 한 달치 일정을 격자로 그린다.
//
// 조작은 둘뿐이다 — 끌어서 옮기기, 클릭해서 본체 월 탭 열기. 끌기의 좌표는 main이 커서로 재므로
// 여기서는 "시작·이동·끝"만 알린다. 클릭과 끌기는 움직인 거리로 가른다.
const DAYS = ['일', '월', '화', '수', '목', '금', '토']; // getDay() 순서. 머리글은 weekStart만큼 돌려 쓴다
const CLICK_PX = 4;
const MAX_PINS = 8; // 상한일 뿐이다 — 실제 줄 수는 fit()이 칸 높이로 정한다

const el = {
  card: document.getElementById('card'),
  title: document.getElementById('title'),
  sub: document.getElementById('sub'),
  dow: document.getElementById('dow'),
  cells: document.getElementById('cells'),
  done: document.getElementById('done'),
};

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
// 칸이 좁으니 시각은 "9:32"처럼 앞자리 0 없이
function hm(d) {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// 일정이 덮는 날의 범위. 종일 일정의 끝은 배타적(다음 날 0시)이라 1ms를 빼고 본다 — 본체 월 탭과 같은 규칙
function daySpan(ev) {
  const s = startOfDay(new Date(ev.startsAt));
  const raw = ev.endsAt ? new Date(ev.endsAt) : new Date(ev.startsAt);
  const endMs = ev.endsAt ? raw.getTime() - (ev.allDay ? 1 : 0) : raw.getTime();
  const e = startOfDay(new Date(Math.max(endMs, s.getTime())));
  return { from: s, to: e };
}

function renderDow(weekStart) {
  el.dow.replaceChildren(
    ...DAYS.map((_, i) => {
      const day = (i + weekStart) % 7;
      const sp = document.createElement('span');
      if (day === 0 || day === 6) sp.className = 'we';
      sp.textContent = DAYS[day];
      return sp;
    })
  );
}

function render(p) {
  // 크기 단계에 따라 글자·여백을 함께 키운다. 창 크기는 main이 정했고 여기선 배율만 받는다
  document.documentElement.style.zoom = String(p.zoom ?? 1);
  const now = new Date(p.now);
  const start = new Date(p.start);
  el.title.textContent = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
  el.sub.textContent = `오늘 ${now.getDate()}일 (${DAYS[now.getDay()]})`;
  renderDow(p.weekStart ?? 0);

  // 날짜별로 모은다. 여러 날에 걸친 것은 덮는 날마다 적되 시각은 첫날에만
  const byDay = new Map();
  for (const ev of p.events ?? []) {
    const sp = daySpan(ev);
    for (let d = sp.from; d <= sp.to; d = addDays(d, 1)) {
      const k = dayKey(d);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push({ ev, first: sameDay(d, sp.from) });
    }
  }

  const cells = [];
  for (let i = 0; i < p.weeks * 7; i++) {
    const day = addDays(start, i);
    const c = document.createElement('div');
    c.className = 'c';
    if (day.getMonth() !== now.getMonth()) c.classList.add('out');
    if (day.getDay() === 0 || day.getDay() === 6) c.classList.add('we');
    if (sameDay(day, now)) c.classList.add('today');

    const head = document.createElement('div');
    head.className = 'chead';
    const num = document.createElement('span');
    num.className = 'dnum';
    num.textContent = String(day.getDate());
    head.append(num);
    c.append(head);

    const list = byDay.get(dayKey(day)) ?? [];
    list.slice(0, MAX_PINS).forEach(({ ev, first }) => {
      const pin = document.createElement('span');
      pin.className = 'pin';
      const s = new Date(ev.startsAt);
      const e = ev.endsAt ? new Date(ev.endsAt) : s;
      if (e < now) pin.classList.add('past');
      const bar = document.createElement('i');
      bar.style.background = `var(--cal-${ev.color ?? 1})`;
      pin.append(bar);
      // "9:32 디자인 리뷰" — 시각이 앞이고 제목이 남은 폭을 쓴다(WGT-02). 여러 날짜리는 첫날에만 시각
      if (first && !ev.allDay) {
        const h = document.createElement('span');
        h.className = 'h';
        h.textContent = hm(s);
        pin.append(h);
      }
      const t = document.createElement('span');
      t.className = 't';
      t.textContent = ev.title;
      t.title = ev.title;
      pin.append(t);
      c.append(pin);
    });
    if (list.length > MAX_PINS) {
      const plus = document.createElement('span');
      plus.className = 'plus';
      plus.textContent = `+${list.length - MAX_PINS}`;
      head.append(plus);
    }
    cells.push(c);
  }
  el.cells.replaceChildren(...cells);
  fit();

  el.card.classList.toggle('adjusting', !!p.adjusting);
  el.card.classList.toggle('interactive', !!p.interactive);
}

// 칸 높이에 들어가지 못한 줄은 지우고 "+n"에 합친다 — 반쯤 잘린 줄이 보이면 지저분하다
function fit() {
  for (const c of el.cells.querySelectorAll('.c')) {
    const pins = [...c.querySelectorAll('.pin')];
    if (!pins.length) continue;
    const bottom = c.getBoundingClientRect().bottom - 3;
    let hidden = 0;
    for (const pin of pins) {
      if (pin.getBoundingClientRect().bottom > bottom) {
        pin.remove();
        hidden++;
      }
    }
    if (!hidden) continue;
    const head = c.querySelector('.chead');
    let plus = head.querySelector('.plus');
    const prev = plus ? Number(plus.textContent.slice(1)) : 0;
    if (!plus) {
      plus = document.createElement('span');
      plus.className = 'plus';
      head.append(plus);
    }
    plus.textContent = `+${prev + hidden}`;
  }
}

// ── 끌기와 클릭
let press = null; // { x, y, moved, sentAt }
const MOVE_EVERY_MS = 16;

el.card.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || e.target === el.done) return;
  if (!el.card.classList.contains('interactive')) return;
  press = { x: e.screenX, y: e.screenY, moved: false };
  window.widget.drag('start');
});

window.addEventListener('mousemove', (e) => {
  if (!press) return;
  if (!press.moved && Math.hypot(e.screenX - press.x, e.screenY - press.y) >= CLICK_PX) {
    press.moved = true;
    el.card.classList.add('dragging');
  }
  if (!press.moved) return;
  // requestAnimationFrame은 쓰지 않는다 — 다른 창에 가려진 창(이 위젯의 평소 상태)에서는 프레임이 오지 않아
  // 끌어도 창이 따라오지 않는다(2026-10-08 실측). 시간으로 솎는다
  const t = performance.now();
  if (t - (press.sentAt ?? 0) < MOVE_EVERY_MS) return;
  press.sentAt = t;
  window.widget.drag('move');
});

function release(e) {
  if (!press) return;
  const p = press;
  press = null;
  el.card.classList.remove('dragging');
  window.widget.drag('end');
  // 움직이지 않았으면 클릭 — 조정 모드가 아닐 때만 본체를 연다
  if (!p.moved && e?.type === 'mouseup' && !el.card.classList.contains('adjusting')) window.widget.open();
}
window.addEventListener('mouseup', release);
window.addEventListener('blur', () => release(null));

el.done.addEventListener('click', () => window.widget.adjustDone());

window.widget.onState(render);
