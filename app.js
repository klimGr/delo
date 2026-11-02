'use strict';

/* ---------- Telegram ---------- */
const tg = window.Telegram && window.Telegram.WebApp;
const inTelegram = !!(tg && tg.initData);
const tgBack = inTelegram && tg.isVersionAtLeast && tg.isVersionAtLeast('6.1');

/* ---------- настройки ---------- */
// Адрес серверной функции Supabase. Пусто — демо-режим, данные только на этом устройстве.
const API_URL = 'https://uizymjtflqoicpnifoue.supabase.co/functions/v1/api';
const remote = !!(API_URL && inTelegram);

/* ---------- справочники ---------- */
const PEOPLE = { ivan: 'Иван', klim: 'Клим' };
// Кто нашёл заказ → как делим деньги
const SPLIT = {
  ivan: { ivan: 0.65, klim: 0.35, label: '65 / 35' },
  klim: { ivan: 0.5, klim: 0.5, label: '50 / 50' },
};
const KINDS = [
  { key: 'plinth', name: 'Плинтус', unit: 'м' },
  { key: 'molding', name: 'Молдинг', unit: 'м' },
  { key: 'panels', name: 'Панели', unit: 'м²' },
];
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const WEEKDAYS_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

/* ---------- иконки ---------- */
const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  chevron: svg('<path d="m9 6 6 6-6 6"/>'),
  back: svg('<path d="m15 5-7 7 7 7"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  home: svg('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
  calendar: svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  pin: svg('<path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
  check: svg('<path d="m5 12 5 5L20 7"/>'),
  note: svg('<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
};

/* ---------- утилиты ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const num = n => nf.format(n || 0);
const money = n => nf0.format(Math.round(n || 0)) + ' ₽';
const parseNum = v => {
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const pad = n => String(n).padStart(2, '0');
const toLocalInput = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const monthKey = s => s.slice(0, 7);
const currentMonth = () => monthKey(toLocalInput(new Date()));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const telHref = p => 'tel:' + String(p).replace(/[^\d+]/g, '');
const lin = v => (v?.plinth || 0) + (v?.molding || 0);

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function monthName(key) {
  const [y, m] = key.split('-').map(Number);
  return MONTHS[m - 1] + (y !== new Date().getFullYear() ? ' ' + y : '');
}

function fmtDate(str) {
  const d = new Date(str);
  const now = new Date();
  const day0 = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day0(d) - day0(now)) / 864e5);
  let day;
  if (diff === 0) day = 'Сегодня';
  else if (diff === 1) day = 'Завтра';
  else if (diff === -1) day = 'Вчера';
  else {
    day = `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
    if (d.getFullYear() !== now.getFullYear()) day += ' ' + d.getFullYear();
    day = day[0].toUpperCase() + day.slice(1);
  }
  return `${day}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// «~42 м · 12 м²»
function volumeShort(v, approx = true) {
  const parts = [];
  if (lin(v)) parts.push(`${num(lin(v))} м`);
  if (v?.panels) parts.push(`${num(v.panels)} м²`);
  if (!parts.length) return '—';
  return (approx ? '~' : '') + parts.join(' · ');
}

/* ---------- данные ---------- */
// В общем режиме localStorage — кэш для мгновенного открытия и очередь неотправленных правок
const STORE_KEY = remote ? 'delo.cache.v1' : 'delo.orders.v1';
const NOTES_KEY = remote ? 'delo.notes.cache.v1' : 'delo.notes.v1';
const QUEUE_KEY = 'delo.queue.v1';

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* хранилище недоступно */ }
}

const saveOrders = () => writeJSON(STORE_KEY, orders);
const saveNotes = () => writeJSON(NOTES_KEY, notes);

