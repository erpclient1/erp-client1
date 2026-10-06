/* REPORT (balance PO: diterima / keluar) dan STOCK (barang yang sudah diterima lewat Goods Received) */
(function () {
  const ERP = window.ERP;
  const { $, esc, btn, norm, fmtDate } = ERP;
  const qty = (n) => (n == null ? '-' : ERP.fmtNum(n, Number.isInteger(+n) ? 0 : 2));
  const uniq = (a) => [...new Set(a.filter(Boolean))];
  const R = { q: '', from: null, to: null, status: 'all' };
  const T = { q: '', from: null, to: null, tab: 'po', only: false };

  // Satu baris = satu varian pada satu PO, dipisah per Good (G) / Defect (D)
  function ledger(pos) {
    const rows = [];
    pos.filter((p) => p.status === 'approved').forEach((p) => {
      p.items.forEach((i) => {
        const r = p.rc[i.id] || { G: 0, D: 0 }, o = p.ou[i.id] || { G: 0, D: 0 };
        const dosOf = (g) => p.dos.filter((d) => d.items.some((x) => x.po_item_id === i.id && (x.grade === 'D' ? 'D' : 'G') === g));
        const base = { poId: p.id, poNo: p.po_number, supplier: p.supplier.name, brand: i.brand, model: i.model, compound: i.compound, gender: i.gender, color: i.color, size: i.size, unit: i.unit };
        const mk = (g) => {
          const ds = dosOf(g), isG = g === 'G', rec = isG ? r.G : r.D, out = isG ? o.G : o.D;
          return {
            ...base, grade: g, custs: uniq(ds.map((d) => d.client.name)), doNos: uniq(ds.map((d) => d.do_number)),
            inv: uniq([p.invoice_no, ...ds.map((d) => d.inv_no)]), fp: uniq([p.fp_no, ...ds.map((d) => d.fp_no)]),
            poDate: p.po_date, rcvDate: p.lastRecv[i.id + '|' + g] || null,
            qtyPO: isG ? Number(i.qty) : null, recv: rec, short: isG ? Math.max(0, Number(i.qty) - r.G - r.D) : null, out,
            balReport: isG ? Number(i.qty) - out : rec - out, balStock: rec - out,
          };
        };
        rows.push(mk('G'));
        if (r.D > 0 || o.D > 0) rows.push(mk('D'));
      });
    });
    return rows;
  }

  const partner = (r) => `${esc(r.supplier)}${r.custs.length ? `<small>→ ${esc(r.custs.join(', '))}</small>` : ''}`;
  const partnerTxt = (r) => r.supplier + (r.custs.length ? ' → ' + r.custs.join(', ') : '');
  const gd = (r) => ERP.badge(r.grade, r.grade === 'D' ? 'err' : 'ok');
  const sumRow = (rows, k) => ERP.sum(rows, (r) => (r[k] == null ? 0 : r[k]));

  function colsFor(kind) {
    const rep = kind === 'report';
    const dateOf = (r) => (rep ? r.poDate : r.rcvDate);
    return [
      { label: 'Tanggal', v: (r) => fmtDate(dateOf(r)), cls: 'nw', k: (r) => fmtDate(dateOf(r)) },
      { label: 'Nama Supplier / Customer', html: partner, cls: 'sup', m: 'mf', k: partnerTxt },
      { label: 'No PO', v: (r) => r.poNo, cls: 'nw', m: 'mt', k: (r) => r.poNo },
      { label: 'No DO', v: (r) => r.doNos.join(', '), k: (r) => r.doNos.join(', ') },
      { label: 'No INV', v: (r) => r.inv.join(', '), m: 'mh', k: (r) => r.inv.join(', ') },
      { label: 'No FP', v: (r) => r.fp.join(', '), m: 'mh', k: (r) => r.fp.join(', ') },
      { label: 'Brand', v: (r) => r.brand, k: (r) => r.brand }, { label: 'Model', v: (r) => r.model, k: (r) => r.model }, { label: 'Compound', v: (r) => r.compound, k: (r) => r.compound },
      { label: 'Gender', v: (r) => r.gender, k: (r) => r.gender }, { label: 'G/D', html: gd, k: (r) => r.grade },
      { label: 'Color', v: (r) => r.color, k: (r) => r.color }, { label: 'Size', v: (r) => r.size, k: (r) => r.size },
      { label: 'Qty PO', v: (r) => qty(r.qtyPO), cls: 'n', k: (r) => (r.qtyPO == null ? '' : r.qtyPO) },
      ...(rep ? [{ label: 'Qty Diterima', v: (r) => qty(r.recv), cls: 'n', k: (r) => r.recv }, { label: 'Kurang', html: (r) => (r.short ? `<b class="neg">${qty(r.short)}</b>` : r.short === 0 ? '0' : '-'), cls: 'n', k: (r) => (r.short == null ? '' : r.short) }]
        : [{ label: 'Qty In', v: (r) => qty(r.recv), cls: 'n', k: (r) => r.recv }]),
      { label: 'Qty Out', v: (r) => qty(r.out), cls: 'n', k: (r) => r.out },
      { label: 'Balance', html: (r) => `<b>${qty(rep ? r.balReport : r.balStock)}</b>`, cls: 'n', k: (r) => (rep ? r.balReport : r.balStock) },
    ];
  }

  function filterBar(prefix, S) {
    return `<div class="toolbar">${ERP.searchBox('q', 'Cari supplier / customer / no PO / no DO / no INV / no FP / brand / model / compound / color / size…')}</div>
      <div class="filters"><div class="fld"><span>Dari tanggal</span>${ERP.dateInput('from', S.from)}</div><div class="fld"><span>Sampai tanggal</span>${ERP.dateInput('to', S.to)}</div>`;
  }
  const searchText = (r) => [partnerTxt(r), r.poNo, r.doNos.join(' '), r.inv.join(' '), r.fp.join(' '), r.brand, r.model, r.compound, r.gender, r.color, r.size].join(' ').toLowerCase();
  const footTotals = (rows, kind) => {
    const g = rows.filter((r) => r.grade === 'G');
    return kind === 'report'
      ? `Total (baris Good): Qty PO <b>${qty(sumRow(g, 'qtyPO'))}</b> · Diterima G <b>${qty(sumRow(g, 'recv'))}</b> / D <b>${qty(sumRow(rows.filter((r) => r.grade === 'D'), 'recv'))}</b> · Kurang <b>${qty(sumRow(g, 'short'))}</b> · Qty Out <b>${qty(sumRow(rows, 'out'))}</b>`
      : `Total: Qty In <b>${qty(sumRow(rows, 'recv'))}</b> · Qty Out <b>${qty(sumRow(rows, 'out'))}</b> · Stok (Balance) <b>${qty(sumRow(rows, 'balStock'))}</b> <small>(G ${qty(sumRow(rows.filter((r) => r.grade === 'G'), 'balStock'))} / D ${qty(sumRow(rows.filter((r) => r.grade === 'D'), 'balStock'))})</small>`;
  };

  /* ================= REPORT ================= */
  ERP.register('report', {
    async render(v) {
      const data = await ERP.loadPO();
      const all = ledger(data.pos);
      if (!R.from) R.from = ERP.today().slice(0, 4) + '-01-01';
      if (!R.to) R.to = ERP.today();
      v.innerHTML = filterBar('r', R) + `<div class="fld"><span>Status penerimaan</span><select id="f-st"><option value="all">Semua</option><option value="short">Belum lengkap diterima (ada Kurang)</option><option value="full">Sudah lengkap diterima</option></select></div>
        <div class="tb-actions" style="margin-left:auto">${btn('download', 'Export ke Excel', 'id="b-exp"')}${btn('print', 'Print', 'id="b-prt"')}</div></div><div id="list"></div><div class="note" id="foot"></div>
        <div class="note">Satu baris = satu varian pada satu PO. <b>Qty Out</b> = barang keluar lewat Delivery Order. <b>Balance</b> = Qty PO − Qty Out (baris D: Diterima − Out). <b>Kurang</b> = Qty PO − (Good + Defect yang sudah diterima).</div>`;
      $('#q').value = R.q; $('#f-st').value = R.status;
      const cols = colsFor('report');
      const rowsNow = () => all.filter((r) => r.poDate >= R.from && r.poDate <= R.to && (!R.q || searchText(r).includes(R.q)) && (R.status === 'all' || (R.status === 'short' ? r.short > 0 : r.grade === 'G' && r.short === 0)));
      let cur = [];
      const draw = () => { cur = rowsNow(); $('#list').innerHTML = ERP.table(cols.map((c) => ({ ...c, label: c.label })), cur.map((r, i) => ({ ...r, id: r.poId + i })), { empty: 'Tidak ada data pada periode/filter ini.', cls: 'rpt t3', limit: 1000 }); $('#foot').innerHTML = cur.length ? footTotals(cur, 'report') : ''; };
      draw();
      $('#q').oninput = ERP.debounce((e) => { R.q = norm(e.target.value.trim()); draw(); });
      $('#f-st').onchange = (e) => { R.status = e.target.value; draw(); };
      v.onchange = (e) => { if (e.target.name === 'from') R.from = ERP.parseDate(e.target.value) || R.from; if (e.target.name === 'to') R.to = ERP.parseDate(e.target.value) || R.to; if (e.target.name === 'from' || e.target.name === 'to') draw(); };
      $('#b-exp').onclick = () => ERP.xlsxExport(`Report_${R.from}_${R.to}.xlsx`, 'Report', cols.map((c) => c.label), cur.map((r) => cols.map((c) => c.k(r))));
      $('#b-prt').onclick = () => ERP.printTable('Report PO — Penerimaan & Keluar', cols.map((c, i) => ({ label: c.label, num: (c.cls || '').includes('n'), v: (r) => c.k(r) })), cur, `Periode ${fmtDate(R.from)} s/d ${fmtDate(R.to)}`);
    },
  });

  /* ================= STOCK ================= */
  ERP.register('stock', {
    async render(v) {
      const data = await ERP.loadPO();
      const all = ledger(data.pos).filter((r) => r.recv > 0);
      if (!T.from) T.from = ERP.today().slice(0, 4) + '-01-01';
      if (!T.to) T.to = ERP.today();
      v.innerHTML = filterBar('t', T) + `<label class="chk" style="padding-bottom:8px"><input type="checkbox" id="f-only"> Hanya stok &gt; 0</label>
        <div class="tb-actions" style="margin-left:auto">${btn('download', 'Export ke Excel', 'id="b-exp"')}${btn('print', 'Print', 'id="b-prt"')}</div></div>
        <div class="tabs" id="tabs"></div><div id="list"></div><div class="note" id="foot"></div>
        <div class="note">Stok berasal dari barang yang diterima lewat Goods Received. <b>Qty In</b> = diterima, <b>Qty Out</b> = keluar lewat Delivery Order, <b>Balance</b> = stok di tangan, dipisah Good (G) / Defect (D).</div>`;
      $('#q').value = T.q; $('#f-only').checked = T.only;
      const cols = colsFor('stock');
      const sumCols = [{ label: 'Brand', html: (r) => `<b>${esc(r.brand)}</b>`, m: 'mt', k: (r) => r.brand }, { label: 'Model', v: (r) => r.model, k: (r) => r.model }, { label: 'Compound', v: (r) => r.compound, k: (r) => r.compound }, { label: 'Gender', v: (r) => r.gender, k: (r) => r.gender }, { label: 'Color', v: (r) => r.color, k: (r) => r.color }, { label: 'Size', v: (r) => r.size, k: (r) => r.size }, { label: 'Satuan', v: (r) => r.unit, k: (r) => r.unit }, { label: 'G/D', html: gd, k: (r) => r.grade },
        { label: 'Qty In', v: (r) => qty(r.recv), cls: 'n', k: (r) => r.recv }, { label: 'Qty Out', v: (r) => qty(r.out), cls: 'n', k: (r) => r.out }, { label: 'Stok', html: (r) => `<b>${qty(r.balStock)}</b>`, cls: 'n', k: (r) => r.balStock }];
      let cur = [], curCols = cols;
      const filtered = () => all.filter((r) => (r.rcvDate || '') >= T.from && (r.rcvDate || '') <= T.to && (!T.q || searchText(r).includes(T.q)) && (!T.only || r.balStock > 0));
      const summarize = (rows) => {
        const m = new Map();
        rows.forEach((r) => { const k = ERP.itemKey(r) + '|' + r.unit + '|' + r.grade; const e = m.get(k) || { ...r, recv: 0, out: 0, balStock: 0 }; e.recv += r.recv; e.out += r.out; e.balStock += r.balStock; m.set(k, e); });
        return [...m.values()].sort((a, b) => ERP.attrText(a).localeCompare(ERP.attrText(b), undefined, { numeric: true }) || a.grade.localeCompare(b.grade));
      };
      const draw = () => {
        $('#tabs').innerHTML = `<button data-t="po" class="${T.tab === 'po' ? 'on' : ''}">Rincian per PO</button><button data-t="sum" class="${T.tab === 'sum' ? 'on' : ''}">Ringkasan per varian</button>`;
        const f = filtered();
        cur = T.tab === 'po' ? f : summarize(f); curCols = T.tab === 'po' ? cols : sumCols;
        $('#list').innerHTML = ERP.table(curCols, cur.map((r, i) => ({ ...r, id: r.poId + i })), { empty: 'Belum ada barang yang diterima pada periode/filter ini.', cls: T.tab === 'po' ? 'rpt t3' : 't3', limit: 1000 });
        $('#foot').innerHTML = cur.length ? footTotals(cur, 'stock') : '';
      };
      draw();
      $('#q').oninput = ERP.debounce((e) => { T.q = norm(e.target.value.trim()); draw(); });
      $('#f-only').onchange = (e) => { T.only = e.target.checked; draw(); };
      $('#tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { T.tab = b.dataset.t; draw(); } };
      v.onchange = (e) => { if (e.target.name === 'from') T.from = ERP.parseDate(e.target.value) || T.from; if (e.target.name === 'to') T.to = ERP.parseDate(e.target.value) || T.to; if (e.target.name === 'from' || e.target.name === 'to') draw(); };
      $('#b-exp').onclick = () => ERP.xlsxExport(`Stock_${T.tab === 'po' ? 'PO' : 'Varian'}_${ERP.today()}.xlsx`, 'Stock', curCols.map((c) => c.label), cur.map((r) => curCols.map((c) => c.k(r))));
      $('#b-prt').onclick = () => ERP.printTable(T.tab === 'po' ? 'Stock — Rincian per PO' : 'Stock — Ringkasan per Varian', curCols.map((c) => ({ label: c.label, num: (c.cls || '').includes('n'), v: (r) => c.k(r) })), cur, `Periode ${fmtDate(T.from)} s/d ${fmtDate(T.to)}`);
    },
  });
})();
