/* core.js - CSV parsing, number formatting and a dependency-free PDF writer. Works in browser and Node. */
(function (g) {
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const first = text.split(/\r?\n/, 1)[0];
    let delim = ',', best = 0;
    for (const d of [',', ';', '\t', '|']) {
      let n = 0, q = false;
      for (const c of first) { if (c === '"') q = !q; else if (c === d && !q) n++; }
      if (n > best) { best = n; delim = d; }
    }
    const rows = []; let r = [], f = '', q = false;
    const endRow = () => { r.push(f); f = ''; if (r.some(x => x.trim())) rows.push(r); r = []; };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"' && f === '') q = true;
      else if (c === delim) { r.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; endRow(); }
      else f += c;
    }
    if (f || r.length) endRow();
    return rows;
  }
  function decode(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder('windows-1252').decode(buf); }
  }
  function toTable(text) {
    const raw = parseCSV(text); if (raw.length < 1) return null;
    const seen = {};
    const headers = raw[0].map((x, i) => { let n = x.trim() || 'Column ' + (i + 1); if (seen[n]) n += ' (' + (++seen[n]) + ')'; else seen[n] = 1; return n; });
    const used = {};
    const rows = raw.slice(1).map((r, i) => {
      const v = headers.map((_, j) => (r[j] || '').trim());
      let id = v[0] || 'row' + i;
      if (used[id]) { id += '#' + used[id]++; } else used[id] = 1;
      return { id, v };
    });
    return { headers, rows };
  }
  const num = s => {
    const t = String(s).replace(/[\s\u00a0]/g, '').replace(/^[A-Za-z$€£]+/, '');
    return /^-?\d+([.,]\d+)?$/.test(t) ? parseFloat(t.replace(',', '.')) : NaN;
  };
  const MONEY = /cost|price|sell|incl|excl|amount|total|value|vat|retail|rrp/i, CODE = /code|ref|barcode|sku|\bid\b|^no\.?$/i, TITLE = /desc|name|product|item|title/i;
  function colInfo(headers, rows) {
    const n = headers.length, num_ = [], money = [], right = [];
    for (let j = 0; j < n; j++) {
      let ne = 0, nn = 0;
      for (const r of rows) { if (r.v[j] !== '') { ne++; if (!isNaN(num(r.v[j]))) nn++; } }
      const isNum = ne > 0 && nn / ne >= 0.9;
      num_[j] = isNum; money[j] = isNum && MONEY.test(headers[j]);
      right[j] = isNum && j !== 0 && !CODE.test(headers[j]);
    }
    let title = headers.findIndex(h => TITLE.test(h));
    if (title < 0) title = num_.findIndex(x => !x);
    return { num: num_, money, right, title: title < 0 ? 0 : title };
  }
  const grp = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  function fmt(info, j, s, cur) {
    if (s === '' || !info.right[j]) return s;
    const n = num(s); if (isNaN(n)) return s;
    const neg = n < 0 ? '-' : '', a = Math.abs(n);
    if (info.money[j]) { const [i, d] = a.toFixed(2).split('.'); return neg + (cur || '') + grp(i) + '.' + d; }
    const [i, d] = String(+a.toFixed(2)).split('.'); return neg + grp(i) + (d ? '.' + d : '');
  }

  /* ---- PDF writer: A4, Helvetica, repeating table header, wrapped cells, page footers ---- */
  function makePDF(o, measure) {
    const { title, sub, cols, rows } = o, FS = 9, LH = 11.5, PAD = 4, M = 36;
    const cp = { '€': 128, '‚': 130, '„': 132, '…': 133, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '™': 153 };
    const enc = s => { let r = ''; for (const ch of String(s)) { let c = ch.charCodeAt(0); if (cp[ch]) c = cp[ch]; else if (c > 255 || c < 32) c = c === 9 ? 32 : 63; r += (c === 40 || c === 41 || c === 92) ? '\\' + ch : String.fromCharCode(c); } return r; };
    const wrap = (s, w) => {
      const out = [];
      for (const para of String(s).split(/\n/)) {
        let line = '';
        for (let word of para.split(/\s+/)) {
          if (!word) continue;
          while (measure(word) > w) { let k = word.length; while (k > 1 && measure(word.slice(0, k)) > w) k--; if (line) { out.push(line); line = ''; } out.push(word.slice(0, k)); word = word.slice(k); }
          const t = line ? line + ' ' + word : word;
          if (measure(t) <= w) line = t; else { out.push(line); line = word; }
        }
        out.push(line);
      }
      return out;
    };
    let W = 595, H = 842;
    const mx = cols.map((c, j) => Math.max(measure(c.name, 1), ...rows.slice(0, 800).map(r => measure(r[j] || ''))));
    const t = mx.indexOf(Math.max(...mx));
    const layout = () => {
      const av = W - 2 * M, w = mx.map(x => Math.min(x + 2 * PAD + 2, 150));
      let others = w.reduce((a, b, i) => i === t ? a : a + b, 0);
      if (av - others < 110 && W === 595) { W = 842; H = 595; return layout(); }
      if (av - others < 110) { const k = (av - 110) / others; w.forEach((x, i) => { if (i !== t) w[i] = x * k; }); others = av - 110; }
      w[t] = av - others; return w;
    };
    const w = layout(), xs = []; { let x = M; w.forEach(v => { xs.push(x); x += v; }); }
    const f2 = n => (+n).toFixed(2);
    const T = (x, y, s, b, sz, col) => `BT /F${b ? 2 : 1} ${sz} Tf ${col} rg ${f2(x)} ${f2(H - y)} Td (${enc(s)}) Tj ET`;
    const R = (x, y, ww, hh, col) => `${col} rg ${f2(x)} ${f2(H - y - hh)} ${f2(ww)} ${f2(hh)} re f`;
    const INK = '0.1 0.11 0.13', GREY = '0.42 0.45 0.5', BRAND = '0.11 0.27 0.5', ZEB = '0.955 0.96 0.97';
    const pages = []; let ops, y;
    const header = () => { ops.push(R(M, y, W - 2 * M, 18, BRAND)); cols.forEach((c, j) => { const x = c.right ? xs[j] + w[j] - PAD - measure(c.name, 1) : xs[j] + PAD; ops.push(T(x, y + 12.5, c.name, 1, FS, '1 1 1')); }); y += 18; };
    const newPage = () => { ops = []; pages.push(ops); y = M; if (pages.length === 1) { ops.push(T(M, y + 16, title, 1, 18, BRAND)); ops.push(T(M, y + 31, sub, 0, 8.5, GREY)); y += 44; } header(); };
    newPage();
    if (!rows.length) ops.push(T(M + PAD, y + 14, 'No items in this group.', 0, FS, GREY));
    rows.forEach((r, i) => {
      const cells = cols.map((c, j) => wrap(r[j] || '', w[j] - 2 * PAD));
      const n = Math.max(...cells.map(c => c.length)), rh = n * LH + 6;
      if (y + rh > H - M - 14) newPage();
      if (i % 2) ops.push(R(M, y, W - 2 * M, rh, ZEB));
      cells.forEach((lines, j) => lines.forEach((ln, k) => {
        const x = cols[j].right ? xs[j] + w[j] - PAD - measure(ln) : xs[j] + PAD;
        const neg = cols[j].right && /^-/.test(r[j]) ? '0.75 0.1 0.1' : INK;
        ops.push(T(x, y + 3 + 9 + k * LH, ln, 0, FS, neg));
      }));
      ops.push(R(M, y + rh - 0.5, W - 2 * M, 0.5, '0.85 0.87 0.9'));
      y += rh;
    });
    const N = pages.length;
    pages.forEach((p, k) => { p.push(T(M, H - 20, title, 0, 8, GREY)); const s = `Page ${k + 1} of ${N}`; p.push(T(W - M - measure(s), H - 20, s, 0, 8, GREY)); });
    const body = [];
    body[1] = '<</Type/Catalog/Pages 2 0 R>>';
    body[2] = `<</Type/Pages/Count ${N}/Kids[${pages.map((_, k) => (6 + 2 * k) + ' 0 R').join(' ')}]>>`;
    body[3] = '<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>';
    body[4] = '<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>';
    body[5] = `<</Title(${enc(title)})/Producer(Invoice Catalogue)>>`;
    pages.forEach((p, k) => {
      const s = p.join('\n');
      body[6 + 2 * k] = `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${W} ${H}]/Resources<</Font<</F1 3 0 R/F2 4 0 R>>>>/Contents ${7 + 2 * k} 0 R>>`;
      body[7 + 2 * k] = `<</Length ${s.length}>>\nstream\n${s}\nendstream`;
    });
    let out = '%PDF-1.4\n'; const off = [];
    for (let i = 1; i < body.length; i++) { off[i] = out.length; out += `${i} 0 obj\n${body[i]}\nendobj\n`; }
    const xr = out.length;
    out += `xref\n0 ${body.length}\n0000000000 65535 f \n` + off.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<</Size ${body.length}/Root 1 0 R/Info 5 0 R>>\nstartxref\n${xr}\n%%EOF`;
    const u = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) u[i] = out.charCodeAt(i) & 255; return u;
  }
  g.Core = { parseCSV, decode, toTable, colInfo, fmt, num, makePDF };
  if (typeof module !== 'undefined') module.exports = g.Core;
})(typeof window !== 'undefined' ? window : globalThis);