function seedOrders() {
  const at = (days, h, m = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(h, m, 0, 0);
    return toLocalInput(d);
  };
  const vol = (plinth = 0, molding = 0, panels = 0) => ({ plinth, molding, panels });
  const planned = (date, finder, address, client, phone, plan, notes = '') =>
    ({ id: uid(), status: 'planned', date, finder, address, client, phone, plan, notes });
  const done = (date, finder, address, client, phone, fact, earned, comment = '') =>
    ({ id: uid(), status: 'done', date, finder, address, client, phone, plan: fact, fact, earned, comment, notes: '' });

  return [
    planned(at(1, 10), 'ivan', 'ул. Ленина, 12, кв. 48', 'Ольга', '+7 900 123-45-67', vol(32, 10), 'Домофон 48В. 5 этаж, лифт только до 4-го.'),
    planned(at(3, 9, 30), 'klim', 'пр. Мира, 7, кв. 112', 'Андрей', '+7 912 555-20-10', vol(45, 0, 12)),
    planned(at(6, 11), 'ivan', 'ул. Садовая, 3', 'Наталья', '+7 926 700-11-22', vol(0, 28), 'Частный дом, позвонить за 30 минут.'),
    done(at(-1, 10), 'ivan', 'ул. Гагарина, 25, кв. 9', 'Сергей', '+7 903 410-22-33', vol(42, 12), 14800, 'Углы кривые, ушло больше клея.'),
    done(at(-9, 9), 'klim', 'ул. Пушкина, 40, кв. 3', 'Марина', '+7 915 200-30-40', vol(38, 0, 18), 23400),
    done(at(-16, 12), 'ivan', 'Набережная, 5, кв. 71', 'Виктор', '+7 999 111-00-22', vol(56, 20), 19200),
    done(at(-24, 10), 'klim', 'ул. Чехова, 14', 'Ирина', '+7 905 777-88-99', vol(0, 34, 9), 15600),
    done(at(-38, 9), 'ivan', 'ул. Кирова, 2, кв. 15', 'Павел', '+7 916 321-54-76', vol(64, 0, 22), 31000),
    done(at(-55, 10), 'klim', 'ул. Советская, 88, кв. 4', 'Елена', '+7 917 654-32-10', vol(48, 16), 18500),
  ];
}

let orders = readJSON(STORE_KEY) || (remote ? [] : seedOrders());
let queue = remote ? readJSON(QUEUE_KEY) || [] : [];
saveOrders();

// Общие заметки. На сервере лежат в той же таблице, что и заказы, с type: 'note'
const me = tg?.initDataUnsafe?.user?.first_name || '';
let notes = readJSON(NOTES_KEY) || (remote ? [] : seedNotes());
saveNotes();

function seedNotes() {
  const ago = h => Date.now() - h * 3600e3;
  return [
    { id: uid(), type: 'note', text: 'Купить\nКлей монтажный — 6 шт\nСаморезы 3,5×35\nДиски для торцовки', updatedAt: ago(2), by: 'Иван' },
    { id: uid(), type: 'note', text: 'Цены 2026\nПлинтус — 350 ₽/м\nМолдинг — 400 ₽/м\nПанели — 900 ₽/м²', updatedAt: ago(30), by: 'Клим' },
    { id: uid(), type: 'note', text: 'Леруа на Кирова\nПо четвергам скидка на клей', updatedAt: ago(200), by: 'Клим' },
  ];
}

const findNote = id => notes.find(n => n.id === id);
const sortedNotes = () => [...notes].sort((a, b) => b.updatedAt - a.updatedAt);

function noteParts(n) {
  const lines = n.text.trim().split('\n');
  return { title: lines[0] || 'Новая заметка', preview: lines.slice(1).join(' ').trim() };
}

// «14:20», «Вчера», «5 ноября»
function fmtAgo(ts) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (new Date(now - 864e5).toDateString() === d.toDateString()) return 'Вчера';
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

// Текст заметки сохраняется на сервер не на каждую букву, а после паузы
let noteTimer = null;
let noteDirty = null;
function scheduleNoteSave(n) {
  noteDirty = n.id;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(commitNote, 800);
}
function commitNote() {
  clearTimeout(noteTimer);
  const n = noteDirty && findNote(noteDirty);
  noteDirty = null;
  if (n) push({ action: 'save', order: n });
}

// Пустую заметку при выходе удаляем
function closeNote(id) {
  commitNote();
  const n = findNote(id);
  if (n && !n.text.trim()) {
    notes = notes.filter(x => x.id !== id);
    saveNotes();
    if (n.saved !== false) push({ action: 'delete', id });
  }
}

const findOrder = id => orders.find(o => o.id === id);
const doneOrders = () => orders.filter(o => o.status === 'done');
const plannedOrders = () => orders.filter(o => o.status === 'planned').sort((a, b) => a.date.localeCompare(b.date));

function shares(o) {
  const s = SPLIT[o.finder] || SPLIT.klim;
  const e = o.earned || 0;
  return { ivan: e * s.ivan, klim: e * s.klim };
}

