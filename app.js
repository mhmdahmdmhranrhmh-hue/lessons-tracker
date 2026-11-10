'use strict';
/* ========== الإعدادات والبيانات ========== */
const KEY = 'lessons-tracker-v2', NKEY = 'lessons-notified-v1';
const DAYS = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const COLORS = ['#5e548e','#e07a5f','#3d9970','#2a7fba','#c9709a','#b08900','#16817a'];
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => parse(iso(new Date()));
const diffDays = a => Math.round((parse(a) - today()) / 864e5);
const fmtTime = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'م' : 'ص'}`; };
const fmtDate = s => { const d = parse(s); return `${DAYS[d.getDay()]} ${d.getDate()}/${d.getMonth()+1}`; };
const rel = s => ({ '-1': 'امبارح', '0': 'النهاردة', '1': 'بكرة' }[diffDays(s)] || '');
const units = s => s.type === 'double' ? 2 : 1;

const seed = () => ({
  // payNo = رقم الحصة اللي بيتدفع فيها كل شهر
  // startNo = رقم أول حصة جاية (الحصص الدبل بتاخد رقمين: 1 و 2 / 3 و 4 ...)
  subjects: [
    { id: 'eng',  name: 'الإنجليزي', days: [5],   time: '09:30', start: '2026-11-13', type: 'double', startNo: 1, payNo: 1, price: 0, cycle: 8, color: COLORS[0] },
    { id: 'ar',   name: 'العربي',    days: [6],   time: '11:00', start: '2026-11-14', type: 'double', startNo: 3, payNo: 1, price: 0, cycle: 8, color: COLORS[1] },
    { id: 'chem', name: 'الكيمياء',  days: [6],   time: '19:50', start: '2026-11-14', type: 'double', startNo: 5, payNo: 1, price: 0, cycle: 8, color: COLORS[2] },
    { id: 'math', name: 'الرياضة',   days: [0,3], time: '09:30', start: '2026-11-10', type: 'single', startNo: 5, payNo: 4, price: 0, cycle: 8, color: COLORS[3] },
    { id: 'phy',  name: 'الفيزياء',  days: [3],   time: '09:00', start: '2026-11-18', type: 'double', startNo: 1, payNo: 1, price: 0, cycle: 8, color: COLORS[4] }
  ],
  logs: {},  // "subjectId|date" -> { st: 'taken' | 'cancelled', u: عدد الحصص }
  paid: {}   // "subjectId|رقم الشهر" -> true
});

let db;
try { db = JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { db = seed(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { toast('تعذر الحفظ على الجهاز'); } };
navigator.storage?.persist?.();   // يطلب من المتصفح عدم مسح البيانات تلقائيًا
db.subjects.forEach(s => { s.startNo = s.startNo || 1; s.cycle = s.cycle || 8; s.payNo = Math.min(s.cycle, Math.max(1, s.payNo || (s.id === 'math' ? 4 : 1))); });
save();

/* ========== حسابات الحصص والدفع ========== */
const takenUnits = s => (s.startNo - 1) + Object.entries(db.logs).reduce((n, [k, v]) => k.startsWith(s.id + '|') && v.st === 'taken' ? n + v.u : n, 0);
const cycleIdx = s => Math.floor(takenUnits(s) / s.cycle);
const cycleLeft = s => s.cycle - (takenUnits(s) % s.cycle);
// نقطة الدفع = رقم الحصة المطلقة اللي بيتدفع فيها في الشهر c
const payAbs = (s, c) => c * s.cycle + s.payNo;
const paidC = (s, c) => !!db.paid[`${s.id}|${c}`];
// أول شهر حصة الدفع بتاعته عدّت ولسه متدفعش (الشهور اللي قبل رقم البداية معتبرة مدفوعة)
function dueCycle(s) {
  const T = takenUnits(s);
  for (let c = 0; payAbs(s, c) <= T; c++) if (payAbs(s, c) > s.startNo - 1 && !paidC(s, c)) return c;
  return null;
}
// هل الحصة في التاريخ d هي حصة الدفع؟ وبتاعة أنهي شهر
function payInfo(s, d) {
  const n = numAt(s, d);
  for (let k = n + 1; k <= n + units(s); k++) if ((k - 1) % s.cycle + 1 === s.payNo) return { c: Math.floor((k - 1) / s.cycle) };
  return null;
}
function payTarget(s) {
  const due = dueCycle(s); if (due !== null) return { c: due, due: true };
  const T = takenUnits(s); let c = 0; while (payAbs(s, c) <= T) c++;
  return { c, due: false };
}
const paidTotal = s => Object.keys(db.paid).filter(k => k.startsWith(s.id + '|')).length * (s.price || 0);

function dates(s, from, to) {
  const out = [];
  for (let d = new Date(Math.max(parse(s.start), from)); d <= to; d = addDays(d, 1))
    if (s.days.includes(d.getDay())) out.push(iso(d));
  return out;
}
// رقم الحصة (أو الحصتين) في يوم معين، بالنسبة لشهر الـ cycle
function numAt(s, d) {
  let n = s.startNo - 1;
  for (const x of dates(s, parse(s.start), addDays(parse(d), -1))) {
    const l = db.logs[`${s.id}|${x}`];
    if (l) { if (l.st === 'taken') n += l.u; } else n += units(s);
  }
  return n;
}
function lessonLabel(s, d) {
  const n = numAt(s, d), f = n % s.cycle + 1;
  return s.type === 'double' ? `حصة ${f} و ${(n + 1) % s.cycle + 1}` : `حصة ${f}`;
}
const nextPending = s => dates(s, today(), addDays(today(), 45)).find(d => !db.logs[`${s.id}|${d}`]);
const dateTime = (d, t) => { const [h, m] = t.split(':').map(Number); const x = parse(d); x.setHours(h, m); return x; };

/* ========== الواجهة ========== */
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1800); }

function renderSessions() {
  const items = [];
  db.subjects.forEach(s => dates(s, addDays(today(), -14), addDays(today(), 14)).forEach(d => items.push({ s, d, st: db.logs[`${s.id}|${d}`]?.st })));
  items.sort((a, b) => a.d.localeCompare(b.d) || a.s.time.localeCompare(b.s.time));
  if (!items.length) return $('#tab-sessions').innerHTML = '<p class="empty">مفيش حصص. ضيفي مادة من تبويب «المواد والدفع».</p>';
  let html = '', last = '';
  for (const { s, d, st } of items) {
    if (d !== last) { last = d; html += `<h3 class="day">${fmtDate(d)} ${rel(d) ? '— ' + rel(d) : ''}</h3>`; }
    const late = !st && diffDays(d) < 0, pi = payInfo(s, d);
    const pTag = pi && st !== 'cancelled' ? (paidC(s, pi.c) ? '<span class="tag taken">💰 مدفوع</span> ' : '<span class="tag pay">💰 ميعاد الدفع</span> ') : '';
    html += `<article class="s" style="--c:${s.color}">
      <div class="h"><div><b>${esc(s.name)}</b><br><small>${fmtTime(s.time)}${st === 'cancelled' ? '' : ' · ' + lessonLabel(s, d)}</small></div>
      <span>${pTag}${s.type === 'double' ? '<span class="tag dbl">دبل</span> ' : ''}${st === 'taken' ? '<span class="tag taken">أخذتها</span>' : st === 'cancelled' ? '<span class="tag cancel">اتلغت</span>' : late ? '<span class="tag">لسه متسجلتش</span>' : ''}</span></div>
      <div class="acts" data-sid="${s.id}" data-d="${d}">
        ${st ? '<button class="undo" data-act="undo">تراجع</button>' : '<button class="y" data-act="taken">أخذتها</button><button class="n" data-act="cancelled">اتلغت</button>'}
      </div></article>`;
  }
  $('#tab-sessions').innerHTML = html;
}

function renderSubjects() {
  let html = '<button class="primary add" data-act="new">+ مادة جديدة</button>';
  for (const s of db.subjects) {
    const done = s.cycle - cycleLeft(s), nxt = nextPending(s), tg = payTarget(s), paid = paidC(s, tg.c);
    html += `<article class="s" style="--c:${s.color}" data-sid="${s.id}">
      <div class="h"><b>${esc(s.name)}</b>
        <span><span class="tag ${s.type === 'double' ? 'dbl' : ''}">${s.type === 'double' ? 'دبل' : 'عادي'}</span></span></div>
      <small>${s.days.map(i => DAYS[i]).join(' + ')} · ${fmtTime(s.time)}</small>
      ${nxt ? `<small>الجاية: ${fmtDate(nxt)} · ${lessonLabel(s, nxt)}</small>` : ''}
      <div class="meta"><span>الشهر ${cycleIdx(s) + 1}: ${done} من ${s.cycle} حصة</span><span>باقي ${cycleLeft(s)}</span></div>
      <div class="bar-wrap"><div class="bar-fill" style="width:${done / s.cycle * 100}%"></div></div>
      <div class="pay"><span>الدفع في حصة ${s.payNo} · ${s.price ? s.price + ' ج للشهر' : 'السعر مش متحدد'}${paidTotal(s) ? ' · اتدفع ' + paidTotal(s) + ' ج' : ''}</span>
        <button class="sw ${paid ? 'paid' : ''}" data-act="pay" data-c="${tg.c}">${paid ? '✓ مدفوع' : tg.due ? 'مستحق الدفع' : 'لسه مدفوعش'}</button></div>
      <div class="acts"><button data-act="toggleType">${s.type === 'double' ? 'حوّل لعادي' : 'حوّل لدبل'}</button><button data-act="edit">تعديل</button>
        <button class="undo" data-act="del">حذف المادة</button></div></article>`;
  }
  $('#tab-subjects').innerHTML = html;
}

function renderSettings() {
  $('#tab-settings').innerHTML = `
    <article class="s" style="--c:var(--primary)"><b>نسخة احتياطية</b>
      <small>البيانات محفوظة على موبايلك. نزّلي نسخة من وقت للتاني وارفعيها لو غيرتي الموبايل أو مسحتي بيانات المتصفح.</small>
      <div class="acts"><button data-act="export">تنزيل نسخة</button><button data-act="import">رفع نسخة</button></div>
      <input type="file" id="file" accept="application/json" hidden></article>
    <article class="s" style="--c:var(--bad)"><b>مسح كل البيانات</b>
      <div class="acts"><button class="undo" data-act="reset">رجوع للمواد الافتراضية</button></div></article>`;
}

function renderAlerts() {
  const box = $('#alerts'); let html = '';
  for (const s of db.subjects) {
    const price = s.price ? ' (' + s.price + ' ج)' : '';
    const dc = dueCycle(s);
    if (dc !== null) html += `<div class="alert"><span>💰 مستحق دفع ${esc(s.name)}${price} — عدّت حصة الدفع</span><button data-act="payNow" data-sid="${s.id}" data-c="${dc}">دفعت</button></div>`;
    const n = nextPending(s), pi = n && payInfo(s, n);
    if (pi && diffDays(n) <= 1 && !paidC(s, pi.c))
      html += `<div class="alert"><span>💰 ادفعي ثمن ${esc(s.name)}${price} — حصة ${rel(n)} هي حصة الدفع</span><button data-act="payNow" data-sid="${s.id}" data-c="${pi.c}">دفعت</button></div>`;
  }
  const old = db.subjects.reduce((n, s) => n + dates(s, parse(s.start), addDays(today(), -1)).filter(d => !db.logs[`${s.id}|${d}`]).length, 0);
  if (old) html += `<div class="alert info"><span>عندك ${old} حصة قديمة لسه متسجلتش، سجليها عشان العد يبقى مظبوط.</span></div>`;
  box.innerHTML = html;
}

const render = () => { renderSessions(); renderSubjects(); renderSettings(); renderAlerts(); $('#today').textContent = fmtDate(iso(new Date())); updateBell(); };

/* ========== الأحداث ========== */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, box = b.closest('[data-sid]'), sid = b.dataset.sid || box?.dataset.sid;
  const s = db.subjects.find(x => x.id === sid);
  if (act === 'taken' || act === 'cancelled') { db.logs[`${sid}|${box.dataset.d}`] = { st: act, u: units(s) }; toast(act === 'taken' ? 'اتسجلت: أخذتها' : 'اتسجلت: اتلغت'); }
  else if (act === 'undo') delete db.logs[`${sid}|${box.dataset.d}`];
  else if (act === 'pay') { const k = `${sid}|${b.dataset.c}`; db.paid[k] ? delete db.paid[k] : db.paid[k] = true; }
  else if (act === 'payNow') db.paid[`${sid}|${b.dataset.c}`] = true;
  else if (act === 'toggleType') { s.type = s.type === 'double' ? 'single' : 'double'; toast('الدبل اتغير'); }
  else if (act === 'new') return openDlg();
  else if (act === 'edit') return openDlg(s);
  else if (act === 'del') { if (!confirm(`حذف ${s.name} وكل سجلاتها؟`)) return; db.subjects = db.subjects.filter(x => x !== s);
    Object.keys(db.logs).concat(Object.keys(db.paid)).filter(k => k.startsWith(sid + '|')).forEach(k => { delete db.logs[k]; delete db.paid[k]; }); }
  else if (act === 'export') return exportData();
  else if (act === 'import') return $('#file').click();
  else if (act === 'reset') { if (!confirm('هتتمسح كل البيانات الحالية. متأكدة؟')) return; db = seed(); }
  save(); render();
});

document.addEventListener('change', e => {
  if (e.target.id !== 'file') return;
  const r = new FileReader();
  r.onload = () => { try { const d = JSON.parse(r.result); if (!Array.isArray(d.subjects)) throw 0; db = { subjects: d.subjects, logs: d.logs || {}, paid: d.paid || {} }; save(); render(); toast('تم رفع النسخة'); } catch { toast('الملف مش صالح'); } };
  r.readAsText(e.target.files[0]);
});

function exportData() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' }));
  a.download = `lessons-backup-${iso(new Date())}.json`; a.click(); URL.revokeObjectURL(a.href);
}

document.querySelectorAll('.bar button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.bar button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach(t => t.hidden = t.id !== 'tab-' + b.dataset.tab);
  scrollTo(0, 0);
});

/* ========== إضافة / تعديل مادة ========== */
const dlg = $('#dlg'), form = $('#form'); let editing = null;
$('#dayPick').innerHTML = DAYS.map((d, i) => `<label><input type="checkbox" name="day" value="${i}"><span>${d}</span></label>`).join('');
function openDlg(s) {
  editing = s || null; form.reset();
  $('#dlgTitle').textContent = s ? 'تعديل ' + s.name : 'مادة جديدة';
  if (s) { form.name.value = s.name; form.time.value = s.time; form.start.value = s.start; form.price.value = s.price || ''; form.cycle.value = s.cycle; form.type.value = s.type; form.startNo.value = s.startNo; form.payNo.value = s.payNo;
    form.querySelectorAll('[name=day]').forEach(c => c.checked = s.days.includes(+c.value)); }
  else { form.start.value = iso(new Date()); form.cycle.value = 8; form.startNo.value = 1; form.payNo.value = 1; }
  dlg.showModal();
}
$('#cancelDlg').onclick = () => dlg.close();
form.addEventListener('submit', e => {
  e.preventDefault();
  const days = [...form.querySelectorAll('[name=day]:checked')].map(c => +c.value);
  if (!days.length) return toast('اختاري يوم واحد على الأقل');
  const data = { name: form.name.value.trim(), days, time: form.time.value, start: form.start.value, type: form.type.value, price: +form.price.value || 0, cycle: +form.cycle.value || 8, startNo: Math.max(1, +form.startNo.value || 1) };
  data.payNo = Math.min(data.cycle, Math.max(1, +form.payNo.value || 1));
  if (editing) Object.assign(editing, data);
  else db.subjects.push({ id: uid(), color: COLORS[db.subjects.length % COLORS.length], ...data });
  save(); dlg.close(); render(); toast('اتحفظ');
});

/* ========== الإشعارات ========== */
const updateBell = () => $('#bell').textContent = ('Notification' in window && Notification.permission === 'granted') ? '🔔' : '🔕';
$('#bell').onclick = async () => {
  if (!('Notification' in window)) return toast('المتصفح ده مبيدعمش الإشعارات');
  const p = await Notification.requestPermission(); updateBell();
  if (p === 'granted') { notify('الإشعارات اشتغلت', 'هنذكرك بالحصص والدفع'); checkReminders(); }
};
function notify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opt = { body, tag: title + body, dir: 'rtl', lang: 'ar' };
  navigator.serviceWorker?.ready.then(r => r.showNotification(title, opt)).catch(() => new Notification(title, opt));
}
function checkReminders() {
  let seen = {}; try { seen = JSON.parse(localStorage.getItem(NKEY)) || {}; } catch {}
  const once = (k, t, b) => { if (!seen[k]) { seen[k] = 1; notify(t, b); } };
  const now = new Date();
  for (const s of db.subjects) {
    const d = nextPending(s); if (!d) continue;
    const mins = (dateTime(d, s.time) - now) / 6e4, dd = diffDays(d);
    if (dd === 1 && now.getHours() >= 18) once(`${s.id}|${d}|eve`, `بكرة حصة ${s.name}`, `الساعة ${fmtTime(s.time)}. لو المدرس لغاها سجليها في التطبيق.`);
    if (mins > 0 && mins <= 90) once(`${s.id}|${d}|soon`, `حصة ${s.name} قربت`, `بعد ${Math.round(mins)} دقيقة (${fmtTime(s.time)}). اتأكدي إنها هتتم.`);
    const pi = payInfo(s, d);
    if (pi && dd <= 1 && !paidC(s, pi.c)) once(`${s.id}|${d}|pay`, `ميعاد دفع ${s.name}`, `حصة الدفع ${dd === 0 ? 'النهاردة' : 'بكرة'}${s.price ? ': المطلوب ' + s.price + ' ج' : ''}.`);
    const dc = dueCycle(s);
    if (dc !== null) once(`${s.id}|${dc}|due`, `مستحق دفع ${s.name}`, 'عدّت حصة الدفع ولسه مدفوعش.');
  }
  localStorage.setItem(NKEY, JSON.stringify(seen));
}

/* ========== تشغيل ========== */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render(); checkReminders();
setInterval(() => { checkReminders(); renderAlerts(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); checkReminders(); } });
