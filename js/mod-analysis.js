/* Analisa: Harga Beli per item & per Supplier (berdasarkan PO yang sudah di-approve + riwayat import) */
(function () {
  const ERP = window.ERP;
  const { $, esc, btn, norm, fmtDate } = ERP;
  const DB = ERP.DB;
  const S = { tab: 'price', q: '', from: null, to: null, open: new Set() };
  const HIST_HEAD = ['Tanggal PO', 'Supplier', 'Brand', 'Model', 'Compound', 'Gender', 'Colour', 'Size', 'Mata Uang', 'Qty', 'Harga Satuan', 'Tanggal Invoice', 'Tanggal Bayar'];

  const stats = (arr) => {
    const prices = arr.map((t) => t.price);
    const min = Math.min(...prices), max = Math.max(...prices);
    return { min, max, avg: ERP.sum(prices) / prices.length, fl: min > 0 ? ((max - min) / min) * 100 : 0, tx: new Set(arr.map((t) => t.po)).size, sups: new Set(arr.map((t) => t.supplier)).size };
  };
  const avgDays = (arr) => { const m = new Map(); arr.forEach((t) => { if (t.payDays != null) m.set(t.po, t.payDays); }); return m.size ? ERP.sum([...m.values()]) / m.size : null; };
  const groupBy = (arr, f) => { const m = new Map(); arr.forEach((x) => { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return m; };
  const pct = (n) => ERP.fmtNum(n, 1) + '%';
  const days = (n) => (n == null ? '-' : ERP.fmtNum(n, 1) + ' hari');

  function buildTx(pos, hist) {
    const tx = [];
    pos.filter((p) => p.status === 'approved').forEach((p) => {
      const payDays = p.paidDate ? ERP.daysBetween(p.invoice_date || p.po_date, p.paidDate) : null;
      p.items.forEach((i) => tx.push({ date: p.po_date, supplier: p.supplier.name, contact: p.supplier.contact_person || '', brand: i.brand || '', model: i.model || '', compound: i.compound || '', gender: i.gender || '', color: i.color || '', size: i.size || '', cur: p.currency, qty: Number(i.qty), price: Number(i.price), po: p.id, payDays }));
    });
    hist.forEach((h) => tx.push({ date: h.tx_date, supplier: h.supplier_name || '(tanpa nama)', contact: '', brand: h.brand || '', model: h.model || '', compound: h.compound || '', gender: h.gender || '', color: h.color || '', size: h.size || '', cur: h.currency || 'IDR', qty: Number(h.qty) || 0, price: Number(h.price) || 0, po: 'h' + h.id, payDays: h.pay_date ? ERP.daysBetween(h.invoice_date || h.tx_date, h.pay_date) : null }));
    return tx;
  }

  const attrs = (t) => ({ brand: t.brand, model: t.model, compound: t.compound, gender: t.gender, color: t.color, size: t.size });
  function priceRows(tx) {
    return [...groupBy(tx, (t) => ERP.itemKey(t) + '|' + t.cur).entries()].map(([k, a]) => ({ id: k, ...attrs(a[0]), cur: a[0].cur, ...stats(a) })).sort((a, b) => ERP.attrText(a).localeCompare(ERP.attrText(b), undefined, { numeric: true }));
  }
  function supplierRows(tx) {
    return [...groupBy(tx, (t) => t.supplier + '|' + t.cur).entries()].map(([k, a]) => {
      const items = [...groupBy(a, (t) => ERP.itemKey(t)).entries()].map(([ik, ia]) => ({ id: k + '#' + ik, ...attrs(ia[0]), ...stats(ia) })).sort((x, y) => ERP.attrText(x).localeCompare(ERP.attrText(y), undefined, { numeric: true }));
      return { id: k, supplier: a[0].supplier, contact: a[0].contact, cur: a[0].cur, nItems: items.length, tx: new Set(a.map((t) => t.po)).size, total: ERP.sum(a, (t) => t.qty * t.price), payDays: avgDays(a), items };
    }).sort((a, b) => a.supplier.localeCompare(b.supplier));
  }

  ERP.register('analysis', {
    async render(v) {
      const [data, hist] = await Promise.all([ERP.loadPO(), DB.list('hist_purchases')]);
      const all = buildTx(data.pos, hist);
      if (!S.from) S.from = ERP.today().slice(0, 4) + '-01-01';
      if (!S.to) S.to = ERP.today();
      const canW = ERP.can.write();
      v.innerHTML = `<div class="toolbar">${ERP.searchBox('q', 'Cari brand / model / compound / gender / color / size / supplier / kontak…')}</div>
        <div class="filters"><div class="fld"><span>Dari tanggal</span>${ERP.dateInput('from', S.from)}</div><div class="fld"><span>Sampai tanggal</span>${ERP.dateInput('to', S.to)}</div>
          <div class="tb-actions" style="margin-left:auto">${canW ? btn('upload', 'Import riwayat pembelian (Excel)', 'id="b-imp"') + btn('template', 'Unduh template import', 'id="b-tpl"') : ''}${btn('download', 'Export ke Excel', 'id="b-exp"')}${btn('print', 'Print', 'id="b-prt"')}</div></div>
        <div class="tabs" id="tabs"></div><div id="list"></div><div class="note">Dihitung dari PO berstatus Approved${hist.length ? ` + ${hist.length} baris riwayat import` : ''}. Fluktuasi = (tertinggi − terendah) ÷ terendah. Waktu pembayaran = tanggal invoice supplier (atau tanggal PO bila belum ada invoice) sampai lunas. Mata uang dipisah, tanpa konversi.</div>`;
      $('#q').value = S.q;
      let curRows = [];

      const filtered = () => all.filter((t) => t.date >= S.from && t.date <= S.to && (!S.q || [ERP.attrText(t), t.supplier, t.contact].some((x) => norm(x).includes(S.q))));
      const priceCols = [
        { label: 'Brand', html: (r) => `<b>${esc(r.brand)}</b>`, m: 'mt' }, { label: 'Model', v: (r) => r.model }, { label: 'Compound', v: (r) => r.compound }, { label: 'Gender', v: (r) => r.gender }, { label: 'Color', v: (r) => r.color }, { label: 'Size', v: (r) => r.size },
        { label: 'Harga Terendah', html: (r) => ERP.fmtMoney(r.min, r.cur), cls: 'r' }, { label: 'Harga Tertinggi', html: (r) => ERP.fmtMoney(r.max, r.cur), cls: 'r' },
        { label: 'Rata-rata', html: (r) => ERP.fmtMoney(r.avg, r.cur), cls: 'r' }, { label: 'Fluktuasi', html: (r) => pct(r.fl), cls: 'n' },
        { label: 'Jml Supplier', v: (r) => r.sups, cls: 'n' }, { label: 'Jml Transaksi', v: (r) => r.tx, cls: 'n' },
      ];
      const supCols = [
        { label: '', cls: 'mh', html: (r) => btn('chevron', 'Tampilkan item', `data-open="${esc(r.id)}"`, 'sm') },
        { label: 'Supplier', html: (r) => `<b>${esc(r.supplier)}</b>${r.contact ? `<small>${esc(r.contact)}</small>` : ''}<span class="mob-only">${btn('chevron', 'Tampilkan item', `data-open="${esc(r.id)}"`, 'sm')}</span>`, m: 'mt' },
        { label: 'Mata uang', v: (r) => r.cur }, { label: 'Jml Item', v: (r) => r.nItems, cls: 'n' }, { label: 'Jml Transaksi', v: (r) => r.tx, cls: 'n' },
        { label: 'Total Pembelian', html: (r) => ERP.fmtMoney(r.total, r.cur), cls: 'n nw' }, { label: 'Waktu Pembayaran (rata-rata)', v: (r) => days(r.payDays), cls: 'n nw' },
      ];
      const subCols = [{ label: 'Brand', html: (r) => `<b>${esc(r.brand)}</b>`, m: 'mt' }, { label: 'Model', v: (r) => r.model }, { label: 'Compound', v: (r) => r.compound }, { label: 'Gender', v: (r) => r.gender }, { label: 'Color', v: (r) => r.color }, { label: 'Size', v: (r) => r.size }, { label: 'Terendah', html: (r) => ERP.fmtNum(r.min, 2), cls: 'n' }, { label: 'Tertinggi', html: (r) => ERP.fmtNum(r.max, 2), cls: 'n' }, { label: 'Rata-rata', html: (r) => ERP.fmtNum(r.avg, 2), cls: 'n' }, { label: 'Fluktuasi', html: (r) => pct(r.fl), cls: 'n' }, { label: 'Jml Transaksi', v: (r) => r.tx, cls: 'n' }];

      const draw = () => {
        $('#tabs').innerHTML = `<button data-t="price" class="${S.tab === 'price' ? 'on' : ''}">Harga Beli (per item)</button><button data-t="sup" class="${S.tab === 'sup' ? 'on' : ''}">Supplier</button>`;
        const tx = filtered();
        if (S.tab === 'price') { curRows = priceRows(tx); $('#list').innerHTML = ERP.table(priceCols, curRows, { empty: 'Tidak ada data pembelian pada periode ini.' }); }
        else {
          curRows = supplierRows(tx);
          if (!curRows.length) { $('#list').innerHTML = '<div class="empty">Tidak ada data pembelian pada periode ini.</div>'; return; }
          const head = supCols.map((c) => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('');
          const body = curRows.map((r) => `<tr>${supCols.map((c) => `<td data-label="${esc(c.label)}" class="${c.cls || ''} ${c.m || ''}">${c.html ? c.html(r) : esc(c.v(r))}</td>`).join('')}</tr>${S.open.has(r.id) ? `<tr class="sub"><td colspan="${supCols.length}">${ERP.table(subCols, r.items)}</td></tr>` : ''}`).join('');
          $('#list').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
        }
      };
      draw();
      $('#q').oninput = ERP.debounce((e) => { S.q = norm(e.target.value.trim()); draw(); });
      v.onchange = (e) => { if (e.target.name === 'from') S.from = ERP.parseDate(e.target.value) || S.from; if (e.target.name === 'to') S.to = ERP.parseDate(e.target.value) || S.to; if (e.target.name === 'from' || e.target.name === 'to') draw(); };
      $('#tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { S.tab = b.dataset.t; draw(); } };
      $('#list').onclick = (e) => { const b = e.target.closest('[data-open]'); if (!b) return; const k = b.dataset.open; S.open.has(k) ? S.open.delete(k) : S.open.add(k); draw(); };

      const period = `Periode ${fmtDate(S.from)} s/d ${fmtDate(S.to)}`;
      const exportData = () => S.tab === 'price'
        ? { head: ['Brand', 'Model', 'Compound', 'Gender', 'Color', 'Size', 'Mata Uang', 'Harga Terendah', 'Harga Tertinggi', 'Harga Rata-rata', 'Fluktuasi %', 'Jumlah Supplier', 'Jumlah Transaksi'], rows: curRows.map((r) => [r.brand, r.model, r.compound, r.gender, r.color, r.size, r.cur, r.min, r.max, r.avg, +r.fl.toFixed(2), r.sups, r.tx]), name: 'Analisa_HargaBeli' }
        : { head: ['Supplier', 'Kontak', 'Mata Uang', 'Brand', 'Model', 'Compound', 'Gender', 'Color', 'Size', 'Harga Terendah', 'Harga Tertinggi', 'Harga Rata-rata', 'Fluktuasi %', 'Jumlah Transaksi', 'Waktu Pembayaran Supplier (hari, rata-rata)'], rows: curRows.flatMap((r) => r.items.map((i) => [r.supplier, r.contact, r.cur, i.brand, i.model, i.compound, i.gender, i.color, i.size, i.min, i.max, i.avg, +i.fl.toFixed(2), i.tx, r.payDays == null ? '' : +r.payDays.toFixed(1)])), name: 'Analisa_Supplier' };
      $('#b-exp').onclick = () => { const d = exportData(); ERP.xlsxExport(`${d.name}_${S.from}_${S.to}.xlsx`, 'Analisa', d.head, d.rows); };
      $('#b-prt').onclick = () => {
        const d = exportData();
        ERP.printTable(S.tab === 'price' ? 'Analisa Harga Beli' : 'Analisa Supplier', d.head.map((h, i) => ({ label: h, num: i >= (S.tab === 'price' ? 7 : 9), v: (r) => { const x = r[i]; return typeof x === 'number' ? ERP.fmtNum(x, Number.isInteger(x) ? 0 : 2) : x; } })), d.rows, period);
      };
      if ($('#b-tpl')) $('#b-tpl').onclick = () => ERP.xlsxExport('Template_Riwayat_Pembelian.xlsx', 'Riwayat', HIST_HEAD, [['05-Jan-26', 'PT Contoh', 'Aero', 'Runner X', 'EVA-60', 'Man', 'Black', '9', 'IDR', 100, 185000, '06-Jan-26', '20-Jan-26']]);
      if ($('#b-imp')) $('#b-imp').onclick = async () => {
        const f = await ERP.pickFile(); if (!f) return;
        try {
          const data2 = await ERP.xlsxRead(f);
          const recs = []; let skip = 0;
          for (const r of data2) {
            const g = (...k) => String(ERP.pick(r, ...k) ?? '').trim();
            const tx_date = ERP.toISO(ERP.pick(r, 'tanggal po', 'tanggal')), price = ERP.num(ERP.pick(r, 'harga satuan', 'harga'));
            if (!tx_date || !g('brand') || !g('model', 'model name') || !(price > 0)) { skip++; continue; }
            const cur = g('mata uang', 'currency').toUpperCase() || 'IDR';
            recs.push({ tx_date, supplier_name: g('supplier', 'nama supplier'), brand: g('brand'), model: g('model', 'model name'), compound: g('compound', 'compound name'), gender: g('gender'), color: g('colour', 'color'), size: g('size'), currency: ERP.curMap[cur] ? cur : 'IDR', qty: ERP.num(ERP.pick(r, 'qty', 'jumlah')) || 1, price, invoice_date: ERP.toISO(ERP.pick(r, 'tanggal invoice')) || null, pay_date: ERP.toISO(ERP.pick(r, 'tanggal bayar', 'tanggal pembayaran')) || null });
          }
          if (!recs.length) { ERP.toast('Tidak ada baris valid (butuh Tanggal PO, Brand, Model, Harga Satuan)', 'err'); return; }
          await DB.insert('hist_purchases', recs);
          ERP.toast(`${recs.length} baris riwayat diimport${skip ? ', ' + skip + ' dilewati' : ''}`); ERP.refresh();
        } catch (e) { ERP.toast('Import gagal: ' + e.message, 'err'); }
      };
    },
  });
})();