function totals(list) {
  const t = { plinth: 0, molding: 0, panels: 0, earned: 0, ivan: 0, klim: 0 };
  for (const o of list) {
    for (const k of KINDS) t[k.key] += o.fact?.[k.key] || 0;
    const s = shares(o);
    t.earned += o.earned || 0;
    t.ivan += s.ivan;
    t.klim += s.klim;
  }
  return t;
}

/* ---------- синхронизация ---------- */
async function api(body) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, initData: tg.initData }),
  });
  if (!res.ok) throw Object.assign(new Error('api'), { status: res.status });
  return res.json();
}

const syncError = e => toast(e.status === 403 ? 'Нет доступа: проверьте Telegram ID' : 'Нет связи, отправлю позже');

// Правка сразу видна в интерфейсе, а на сервер уходит в фоне
function push(op) {
  if (!remote) return;
  queue.push(op);
  writeJSON(QUEUE_KEY, queue);
  flush();
}

let flushing = false;
async function flush() {
  if (flushing || !queue.length) return;
  flushing = true;
  try {
    while (queue.length) {
      await api(queue[0]);
      queue.shift();
      writeJSON(QUEUE_KEY, queue);
    }
  } catch (e) {
    syncError(e);
  } finally {
    flushing = false;
  }
}

async function pull() {
  if (!remote) return;
  commitNote();
  await flush();
  if (queue.length) return; // не всё отправлено — не затираем свои правки
  try {
    const res = await api({ action: 'list' });
    orders = res.orders.filter(r => r.type !== 'note');
    notes = res.orders.filter(r => r.type === 'note');
    saveOrders();
    saveNotes();
    const top = state.stack[state.stack.length - 1];
    if (!top || !['edit', 'complete', 'note'].includes(top.type)) render();
  } catch (e) {
    syncError(e);
  }
}

let toastTimer;
function toast(text) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

function groupByMonth(list) {
  const map = new Map();
  [...list].sort((a, b) => b.date.localeCompare(a.date)).forEach(o => {
    const k = monthKey(o.date);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(o);
  });
  return [...map];
}

/* ---------- навигация ---------- */
const state = { tab: 'home', stack: [] };
const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');

function go(screen) { state.stack.push(screen); render(true); }
function back() {
  const top = state.stack.pop();
  if (top?.type === 'note') closeNote(top.id);
  render(true);
}
function setTab(tab) { state.tab = tab; state.stack = []; render(true); }

function render(scrollTop) {
  const top = state.stack[state.stack.length - 1];
  app.innerHTML = top ? SCREENS[top.type](top) : TABS[state.tab]();
  document.body.classList.toggle('sub', !!top);
  tabbar.hidden = !!top;
  tabbar.innerHTML = renderTabbar();
  if (tgBack) top ? tg.BackButton.show() : tg.BackButton.hide();
  if (scrollTop) window.scrollTo(0, 0);
}

