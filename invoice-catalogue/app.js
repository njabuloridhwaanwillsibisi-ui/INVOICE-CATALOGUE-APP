'use strict';
(() => {
const { toTable, decode, colInfo, fmt, num, makePDF } = Core;
const h = (t, a = {}, ...c) => { const e = document.createElement(t); for (const k in a) { const v = a[k]; if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v); } c.flat(9).forEach(x => { if (x != null && x !== false) e.append(x.nodeType ? x : document.createTextNode(x)); }); return e; };
const $ = s => document.querySelector(s);

/* ---------- storage (IndexedDB key/value) ---------- */
const DB = {
  open() { return this.p || (this.p = new Promise((ok, no) => { const r = indexedDB.open('catalogue', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); })); },
  async get(k) { const d = await this.open(); return new Promise(ok => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => ok(q.result); q.onerror = () => ok(undefined); }); },
  async set(k, v) { const d = await this.open(); return new Promise((ok, no) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = ok; t.onerror = () => no(t.error); }); }
};
const S = { headers: [], rows: [], info: null, byId: new Map(), groups: [], meta: {}, prefs: { theme: 'auto', cur: 'R', title: -1, vis: [] }, sel: new Set(), q: '', sort: -1, dir: 1, flt: null, tab: 'home', grp: null, view: [], shown: 0, exp: {} };
const save = async k => { try { await DB.set(k, k === 'data' ? { headers: S.headers, rows: S.rows.map(r => ({ id: r.id, v: r.v })), meta: S.meta } : S[k]); } catch (e) { toast('Could not save: ' + e.message); } };
const gid = () => Math.random().toString(36).slice(2, 9);
const T = () => S.prefs.title >= 0 && S.prefs.title < S.headers.length ? S.prefs.title : S.info ? S.info.title : 0;
const vis = () => S.headers.map((_, i) => S.prefs.vis[i] !== false);
const F = (r, j) => fmt(S.info, j, r.v[j], S.prefs.cur);
function setData(headers, rows) {
  S.headers = headers; S.rows = rows; S.info = colInfo(headers, rows);
  S.byId = new Map(rows.map(r => { r.h = (r.v.join(' ') + ' ' + r.v.join(' ').replace(/,/g, '.')).toLowerCase(); return [r.id, r]; }));
}
const toast = m => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2600); };
function sheet(title, ...body) {
  const d = h('dialog', { class: 'sheet' }, h('div', { class: 'sh' }, h('b', {}, title), h('button', { class: 'x', onclick: () => d.close() }, '✕')), h('div', { class: 'sb' }, body));
  d.addEventListener('close', () => d.remove()); d.addEventListener('click', e => { if (e.target === d) d.close(); });
  document.body.append(d); d.showModal(); return d;
}
function applyTheme() { document.documentElement.dataset.theme = S.prefs.theme; }

/* ---------- import ---------- */
async function importText(text, name) {
  const t = toTable(text);
  if (!t || !t.rows.length) return toast('No rows found in that file');
  if (S.rows.length && !confirm(`Replace the current dataset (${S.rows.length} items) with "${name}" (${t.rows.length} items)?` + (S.groups.length ? `\n\nYour ${S.groups.length} group(s) are kept. Items are matched by the first column ("${S.headers[0]}").` : ''))) return;
  const same = JSON.stringify(t.headers) === JSON.stringify(S.headers);
  setData(t.headers, t.rows); if (!same) { S.prefs.vis = []; S.prefs.title = -1; }
  S.meta = { file: name, date: new Date().toLocaleString() }; S.sel.clear(); S.q = ''; S.flt = null; S.sort = -1;
  await Promise.all([save('data'), save('prefs')]);
  const miss = S.groups.reduce((a, g) => a + g.ids.filter(i => !S.byId.has(i)).length, 0);
  toast(`Imported ${t.rows.length} items` + (miss ? ` · ${miss} grouped item(s) not in this file` : '')); go('home');
}
async function importFile(f) { if (f) importText(decode(await f.arrayBuffer()), f.name); }

