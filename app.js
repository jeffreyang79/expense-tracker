'use strict';

const KEY = 'expenseTrackerV1';
const DEFAULT_MODES = ['Credit Card', 'PayNow', 'Cash'];
const DEFAULT_CATS = ['Groceries', 'Dining', 'Online', 'Shopping', 'Transportation', 'Household',
  'Telco', 'Entertainment', 'Education', 'Healthcare', 'Gift', 'Travel', 'Insurance', 'Other'];

let state = load();
const $ = id => document.getElementById(id);

/* ---------- storage ---------- */
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.transactions)) {
      s.modes = s.modes || DEFAULT_MODES.slice();
      s.categories = s.categories || DEFAULT_CATS.slice();
      s.series = s.series || [];
      return s;
    }
  } catch (e) { /* fall through */ }
  return { transactions: [], modes: DEFAULT_MODES.slice(), categories: DEFAULT_CATS.slice(), series: [] };
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* ---------- helpers ---------- */
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const money = n => n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2200);
}
function monthOf(dateStr) { return dateStr.slice(0, 7); }
function nextMonth(ym) {
  let [y, m] = ym.split('-').map(Number);
  m++; if (m > 12) { m = 1; y++; }
  return `${y}-${pad(m)}`;
}
function dateInMonth(ym, day) {   // clamp day to month length (31st -> 28th in Feb)
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${ym}-${pad(Math.min(day, last))}`;
}

/* ---------- recurring ---------- */
function generateRecurring() {
  const cur = monthOf(todayStr());
  let added = 0;
  state.series.filter(s => s.active).forEach(s => {
    while (nextMonth(s.lastMonth) <= cur) {
      s.lastMonth = nextMonth(s.lastMonth);
      state.transactions.push({
        id: uid(), seriesId: s.id, date: dateInMonth(s.lastMonth, s.day),
        mode: s.mode, amount: s.amount, category: s.category, notes: s.notes, reconciled: false
      });
      added++;
    }
  });
  if (added) { save(); toast(`${added} recurring expense(s) added`); }
}

/* ---------- dropdowns ---------- */
function fillSelect(sel, items, firstAll, keep) {
  const prev = keep ? sel.value : null;
  const first = firstAll ? '<option value="">All</option>'
    : '<option value="" selected disabled hidden>Select…</option>';   // blank by default in the form
  sel.innerHTML = first + items.map(i => `<option>${esc(i)}</option>`).join('');
  if (prev && items.includes(prev)) sel.value = prev;
}
function allUsed(listKey, txKey) {   // list + any value still used by old transactions
  const set = new Set(state[listKey]);
  state.transactions.forEach(t => set.add(t[txKey]));
  return [...set];
}
function refreshLists() {
  fillSelect($('fMode'), state.modes, false, true);
  fillSelect($('fCategory'), state.categories, false, true);
  fillSelect($('xMode'), allUsed('modes', 'mode'), true, true);
  fillSelect($('xCategory'), allUsed('categories', 'category'), true, true);
  renderManage();
}

/* ---------- manage lists: rename / delete ---------- */
function renderManage() {
  const build = (ul, list, txKey, kind) => {
    ul.innerHTML = state[list].map((name, i) => {
      const used = state.transactions.filter(t => t[txKey] === name).length;
      return `<li data-i="${i}"><span class="handle" title="Drag to reorder" aria-label="Drag to reorder">⋮⋮</span><span class="nm">${esc(name)} <small>(${used})</small></span>
        <button type="button" data-kind="${kind}" data-i="${i}" data-act="rename">Rename</button>
        <button type="button" class="del" data-kind="${kind}" data-i="${i}" data-act="delete" ${used ? 'disabled title="In use by transactions"' : ''}>Delete</button></li>`;
    }).join('');
  };
  build($('manageModes'), 'modes', 'mode', 'mode');
  build($('manageCats'), 'categories', 'category', 'category');
}

function manageClick(e) {
  const b = e.target;
  if (!b.dataset.act) return;
  const kind = b.dataset.kind, list = kind === 'mode' ? 'modes' : 'categories', i = +b.dataset.i;
  const old = state[list][i];
  if (b.dataset.act === 'delete') {
    if (!confirm(`Delete "${old}" from the list?`)) return;
    state[list].splice(i, 1);
  } else {
    const nu = (prompt(`Rename "${old}" to:`, old) || '').trim();
    if (!nu || nu === old) return;
    if (state[list].some(x => x.toLowerCase() === nu.toLowerCase())) { alert(`"${nu}" already exists.`); return; }
    state[list][i] = nu;
    state.transactions.forEach(t => { if (t[kind] === old) t[kind] = nu; });
    state.series.forEach(s => { if (s[kind] === old) s[kind] = nu; });
    const fx = $(kind === 'mode' ? 'xMode' : 'xCategory');
    if (fx.value === old) fx.dataset.pending = nu;
  }
  save();
  const fx = $(kind === 'mode' ? 'xMode' : 'xCategory');
  const pending = fx.dataset.pending; delete fx.dataset.pending;
  refreshLists();
  if (pending) fx.value = pending;
  render(); toast('List updated');
}
/* drag to reorder (pointer events: works with mouse and touch) */
function enableDrag(ul, list) {
  let dragLi = null;
  ul.addEventListener('pointerdown', e => {
    const h = e.target.closest('.handle');
    if (!h) return;
    dragLi = h.closest('li');
    dragLi.classList.add('dragging');
    ul.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  ul.addEventListener('pointermove', e => {
    if (!dragLi) return;
    const others = [...ul.children].filter(l => l !== dragLi);
    const next = others.find(l => { const r = l.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    if (next) { if (dragLi.nextElementSibling !== next) ul.insertBefore(dragLi, next); }
    else if (ul.lastElementChild !== dragLi) ul.appendChild(dragLi);
    if (e.clientY < 70) window.scrollBy(0, -12);                       // auto-scroll near screen edges
    else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 12);
  });
  const end = () => {
    if (!dragLi) return;
    dragLi.classList.remove('dragging');
    const order = [...ul.children].map(l => +l.dataset.i);
    dragLi = null;
    if (order.every((v, k) => v === k)) return;                         // nothing moved
    const old = state[list];
    state[list] = order.map(i => old[i]);
    save(); refreshLists(); toast('Order saved');
  };
  ul.addEventListener('pointerup', end);
  ul.addEventListener('pointercancel', end);
}
enableDrag($('manageModes'), 'modes');
enableDrag($('manageCats'), 'categories');

function setManage(open) {
  $('manageSection').hidden = !open;
  $('manageToggle').setAttribute('aria-expanded', open);
  $('manageToggle').textContent = open ? 'Hide lists' : 'Manage lists';
  if (open) $('manageSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('manageToggle').onclick = () => setManage($('manageSection').hidden);
$('manageClose').onclick = () => { setManage(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
$('manageModes').onclick = manageClick;
$('manageCats').onclick = manageClick;

$('addModeBtn').onclick = () => {
  const v = (prompt('New payment mode (e.g. "Visa 1234"):') || '').trim();
  if (!v) return;
  if (!state.modes.includes(v)) state.modes.push(v);
  save(); refreshLists(); $('fMode').value = v;
};
$('addCatBtn').onclick = () => {
  const v = (prompt('New category:') || '').trim();
  if (!v) return;
  if (!state.categories.includes(v)) state.categories.push(v);
  save(); refreshLists(); $('fCategory').value = v;
};

/* ---------- form: add / edit ---------- */
function resetForm() {
  $('expenseForm').reset();
  $('editId').value = '';
  $('fDate').value = todayStr();
  $('formTitle').textContent = 'Add expense';
  $('saveBtn').textContent = 'Add expense';
  $('cancelBtn').hidden = true;
}

$('expenseForm').onsubmit = e => {
  e.preventDefault();
  const data = {
    mode: $('fMode').value,
    amount: Math.round(parseFloat($('fAmount').value) * 100) / 100,
    category: $('fCategory').value,
    date: $('fDate').value,
    notes: $('fNotes').value.trim()
  };
  const wantRecurring = $('fRecurring').checked;
  const editId = $('editId').value;

  if (!data.mode) { toast('Select a payment mode'); $('fMode').focus(); return; }
  if (!data.category) { toast('Select a category'); $('fCategory').focus(); return; }
  if (!(data.amount > 0)) { toast('Enter an amount above 0'); $('fAmount').focus(); return; }
  if (!data.date) { toast('Select a date'); $('fDate').focus(); return; }

  if (editId) {
    const t = state.transactions.find(x => x.id === editId);
    const series = t.seriesId && state.series.find(s => s.id === t.seriesId);
    Object.assign(t, data);
    if (series && series.active) {
      if (!wantRecurring) {
        series.active = false; t.seriesId = null;
      } else if (confirm('Apply these changes to FUTURE recurring months too?\n\nOK = yes, future months use the new values.\nCancel = only this transaction.')) {
        Object.assign(series, { mode: data.mode, amount: data.amount, category: data.category, notes: data.notes, day: +data.date.slice(8) });
      }
    } else if (wantRecurring) {
      t.seriesId = startSeries(data);
    }
    toast('Expense updated');
  } else {
    const t = Object.assign({ id: uid(), reconciled: false, seriesId: null }, data);
    if (wantRecurring) t.seriesId = startSeries(data);
    state.transactions.push(t);
    toast('Expense added');
  }
  generateRecurring();
  save(); resetForm(); refreshLists(); render();
};

function startSeries(d) {
  const s = { id: uid(), active: true, day: +d.date.slice(8), lastMonth: monthOf(d.date),
    mode: d.mode, amount: d.amount, category: d.category, notes: d.notes };
  state.series.push(s);
  return s.id;
}

$('cancelBtn').onclick = resetForm;

function editTx(id) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) return;
  [['mode', 'modes', 'fMode'], ['category', 'categories', 'fCategory']].forEach(([k, list, el]) => {
    if (!state[list].includes(t[k])) state[list].push(t[k]);   // keep old values selectable
  });
  refreshLists();
  $('editId').value = t.id;
  $('fMode').value = t.mode;
  $('fAmount').value = t.amount;
  $('fCategory').value = t.category;
  $('fDate').value = t.date;
  $('fNotes').value = t.notes || '';
  const s = t.seriesId && state.series.find(x => x.id === t.seriesId);
  $('fRecurring').checked = !!(s && s.active);
  $('formTitle').textContent = 'Edit expense';
  $('saveBtn').textContent = 'Save changes';
  $('cancelBtn').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteTx(id) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) return;
  if (!confirm(`Delete this expense?\n\n${t.date}  ${t.category}  SGD ${money(t.amount)}`)) return;
  const s = t.seriesId && state.series.find(x => x.id === t.seriesId);
  if (s && s.active && confirm('This is a monthly recurring expense.\n\nOK = also STOP it repeating in future months.\nCancel = keep repeating (only delete this one).')) {
    s.active = false;
  }
  state.transactions = state.transactions.filter(x => x.id !== id);
  save(); refreshLists(); render();
  toast('Deleted');
}

/* ---------- filters ---------- */
function filtered() {
  const mode = $('xMode').value, cat = $('xCategory').value, per = $('xPeriod').value;
  const rec = $('xRec').value, text = $('xText').value.trim().toLowerCase();
  const month = $('xMonth').value, year = $('xYear').value;
  const from = $('xFrom').value, to = $('xTo').value;
  return state.transactions.filter(t => {
    if (mode && t.mode !== mode) return false;
    if (cat && t.category !== cat) return false;
    if (per === 'month' && month && monthOf(t.date) !== month) return false;
    if (per === 'year' && year && t.date.slice(0, 4) !== String(year)) return false;
    if (per === 'range') {
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
    }
    if (rec === 'yes' && !t.reconciled) return false;
    if (rec === 'no' && t.reconciled) return false;
    if (text && !(t.notes || '').toLowerCase().includes(text)) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

function syncPeriodBoxes() {
  const p = $('xPeriod').value;
  $('boxMonth').hidden = p !== 'month';
  $('boxYear').hidden = p !== 'year';
  $('boxFrom').hidden = $('boxTo').hidden = p !== 'range';
}

['xMode', 'xCategory', 'xRec', 'xMonth', 'xYear', 'xFrom', 'xTo'].forEach(id => $(id).onchange = render);
$('xText').oninput = render;
$('xPeriod').onchange = () => { syncPeriodBoxes(); render(); };
$('resetBtn').onclick = () => {
  ['xMode', 'xCategory'].forEach(id => $(id).value = '');
  $('xPeriod').value = 'all'; $('xRec').value = 'all'; $('xText').value = '';
  $('xFrom').value = $('xTo').value = '';
  setDefaultPeriodValues(); syncPeriodBoxes(); render();
};
function setDefaultPeriodValues() {
  const t = todayStr();
  $('xMonth').value = monthOf(t);
  $('xYear').value = t.slice(0, 4);
}

/* ---------- render ---------- */
function render() {
  const rows = filtered();
  let total = 0, matched = 0;
  rows.forEach(t => { total += t.amount; if (t.reconciled) matched += t.amount; });
  $('tTotal').textContent = money(total);
  $('tCount').textContent = rows.length + (rows.length === 1 ? ' item' : ' items');
  $('tMatched').textContent = money(matched);
  $('tUnmatched').textContent = money(total - matched);
  $('emptyMsg').hidden = rows.length > 0;

  $('txTable').querySelector('tbody').innerHTML = rows.map(t => {
    const s = t.seriesId && state.series.find(x => x.id === t.seriesId);
    return `<tr class="${t.reconciled ? 'matched' : ''}">
      <td class="c-rec"><input type="checkbox" data-rec="${t.id}" ${t.reconciled ? 'checked' : ''} aria-label="Matched with statement"></td>
      <td class="c-date">${esc(t.date)}</td>
      <td class="c-mode">${esc(t.mode)}</td>
      <td class="c-cat">${esc(t.category)}</td>
      <td class="num c-amt">${money(t.amount)}</td>
      <td class="c-notes">${esc(t.notes || '')}${t.seriesId ? `<span class="badge">${s && s.active ? 'monthly' : 'was monthly'}</span>` : ''}</td>
      <td class="actions-cell c-act"><button data-edit="${t.id}">Edit</button> <button class="del" data-del="${t.id}">Delete</button></td>
    </tr>`;
  }).join('');

  renderBreakdown('catTable', rows, t => t.category, true, total);
  renderBreakdown('monthTable', rows, t => monthOf(t.date), false, total);
}

function renderBreakdown(tableId, rows, keyFn, sortByAmount, total) {
  const sums = {};
  rows.forEach(t => { const k = keyFn(t); sums[k] = (sums[k] || 0) + t.amount; });
  let entries = Object.entries(sums);
  entries = sortByAmount ? entries.sort((a, b) => b[1] - a[1]) : entries.sort((a, b) => b[0].localeCompare(a[0]));
  const max = Math.max(...entries.map(e => e[1]), 1);
  $(tableId).querySelector('tbody').innerHTML = entries.length ? entries.map(([k, v]) =>
    `<tr><td>${esc(k)}</td><td class="num">${money(v)}</td>
     <td class="num">${total ? (v / total * 100).toFixed(1) : 0}%</td>
     <td class="bar-cell"><div class="bar" style="width:${(v / max * 100).toFixed(1)}%"></div></td></tr>`
  ).join('') : '<tr><td class="hint">No data</td></tr>';
}

/* table clicks: reconcile tick, edit, delete */
$('txTable').addEventListener('click', e => {
  const b = e.target;
  if (b.dataset.edit) editTx(b.dataset.edit);
  else if (b.dataset.del) deleteTx(b.dataset.del);
});
$('txTable').addEventListener('change', e => {
  const id = e.target.dataset.rec;
  if (!id) return;
  const t = state.transactions.find(x => x.id === id);
  t.reconciled = e.target.checked;
  save(); render();
});

/* ---------- export ---------- */
const HEADERS = ['Date', 'Year', 'Month', 'Payment Mode', 'Category', 'Amount', 'Notes', 'Recurring', 'Reconciled'];
function toRow(t) {
  return [t.date, t.date.slice(0, 4), t.date.slice(5, 7), t.mode, t.category,
    t.amount.toFixed(2), t.notes || '', t.seriesId ? 'Yes' : 'No', t.reconciled ? 'Yes' : 'No'];
}
function csvCell(v) { v = String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportCsv(rows, name) {
  if (!rows.length) { toast('Nothing to export'); return; }
  const lines = [HEADERS, ...rows.map(toRow)].map(r => r.map(csvCell).join(','));
  download(name, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
}
const sortedAsc = rows => rows.slice().sort((a, b) => a.date.localeCompare(b.date));
$('csvFiltered').onclick = () => exportCsv(sortedAsc(filtered()), `expenses-filtered-${todayStr()}.csv`);
$('csvAll').onclick = () => exportCsv(sortedAsc(state.transactions), `expenses-all-${todayStr()}.csv`);

$('copyBtn').onclick = async () => {
  const rows = sortedAsc(filtered());
  if (!rows.length) { toast('Nothing to copy'); return; }
  const clean = v => String(v).replace(/[\t\r\n]+/g, ' ');
  const text = [HEADERS, ...rows.map(toRow)].map(r => r.map(clean).join('\t')).join('\n');
  try { await navigator.clipboard.writeText(text); toast(`Copied ${rows.length} rows. Paste into Google Sheets.`); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); ta.remove(); toast(`Copied ${rows.length} rows.`);
  }
};

/* ---------- backup / restore ---------- */
$('backupBtn').onclick = () => download(`expense-backup-${todayStr()}.json`, JSON.stringify(state, null, 2), 'application/json');
$('restoreBtn').onclick = () => $('restoreFile').click();
$('restoreFile').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const s = JSON.parse(r.result);
      if (!Array.isArray(s.transactions)) throw new Error('bad file');
      if (!confirm(`Replace ALL current data with this backup (${s.transactions.length} transactions)?`)) return;
      state = { transactions: s.transactions, modes: s.modes || DEFAULT_MODES.slice(),
        categories: s.categories || DEFAULT_CATS.slice(), series: s.series || [] };
      save(); refreshLists(); render(); toast('Backup restored');
    } catch (err) { alert('That file is not a valid backup.'); }
  };
  r.readAsText(f); e.target.value = '';
};

/* ---------- start ---------- */
generateRecurring();
refreshLists();
setDefaultPeriodValues();
resetForm();
syncPeriodBoxes();
render();