function openLink(url) {
  if (inTelegram) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

function haptic(type) {
  try { tg?.HapticFeedback?.notificationOccurred(type); } catch { /* старый клиент */ }
}

function confirmAsk(text, cb) {
  if (inTelegram && tg.showConfirm) {
    try { tg.showConfirm(text, cb); return; } catch { /* старый клиент */ }
  }
  cb(window.confirm(text));
}

/* ---------- общие куски разметки ---------- */
function navBar(title, right = '') {
  const backBtn = tgBack ? '<span></span>' : `<button class="nav-back" data-action="back">${ICON.back}Назад</button>`;
  return `<div class="navbar">${backBtn}<div class="nav-title">${esc(title)}</div><div class="nav-right">${right}</div></div>`;
}

const infoRow = (label, value) =>
  `<div class="row"><div class="row-label">${label}</div><div class="row-value">${value}</div></div>`;

const field = (label, control, cls = '') =>
  `<label class="field ${cls}"><span class="field-label">${label}</span><span class="field-control">${control}</span></label>`;

const numField = (k, v) =>
  field(k.name, `<input name="v_${k.key}" inputmode="decimal" placeholder="0" value="${v || ''}"><em>${k.unit}</em>`, 'num');

const textareaBlock = (title, name, value, placeholder) =>
  `<h2 class="section-title">${title}</h2><div class="list"><textarea name="${name}" rows="3" placeholder="${placeholder}">${esc(value)}</textarea></div>`;

const textBlock = (title, text) =>
  `<h2 class="section-title">${title}</h2><div class="card text">${esc(text)}</div>`;

const emptyState = (title, text) =>
  `<div class="empty"><div class="empty-title">${title}</div><p>${text}</p></div>`;

const personLine = (p, v) =>
  `<div class="person"><span class="dot ${p}"></span><span>${PEOPLE[p]}</span><b>${money(v)}</b></div>`;

function splitPreview(finder, earned) {
  const s = SPLIT[finder] || SPLIT.klim;
  const e = parseNum(earned);
  return `
    <div><span class="dot ivan"></span>Иван · ${Math.round(s.ivan * 100)}%<b>${money(e * s.ivan)}</b></div>
    <div><span class="dot klim"></span>Клим · ${Math.round(s.klim * 100)}%<b>${money(e * s.klim)}</b></div>
    <p>Заказ нашёл ${PEOPLE[finder] || PEOPLE.klim}, делим ${s.label}</p>`;
}

function orderRow(o) {
  const isDone = o.status === 'done';
  const side = isDone
    ? `<b>${money(o.earned)}</b><span>${esc(volumeShort(o.fact, false))}</span>`
    : `<span>${esc(volumeShort(o.plan))}</span>`;
  return `
    <button class="row" data-go="order" data-id="${o.id}">
      <div class="row-main">
        <div class="row-title">${esc(o.address)}</div>
        <div class="row-sub">${esc(fmtDate(o.date))}${o.client ? ' · ' + esc(o.client) : ''}</div>
      </div>
      <div class="row-side">${side}</div>
      ${ICON.chevron}
    </button>`;
}

function nextCard(o) {
  const who = [o.client, o.phone].filter(Boolean).join(' · ');
  return `
    <div class="card next tap" data-go="order" data-id="${o.id}">
      <div class="next-top"><span>${esc(fmtDate(o.date))}</span><span>${esc(volumeShort(o.plan))}</span></div>
      <div class="next-address">${esc(o.address)}</div>
      ${who ? `<div class="next-client">${esc(who)}</div>` : ''}
      ${o.notes ? `<div class="next-note">${esc(o.notes)}</div>` : ''}
      <div class="next-actions">
        <button class="chip" data-action="map" data-id="${o.id}">${ICON.pin}Маршрут</button>
      </div>
    </div>`;
}

function renderTabbar() {
  const tabs = [
    ['home', 'Главная', ICON.home],
    ['orders', 'Заказы', ICON.calendar],
    ['notes', 'Заметки', ICON.note],
    ['history', 'История', ICON.clock],
  ];
  return tabs.map(([key, label, icon]) =>
    `<button class="tab ${state.tab === key ? 'active' : ''}" data-tab="${key}">${icon}<span>${label}</span></button>`
  ).join('');
}

/* ---------- вкладки ---------- */
function renderHome() {
  const now = new Date();
  const all = doneOrders();
  const m = totals(all.filter(o => monthKey(o.date) === currentMonth()));
  const a = totals(all);
  const upcoming = plannedOrders();
  const [first, ...rest] = upcoming;

  return `
    <header class="hero">
      <div class="eyebrow">${WEEKDAYS_FULL[now.getDay()]}, ${now.getDate()} ${MONTHS_GEN[now.getMonth()]}</div>
    </header>

    <div class="section-head lg">
      <h2 class="section-title lg">Ближайшие заказы</h2>
      ${upcoming.length > 4 ? `<button class="link" data-tab="orders">Все ${upcoming.length}</button>` : ''}
    </div>
    ${first ? nextCard(first) : `
      <div class="card empty">
        <div class="empty-title">Заказов нет</div>
        <p>Нашли объект? Добавьте его.</p>
        <button class="btn primary small" data-go="edit">Добавить заказ</button>
      </div>`}
    ${rest.length ? `<div class="list upcoming">${rest.slice(0, 3).map(orderRow).join('')}</div>` : ''}

    <button class="card tap" data-go="money">
      <div class="card-head"><span>Заработано за ${MONTHS[now.getMonth()].toLowerCase()}</span>${ICON.chevron}</div>
      <div class="big">${money(m.earned)}</div>
      ${m.earned ? `<div class="bar"><i style="width:${(m.ivan / m.earned * 100).toFixed(1)}%"></i></div>` : '<div style="height:12px"></div>'}
      <div class="people">${personLine('ivan', m.ivan)}${personLine('klim', m.klim)}</div>
      <div class="card-foot">За всё время ${money(a.earned)}</div>
    </button>

    <button class="card tap" data-go="stats">
      <div class="card-head"><span>Уложено</span>${ICON.chevron}</div>
      <div class="cols">
        <div><div class="caption">Этот месяц</div><div class="big">${num(lin(m))}<small>м</small></div></div>
        <div><div class="caption">Всё время</div><div class="big">${num(lin(a))}<small>м</small></div></div>
      </div>
      <div class="card-foot">Плинтус и молдинг</div>
    </button>`;
}

function renderOrders() {
  const list = plannedOrders();
  return `
    <header class="hero row">
      <h1 class="large-title">Заказы</h1>
      <button class="round-btn" data-go="edit" aria-label="Новый заказ">${ICON.plus}</button>
    </header>
    ${list.length
      ? `<div class="list">${list.map(orderRow).join('')}</div>`
      : emptyState('Заказов пока нет', 'Нашли объект — добавьте его, чтобы не потерять адрес и детали.')}
    <button class="btn primary" data-go="edit">${ICON.plus}Новый заказ</button>`;
}

function renderHistory() {
  const groups = groupByMonth(doneOrders());
  return `
    <header class="hero"><h1 class="large-title">История</h1></header>
    ${groups.length ? groups.map(([key, list]) => `
      <div class="section-head">
        <h2 class="section-title">${monthName(key)}</h2>
        <span>${money(totals(list).earned)}</span>
      </div>
      <div class="list">${list.map(orderRow).join('')}</div>`).join('')
      : emptyState('Пока пусто', 'Выполненные заказы появятся здесь.')}`;
}

function renderNotes() {
  const list = sortedNotes();
  return `
    <header class="hero row">
      <h1 class="large-title">Заметки</h1>
      <button class="round-btn" data-action="new-note" aria-label="Новая заметка">${ICON.plus}</button>
    </header>
    ${list.length ? `<div class="list">${list.map(n => {
      const { title, preview } = noteParts(n);
      return `
        <button class="row" data-go="note" data-id="${n.id}">
          <div class="row-main">
            <div class="row-title note-title">${esc(title)}</div>
            <div class="row-sub"><span class="note-time">${fmtAgo(n.updatedAt)}</span>${esc(preview || 'Нет текста')}</div>
          </div>
        </button>`;
    }).join('')}</div>`
      : emptyState('Заметок нет', 'Общие записи на двоих: что купить, цены, контакты.')}
    <button class="btn primary" data-action="new-note">${ICON.plus}Новая заметка</button>`;
}

const TABS = { home: renderHome, orders: renderOrders, notes: renderNotes, history: renderHistory };

/* ---------- экраны ---------- */
function notFound() {
  return navBar('') + emptyState('Заказ не найден', 'Возможно, его удалили.');
}

function renderOrder({ id }) {
  const o = findOrder(id);
  if (!o) return notFound();
  const isDone = o.status === 'done';
  const vols = (isDone ? o.fact : o.plan) || {};
  const s = shares(o);

  return `
    ${navBar('', `<button class="nav-link" data-go="edit" data-id="${o.id}">Изменить</button>`)}
    <div class="order-head">
      <span class="pill ${isDone ? 'done' : ''}">${isDone ? 'Выполнен' : 'Запланирован'}</span>
      <h1 class="title">${esc(o.address)}</h1>
      <div class="caption">${esc(fmtDate(o.date))}</div>
    </div>

    <div class="actions">
      <button class="action" data-action="map" data-id="${o.id}">${ICON.pin}<span>Маршрут</span></button>
    </div>

    <h2 class="section-title">Клиент</h2>
    <div class="list">
      ${infoRow('Имя', esc(o.client) || '—')}
      ${o.phone ? infoRow('Телефон', `<a href="${telHref(o.phone)}">${esc(o.phone)}</a>`) : ''}
      ${infoRow('Нашёл заказ', `${PEOPLE[o.finder]} · ${SPLIT[o.finder].label}`)}
    </div>

    ${o.notes ? textBlock('Заметки', o.notes) : ''}

    <h2 class="section-title">${isDone ? 'Уложено' : 'Объём, примерно'}</h2>
    <div class="list">
      ${KINDS.map(k => infoRow(k.name, vols[k.key] ? `${num(vols[k.key])} ${k.unit}` : '—')).join('')}
    </div>

    ${isDone ? `
      <h2 class="section-title">Деньги</h2>
      <div class="list">
        ${infoRow('Заработано', `<b>${money(o.earned)}</b>`)}
        ${infoRow('<span class="dot ivan"></span>Иван', money(s.ivan))}
        ${infoRow('<span class="dot klim"></span>Клим', money(s.klim))}
      </div>
      ${o.comment ? textBlock('Комментарий', o.comment) : ''}` : ''}

    ${!isDone ? `<button class="btn primary" data-go="complete" data-id="${o.id}">${ICON.check}Заказ выполнен</button>` : ''}
    <button class="btn plain danger" data-action="delete" data-id="${o.id}">Удалить заказ</button>`;
}

function defaultDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return toLocalInput(d);
}