/* ---------- filtering, sorting ---------- */
const FOK = r => { const { c, op, val } = S.flt, x = r.v[c]; if (op === 'has') return x.toLowerCase().includes(val.toLowerCase()); if (op === 'empty') return x === ''; if (op === 'filled') return x !== ''; const a = num(x), b = num(val); if (op === '=') return isNaN(a) ? x.toLowerCase() === val.toLowerCase() : a === b; return op === '>' ? a > b : a < b; };
function refresh() {
  const terms = S.q.toLowerCase().split(/\s+/).filter(Boolean);
  let v = S.rows.filter(r => terms.every(t => r.h.includes(t)));
  if (S.flt) v = v.filter(FOK);
  if (S.sort >= 0) { const c = S.sort, nm = S.info.num[c]; v = v.slice().sort((p, q) => { const a = p.v[c], b = q.v[c]; if (a === '' || b === '') return (a === '') - (b === ''); return S.dir * (nm ? num(a) - num(b) : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })); }); }
  S.view = v; S.shown = 0; drawList();
}

/* ---------- cards ---------- */
function card(r, remove) {
  const t = T(), V = vis(), cols = V.map((x, i) => x ? i : -1).filter(i => i >= 0), ti = V[t] ? t : cols[0];
  const tiles = cols.filter(i => i !== ti && i !== 0).map(i => { const val = F(r, i); if (val === '') return null; const neg = S.info.right[i] && num(r.v[i]) < 0; return h('div', { class: 'tile' + (S.info.money[i] ? ' m' : '') + (neg ? ' neg' : '') }, h('small', {}, S.headers[i]), h('b', {}, val)); });
  const title = ti != null ? r.v[ti] : '';
  const el = h('div', { class: 'card' + (S.sel.has(r.id) ? ' on' : ''), 'data-id': r.id },
    remove ? null : h('div', { class: 'chk' }, '✓'),
    h('div', { class: 'cb' }, V[0] && ti !== 0 ? h('div', { class: 'code' }, r.v[0]) : null, h('div', { class: 'ti' + (title ? '' : ' empty') }, title || '(no description)'), tiles.length ? h('div', { class: 'tiles' }, tiles) : null),
    remove ? h('button', { class: 'rm', onclick: e => { e.stopPropagation(); remove(r); } }, '✕') : null);
  if (!remove) el.addEventListener('click', () => { S.sel.has(r.id) ? S.sel.delete(r.id) : S.sel.add(r.id); el.classList.toggle('on'); selBar(); });
  return el;
}
function drawList() {
  const L = $('#list'); if (!L) return; if (!S.shown) L.replaceChildren();
  const end = Math.min(S.view.length, S.shown + 50); for (let i = S.shown; i < end; i++) L.append(card(S.view[i])); S.shown = end;
  $('#cnt').textContent = `${S.view.length.toLocaleString()} of ${S.rows.length.toLocaleString()} items` + (S.sel.size ? ` · ${S.sel.size} selected` : '');
  if (!S.view.length) L.append(h('div', { class: 'empty-state' }, 'No items match.'));
}
addEventListener('scroll', () => { if (S.tab === 'products' && S.shown < S.view.length && innerHeight + scrollY > document.body.scrollHeight - 600) drawList(); }, { passive: true });
function selBar() {
  const b = $('#selbar'), n = S.sel.size; b.hidden = !(n && S.tab === 'products'); if (b.hidden) return;
  b.replaceChildren(h('b', {}, n + ' selected'), h('button', { class: 'btn alt sm', onclick: () => { S.view.forEach(r => S.sel.add(r.id)); S.shown = 0; drawList(); selBar(); } }, 'All results'), h('button', { class: 'btn alt sm', onclick: () => { S.sel.clear(); S.shown = 0; drawList(); selBar(); } }, 'Clear'), h('button', { class: 'btn sm', onclick: groupSheet }, 'Add to group'));
  const c = $('#cnt'); if (c) c.textContent = c.textContent.replace(/ · \d+ selected/, '') + ` · ${n} selected`;
}

