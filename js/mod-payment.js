/* PEMBAYARAN (Finance): barang yang sudah diterima di Goods Received + harga dari PO -> pilih -> input FP & pembayaran */
(function () {
  const ERP = window.ERP;
  const { $, $$, esc, btn, norm, fmtDate, fmtMoney } = ERP;
  const DB = ERP.DB;
  const S = { supplierId: null, tab: 'due', showPaid: false, q: '' };
  const qty = (n) => ERP.fmtNum(n, Number.isInteger(+n) ? 0 : 2);

  // Satu baris = satu baris penerimaan (per surat jalan, per G/D).
  // Nilai bayar = qty x harga PO x (total PO / subtotal PO)  => sudah termasuk diskon, PPN dan PPh 23 secara proporsional.
  function buildLines(data, supplierId) {
    const out = [];
    data.pos.filter((p) => p.status === 'approved' && p.supplier_id === supplierId).forEach((p) => {
      const f = Number(p.subtotal) > 0 ? Number(p.total) / Number(p.subtotal) : 1;
      p.receipts.forEach((g) => g.items.forEach((x) => {
        const it = p.items.find((i) => i.id === x.po_item_id) || {};
        const payable = ERP.round(Number(x.qty) * Number(it.price) * f, p.currency);
        const paid = ERP.round(data.paidByGr[x.id] || 0, p.currency);
        out.push({ id: x.id, po: p, item: it, grade: x.grade === 'D' ? 'D' : 'G', qty: Number(x.qty), date: g.gr_date, sj: g.delivery_note_no, price: Number(it.price), payable, paid, left: ERP.round(payable - paid, p.currency) });
      }));
    });
    return out.sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.po.po_number.localeCompare(b.po.po_number));
  }
  const status = (l) => (l.left <= 0.005 ? ERP.badge('Lunas', 'ok') : l.paid > 0.005 ? ERP.badge('Sebagian', 'warn') : ERP.badge('Belum', 'mut'));

  function payModal(sel, sup, data) {
    const cur = sel[0].po.currency;
    if (sel.some((l) => l.po.currency !== cur)) { ERP.toast('Baris terpilih memakai mata uang berbeda; pilih satu mata uang saja', 'err'); return; }
    const total = ERP.round(ERP.sum(sel, (l) => l.left), cur), dec = ERP.decimals(cur);
    const pos = [...new Set(sel.map((l) => l.po.po_number))];
    const bank = ERP.banks.length ? `<select name="bank">${ERP.options(ERP.banks.map((b) => b.name), '', null, null, '— pilih bank asal —')}</select>` : '<input name="bank" placeholder="Nama bank asal (atau tambah daftar bank di Pengaturan)">';
    ERP.modal({
      title: 'Input FP & Pembayaran — ' + esc(sup.name), wide: true,
      html: `<dl class="kv" style="margin-bottom:10px"><dt>Barang dipilih</dt><dd>${sel.length} baris · ${pos.length} PO (${esc(pos.join(', '))})</dd><dt>Total sisa tagihan</dt><dd><b>${fmtMoney(total, cur)}</b></dd></dl>
        <div class="grid c2">${ERP.field('No Faktur Pajak (FP)', '<input name="fp_no" placeholder="mis. 010.000-26.00000001 (kosongkan bila tidak ada)">')}${ERP.field('Tanggal Pembayaran *', ERP.dateInput('pay_date', ERP.today()))}
        ${ERP.field('Jumlah (' + cur + ') *', `<input name="amount" inputmode="decimal" value="${total.toFixed(dec)}">`)}${ERP.field('Bank Asal *', bank)}
        ${ERP.field('Catatan', '<input name="note">', 'full')}</div>
        <div class="note" style="margin-top:8px">Jumlah boleh lebih kecil dari total (pembayaran sebagian); nilainya dibagi proporsional ke baris terpilih. Setelah disimpan, status pembayaran di PO terkait ikut terisi otomatis.</div>`,
      actions: [{ icon: 'check', tip: 'Simpan pembayaran', cls: 'primary', onClick: async (m) => {
        const d = ERP.formData(m.el); const A = ERP.round(ERP.num(d.amount), cur);
        if (!d.pay_date) { ERP.toast('Tanggal pembayaran wajib diisi', 'err'); return; }
        if (!(A > 0)) { ERP.toast('Jumlah harus lebih dari 0', 'err'); return; }
        if (A > total + 0.005) { ERP.toast('Jumlah melebihi total sisa tagihan', 'err'); return; }
        if (!d.bank) { ERP.toast('Pilih / isi Bank Asal', 'err'); return; }
        // bagi jumlah ke baris terpilih (proporsional terhadap sisa)
        let alloc = sel.map((l) => ({ l, a: A >= total - 0.005 ? l.left : ERP.round((A * l.left) / total, cur) }));
        const diff = ERP.round(A - ERP.sum(alloc, (x) => x.a), cur);
        if (Math.abs(diff) > 0) { const last = alloc.reduce((b, x) => (x.l.left - x.a > b.l.left - b.a ? x : b), alloc[0]); last.a = ERP.round(last.a + diff, cur); }
        alloc = alloc.filter((x) => x.a > 0);
        try {
          const [pm] = await DB.insert('payments', { supplier_id: sup.id, currency: cur, fp_no: d.fp_no || null, pay_date: d.pay_date, amount: A, bank: d.bank, note: d.note || null });
          await DB.insert('payment_items', alloc.map((x) => ({ payment_id: pm.id, gr_item_id: x.l.id, po_id: x.l.po.id, amount: x.a })));
          const byPo = {}; alloc.forEach((x) => (byPo[x.l.po.id] = (byPo[x.l.po.id] || 0) + x.a));
          await DB.insert('po_payments', Object.entries(byPo).map(([poId, amt]) => ({ po_id: poId, payment_id: pm.id, pay_date: d.pay_date, amount: ERP.round(amt, cur), note: 'Pembayaran' + (d.fp_no ? ' FP ' + d.fp_no : '') + ' · ' + d.bank })));
          m.close(); ERP.toast('Pembayaran disimpan — status di PO terkait diperbarui'); ERP.refresh();
        } catch (e) { ERP.toast('Gagal menyimpan: ' + e.message, 'err'); }
      } }],
    });
  }

  ERP.register('payment', {
    async render(v) {
      const data = await ERP.loadPO();
      const canPay = ERP.can.pay();
      const supMap = Object.fromEntries(data.sups.map((s) => [s.id, s]));
      v.innerHTML = `<div class="toolbar">${ERP.searchBox('sup', 'Pilih / cari nama supplier…')}<div class="tb-actions">${btn('download', 'Export Excel', 'id="b-exp"')}${btn('print', 'Print', 'id="b-prt"')}</div></div>
        <div class="tabs" id="tabs"></div><div id="list"></div><div id="bar"></div>`;
      const supInput = $('#sup');
      supInput.value = S.supplierId && supMap[S.supplierId] ? supMap[S.supplierId].name : '';
      ERP.combo(supInput, (q) => { const n = norm(q); return data.sups.filter((s) => !n || norm(s.name).includes(n) || norm(s.company_code).includes(n) || norm(s.code).includes(n)).map((s) => ({ s, label: s.name, sub: `${s.company_code || s.code} · ${s.currency}` })); },
        (it) => { S.supplierId = it.s.id; supInput.value = it.s.name; draw(); });
      supInput.addEventListener('input', () => { if (!supInput.value.trim()) { S.supplierId = null; draw(); } });

      let lines = [], shown = [], selected = new Set();
      const dueCols = [
        { label: 'Pilih / No PO', html: (l) => (canPay && l.left > 0.005 ? `<label class="chk"><input type="checkbox" data-sel="${l.id}" ${selected.has(l.id) ? 'checked' : ''}> <b>${esc(l.po.po_number)}</b></label>` : `<b>${esc(l.po.po_number)}</b>`), cls: 'nw', m: 'mt' },
        { label: 'Tgl Terima', v: (l) => fmtDate(l.date), cls: 'nw' }, { label: 'No Surat Jalan', v: (l) => l.sj },
        { label: 'Brand', v: (l) => l.item.brand }, { label: 'Model', v: (l) => l.item.model }, { label: 'Compound', v: (l) => l.item.compound }, { label: 'Gender', v: (l) => l.item.gender },
        { label: 'Color', v: (l) => l.item.color }, { label: 'Size', v: (l) => l.item.size }, { label: 'G/D', html: (l) => ERP.badge(l.grade, l.grade === 'D' ? 'err' : 'ok') },
        { label: 'Qty', v: (l) => qty(l.qty), cls: 'n' }, { label: 'Harga PO', html: (l) => ERP.fmtNum(l.price, ERP.decimals(l.po.currency)), cls: 'n' },
        { label: 'Nilai bayar', html: (l) => ERP.fmtNum(l.payable, ERP.decimals(l.po.currency)), cls: 'n' }, { label: 'Dibayar', html: (l) => ERP.fmtNum(l.paid, ERP.decimals(l.po.currency)), cls: 'n' },
        { label: 'Sisa', html: (l) => `<b>${ERP.fmtNum(Math.max(0, l.left), ERP.decimals(l.po.currency))}</b>`, cls: 'n' }, { label: 'Status', html: status },
      ];
      const histCols = [
        { label: 'Tanggal', v: (x) => fmtDate(x.pay_date), cls: 'nw', m: 'mt' }, { label: 'Supplier', v: (x) => (supMap[x.supplier_id] || {}).name || '-' }, { label: 'No FP', v: (x) => x.fp_no || '-' },
        { label: 'Jumlah', html: (x) => fmtMoney(x.amount, x.currency), cls: 'n nw' }, { label: 'Bank Asal', v: (x) => x.bank }, { label: 'Catatan', v: (x) => x.note || '', cls: 'hide-md', m: 'mh' },
        { label: 'PO', v: (x) => [...new Set(data.payItems.filter((i) => i.payment_id === x.id).map((i) => (data.pos.find((p) => p.id === i.po_id) || {}).po_number))].join(', '), m: 'mf' },
        { label: '', cls: 'act', html: (x) => btn('eye', 'Lihat rincian', `data-pv="${x.id}"`, 'sm') + (canPay ? btn('trash', 'Hapus pembayaran', `data-pd="${x.id}"`, 'sm danger') : '') },
      ];
      const payList = () => data.payments.filter((x) => !S.supplierId || x.supplier_id === S.supplierId).slice().sort((a, b) => String(b.pay_date).localeCompare(String(a.pay_date)));

      function bar() {
        const sel = lines.filter((l) => selected.has(l.id));
        const cur = sel.length ? sel[0].po.currency : '';
        $('#bar').innerHTML = S.tab === 'due' && canPay && S.supplierId ? `<div class="card" style="position:sticky;bottom:64px;margin-top:10px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:200px">Dipilih: <b>${sel.length}</b> baris · Total sisa: <b>${sel.length ? fmtMoney(ERP.sum(sel, (l) => l.left), cur) : '-'}</b></div>${btn('wallet', 'Input FP & Pembayaran', 'id="b-pay"' + (sel.length ? '' : ' disabled'), 'primary')}</div>` : '';
        if ($('#b-pay')) $('#b-pay').onclick = () => payModal(sel, supMap[S.supplierId], data);
      }
      function draw() {
        $('#tabs').innerHTML = `<button data-t="due" class="${S.tab === 'due' ? 'on' : ''}">Barang Diterima</button><button data-t="hist" class="${S.tab === 'hist' ? 'on' : ''}">Riwayat Pembayaran<span class="cnt">${payList().length}</span></button>`;
        if (S.tab === 'hist') { $('#list').innerHTML = ERP.table(histCols, payList(), { empty: 'Belum ada pembayaran.', cls: 'rpt t3' }); $('#bar').innerHTML = ''; return; }
        if (!S.supplierId) { $('#list').innerHTML = '<div class="empty">Pilih supplier terlebih dahulu. Daftar barang yang sudah diterima dan harganya akan tampil otomatis.</div>'; $('#bar').innerHTML = ''; return; }
        lines = buildLines(data, S.supplierId);
        selected = new Set([...selected].filter((id) => lines.some((l) => l.id === id && l.left > 0.005)));
        shown = lines.filter((l) => S.showPaid || l.left > 0.005);
        const due = ERP.sum(lines, (l) => Math.max(0, l.left));
        $('#list').innerHTML = `<div class="filters"><label class="chk"><input type="checkbox" id="f-paid" ${S.showPaid ? 'checked' : ''}> Tampilkan yang sudah lunas</label><div class="note" style="margin-left:auto">Total sisa tagihan supplier ini: <b>${lines.length ? fmtMoney(due, lines[0].po.currency) : '-'}</b>${canPay ? ' · centang baris lalu klik <b>Input FP &amp; Pembayaran</b>' : ''}</div></div>`
          + ERP.table(dueCols, shown, { empty: 'Belum ada barang diterima (PO approved) untuk supplier ini.', cls: 'rpt t3', limit: 1000 });
        bar();
      }
      draw();
      $('#tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { S.tab = b.dataset.t; draw(); } };
      $('#list').onchange = (e) => {
        if (e.target.id === 'f-paid') { S.showPaid = e.target.checked; draw(); return; }
        const c = e.target.closest('[data-sel]'); if (!c) return;
        if (c.checked) selected.add(c.dataset.sel); else selected.delete(c.dataset.sel);
        bar();
      };
      $('#list').onclick = async (e) => {
        const pv = e.target.closest('[data-pv]'), pd = e.target.closest('[data-pd]');
        if (pv) {
          const x = data.payments.find((y) => y.id === pv.dataset.pv);
          const items = data.payItems.filter((i) => i.payment_id === x.id);
          ERP.modal({ title: 'Rincian pembayaran', wide: true, html: `<dl class="kv"><dt>Supplier</dt><dd>${esc((supMap[x.supplier_id] || {}).name)}</dd><dt>Tanggal</dt><dd>${fmtDate(x.pay_date)}</dd><dt>No FP</dt><dd>${esc(x.fp_no) || '-'}</dd><dt>Jumlah</dt><dd><b>${fmtMoney(x.amount, x.currency)}</b></dd><dt>Bank asal</dt><dd>${esc(x.bank)}</dd><dt>Catatan</dt><dd>${esc(x.note) || '-'}</dd></dl><div class="sec-t">Barang yang dibayar</div>${ERP.table(
            [{ label: 'No PO', v: (i) => (data.pos.find((p) => p.id === i.po_id) || {}).po_number, cls: 'nw', m: 'mt' }, { label: 'Barang', v: (i) => { const g = lineOf(i.gr_item_id); return g ? ERP.attrText(g.item) + ' · ' + g.grade : '-'; }, m: 'mf' }, { label: 'No Surat Jalan', v: (i) => (lineOf(i.gr_item_id) || {}).sj || '' }, { label: 'Dibayar', html: (i) => fmtMoney(i.amount, x.currency), cls: 'n' }], items)}` });
        } else if (pd) {
          if (!(await ERP.confirm('Hapus pembayaran ini? Status bayar di PO terkait ikut dibatalkan.', { danger: true }))) return;
          try { await DB.remove('payments', pd.dataset.pd); ERP.toast('Pembayaran dihapus'); ERP.refresh(); } catch (err) { ERP.toast(err.message, 'err'); }
        }
      };
      function lineOf(grItemId) {
        for (const p of data.pos) for (const g of p.receipts) for (const x of g.items) if (x.id === grItemId) { const it = p.items.find((i) => i.id === x.po_item_id) || {}; return { item: it, grade: x.grade === 'D' ? 'D' : 'G', sj: g.delivery_note_no }; }
        return null;
      }

      $('#b-exp').onclick = () => {
        if (S.tab === 'hist') {
          const pl = payList();
          const det = [];
          pl.forEach((x) => data.payItems.filter((i) => i.payment_id === x.id).forEach((i) => { const po = data.pos.find((p) => p.id === i.po_id) || {}; const g = lineOf(i.gr_item_id) || { item: {} }; det.push([fmtDate(x.pay_date), (supMap[x.supplier_id] || {}).name, x.fp_no || '', x.bank, po.po_number, g.sj || '', g.item.brand, g.item.model, g.item.compound || '', g.item.gender || '', g.item.color || '', g.item.size || '', g.grade, Number(i.amount), x.currency]); }));
          ERP.xlsxExportMulti('Pembayaran_' + ERP.today() + '.xlsx', [
            { name: 'Pembayaran', headers: ['Tanggal', 'Supplier', 'No FP', 'Jumlah', 'Mata Uang', 'Bank Asal', 'Catatan'], rows: pl.map((x) => [fmtDate(x.pay_date), (supMap[x.supplier_id] || {}).name, x.fp_no || '', Number(x.amount), x.currency, x.bank, x.note || '']) },
            { name: 'Rincian Barang', headers: ['Tanggal Bayar', 'Supplier', 'No FP', 'Bank Asal', 'No PO', 'No Surat Jalan', 'Brand', 'Model', 'Compound', 'Gender', 'Color', 'Size', 'G/D', 'Jumlah Dibayar', 'Mata Uang'], rows: det },
          ]);
        } else {
          if (!S.supplierId) { ERP.toast('Pilih supplier dulu', 'err'); return; }
          ERP.xlsxExport('Pembayaran_BarangDiterima_' + ERP.today() + '.xlsx', 'Barang Diterima', ['Tgl Terima', 'No Surat Jalan', 'No PO', 'Brand', 'Model', 'Compound', 'Gender', 'Color', 'Size', 'G/D', 'Qty', 'Harga PO', 'Nilai Bayar', 'Dibayar', 'Sisa', 'Status', 'Mata Uang'],
            shown.map((l) => [fmtDate(l.date), l.sj, l.po.po_number, l.item.brand, l.item.model, l.item.compound || '', l.item.gender || '', l.item.color || '', l.item.size || '', l.grade, l.qty, l.price, l.payable, l.paid, Math.max(0, l.left), l.left <= 0.005 ? 'Lunas' : l.paid > 0.005 ? 'Sebagian' : 'Belum', l.po.currency]));
        }
      };
      $('#b-prt').onclick = () => {
        if (S.tab === 'hist') ERP.printTable('Riwayat Pembayaran', [{ label: 'Tanggal', v: (x) => fmtDate(x.pay_date) }, { label: 'Supplier', v: (x) => (supMap[x.supplier_id] || {}).name }, { label: 'No FP', v: (x) => x.fp_no || '' }, { label: 'Jumlah', num: true, v: (x) => fmtMoney(x.amount, x.currency) }, { label: 'Bank Asal', v: (x) => x.bank }, { label: 'Catatan', v: (x) => x.note || '' }], payList());
        else if (S.supplierId) ERP.printTable('Barang Diterima — ' + (supMap[S.supplierId] || {}).name, [{ label: 'Tgl Terima', v: (l) => fmtDate(l.date) }, { label: 'No SJ', v: (l) => l.sj }, { label: 'No PO', v: (l) => l.po.po_number }, { label: 'Barang', v: (l) => ERP.attrText(l.item) }, { label: 'G/D', v: (l) => l.grade }, { label: 'Qty', num: true, v: (l) => qty(l.qty) }, { label: 'Harga', num: true, v: (l) => ERP.fmtNum(l.price, ERP.decimals(l.po.currency)) }, { label: 'Nilai bayar', num: true, v: (l) => ERP.fmtNum(l.payable, ERP.decimals(l.po.currency)) }, { label: 'Sisa', num: true, v: (l) => ERP.fmtNum(Math.max(0, l.left), ERP.decimals(l.po.currency)) }, { label: 'Status', v: (l) => (l.left <= 0.005 ? 'Lunas' : l.paid > 0.005 ? 'Sebagian' : 'Belum') }], shown);
        else ERP.toast('Pilih supplier dulu', 'err');
      };
    },
  });
})();