function renderEdit({ id }) {
  const o = id ? findOrder(id) : null;
  if (id && !o) return notFound();
  const isDone = o?.status === 'done';
  const vols = (isDone ? o.fact : o?.plan) || {};
  const finder = o?.finder || 'klim';

  return `
    <form data-form="edit" data-id="${o ? o.id : ''}" autocomplete="off">
      ${navBar(o ? 'Изменить' : 'Новый заказ', '<button class="nav-link strong" type="submit">Готово</button>')}

      <h2 class="section-title">Объект</h2>
      <div class="list">
        ${field('Адрес', `<input name="address" required placeholder="ул. Ленина, 12, кв. 48" value="${esc(o?.address)}">`)}
        ${field('Когда', `<input name="date" type="datetime-local" required value="${esc(o?.date || defaultDate())}">`)}
      </div>

      <h2 class="section-title">Клиент</h2>
      <div class="list">
        ${field('Имя', `<input name="client" placeholder="Ольга" value="${esc(o?.client)}">`)}
        ${field('Телефон', `<input name="phone" type="tel" inputmode="tel" placeholder="+7 900 123-45-67" value="${esc(o?.phone)}">`)}
      </div>

      <h2 class="section-title">Кто нашёл заказ</h2>
      <div class="segmented">
        ${['ivan', 'klim'].map(p => `
          <label><input type="radio" name="finder" value="${p}" ${finder === p ? 'checked' : ''}>
          <span>${PEOPLE[p]}<small>${SPLIT[p].label}</small></span></label>`).join('')}
      </div>

      <h2 class="section-title">${isDone ? 'Уложено' : 'Объём, примерно'}</h2>
      <div class="list">${KINDS.map(k => numField(k, vols[k.key])).join('')}</div>

      ${isDone ? `
        <h2 class="section-title">Заработано</h2>
        <div class="list">${field('Сумма', `<input name="earned" inputmode="decimal" placeholder="0" value="${o.earned || ''}"><em>₽</em>`, 'num')}</div>
        <div class="split-preview" id="split-preview">${splitPreview(finder, o.earned)}</div>
        ${textareaBlock('Комментарий', 'comment', o.comment, 'Как прошло, что учесть')}` : ''}

      ${textareaBlock('Заметки', 'notes', o?.notes, 'Код домофона, этаж, парковка…')}

      <button class="btn primary" type="submit">Сохранить</button>
    </form>`;
}