/* ---------- groups ---------- */
function groupSheet() {
  const ids = [...S.sel], name = h('input', { placeholder: 'New group name, e.g. Drinks', maxlength: 60 });
  const d = sheet(`Add ${ids.length} item(s) to…`, S.groups.map(g => h('div', { class: 'g', onclick: () => { g.ids = [...new Set([...g.ids, ...ids])]; done(g); } }, h('div', { class: 'grow' }, h('b', {}, g.name), h('br'), h('span', {}, g.ids.length + ' items')), '＋')),
    h('h2', {}, 'Create new group'), h('div', { class: 'row' }, name, h('button', { class: 'btn', onclick: () => { const n = name.value.trim(); if (!n) return toast('Enter a group name'); const g = { id: gid(), name: n, ids: [], cols: null, sort: null }; S.groups.push(g); g.ids = ids; done(g); } }, 'Create')));
  function done(g) { save('groups'); toast(`Added to “${g.name}”`); S.sel.clear(); d.close(); S.shown = 0; drawList(); selBar(); }
}
const gItems = g => g.ids.map(i => S.byId.get(i)).filter(Boolean);

/* ---------- PDF ---------- */
const cx = document.createElement('canvas').getContext('2d');
const measure = (s, b) => { cx.font = (b ? 'bold ' : '') + '9px Helvetica,Arial,sans-serif'; return cx.measureText(s).width; };
function buildPDF(g) {
  const cols = (g.cols || vis().map((x, i) => x ? i : -1).filter(i => i >= 0)).filter(i => i < S.headers.length);
  let rows = gItems(g), sc = g.sort != null ? g.sort : T();
  if (sc >= 0) { const nm = S.info.num[sc]; rows = rows.slice().sort((p, q) => { const a = p.v[sc], b = q.v[sc]; if (a === '' || b === '') return (a === '') - (b === ''); return nm ? num(a) - num(b) : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }); }); }
  return makePDF({ title: g.name, sub: `${rows.length} items  ·  ${new Date().toLocaleDateString()}  ·  Source: ${S.meta.file || 'catalogue'}`, cols: cols.map(c => ({ name: S.headers[c], right: S.info.right[c] })), rows: rows.map(r => cols.map(c => F(r, c))) }, measure);
}
const pdfFile = g => new File([buildPDF(g)], g.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') + '.pdf', { type: 'application/pdf' });
function dl(file) { const u = URL.createObjectURL(file), a = h('a', { href: u, download: file.name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); }

/* ---------- screens ---------- */
const NAV = [['home', '🏠', 'Home'], ['products', '📦', 'Products'], ['groups', '🗂️', 'Groups'], ['export', '📄', 'Export'], ['settings', '⚙️', 'Settings']];
function go(t, g = null) { S.tab = t; S.grp = g; render(); scrollTo(0, 0); }
function render() {
  $('#nav').replaceChildren(...NAV.map(([k, i, l]) => h('button', { class: S.tab === k ? 'on' : '', onclick: () => go(k) }, h('i', {}, i), l)));
  const m = $('#main'); m.replaceChildren(); ({ home, products, groups, export: exportScr, settings }[S.tab])(m); selBar();
}
function needData(m) { m.append(h('div', { class: 'empty-state' }, h('p', {}, 'No data yet. Import a CSV on the Home tab.'), h('button', { class: 'btn', onclick: () => go('home') }, 'Go to Home'))); }
function home(m) {
  const inp = h('input', { type: 'file', accept: '.csv,.txt,text/csv,text/plain,application/vnd.ms-excel', hidden: true, onchange: e => { importFile(e.target.files[0]); e.target.value = ''; } });
  m.append(h('h1', {}, 'Invoice Catalogue'), h('p', {}, 'Import a CSV invoice or stock list, search it, group products and export tidy PDFs. Everything stays on this device.'),
    h('div', { class: 'panel' }, S.rows.length ? [h('b', {}, S.meta.file || 'Current dataset'), h('p', {}, 'Imported ' + (S.meta.date || '')), h('div', { class: 'stat' }, h('div', {}, h('b', {}, S.rows.length.toLocaleString()), h('span', {}, 'items')), h('div', {}, h('b', {}, S.headers.length), h('span', {}, 'columns')), h('div', {}, h('b', {}, S.groups.length), h('span', {}, 'groups'))), h('p', {}, 'Columns: ' + S.headers.join(' · '))] : h('p', {}, 'No dataset loaded yet.')),
    inp, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => inp.click() }, S.rows.length ? '⬆ Import another CSV' : '⬆ Import CSV'), S.rows.length ? h('button', { class: 'btn alt', onclick: () => go('products') }, 'Browse products') : h('button', { class: 'btn alt', onclick: async () => importText(await (await fetch('sample.csv')).text(), 'sample.csv') }, 'Try sample data')));
}
function products(m) {
  if (!S.rows.length) return needData(m);
  const q = h('input', { type: 'search', placeholder: 'Search description, code, price…', value: S.q, autocomplete: 'off', oninput: e => { clearTimeout(q.t); q.t = setTimeout(() => { S.q = e.target.value; refresh(); }, 80); } });
  const sortSel = h('select', { onchange: e => { S.sort = +e.target.value; refresh(); } }, h('option', { value: -1 }, 'Sort: original'), S.headers.map((x, i) => h('option', { value: i, selected: S.sort === i }, 'Sort: ' + x)));
  m.append(h('div', { class: 'top' }, h('div', { class: 'sw' }, q, h('button', { 'aria-label': 'Clear search', onclick: () => { q.value = ''; S.q = ''; refresh(); q.focus(); } }, '✕')),
    h('div', { class: 'tools' }, sortSel, h('button', { class: 'btn alt', title: 'Direction', onclick: e => { S.dir *= -1; e.target.textContent = S.dir > 0 ? '↑' : '↓'; refresh(); } }, S.dir > 0 ? '↑' : '↓'), h('button', { class: 'btn alt', onclick: filterSheet }, S.flt ? 'Filter ●' : 'Filter'), h('button', { class: 'btn alt', onclick: colsSheet }, 'Columns')),
    h('div', { class: 'count', id: 'cnt' })), h('div', { id: 'list' })); refresh();
}
function filterSheet() {
  const f = S.flt || { c: 0, op: 'has', val: '' };
  const c = h('select', {}, S.headers.map((x, i) => h('option', { value: i, selected: f.c === i }, x))), op = h('select', {}, [['has', 'contains'], ['=', 'equals'], ['>', 'greater than'], ['<', 'less than'], ['empty', 'is blank'], ['filled', 'is not blank']].map(([v, l]) => h('option', { value: v, selected: f.op === v }, l))), val = h('input', { placeholder: 'Value', value: f.val });
  const d = sheet('Filter products', h('div', { class: 'row' }, c, op), h('div', { class: 'row', style: 'margin-top:8px' }, val), h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn alt', onclick: () => { S.flt = null; d.close(); render(); } }, 'Clear filter'), h('button', { class: 'btn', onclick: () => { S.flt = { c: +c.value, op: op.value, val: val.value }; d.close(); render(); } }, 'Apply')));
}
function colsSheet() {
  const V = vis(), set = (i, v) => { S.prefs.vis = vis(); S.prefs.vis[i] = v; save('prefs'); S.shown = 0; drawList(); };
  sheet('Visible columns', h('p', {}, 'Hidden columns stay in your data and remain searchable.'), S.headers.map((x, i) => h('label', { class: 'opt' }, h('input', { type: 'checkbox', checked: V[i], onchange: e => set(i, e.target.checked) }), x)));
}
function groups(m) {
  if (S.grp) return groupView(m, S.groups.find(g => g.id === S.grp));
  m.append(h('h1', {}, 'Groups'), h('p', {}, 'Select products on the Products tab, then “Add to group”.'));
  const name = h('input', { placeholder: 'New empty group name' });
  m.append(h('div', { class: 'row' }, name, h('button', { class: 'btn', style: 'flex:none', onclick: () => { const n = name.value.trim(); if (!n) return; S.groups.push({ id: gid(), name: n, ids: [], cols: null, sort: null }); save('groups'); render(); } }, 'Create')));
  if (!S.groups.length) m.append(h('div', { class: 'empty-state' }, 'No groups yet.'));
  S.groups.forEach(g => m.append(h('div', { class: 'g', onclick: () => go('groups', g.id) }, h('div', { class: 'grow' }, h('b', {}, g.name), h('br'), h('span', {}, gItems(g).length + ' items')), '›')));
}
function groupView(m, g) {
  if (!g) return go('groups');
  const missing = g.ids.length - gItems(g).length;
  m.append(h('div', { class: 'top' }, h('button', { class: 'btn alt sm', onclick: () => go('groups') }, '‹ Groups')), h('h1', {}, g.name), h('p', {}, gItems(g).length + ' items' + (missing ? ` · ${missing} not in the current dataset` : '')),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { S.exp.g = g.id; go('export'); } }, 'Export PDF'), h('button', { class: 'btn alt', onclick: () => { const n = prompt('Rename group', g.name); if (n && n.trim()) { g.name = n.trim(); save('groups'); render(); } } }, 'Rename'), h('button', { class: 'btn red', onclick: () => { if (confirm(`Delete group “${g.name}”? The products themselves are not deleted.`)) { S.groups = S.groups.filter(x => x !== g); save('groups'); go('groups'); } } }, 'Delete')));
  const L = h('div'); m.append(L);
  const items = gItems(g); items.slice(0, 300).forEach(r => L.append(card(r, r => { g.ids = g.ids.filter(i => i !== r.id); save('groups'); render(); })));
  if (items.length > 300) L.append(h('p', {}, `Showing first 300 of ${items.length}. Full list is included in the PDF.`));
}
function exportScr(m) {
  m.append(h('h1', {}, 'Export PDF'));
  if (!S.groups.length) return m.append(h('div', { class: 'empty-state' }, 'Create a group first.'));
  let g = S.groups.find(x => x.id === S.exp.g) || S.groups[0]; S.exp.g = g.id;
  const gs = h('select', { onchange: e => { S.exp.g = e.target.value; render(); } }, S.groups.map(x => h('option', { value: x.id, selected: x === g }, `${x.name} (${gItems(x).length})`)));
  const cols = g.cols || vis().map((x, i) => x ? i : -1).filter(i => i >= 0), sc = g.sort != null ? g.sort : T();
  const ss = h('select', { onchange: e => { g.sort = +e.target.value; save('groups'); render(); } }, h('option', { value: -1 }, 'Order: original'), S.headers.map((x, i) => h('option', { value: i, selected: sc === i }, 'Order by ' + x)));
  const pv = gItems(g).slice(0, 8), n = gItems(g).length;
  m.append(gs, h('h2', {}, 'Columns in PDF'), h('div', { class: 'panel' }, S.headers.map((x, i) => h('label', { class: 'opt' }, h('input', { type: 'checkbox', checked: cols.includes(i), onchange: e => { const s = new Set(cols); e.target.checked ? s.add(i) : s.delete(i); g.cols = [...s].sort((a, b) => a - b); save('groups'); render(); } }), x))), ss,
    h('h2', {}, 'Preview'), h('div', { class: 'panel scr' }, h('table', { class: 'pv' }, h('tr', {}, cols.map(c => h('th', { class: S.info.right[c] ? 'r' : '' }, S.headers[c]))), pv.map(r => h('tr', {}, cols.map(c => h('td', { class: S.info.right[c] ? 'r' : '' }, F(r, c)))))), n > 8 ? h('p', {}, `…and ${n - 8} more`) : null),
    h('div', { class: 'row' }, h('button', { class: 'btn', disabled: !n || !cols.length, onclick: () => { dl(pdfFile(g)); toast('PDF saved to Downloads'); } }, '⬇ Save PDF'),
      h('button', { class: 'btn alt', disabled: !n || !cols.length, onclick: async () => { const f = pdfFile(g); try { if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: g.name }); else dl(f); } catch (e) { } } }, '↗ Open / Share'),
      h('button', { class: 'btn alt', disabled: !n || !cols.length, onclick: () => { const u = URL.createObjectURL(pdfFile(g)); if (!open(u, '_blank')) location.href = u; } }, '🖨 Print')),
    h('p', {}, 'To print on Android: tap Open / Share, choose a PDF viewer, then use its Print option.'));
}
function settings(m) {
  const th = h('select', { onchange: e => { S.prefs.theme = e.target.value; applyTheme(); save('prefs'); } }, ['auto', 'light', 'dark'].map(v => h('option', { value: v, selected: S.prefs.theme === v }, 'Theme: ' + v)));
  const cur = h('input', { value: S.prefs.cur, maxlength: 4, oninput: e => { S.prefs.cur = e.target.value; save('prefs'); } });
  const ts = h('select', { onchange: e => { S.prefs.title = +e.target.value; save('prefs'); } }, h('option', { value: -1 }, 'Title column: auto'), S.headers.map((x, i) => h('option', { value: i, selected: S.prefs.title === i }, 'Title column: ' + x)));
  const bi = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async e => { try { await restore(JSON.parse(await e.target.files[0].text())); } catch (x) { toast('Not a valid backup file'); } e.target.value = ''; } });
  m.append(h('h1', {}, 'Settings'), h('div', { class: 'panel' }, th, h('h2', {}, 'Currency symbol'), cur, S.rows.length ? [h('h2', {}, 'Product title'), ts] : null),
    h('div', { class: 'panel' }, h('h2', {}, 'Backup'), h('p', {}, 'A backup contains your data, groups and settings.'), bi, h('div', { class: 'row' }, h('button', { class: 'btn alt', onclick: () => dl(new File([JSON.stringify({ app: 'invoice-catalogue', v: 1, data: { headers: S.headers, rows: S.rows.map(r => ({ id: r.id, v: r.v })), meta: S.meta }, groups: S.groups, prefs: S.prefs })], 'catalogue-backup.json', { type: 'application/json' })) }, 'Export backup'), h('button', { class: 'btn alt', onclick: () => bi.click() }, 'Restore backup'))),
    h('div', { class: 'panel' }, h('h2', {}, 'Clear data'), h('div', { class: 'row' },
      h('button', { class: 'btn red', onclick: async () => { if (!confirm('Clear imported products? Your groups are kept.')) return; setData([], []); S.meta = {}; S.sel.clear(); S.prefs.vis = []; await Promise.all([save('data'), save('prefs')]); go('home'); } }, 'Clear products'),
      h('button', { class: 'btn red', onclick: async () => { if (!confirm('Delete ALL products, groups and settings? This cannot be undone.')) return; setData([], []); S.meta = {}; S.groups = []; S.sel.clear(); S.prefs = { theme: 'auto', cur: 'R', title: -1, vis: [] }; await Promise.all([save('data'), save('groups'), save('prefs')]); applyTheme(); go('home'); } }, 'Delete everything'))));
}
async function restore(b) {
  if (!b || b.app !== 'invoice-catalogue') throw 0;
  if (!confirm('Restore this backup? It replaces your current data, groups and settings.')) return;
  setData(b.data.headers, b.data.rows); S.meta = b.data.meta || {}; S.groups = b.groups || []; S.prefs = Object.assign({ theme: 'auto', cur: 'R', title: -1, vis: [] }, b.prefs);
  await Promise.all([save('data'), save('groups'), save('prefs')]); applyTheme(); toast('Backup restored'); go('home');
}

/* ---------- boot ---------- */
(async () => {
  const [d, g, p] = await Promise.all([DB.get('data'), DB.get('groups'), DB.get('prefs')]);
  if (d && d.headers) { setData(d.headers, d.rows); S.meta = d.meta || {}; } else S.info = colInfo([], []);
  if (g) S.groups = g; if (p) S.prefs = Object.assign(S.prefs, p);
  applyTheme(); render();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
})();
