/* Helper umum: format, ikon, modal, tabel, tanggal, excel, print */
(function () {
  const ERP = (window.ERP = window.ERP || {});
  const p2 = (n) => String(n).padStart(2, '0');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

  ERP.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const esc = ERP.esc;
  ERP.$ = (s, r) => (r || document).querySelector(s);
  ERP.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  ERP.sum = (a, f) => a.reduce((t, x) => t + (f ? f(x) : x), 0);

  /* ---------- Tanggal DD-MMM-YY ---------- */
  ERP.today = () => { const d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  ERP.fmtDate = (iso) => {
    if (!iso) return '-';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? m[3] + '-' + MON[+m[2] - 1] + '-' + m[1].slice(2) : String(iso);
  };
  ERP.fmtDateTime = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return isNaN(d) ? '-' : ERP.fmtDate(d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate())) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  };
  ERP.romanMonth = (iso) => ROMAN[+iso.slice(5, 7) - 1];
  // Terima: DD-MMM-YY, DD-MMM-YYYY, DD/MM/YY(YY), DD-MM-YYYY, YYYY-MM-DD. Hasil ISO atau ''.
  ERP.parseDate = (str) => {
    str = String(str == null ? '' : str).trim();
    if (!str) return '';
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(str);
    let y, mo, d;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = /^(\d{1,2})[-\/ .]([A-Za-z]{3,})[-\/ .](\d{2,4})$/.exec(str))) {
      const idx = MON.findIndex((x) => x.toLowerCase() === m[2].slice(0, 3).toLowerCase());
      const idn = { mei: 4, agu: 7, agt: 7, okt: 9, des: 11, ags: 7 }[m[2].slice(0, 3).toLowerCase()];
      mo = (idx >= 0 ? idx : idn != null ? idn : -1) + 1; d = +m[1]; y = +m[3];
    } else if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/.exec(str))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
    else return '';
    if (y < 100) y += 2000;
    if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return '';
    const dt = new Date(y, mo - 1, d);
    if (dt.getMonth() !== mo - 1) return '';
    return y + '-' + p2(mo) + '-' + p2(d);
  };
  // Nilai sel Excel (Date / serial / teks) -> ISO
  ERP.toISO = (v) => {
    if (v == null || v === '') return '';
    if (v instanceof Date) return isNaN(v) ? '' : v.getFullYear() + '-' + p2(v.getMonth() + 1) + '-' + p2(v.getDate());
    if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400000) + 12 * 3600000); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()); }
    return ERP.parseDate(v);
  };
  ERP.daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  ERP.addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };

  /* ---------- Angka & uang ---------- */
  ERP.curMap = {};
  ERP.decimals = (cur) => (ERP.curMap[cur] ? ERP.curMap[cur].decimals : 2);
  ERP.round = (n, cur) => { const f = Math.pow(10, ERP.decimals(cur)); return Math.round((n + Number.EPSILON) * f) / f; };
  ERP.fmtNum = (n, dec = 0) => Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  ERP.fmtMoney = (n, cur) => { const d = ERP.decimals(cur); return (cur ? cur + ' ' : '') + ERP.fmtNum(n, d); };
  ERP.num = (v) => {
    if (typeof v === 'number') return v;
    let s = String(v == null ? '' : v).trim().replace(/[^\d.,-]/g, '');
    if (!s) return 0;
    if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (s.includes(',')) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
    else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  /* ---------- Ikon ---------- */
  const IC = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/>',
    print: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2"/><rect x="6" y="14" width="12" height="7"/>',
    download: '<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/>',
    upload: '<path d="M12 15V3m0 0L8 7m4-4l4 4M4 21h16"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    truck: '<path d="M2 6h11v10H2zM13 9h4l4 4v3h-8"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 13A9 9 0 1111 3a7 7 0 0010 10z"/>',
    logout: '<path d="M9 21H5V3h4M16 17l5-5-5-5M21 12H9"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M17 4a4 4 0 010 8M22 21c0-3-2-5-4-5.6"/>',
    building: '<path d="M4 21V4h10v17M14 9h6v12M8 8h2M8 12h2M8 16h2M3 21h18"/>',
    box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11l2-8H6"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
    gear: '<path d="M4 6h9M19 6h1M4 12h3M13 12h7M4 18h11M21 18h-1"/><circle cx="16" cy="6" r="2.5"/><circle cx="10" cy="12" r="2.5"/><circle cx="18" cy="18" r="2.5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    backspace: '<path d="M21 5H8l-6 7 6 7h13z"/><path d="M12 9l5 6M17 9l-5 6"/>',
    template: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M12 11v6M9 14h6"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    reset: '<path d="M3 12a9 9 0 109-9 9 9 0 00-7 3.5M3 4v4h4"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5M3 17.5l9 5 9-5"/>',
    send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  };
  ERP.icon = (n, s = 18) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;
  // Tombol simbol; tulisan muncul saat di-hover (data-tip)
  ERP.btn = (icon, tip, attrs = '', cls = '') => `<button type="button" class="ibtn ${cls}" data-tip="${esc(tip)}" aria-label="${esc(tip)}" ${attrs}>${ERP.icon(icon)}</button>`;
  ERP.badge = (txt, kind = '') => `<span class="badge ${kind}">${esc(txt)}</span>`;

  /* ---------- Toast ---------- */
  ERP.toast = (msg, type = 'ok') => {
    let box = ERP.$('#toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + type; t.textContent = msg; box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, type === 'err' ? 5000 : 2800);
  };

  /* ---------- Modal ---------- */
  ERP.modal = ({ title, html, wide, actions = [], onMount, onClose }) => {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="m-head"><h3>${title}</h3>${ERP.btn('x', 'Tutup', 'data-close')}</div>
      <div class="m-body">${html}</div>
      ${actions.length ? `<div class="m-foot">${actions.map((a, i) => ERP.btn(a.icon, a.tip, `data-act="${i}"`, a.cls || '')).join('')}</div>` : ''}
    </div>`;
    document.body.appendChild(ov);
    document.body.classList.add('noscroll');
    const api = {
      el: ov,
      q: (s) => ov.querySelector(s),
      close() { ov.remove(); if (!ERP.$('.overlay')) document.body.classList.remove('noscroll'); if (onClose) onClose(); },
    };
    ov.addEventListener('mousedown', (e) => { ov._down = e.target === ov; });
    ov.addEventListener('click', (e) => {
      if (e.target === ov && ov._down) { api.close(); return; }
      if (e.target.closest('[data-close]')) api.close();
      const a = e.target.closest('[data-act]');
      if (a) { const act = actions[+a.dataset.act]; if (act.onClick) act.onClick(api, a); }
    });
    if (onMount) onMount(api);
    const f = ov.querySelector('input:not([type=hidden]):not(.dnative),select,textarea');
    if (f && !('ontouchstart' in window)) f.focus();
    return api;
  };
  ERP.confirm = (msg, { danger = false } = {}) => new Promise((res) => {
    let done = false;
    ERP.modal({
      title: 'Konfirmasi', html: `<p class="confirm-msg">${msg}</p>`,
      actions: [{ icon: 'x', tip: 'Batal', onClick: (m) => { done = true; m.close(); res(false); } }, { icon: 'check', tip: 'Ya, lanjutkan', cls: danger ? 'danger' : 'primary', onClick: (m) => { done = true; m.close(); res(true); } }],
      onClose: () => { if (!done) res(false); },
    });
  });

  /* ---------- Form helper ---------- */
  ERP.field = (label, input, cls = '') => `<label class="fld ${cls}"><span>${label}</span>${input}</label>`;
  ERP.formData = (root) => {
    const o = {};
    ERP.$$('[name]', root).forEach((el) => {
      if (el.classList.contains('dtxt')) o[el.name] = ERP.parseDate(el.value);
      else if (el.type === 'checkbox') o[el.name] = el.checked;
      else o[el.name] = el.value.trim();
    });
    return o;
  };
  ERP.options = (list, sel, valKey, labKey, blank) =>
    (blank != null ? `<option value="">${esc(blank)}</option>` : '') +
    list.map((x) => { const v = valKey ? x[valKey] : x; const l = labKey ? x[labKey] : x; return `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`; }).join('');

  /* ---------- Input tanggal DD-MMM-YY ---------- */
  ERP.dateInput = (name, iso, attrs = '') => {
    const t = iso ? ERP.fmtDate(iso) : '';
    return `<span class="dfield"><input type="text" class="dtxt" name="${name}" value="${t}" placeholder="DD-MMM-YY" autocomplete="off" ${attrs}>
      <button type="button" class="dcal ibtn" data-tip="Pilih tanggal" aria-label="Pilih tanggal">${ERP.icon('calendar', 16)}</button>
      <input type="date" class="dnative" tabindex="-1" value="${iso || ''}"></span>`;
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.dcal');
    if (!b) return;
    const nat = b.parentNode.querySelector('.dnative'), txt = b.parentNode.querySelector('.dtxt');
    nat.value = ERP.parseDate(txt.value) || '';
    try { nat.showPicker(); } catch (_) { nat.focus(); nat.click(); }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.classList && t.classList.contains('dnative')) {
      const txt = t.parentNode.querySelector('.dtxt');
      txt.value = t.value ? ERP.fmtDate(t.value) : '';
      txt.dispatchEvent(new Event('input', { bubbles: true })); txt.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (t.classList && t.classList.contains('dtxt')) {
      const iso = ERP.parseDate(t.value);
      t.classList.toggle('bad', !!t.value && !iso);
      if (iso) t.value = ERP.fmtDate(iso);
    }
  });

  /* ---------- Combo / autocomplete ---------- */
  ERP.combo = (input, search, onPick) => {
    let box = null, idx = -1, items = [];
    const close = () => { if (box) { box.remove(); box = null; } idx = -1; };
    const open = () => {
      items = search(input.value.trim()).slice(0, 30);
      if (!items.length) { close(); return; }
      if (!box) { box = document.createElement('div'); box.className = 'combo-box'; document.body.appendChild(box); }
      const r = input.getBoundingClientRect();
      box.style.left = r.left + 'px'; box.style.top = r.bottom + 2 + 'px'; box.style.width = Math.max(r.width, 240) + 'px';
      box.innerHTML = items.map((it, i) => `<div class="combo-item ${i === idx ? 'on' : ''}" data-i="${i}"><b>${esc(it.label)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div>`).join('');
      ERP._combo = { box, pick };
    };
    const pick = (i) => { const it = items[i]; if (!it) return; close(); onPick(it); };
    input.addEventListener('input', open);
    input.addEventListener('focus', open);
    input.addEventListener('blur', () => setTimeout(close, 180));
    input.addEventListener('keydown', (e) => {
      if (!box) return;
      if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, items.length - 1); open(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, 0); open(); e.preventDefault(); }
      else if (e.key === 'Enter' && idx >= 0) { pick(idx); e.preventDefault(); }
      else if (e.key === 'Escape') close();
    });
    return { close };
  };
  document.addEventListener('mousedown', (e) => {
    const it = e.target.closest && e.target.closest('.combo-item'); const c = ERP._combo;
    if (it && c && c.box.contains(it)) { e.preventDefault(); c.pick(+it.dataset.i); }
  }, true);

  /* ---------- Tabel (jadi kartu di HP) ---------- */
  // kolom: {label, v:(r)=>teks | html:(r)=>html, cls, m:'mt'|'mh'|'mf'}
  ERP.table = (cols, rows, opts = {}) => {
    if (!rows.length) return `<div class="empty">${opts.empty || 'Belum ada data.'}</div>`;
    const limit = opts.limit || 300;
    const shown = rows.slice(0, limit);
    const head = cols.map((c) => `<th class="${c.cls || ''} ${c.m || ''}">${esc(c.label)}</th>`).join('');
    const body = shown.map((r) => `<tr data-id="${esc(r.id)}" class="${opts.rowCls ? opts.rowCls(r) : ''}">${cols.map((c) => `<td data-label="${esc(c.label)}" class="${c.cls || ''} ${c.m || ''}">${c.html ? c.html(r) : esc(c.v(r))}</td>`).join('')}</tr>`).join('');
    return `<div class="tbl-wrap"><table class="tbl ${opts.cls || ''}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>` +
      (rows.length > limit ? `<div class="note">Menampilkan ${limit} dari ${rows.length} baris, persempit pencarian.</div>` : '');
  };
  ERP.searchBox = (id, ph) => `<div class="search">${ERP.icon('search', 18)}<input id="${id}" type="search" placeholder="${esc(ph)}" autocomplete="off"></div>`;
  ERP.debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  // Atribut varian item: Brand · Model · Gender · Color · Size
  ERP.attrText = (o) => [o.brand, o.model, o.compound, o.gender, o.color, o.size].filter(Boolean).join(' · ');
  ERP.itemKey = (o) => [o.brand, o.model, o.compound, o.gender, o.color, o.size].map((x) => String(x || '').trim().toLowerCase()).join('|');
  ERP.GENDERS = ['GS', 'Man', 'Woman', 'INF', 'PS', 'JR', 'KID'];
  ERP.SIZES = ['3T', '4', '4T', '5', '5T', '6', '6T', '7', '7T', '8', '8T', '9', '9T', '10', '10T', '11', '11T', '12', '12T', '13', '13T', '14', '14T', '15'];
  ERP.norm = (s) => String(s == null ? '' : s).toLowerCase();

  /* ---------- Excel ---------- */
  ERP.xlsxExport = (filename, sheet, headers, rows) => {
    if (!window.XLSX) { ERP.toast('Library Excel belum termuat (cek koneksi internet).', 'err'); return; }
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map((h, i) => ({ wch: Math.min(40, Math.max(String(h).length + 2, ...rows.slice(0, 50).map((r) => String(r[i] == null ? '' : r[i]).length + 2))) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 30));
    XLSX.writeFile(wb, filename);
  };
  ERP.pickFile = (accept = '.xlsx,.xls,.csv') => new Promise((res) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept; inp.style.display = 'none';
    inp.onchange = () => { res(inp.files[0] || null); inp.remove(); };
    document.body.appendChild(inp); inp.click();
  });
  ERP.xlsxRead = async (file) => {
    if (!window.XLSX) throw new Error('Library Excel belum termuat (cek koneksi internet).');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
    // kunci header dinormalkan: huruf kecil tanpa spasi berlebih
    return raw.map((r) => { const o = {}; Object.keys(r).forEach((k) => (o[String(k).trim().toLowerCase()] = r[k])); return o; });
  };
  ERP.pick = (row, ...keys) => { for (const k of keys) { const v = row[k.toLowerCase()]; if (v !== undefined && v !== '') return v; } return ''; };

  /* ---------- Print ---------- */
  ERP.printHTML = (title, body, { landscape = false } = {}) => {
    const co = ERP.company || {};
    const css = `*{box-sizing:border-box}body{font:12px/1.45 Arial,Helvetica,sans-serif;color:#111;margin:0;padding:14mm 12mm}
      h1{font-size:18px;margin:0 0 2px}h2{font-size:14px;margin:12px 0 6px}.muted{color:#555}.right{text-align:right}.center{text-align:center}
      .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px;gap:12px}
      .hdr .co b{font-size:15px}table{width:100%;border-collapse:collapse;margin:6px 0}th,td{border:1px solid #888;padding:4px 6px;text-align:left;vertical-align:top}
      th{background:#eee}td.n,th.n{text-align:right;white-space:nowrap}.kv td{border:none;padding:2px 6px 2px 0}.kv td:first-child{color:#555;width:150px;white-space:nowrap}
      .box{border:1px solid #888;padding:8px;margin:6px 0}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.urgent{border:3px solid #c00;color:#c00;font-weight:bold;font-size:15px;text-align:center;padding:4px;margin:6px 0}
      .sign{display:flex;gap:10px;margin-top:28px}.sign div{flex:1;text-align:center}.sign .line{border-bottom:1px solid #111;height:56px;margin-bottom:4px}
      .wm{color:#c00;font-weight:bold;text-align:center;border:2px dashed #c00;padding:4px;margin:6px 0}.tot td{border:none;padding:2px 6px}.tot td:first-child{text-align:right}
      @page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:0}@media print{body{padding:12mm}}`;
    const hdr = `<div class="hdr"><div class="co"><b>${esc(co.name || 'NAMA PERUSAHAAN')}</b><br>${esc(co.address || '')}<br>${esc([co.phone && 'Telp: ' + co.phone, co.email].filter(Boolean).join(' · '))}${co.npwp ? '<br>NPWP: ' + esc(co.npwp) : ''}</div><div class="right muted">Dicetak: ${ERP.fmtDate(ERP.today())}<br>${esc(ERP.user ? ERP.user.full_name : '')}</div></div>`;
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    f.contentDocument.open();
    f.contentDocument.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${hdr}${body}</body></html>`);
    f.contentDocument.close();
    setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 250);
  };
  // Cetak daftar dari definisi kolom
  ERP.printTable = (title, cols, rows, sub = '') => {
    const th = cols.map((c) => `<th class="${c.num ? 'n' : ''}">${esc(c.label)}</th>`).join('');
    const tr = rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? 'n' : ''}">${c.pv ? c.pv(r) : esc(c.v ? c.v(r) : '')}</td>`).join('')}</tr>`).join('');
    ERP.printHTML(title, `<h1>${esc(title)}</h1><div class="muted">${sub}</div><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table><div class="muted">Total ${rows.length} baris</div>`, { landscape: cols.length > 7 });
  };
})();