function renderComplete({ id }) {
  const o = findOrder(id);
  if (!o) return notFound();
  const vols = o.fact || o.plan || {};

  return `
    <form data-form="complete" data-id="${o.id}" data-finder="${o.finder}" autocomplete="off">
      ${navBar('Заказ выполнен', '<button class="nav-link strong" type="submit">Готово</button>')}
      <div class="caption center" style="padding-top:8px">${esc(o.address)}</div>

      <h2 class="section-title">Сколько уложили</h2>
      <div class="list">${KINDS.map(k => numField(k, vols[k.key])).join('')}</div>

      <h2 class="section-title">Сколько заработали</h2>
      <div class="list">${field('Сумма', `<input name="earned" inputmode="decimal" placeholder="0" required value="${o.earned || ''}"><em>₽</em>`, 'num')}</div>
      <div class="split-preview" id="split-preview">${splitPreview(o.finder, o.earned)}</div>

      ${textareaBlock('Комментарий', 'comment', o.comment, 'Как прошло, что учесть на будущее')}

      <button class="btn primary" type="submit">Сохранить</button>
    </form>`;
}

function renderStats() {
  const all = doneOrders();
  const m = totals(all.filter(o => monthKey(o.date) === currentMonth()));
  const a = totals(all);
  const groups = groupByMonth(all);

  return `
    ${navBar('Уложено')}
    <div class="card" style="margin-top:12px">
      <table class="table">
        <thead><tr><th></th><th>Этот месяц</th><th>Всё время</th></tr></thead>
        <tbody>
          ${KINDS.map(k => `<tr><th>${k.name}</th><td>${num(m[k.key])} <small>${k.unit}</small></td><td>${num(a[k.key])} <small>${k.unit}</small></td></tr>`).join('')}
          <tr class="total"><th>Итого, пог. м</th><td>${num(lin(m))} <small>м</small></td><td>${num(lin(a))} <small>м</small></td></tr>
        </tbody>
      </table>
    </div>

    ${groups.length ? `
      <h2 class="section-title">По месяцам</h2>
      <div class="list">
        ${groups.map(([key, list]) => {
          const t = totals(list);
          return `
            <div class="row month-row">
              <div class="row-main">
                <div class="row-title">${monthName(key)}</div>
                <div class="row-sub">${list.length} ${plural(list.length, 'заказ', 'заказа', 'заказов')}</div>
              </div>
              <div class="kinds">${KINDS.map(k => `<span><small>${k.name}</small>${num(t[k.key])} ${k.unit}</span>`).join('')}</div>
            </div>`;
        }).join('')}
      </div>` : ''}`;
}

