/* REPORT (balance PO: diterima / keluar) dan STOCK (barang yang sudah diterima lewat Goods Received) */
(function () {
  const ERP = window.ERP;
  const { $, esc, btn, norm, fmtDate } = ERP;
  const qty = (n) => (n == null ? '-' : ERP.fmtNum(n, Number.isInteger(+n) ? 0 : 2));
  const uniq = (a) => [...new Set(a.filter(Boolean))];
  const R = { q: '', from: null, to: null, status: 'all', pay: 'all' };
  const T = { q: '', from: null, to: null, tab: 'po', only: false };

  // Satu baris = satu varian pada satu PO, dipisah per Good (G) / Defect (D)
  const PAY_TXT = { paid: 'Sudah Dibayar', partial: 'Dibayar Sebagian', unpaid: 'Belum Dibayar' };
  const payBadge = (r) => ERP.badge(PAY_TXT[r.payStatus], { paid: 'ok', partial: 'warn', unpaid: 'mut' }[r.payStatus]);
  function ledger(pos, paidByGr) {
    paidByGr = paidByGr || {};
    const rows = [];
    pos.filter((p) => p.status === 'approved').forEach((p) => {
      p.items.forEach((i) => {
        const r = p.rc[i.id] || { G: 0, D: 0 }, o = p.ou[i.id] || { G: 0, D: 0 };
        const dosOf = (g) => p.dos.filter((d) => d.items.some((x) => x.po_item_id === i.id && (x.grade === 'D' ? 'D' : 'G') === g));
        const base = { poId: p.id, itemId: i.id, orderNo: i.order_no || '', poNo: p.po_number, supplier: p.supplier.name, brand: i.brand, model: i.model, compound: i.compound, gender: i.gender, color: i.color, size: i.size, unit: i.unit };
        const mk = (g) => {
          const ds = dosOf(g), isG = g === 'G', rec = isG ? r.G : r.D, out = isG ? o.G : o.D;
          // status pembayaran per baris: nilai bayar penerimaan (qty x harga x total/subtotal PO) vs yang sudah dibayar
          const fac = Number(p.subtotal) > 0 ? Number(p.total) / Number(p.subtotal) : 1;
          const grs = p.receipts.flatMap((rc) => rc.items.filter((x) => x.po_item_id === i.id && (x.grade === 'D' ? 'D' : 'G') === g));
          const payable = ERP.round(ERP.sum(grs, (x) => Number(x.qty) * Number(i.price) * fac), p.currency), paid = ERP.round(ERP.sum(grs, (x) => paidByGr[x.id] || 0), p.currency);
          const payStatus = payable > 0.005 && paid >= payable - 0.005 ? 'paid' : paid > 0.005 ? 'partial' : 'unpaid';
          return {
            ...base, payable, paid, payStatus, grade: g, custs: uniq(ds.map((d) => d.client.name)), doNos: uniq(ds.map((d) => d.do_number)),
            sjNos: uniq(p.receipts.filter((rc) => rc.items.some((x) => x.po_item_id === i.id && (x.grade === 'D' ? 'D' : 'G') === g)).map((rc) => rc.delivery_note_no)),
            inv: uniq([...(p.invNos || []), ...ds.map((d) => d.inv_no)]), fp: uniq([...(p.fpNos || []), ...ds.map((d) => d.fp_no)]),
            poDate: p.po_date, rcvDate: p.lastRecv[i.id + '|' + g] || null,
            qtyPO: isG ? Number(i.qty) : null, recv: rec, short: isG ? Math.max(0, Number(i.qty) - r.G - r.D) : null, out,
            balReport: rec - out, balStock: rec - out,
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
      { label: 'No SJ', v: (r) => r.sjNos.join(', '), k: (r) => r.sjNos.join(', ') },
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
      ...(rep ? [{ label: 'Status Bayar', html: payBadge, cls: 'nw', k: (r) => PAY_TXT[r.payStatus] }] : []),
    ];
  }

  function filterBar(prefix, S) {
    return `<div class="toolbar">${ERP.searchBox('q', 'Cari supplier / customer / no PO / no SJ / no DO / no INV / no FP / brand / model / compound / color / size…')}</div>
      <div class="filters"><div class="fld"><span>Dari tanggal</span>${ERP.dateInput('from', S.from)}</div><div class="fld"><span>Sampai tanggal</span>${ERP.dateInput('to', S.to)}</div>`;
  }
  const searchText = (r) => [partnerTxt(r), r.poNo, r.sjNos.join(' '), r.doNos.join(' '), r.inv.join(' '), r.fp.join(' '), r.brand, r.model, r.compound, r.gender, r.color, r.size].join(' ').toLowerCase();
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
      const all = ledger(data.pos, data.paidByGr);
      if (!R.from) R.from = ERP.today().slice(0, 4) + '-01-01';
      if (!R.to) R.to = ERP.today();
      v.innerHTML = filterBar('r', R) + `<div class="fld"><span>Status penerimaan</span><select id="f-st"><option value="all">Semua</option><option value="short">Belum lengkap diterima (ada Kurang)</option><option value="full">Sudah lengkap diterima</option></select></div>
        <div class="fld"><span>Status pembayaran</span><select id="f-pay"><option value="all">Semua</option><option value="paid">Sudah Dibayar</option><option value="partial">Dibayar Sebagian</option><option value="unpaid">Belum Dibayar</option></select></div>
        <div class="tb-actions" style="margin-left:auto">${btn('download', 'Export ke Excel', 'id="b-exp"')}${btn('print', 'Print', 'id="b-prt"')}</div></div><div id="list"></div><div class="note" id="foot"></div>
        <div class="note">Satu baris = satu varian pada satu PO. <b>Qty Out</b> = barang keluar lewat Delivery Order. <b>Balance</b> = Qty Diterima − Qty Out. <b>Kurang</b> = Qty PO − (Good + Defect yang sudah diterima). <b>Status Bayar</b> mengikuti nilai barang yang sudah diterima: Sudah Dibayar / Dibayar Sebagian / Belum Dibayar (baris yang belum diterima dianggap Belum Dibayar).</div>`;
      $('#q').value = R.q; $('#f-st').value = R.status; $('#f-pay').value = R.pay;
      const cols = colsFor('report');
      const rowsNow = () => all.filter((r) => r.poDate >= R.from && r.poDate <= R.to && (!R.q || searchText(r).includes(R.q)) && (R.status === 'all' || (R.status === 'short' ? r.short > 0 : r.grade === 'G' && r.short === 0)) && (R.pay === 'all' || r.payStatus === R.pay));
      let cur = [];
      const draw = () => { cur = rowsNow(); $('#list').innerHTML = ERP.table(cols.map((c) => ({ ...c, label: c.label })), cur.map((r, i) => ({ ...r, id: r.poId + i })), { empty: 'Tidak ada data pada periode/filter ini.', cls: 'rpt t3', limit: 1000 }); $('#foot').innerHTML = cur.length ? footTotals(cur, 'report') : ''; };
      draw();
      $('#q').oninput = ERP.debounce((e) => { R.q = norm(e.target.value.trim()); draw(); });
      $('#f-st').onchange = (e) => { R.status = e.target.value; draw(); };
      $('#f-pay').onchange = (e) => { R.pay = e.target.value; draw(); };
      v.onchange = (e) => { if (e.target.name === 'from') R.from = ERP.parseDate(e.target.value) || R.from; if (e.target.name === 'to') R.to = ERP.parseDate(e.target.value) || R.to; if (e.target.name === 'from' || e.target.name === 'to') draw(); };
      $('#b-exp').onclick = () => ERP.xlsxExport(`Report_${R.from}_${R.to}.xlsx`, 'Report', cols.map((c) => c.label), cur.map((r) => cols.map((c) => c.k(r))));
      $('#b-prt').onclick = () => ERP.printTable('Report PO — Penerimaan & Keluar', cols.map((c, i) => ({ label: c.label, num: (c.cls || '').includes('n'), v: (r) => c.k(r) })), cur, `Periode ${fmtDate(R.from)} s/d ${fmtDate(R.to)}`);
    },
  });

  /* ================= STOCK ================= */
  const minD = (a) => a.filter(Boolean).sort()[0] || '';
  const uniqA = (a) => [...new Set(a.filter(Boolean))];
  const sameVar = (x, y) => ['brand', 'model', 'compound', 'gender', 'color'].every((k) => String(x[k] || '').trim().toLowerCase() === String(y[k] || '').trim().toLowerCase());
  // kelompok Report Balance dari baris PO: Model + Color + No Order, per PO. Qty per size = diterima (Good + Defect)
  function groupsFromPO(refs, data) {
    const m = new Map();
    refs.forEach(({ p, i }) => {
      const k = [p.po_number, i.brand, i.model, i.compound, i.gender, i.color, i.order_no].map((x) => String(x || '').trim().toLowerCase()).join('|');
      const so = data.soByNo[String(i.order_no || '').trim().toLowerCase()];
      const sl = so ? so.items.filter((x) => (i.item_id && x.item_id === i.item_id) || ERP.itemKey(x) === ERP.itemKey(i)) : [];
      const g = m.get(k) || { model: i.model, gender: i.gender, color: i.color, orderNo: i.order_no || '', poDate: p.po_date, poNo: p.po_number, type: so ? 'SALES' : 'SHTG', qty: 0, sizes: {}, est: [], etd: [], xfd: [] };
      const r = p.rc[i.id] || { G: 0, D: 0 }, sz = String(i.size || '').trim().toUpperCase();
      g.qty += Number(i.qty); if (sz) g.sizes[sz] = (g.sizes[sz] || 0) + r.G + r.D;
      g.est.push(i.est_date || (so && minD(sl.map((x) => x.est_date))) || p.est_date); sl.forEach((x) => { g.etd.push(x.etd); g.xfd.push(x.xfd); });
      m.set(k, g);
    });
    return [...m.values()].map((g) => ({ ...g, estDate: minD(g.est), etd: minD(g.etd), xfd: minD(g.xfd) }));
  }
  // kelompok Report Balance dari baris Sales Order: Model + Color per SO; qty = qty SO, per size = diterima lewat PO
  function groupsFromSO(refs) {
    const m = new Map();
    refs.forEach(({ s, it }) => {
      const k = [s.so_number, it.brand, it.model, it.compound, it.gender, it.color].map((x) => String(x || '').trim().toLowerCase()).join('|');
      const g = m.get(k) || { model: it.model, gender: it.gender, color: it.color, orderNo: s.so_number, poDates: [], poNos: [], type: 'SALES', qty: 0, sizes: {}, est: [], etd: [], xfd: [] };
      const sz = String(it.size || '').trim().toUpperCase();
      g.qty += Number(it.qty); if (sz) g.sizes[sz] = (g.sizes[sz] || 0) + it.recv;
      g.est.push(it.est_date); g.etd.push(it.etd); g.xfd.push(it.xfd);
      it.poLines.forEach(({ p }) => { g.poDates.push(p.po_date); g.poNos.push(p.po_number); });
      m.set(k, g);
    });
    return [...m.values()].map((g) => ({ ...g, estDate: minD(g.est), etd: minD(g.etd), xfd: minD(g.xfd), poDate: minD(g.poDates), poNo: uniqA(g.poNos).join(', ') }));
  }
  const fname = (x) => String(x || '').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 60);

  ERP.register('stock', {
    async render(v) {
      const data = await ERP.loadPO();
      const all = ledger(data.pos, data.paidByGr).filter((r) => r.recv > 0);
      // baris per item Sales Order (hanya SO yang sudah approved)
      const soAll = data.sos.filter((s) => s.status === 'approved').flatMap((s) => s.items.map((it) => ({ s, it, soId: s.id, soNo: s.so_number, soDate: s.so_date, client: s.client.name, brand: it.brand, model: it.model, compound: it.compound, gender: it.gender, color: it.color, size: it.size, unit: it.unit, qtySO: Number(it.qty), recv: it.recv, out: it.out, bal: it.recv - it.out, short: Math.max(0, Number(it.qty) - it.recv), est: it.est_date, etd: it.etd, xfd: it.xfd })));
      if (!T.from) T.from = ERP.today().slice(0, 4) + '-01-01';
      if (!T.to) T.to = ERP.today();
      v.innerHTML = filterBar('t', T) + `<label class="chk" style="padding-bottom:8px"><input type="checkbox" id="f-only"> Hanya stok &gt; 0</label>
        <div class="tb-actions" style="margin-left:auto">${btn('grid', 'Export Report Balance (format size 1–20)', 'id="b-bal"')}${btn('download', 'Export tabel ke Excel', 'id="b-exp"')}${btn('print', 'Print', 'id="b-prt"')}</div></div>
        <div class="tabs" id="tabs"></div><div id="list"></div><div class="note" id="foot"></div>
        <div class="note">Stok berasal dari barang yang diterima lewat Goods Received. <b>Qty In</b> = diterima, <b>Qty Out</b> = keluar lewat Delivery Order, <b>Balance</b> = stok di tangan, dipisah Good (G) / Defect (D). Tab <b>Rincian per SO</b> menghubungkan Sales Order ke PO lewat <b>No Order</b> di baris PO (filter tanggalnya memakai tanggal SO). Ikon <b>grid</b> di tiap baris = export Excel format Report Balance untuk baris itu.</div>`;
      $('#q').value = T.q; $('#f-only').checked = T.only;
      const cols = colsFor('stock');
      const actCol = { label: '', cls: 'act', html: (r) => btn('grid', 'Export Excel (format Report Balance) baris ini', `data-xb="${r.ri}"`, 'sm') };
      const sumCols = [{ label: 'Brand', html: (r) => `<b>${esc(r.brand)}</b>`, m: 'mt', k: (r) => r.brand }, { label: 'Model', v: (r) => r.model, k: (r) => r.model }, { label: 'Compound', v: (r) => r.compound, k: (r) => r.compound }, { label: 'Gender', v: (r) => r.gender, k: (r) => r.gender }, { label: 'Color', v: (r) => r.color, k: (r) => r.color }, { label: 'Size', v: (r) => r.size, k: (r) => r.size }, { label: 'Satuan', v: (r) => r.unit, k: (r) => r.unit }, { label: 'G/D', html: gd, k: (r) => r.grade },
        { label: 'Qty In', v: (r) => qty(r.recv), cls: 'n', k: (r) => r.recv }, { label: 'Qty Out', v: (r) => qty(r.out), cls: 'n', k: (r) => r.out }, { label: 'Stok', html: (r) => `<b>${qty(r.balStock)}</b>`, cls: 'n', k: (r) => r.balStock }];
      const soCols = [
        { label: 'Tgl SO', v: (r) => fmtDate(r.soDate), cls: 'nw', k: (r) => fmtDate(r.soDate) }, { label: 'Client', v: (r) => r.client, cls: 'sup', m: 'mf', k: (r) => r.client },
        { label: 'No SO', html: (r) => `<b>${esc(r.soNo)}</b>`, cls: 'nw', m: 'mt', k: (r) => r.soNo },
        { label: 'Brand', v: (r) => r.brand, k: (r) => r.brand }, { label: 'Model', v: (r) => r.model, k: (r) => r.model }, { label: 'Compound', v: (r) => r.compound, k: (r) => r.compound }, { label: 'Gender', v: (r) => r.gender, k: (r) => r.gender },
        { label: 'Color', v: (r) => r.color, k: (r) => r.color }, { label: 'Size', v: (r) => r.size, k: (r) => r.size },
        { label: 'Est Date', v: (r) => fmtDate(r.est), cls: 'nw', m: 'mh', k: (r) => fmtDate(r.est) }, { label: 'ETD', v: (r) => fmtDate(r.etd), cls: 'nw', m: 'mh', k: (r) => fmtDate(r.etd) }, { label: 'XFD', v: (r) => fmtDate(r.xfd), cls: 'nw', m: 'mh', k: (r) => fmtDate(r.xfd) },
        { label: 'Qty SO', v: (r) => qty(r.qtySO), cls: 'n', k: (r) => r.qtySO }, { label: 'Qty Diterima', v: (r) => qty(r.recv), cls: 'n', k: (r) => r.recv },
        { label: 'Kurang', html: (r) => (r.short ? `<b class="neg">${qty(r.short)}</b>` : '0'), cls: 'n', k: (r) => r.short },
        { label: 'Qty Out', v: (r) => qty(r.out), cls: 'n', k: (r) => r.out }, { label: 'Stok', html: (r) => `<b>${qty(r.bal)}</b>`, cls: 'n', k: (r) => r.bal },
      ];
      let cur = [], curCols = cols, curRaw = [];
      const filtered = () => all.filter((r) => (r.rcvDate || '') >= T.from && (r.rcvDate || '') <= T.to && (!T.q || searchText(r).includes(T.q)) && (!T.only || r.balStock > 0));
      const soFiltered = () => soAll.filter((r) => r.soDate >= T.from && r.soDate <= T.to && (!T.q || [r.soNo, r.client, r.brand, r.model, r.compound, r.gender, r.color, r.size].join(' ').toLowerCase().includes(T.q)) && (!T.only || r.bal > 0));
      const summarize = (rows) => {
        const m = new Map();
        rows.forEach((r) => { const k = ERP.itemKey(r) + '|' + r.unit + '|' + r.grade; const e = m.get(k) || { ...r, recv: 0, out: 0, balStock: 0 }; e.recv += r.recv; e.out += r.out; e.balStock += r.balStock; m.set(k, e); });
        return [...m.values()].sort((a, b) => ERP.attrText(a).localeCompare(ERP.attrText(b), undefined, { numeric: true }) || a.grade.localeCompare(b.grade));
      };
      const draw = () => {
        $('#tabs').innerHTML = [['po', 'Rincian per PO'], ['so', 'Rincian per SO'], ['sum', 'Ringkasan per varian']].map(([k, l]) => `<button data-t="${k}" class="${T.tab === k ? 'on' : ''}">${l}</button>`).join('');
        if (T.tab === 'so') {
          curRaw = soFiltered(); cur = curRaw; curCols = soCols;
          $('#foot').innerHTML = cur.length ? `Total: Qty SO <b>${qty(sumRow(cur, 'qtySO'))}</b> · Diterima <b>${qty(sumRow(cur, 'recv'))}</b> · Kurang <b>${qty(sumRow(cur, 'short'))}</b> · Qty Out <b>${qty(sumRow(cur, 'out'))}</b> · Stok <b>${qty(sumRow(cur, 'bal'))}</b>` : '';
        } else {
          curRaw = filtered(); cur = T.tab === 'po' ? curRaw : summarize(curRaw); curCols = T.tab === 'po' ? cols : sumCols;
          $('#foot').innerHTML = cur.length ? footTotals(cur, 'stock') : '';
        }
        $('#list').innerHTML = ERP.table([...curCols, actCol], cur.map((r, i) => ({ ...r, id: (r.poId || r.soId) + '_' + i, ri: i })), { empty: T.tab === 'so' ? 'Belum ada Sales Order (approved) pada periode/filter ini.' : 'Belum ada barang yang diterima pada periode/filter ini.', cls: T.tab === 'sum' ? 't3' : 'rpt t3', limit: 1000 });
      };
      draw();
      $('#q').oninput = ERP.debounce((e) => { T.q = norm(e.target.value.trim()); draw(); });
      $('#f-only').onchange = (e) => { T.only = e.target.checked; draw(); };
      $('#tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { T.tab = b.dataset.t; draw(); } };
      v.onchange = (e) => { if (e.target.name === 'from') T.from = ERP.parseDate(e.target.value) || T.from; if (e.target.name === 'to') T.to = ERP.parseDate(e.target.value) || T.to; if (e.target.name === 'from' || e.target.name === 'to') draw(); };

      // ---- export Report Balance ----
      // satu kelompok selalu lengkap semua ukuran (termasuk ukuran yang belum diterima), supaya Qty PO & balance benar
      const poRefsOf = (rows) => { const seen = new Set(); return rows.flatMap((r) => { const p = data.pos.find((x) => x.id === r.poId); const i0 = p && p.items.find((x) => x.id === r.itemId); if (!i0) return []; return p.items.filter((i) => sameVar(i, i0) && String(i.order_no || '') === String(i0.order_no || '') && !seen.has(i.id) && seen.add(i.id)).map((i) => ({ p, i })); }); };
      const exportBalance = (rows, label) => {
        if (T.tab === 'so') { const seen = new Set(); ERP.balanceExport(groupsFromSO(rows.flatMap((r) => r.s.items.filter((it) => sameVar(it, r.it) && !seen.has(it.id) && seen.add(it.id)).map((it) => ({ s: r.s, it })))), `Report_Balance_${fname(label)}.xlsx`, 'QTY SO'); }
        else ERP.balanceExport(groupsFromPO(poRefsOf(rows), data), `Report_Balance_${fname(label)}.xlsx`);
      };
      $('#b-bal').onclick = () => exportBalance(curRaw, 'Stock_' + (T.tab === 'so' ? 'SO' : T.tab === 'po' ? 'PO' : 'Varian') + '_' + ERP.today());
      $('#list').onclick = (e) => {
        const b = e.target.closest('[data-xb]'); if (!b) return;
        const r = cur[+b.dataset.xb]; if (!r) return;
        if (T.tab === 'so') { // semua ukuran Model + Color yang sama pada SO itu
          const rows = soAll.filter((x) => x.soId === r.soId && sameVar(x, r)); exportBalance(rows, `${r.soNo}_${r.model}_${r.color}`);
        } else if (T.tab === 'po') { // semua ukuran Model + Color + No Order yang sama pada PO itu
          const p = data.pos.find((x) => x.id === r.poId), rows = p.items.filter((i) => sameVar(i, r) && String(i.order_no || '') === String(r.orderNo || '')).map((i) => ({ poId: p.id, itemId: i.id }));
          exportBalance(rows, `${r.poNo}_${r.model}_${r.color}`);
        } else { // ringkasan varian: Model + Color yang sama di semua PO approved
          const rows = data.pos.filter((p) => p.status === 'approved').flatMap((p) => p.items.filter((i) => sameVar(i, r)).map((i) => ({ poId: p.id, itemId: i.id })));
          exportBalance(rows, `${r.model}_${r.color}`);
        }
      };
      const tabName = { po: 'Rincian per PO', so: 'Rincian per SO', sum: 'Ringkasan per Varian' }[T.tab];
      $('#b-exp').onclick = () => ERP.xlsxExport(`Stock_${{ po: 'PO', so: 'SO', sum: 'Varian' }[T.tab]}_${ERP.today()}.xlsx`, 'Stock', curCols.map((c) => c.label), cur.map((r) => curCols.map((c) => c.k(r))));
      $('#b-prt').onclick = () => ERP.printTable('Stock — ' + { po: 'Rincian per PO', so: 'Rincian per SO', sum: 'Ringkasan per Varian' }[T.tab], curCols.map((c) => ({ label: c.label, num: (c.cls || '').includes('n'), v: (r) => c.k(r) })), cur, `Periode ${fmtDate(T.from)} s/d ${fmtDate(T.to)}`);
    },
  });
})();