function renderMoney() {
  const all = doneOrders();
  const m = totals(all.filter(o => monthKey(o.date) === currentMonth()));
  const a = totals(all);
  const groups = groupByMonth(all);
  const row = (label, key) => `<tr><th>${label}</th><td>${money(m[key])}</td><td>${money(a[key])}</td></tr>`;

  return `
    ${navBar('Заработано')}
    <div class="card" style="margin-top:12px">
      <table class="table">
        <thead><tr><th></th><th>Этот месяц</th><th>Всё время</th></tr></thead>
        <tbody>
          <tr class="total"><th>Всего</th><td>${money(m.earned)}</td><td>${money(a.earned)}</td></tr>
          ${row('<span class="dot ivan"></span> Иван', 'ivan')}
          ${row('<span class="dot klim"></span> Клим', 'klim')}
        </tbody>
      </table>
    </div>

    ${groups.length ? `
      <h2 class="section-title">По месяцам</h2>
      <div class="list">
        ${groups.map(([key, list]) => {
          const t = totals(list);
          return `
            <div class="row">
              <div class="row-main">
                <div class="row-title">${monthName(key)}</div>
                <div class="row-sub">Иван ${money(t.ivan)} · Клим ${money(t.klim)}</div>
              </div>
              <div class="row-side"><b>${money(t.earned)}</b><span>${list.length} ${plural(list.length, 'заказ', 'заказа', 'заказов')}</span></div>
            </div>`;
        }).join('')}
      </div>` : ''}`;
}

function renderNote({ id }) {
  const n = findNote(id);
  if (!n) return navBar('') + emptyState('Заметка не найдена', 'Возможно, её удалили.');
  const meta = [n.by, fmtAgo(n.updatedAt)].filter(Boolean).join(' · ');
  return `
    ${navBar('', `<button class="nav-link danger" data-action="delete-note" data-id="${n.id}">Удалить</button>`)}
    <div class="note-meta" id="note-meta">${esc(meta)}</div>
    <textarea class="note-editor" data-note="${n.id}" placeholder="Первая строка станет заголовком">${esc(n.text)}</textarea>`;
}

const SCREENS = {
  note: renderNote,
  order: renderOrder,
  edit: renderEdit,
  complete: renderComplete,
  stats: renderStats,
  money: renderMoney,
};

/* ---------- сохранение форм ---------- */
function readKinds(fd) {
  return Object.fromEntries(KINDS.map(k => [k.key, parseNum(fd.get('v_' + k.key))]));
}

function saveEdit(id, fd) {
  const existing = id ? findOrder(id) : null;
  const o = existing || { id: uid(), status: 'planned', createdAt: Date.now() };
  o.address = String(fd.get('address')).trim();
  o.date = fd.get('date');
  o.client = String(fd.get('client') || '').trim();
  o.phone = String(fd.get('phone') || '').trim();
  o.finder = fd.get('finder') || 'klim';
  o.notes = String(fd.get('notes') || '').trim();
  if (o.status === 'done') {
    o.fact = readKinds(fd);
    o.earned = parseNum(fd.get('earned'));
    o.comment = String(fd.get('comment') || '').trim();
  } else {
    o.plan = readKinds(fd);
  }
  if (!existing) orders.push(o);
  saveOrders();
  push({ action: 'save', order: o });
  haptic('success');
  back();
}

function saveComplete(id, fd) {
  const o = findOrder(id);
  if (!o) return back();
  o.status = 'done';
  o.fact = readKinds(fd);
  o.earned = parseNum(fd.get('earned'));
  o.comment = String(fd.get('comment') || '').trim();
  o.doneAt = Date.now();
  saveOrders();
  push({ action: 'save', order: o });
  haptic('success');
  back();
}

function handleAction(action, id) {
  if (action === 'back') return back();
  if (action === 'new-note') {
    const n = { id: uid(), type: 'note', text: '', updatedAt: Date.now(), by: me, saved: false };
    notes.push(n);
    go({ type: 'note', id: n.id });
    app.querySelector('.note-editor')?.focus();
    return;
  }
  if (action === 'delete-note') {
    return confirmAsk('Удалить заметку?', ok => {
      if (!ok) return;
      const n = findNote(id);
      notes = notes.filter(x => x.id !== id);
      saveNotes();
      if (n && n.saved !== false) push({ action: 'delete', id });
      back();
    });
  }
  const o = findOrder(id);
  if (!o) return;
  if (action === 'map') {
    openLink('https://yandex.ru/maps/?mode=search&text=' + encodeURIComponent(o.address));
  } else if (action === 'delete') {
    confirmAsk('Удалить заказ? Это нельзя отменить.', ok => {
      if (!ok) return;
      orders = orders.filter(x => x.id !== id);
      saveOrders();
      push({ action: 'delete', id });
      state.stack = state.stack.filter(s => s.id !== id);
      render(true);
    });
  }
}

/* ---------- события ---------- */
document.addEventListener('click', e => {
  if (e.target.closest('a[href]')) return;
  const act = e.target.closest('[data-action]');
  if (act) return handleAction(act.dataset.action, act.dataset.id);
  const tab = e.target.closest('[data-tab]');
  if (tab) return setTab(tab.dataset.tab);
  const target = e.target.closest('[data-go]');
  if (target) go({ type: target.dataset.go, id: target.dataset.id });
});

document.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  if (form.dataset.form === 'edit') saveEdit(form.dataset.id, fd);
  if (form.dataset.form === 'complete') saveComplete(form.dataset.id, fd);
});

// живой пересчёт долей при вводе суммы
function updatePreview(e) {
  const form = e.target.closest('form');
  const preview = form && form.querySelector('#split-preview');
  if (!preview) return;
  const finder = form.elements.finder?.value || form.dataset.finder;
  preview.innerHTML = splitPreview(finder, form.elements.earned?.value);
}
document.addEventListener('input', updatePreview);

// заметка сохраняется сама, пока печатаешь
document.addEventListener('input', e => {
  const n = e.target.dataset?.note && findNote(e.target.dataset.note);
  if (!n) return;
  n.text = e.target.value;
  n.updatedAt = Date.now();
  if (me) n.by = me;
  n.saved = true;
  saveNotes();
  scheduleNoteSave(n);
  const meta = document.getElementById('note-meta');
  if (meta) meta.textContent = [n.by, fmtAgo(n.updatedAt)].filter(Boolean).join(' · ');
});
document.addEventListener('change', updatePreview);

/* ---------- старт ---------- */
function applyTheme() {
  if (!inTelegram) return;
  const dark = tg.colorScheme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  try {
    tg.setHeaderColor(dark ? '#000000' : '#F2F2F7');
    tg.setBackgroundColor(dark ? '#000000' : '#F2F2F7');
  } catch { /* старый клиент */ }
}

if (inTelegram) {
  tg.ready();
  tg.expand();
  applyTheme();
  tg.onEvent('themeChanged', applyTheme);
  if (tgBack) tg.BackButton.onClick(back);
}

render();

if (remote) {
  pull();
  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { commitNote(); flush(); } else pull();
  });
}
