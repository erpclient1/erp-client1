/* Goods Received (tanpa harga). Penerimaan dicatat per Good (G) / Defect (D). */
(function () {
  const ERP = window.ERP;
  const { $, esc, btn, norm, fmtDate } = ERP;
  const DB = ERP.DB;
  const S = { tab: 'wait', q: '' };
  const qty = (n) => ERP.fmtNum(n, Number.isInteger(+n) ? 0 : 2);
  const attrCells = (i) => `<td>${esc(i.brand)}</td><td>${esc(i.model)}</td><td>${esc(i.compound)}</td><td>${esc(i.gender)}</td><td>${esc(i.color)}</td><td>${esc(i.size)}</td>`;

  function printGR(p, g) {
    const rows = g.items.map((x, n) => { const it = p.items.find((i) => i.id === x.po_item_id) || {}; return `<tr><td class="center">${n + 1}</td>${attrCells(it)}<td class="center">${x.grade === 'D' ? 'D' : 'G'}</td><td class="n">${qty(x.qty)} ${esc(it.unit)}</td></tr>`; }).join('');
    ERP.printHTML('Penerimaan ' + p.po_number, `<h1>BUKTI PENERIMAAN BARANG</h1><div class="muted">Ref. ${esc(p.po_number)}</div>
      <table class="kv"><tr><td>Supplier</td><td><b>${esc(p.supplier.name)}</b></td></tr><tr><td>No PO</td><td>${esc(p.po_number)}</td></tr><tr><td>No Surat Jalan</td><td>${esc(g.delivery_note_no)}</td></tr><tr><td>Tanggal terima</td><td>${fmtDate(g.gr_date)}</td></tr><tr><td>Diterima oleh</td><td>${esc(g.received_by)}</td></tr></table>
      <table><thead><tr><th class="center">No</th><th>Brand</th><th>Model</th><th>Compound</th><th>Gender</th><th>Color</th><th>Size</th><th class="center">G/D</th><th class="n">Qty Diterima</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="sign"><div><div class="line"></div>Diterima oleh<br><b>${esc(g.received_by)}</b></div><div><div class="line"></div>Pengirim</div></div>`);
  }

  // Export Excel tanpa harga: sheet Penerimaan (per baris diterima) + sheet Sisa Pesanan (per baris PO)
  function exportGR(list, filename) {
    const rec = [], rest = [];
    list.forEach((p) => {
      p.receipts.forEach((g) => g.items.forEach((x) => { const it = p.items.find((i) => i.id === x.po_item_id) || {}; rec.push([fmtDate(g.gr_date), g.delivery_note_no, g.received_by, p.po_number, p.supplier.name, it.brand, it.model, it.compound || '', it.gender || '', it.color || '', it.size || '', x.grade === 'D' ? 'D' : 'G', Number(x.qty), it.unit]); }));
      p.items.forEach((i) => { const r = p.rc[i.id] || { G: 0, D: 0 }; rest.push([p.po_number, p.supplier.name, fmtDate(p.est_date), i.brand, i.model, i.compound || '', i.gender || '', i.color || '', i.size || '', Number(i.qty), r.G, r.D, Math.max(0, Number(i.qty) - r.G - r.D), i.unit]); });
    });
    if (!rec.length && !rest.length) { ERP.toast('Tidak ada data untuk diexport', 'err'); return; }
    ERP.xlsxExportMulti(filename, [
      { name: 'Penerimaan', headers: ['Tanggal Terima', 'No Surat Jalan', 'Diterima oleh', 'No PO', 'Supplier', 'Brand', 'Model', 'Compound', 'Gender', 'Color', 'Size', 'G/D', 'Qty', 'Satuan'], rows: rec },
      { name: 'Sisa Pesanan', headers: ['No PO', 'Supplier', 'Est Date', 'Brand', 'Model', 'Compound', 'Gender', 'Color', 'Size', 'Qty PO', 'Diterima Good', 'Diterima Defect', 'Sisa', 'Satuan'], rows: rest },
    ]);
  }

  /* ---------- Revisi & hapus penerimaan ---------- */
  const gkey = (id, grade) => id + '|' + (grade === 'D' ? 'D' : 'G');
  // plan: Map(kunci -> qty baru pada penerimaan ini). Mengembalikan teks kesalahan atau '' bila aman.
  function checkReceipt(p, data, g, plan) {
    const f = Number(p.subtotal) > 0 ? Number(p.total) / Number(p.subtotal) : 1;
    for (const i of p.items) {
      for (const gr of ['G', 'D']) {
        const other = ERP.sum(p.receipts.filter((r) => r.id !== g.id), (r) => ERP.sum(r.items.filter((x) => x.po_item_id === i.id && (x.grade === 'D' ? 'D' : 'G') === gr), (x) => Number(x.qty)));
        const mine = plan.get(gkey(i.id, gr)) || 0;
        const out = (p.ou[i.id] || { G: 0, D: 0 })[gr];
        if (other + mine < out - 1e-9) return `${ERP.attrText(i)} (${gr}) sudah dikirim ${qty(out)} lewat Delivery Order, jadi total penerimaan tidak boleh kurang dari itu. Revisi/batalkan DO terkait dulu.`;
      }
    }
    for (const x of g.items) {
      const paid = data.paidByGr[x.id] || 0; if (!(paid > 0)) continue;
      const it = p.items.find((i) => i.id === x.po_item_id) || {};
      const payable = ERP.round((plan.get(gkey(x.po_item_id, x.grade)) || 0) * Number(it.price) * f, p.currency);
      if (paid > payable + 0.005) return `${ERP.attrText(it)} sudah dibayar ${ERP.fmtMoney(paid, p.currency)}. Hapus/ubah pembayaran terkait di modul Pembayaran terlebih dulu.`;
    }
    return '';
  }
  async function deleteReceipt(p, data, g, onDone) {
    const err = checkReceipt(p, data, g, new Map());
    if (err) { ERP.toast(err, 'err'); return; }
    if (!(await ERP.confirm(`Hapus penerimaan <b>SJ ${esc(g.delivery_note_no)}</b> (${fmtDate(g.gr_date)}) dari <b>${esc(p.po_number)}</b>?<br><small>Barang pada surat jalan ini dianggap <b>belum diterima</b>; status PO, Report, Stock, dan Pembayaran ikut menyesuaikan.</small>`, { danger: true }))) return;
    try { await DB.remove('goods_receipts', g.id); ERP.toast('Penerimaan dihapus — data PO ikut diperbarui'); if (onDone) onDone(); ERP.refresh(); } catch (e) { ERP.toast(e.message, 'err'); }
  }
  function reviseModal(p, g, data, onDone) {
    const mine = {}; g.items.forEach((x) => (mine[gkey(x.po_item_id, x.grade)] = Number(x.qty)));
    const rows = p.items.map((i) => {
      const other = ERP.sum(p.receipts.filter((r) => r.id !== g.id), (r) => ERP.sum(r.items.filter((x) => x.po_item_id === i.id), (x) => Number(x.qty)));
      const maxq = Math.max(0, Number(i.qty) - other);
      return `<tr data-id="${i.id}"><td data-label="Brand" class="mt"><b>${esc(i.brand)}</b></td><td data-label="Model">${esc(i.model)}</td><td data-label="Compound">${esc(i.compound)}</td><td data-label="Gender">${esc(i.gender)}</td><td data-label="Color">${esc(i.color)}</td><td data-label="Size">${esc(i.size)}</td>
        <td data-label="Dipesan" class="n">${qty(i.qty)} ${esc(i.unit)}</td><td data-label="Surat jalan lain" class="n">${qty(other)}</td><td data-label="Maks" class="n">${qty(maxq)}</td>
        <td data-label="Good (G)" class="n"><input class="gq g" inputmode="decimal" style="width:80px;text-align:right" value="${mine[gkey(i.id, 'G')] || 0}" data-max="${maxq}"></td>
        <td data-label="Defect (D)" class="n"><input class="gq d" inputmode="decimal" style="width:80px;text-align:right" value="${mine[gkey(i.id, 'D')] || 0}"></td></tr>`;
    }).join('');
    ERP.modal({
      title: 'Revisi Penerimaan — ' + esc(p.po_number) + ' · SJ ' + esc(g.delivery_note_no), wide: true,
      html: `<div class="note" style="margin-bottom:8px">Ubah jumlah Good/Defect pada surat jalan ini. Data di PO, Report, Stock, dan Pembayaran otomatis mengikuti hasil revisi.</div>
        <div class="tbl-wrap"><table class="tbl t3"><thead><tr><th>Brand</th><th>Model</th><th>Compound</th><th>Gender</th><th>Color</th><th>Size</th><th class="n">Dipesan</th><th class="n">SJ lain</th><th class="n">Maks</th><th class="n">Good (G)</th><th class="n">Defect (D)</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="grid c3" style="margin-top:12px">${ERP.field('No Surat Jalan *', `<input name="delivery_note_no" value="${esc(g.delivery_note_no)}">`)}${ERP.field('Tanggal terima', ERP.dateInput('gr_date', g.gr_date))}${ERP.field('Diterima oleh *', `<input name="received_by" value="${esc(g.received_by)}">`)}</div>`,
      actions: [{ icon: 'check', tip: 'Simpan revisi', cls: 'primary', onClick: async (m) => {
        const d = ERP.formData(m.el);
        if (!d.delivery_note_no) { ERP.toast('No surat jalan wajib diisi', 'err'); return; }
        if (!d.received_by) { ERP.toast('Nama penerima wajib diisi', 'err'); return; }
        if (!d.gr_date) { ERP.toast('Tanggal tidak valid', 'err'); return; }
        const plan = new Map(); let bad = false;
        ERP.$$('tr[data-id]', m.el).forEach((tr) => {
          const gq = ERP.num($('.gq.g', tr).value), dq = ERP.num($('.gq.d', tr).value), max = Number($('.gq.g', tr).dataset.max);
          if (gq < 0 || dq < 0 || gq + dq > max + 1e-9) bad = true;
          if (gq > 0) plan.set(gkey(tr.dataset.id, 'G'), gq);
          if (dq > 0) plan.set(gkey(tr.dataset.id, 'D'), dq);
        });
        if (bad) { ERP.toast('Good + Defect melebihi sisa pesanan (setelah dikurangi surat jalan lain)', 'err'); return; }
        if (!plan.size) { ERP.toast('Semua qty nol. Untuk membatalkan penerimaan, gunakan tombol hapus.', 'err'); return; }
        const err = checkReceipt(p, data, g, plan);
        if (err) { ERP.toast(err, 'err'); return; }
        try {
          await DB.update('goods_receipts', g.id, { gr_date: d.gr_date, delivery_note_no: d.delivery_note_no, received_by: d.received_by });
          for (const x of g.items) {
            const k = gkey(x.po_item_id, x.grade), nq = plan.get(k) || 0;
            if (nq <= 0) await DB.remove('gr_items', x.id); else if (nq !== Number(x.qty)) await DB.update('gr_items', x.id, { qty: nq });
            plan.delete(k);
          }
          const add = [...plan.entries()].map(([k, q]) => { const [id, gr] = k.split('|'); return { gr_id: g.id, po_item_id: id, qty: q, grade: gr }; });
          if (add.length) await DB.insert('gr_items', add);
          m.close(); if (onDone) onDone(); ERP.toast('Revisi disimpan — data PO ikut diperbarui'); ERP.refresh();
        } catch (e) { ERP.toast('Gagal menyimpan revisi: ' + e.message, 'err'); }
      } }],
    });
  }

  function receiveModal(p) {
    const remain = p.items.map((i) => ({ ...i, got: p.recv[i.id] || 0, left: Math.max(0, Number(i.qty) - (p.recv[i.id] || 0)) })).filter((i) => i.left > 0);
    const rowsHTML = remain.map((i) => `<tr data-id="${i.id}"><td data-label="Brand" class="mt"><b>${esc(i.brand)}</b></td><td data-label="Model">${esc(i.model)}</td><td data-label="Compound">${esc(i.compound)}</td><td data-label="Gender">${esc(i.gender)}</td><td data-label="Color">${esc(i.color)}</td><td data-label="Size">${esc(i.size)}</td>
      <td data-label="Dipesan" class="n">${qty(i.qty)} ${esc(i.unit)}</td><td data-label="Sudah diterima" class="n">${qty(i.got)}</td><td data-label="Sisa" class="n">${qty(i.left)}</td>
      <td data-label="Good (G)" class="n"><span style="display:inline-flex;gap:4px;align-items:center"><input class="gq g" inputmode="decimal" style="width:80px;text-align:right" value="0" data-max="${i.left}">${btn('check', 'Terima semua sisa sebagai Good', 'data-all', 'sm')}</span></td>
      <td data-label="Defect (D)" class="n"><input class="gq d" inputmode="decimal" style="width:80px;text-align:right" value="0"></td></tr>`).join('');
    ERP.modal({
      title: 'Barang Diterima — ' + esc(p.po_number), wide: true,
      html: `<div class="note" style="margin-bottom:8px">Supplier: <b>${esc(p.supplier.name)}</b>. Isi jumlah <b>Good</b> dan <b>Defect</b> per item (boleh sebagian).</div>
        <div class="tbl-wrap"><table class="tbl t3"><thead><tr><th>Brand</th><th>Model</th><th>Compound</th><th>Gender</th><th>Color</th><th>Size</th><th class="n">Dipesan</th><th class="n">Sudah diterima</th><th class="n">Sisa</th><th class="n">Good (G)</th><th class="n">Defect (D)</th></tr></thead><tbody>${rowsHTML}</tbody></table></div>
        <div class="grid c3" style="margin-top:12px">${ERP.field('No Surat Jalan *', '<input name="delivery_note_no">')}${ERP.field('Tanggal terima', ERP.dateInput('gr_date', ERP.today()))}${ERP.field('Diterima oleh *', `<input name="received_by" value="${esc(ERP.user.full_name)}">`)}</div>`,
      onMount: (m) => { m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-all]'); if (b) { const i = b.parentNode.querySelector('.gq'); i.value = i.dataset.max; const d = b.closest('tr').querySelector('.gq.d'); d.value = 0; } }); },
      actions: [{ icon: 'check', tip: 'Simpan penerimaan', cls: 'primary', onClick: async (m) => {
        const d = ERP.formData(m.el);
        if (!d.delivery_note_no) { ERP.toast('No surat jalan wajib diisi', 'err'); return; }
        if (!d.received_by) { ERP.toast('Nama penerima wajib diisi', 'err'); return; }
        if (!d.gr_date) { ERP.toast('Tanggal tidak valid', 'err'); return; }
        const got = []; let bad = false;
        ERP.$$('tr[data-id]', m.el).forEach((tr) => {
          const g = ERP.num($('.gq.g', tr).value), df = ERP.num($('.gq.d', tr).value), max = Number($('.gq.g', tr).dataset.max);
          if (g < 0 || df < 0 || g + df > max + 1e-9) bad = true;
          if (g > 0) got.push({ po_item_id: tr.dataset.id, qty: g, grade: 'G' });
          if (df > 0) got.push({ po_item_id: tr.dataset.id, qty: df, grade: 'D' });
        });
        if (bad) { ERP.toast('Good + Defect melebihi sisa pesanan', 'err'); return; }
        if (!got.length) { ERP.toast('Isi jumlah barang yang diterima', 'err'); return; }
        try {
          const [g] = await DB.insert('goods_receipts', { po_id: p.id, gr_date: d.gr_date, delivery_note_no: d.delivery_note_no, received_by: d.received_by });
          await DB.insert('gr_items', got.map((x) => ({ ...x, gr_id: g.id })));
          m.close(); ERP.toast('Penerimaan disimpan'); ERP.refresh();
        } catch (e) { ERP.toast(e.message, 'err'); }
      } }],
    });
  }

  ERP.register('gr', {
    async render(v) {
      const data = await ERP.loadPO();
      const canR = ERP.can.receive();
      const approved = data.pos.filter((p) => p.status === 'approved');
      const match = (p) => !S.q || norm(p.po_number).includes(S.q) || norm(p.supplier.name).includes(S.q) || p.items.some((i) => norm(ERP.attrText(i)).includes(S.q));
      v.innerHTML = `<div class="toolbar">${ERP.searchBox('q', 'Cari nama supplier / brand / model / compound / color / size / no PO…')}<div class="tb-actions">${btn('download', 'Export Excel (tanpa harga)', 'id="b-exp"')}${btn('print', 'Print daftar', 'id="b-prt"')}</div></div><div class="tabs" id="tabs"></div><div id="list"></div>`;
      $('#q').value = S.q;
      let cur = [];
      const bar = (a, b) => `<div class="bar ${a >= b ? 'ok' : ''}"><i style="width:${b > 0 ? Math.min(100, (a / b) * 100) : 0}%"></i></div>`;
      const itemsTxt = (p) => [...new Set(p.items.map((i) => [i.brand, i.model].filter(Boolean).join(' ')))].join(', ');
      const waitCols = [
        { label: 'No PO', html: (p) => `<b>${esc(p.po_number)}</b>${p.urgent ? '<span class="urgent-tag">URGENT</span>' : ''}`, cls: 'nw', m: 'mt' },
        { label: 'Tanggal', v: (p) => fmtDate(p.po_date), cls: 'nw' },
        { label: 'Supplier', v: (p) => p.supplier.name },
        { label: 'Item', v: itemsTxt, cls: 'hide-md', m: 'mf' },
        { label: 'Diterima', html: (p) => `${qty(p.received)} / ${qty(p.ordered)}${bar(p.received, p.ordered)}`, cls: 'nw' },
        { label: '', cls: 'act', html: (p) => btn('download', 'Export Excel PO ini', `data-a="xls" data-id="${p.id}"`, 'sm') + (p.receipts.length ? btn('eye', 'Riwayat penerimaan', `data-a="hist" data-id="${p.id}"`, 'sm') : '') + (canR ? btn('truck', 'Barang Diterima', `data-a="recv" data-id="${p.id}"`, 'sm primary') : '') },
      ];
      const finalCols = [
        { label: 'No PO', html: (p) => `<b>${esc(p.po_number)}</b>`, cls: 'nw', m: 'mt' },
        { label: 'Supplier', v: (p) => p.supplier.name },
        { label: 'Tgl Terima Akhir', v: (p) => fmtDate(p.lastRecvDate), cls: 'nw' },
        { label: 'No Surat Jalan', v: (p) => p.receipts.map((g) => g.delivery_note_no).join(', ') },
        { label: 'Diterima oleh', v: (p) => [...new Set(p.receipts.map((g) => g.received_by))].join(', ') },
        { label: 'Good / Defect', v: (p) => { let g = 0, d = 0; Object.values(p.rc).forEach((r) => { g += r.G; d += r.D; }); return qty(g) + ' / ' + qty(d); }, cls: 'nw' },
        { label: 'Item', v: itemsTxt, cls: 'hide-md', m: 'mf' },
        { label: '', cls: 'act', html: (p) => btn('download', 'Export Excel PO ini', `data-a="xls" data-id="${p.id}"`, 'sm') + btn('eye', 'Lihat penerimaan', `data-a="hist" data-id="${p.id}"`, 'sm') },
      ];
      const rcTotals = (r) => { let g = 0, d = 0; r.g.items.forEach((x) => { if (x.grade === 'D') d += Number(x.qty); else g += Number(x.qty); }); return [g, d]; };
      const sa = (a, r) => `data-sj="${a}" data-id="${r.p.id}" data-gid="${r.g.id}"`;
      const sjCols = [
        { label: 'No Surat Jalan', html: (r) => `<b>${esc(r.g.delivery_note_no)}</b>`, cls: 'nw', m: 'mt' },
        { label: 'Tgl Terima', v: (r) => fmtDate(r.g.gr_date), cls: 'nw' },
        { label: 'No PO', v: (r) => r.p.po_number, cls: 'nw' },
        { label: 'Supplier', v: (r) => r.p.supplier.name },
        { label: 'Item', v: (r) => [...new Set(r.g.items.map((x) => { const it = r.p.items.find((i) => i.id === x.po_item_id) || {}; return [it.brand, it.model].filter(Boolean).join(' '); }))].join(', '), cls: 'hide-md', m: 'mf' },
        { label: 'Good / Defect', v: (r) => { const [g, d] = rcTotals(r); return qty(g) + ' / ' + qty(d); }, cls: 'nw' },
        { label: 'Diterima oleh', v: (r) => r.g.received_by, cls: 'hide-md' },
        { label: '', cls: 'act', html: (r) => btn('eye', 'Lihat rincian', sa('view', r), 'sm') + btn('print', 'Print bukti penerimaan', sa('print', r), 'sm') + btn('download', 'Export Excel', sa('xls', r), 'sm') + (canR ? btn('edit', 'Revisi penerimaan', sa('edit', r), 'sm') + btn('trash', 'Hapus penerimaan', sa('del', r), 'sm danger') : '') },
      ];
      const rcMatch = (r) => !S.q || norm(r.p.po_number).includes(S.q) || norm(r.p.supplier.name).includes(S.q) || norm(r.g.delivery_note_no).includes(S.q) || norm(r.g.received_by).includes(S.q) || r.g.items.some((x) => norm(ERP.attrText(r.p.items.find((i) => i.id === x.po_item_id) || {})).includes(S.q));
      let curRc = [];
      const draw = () => {
        const base = approved.filter(match);
        const wait = base.filter((p) => !p.allReceived), fin = base.filter((p) => p.allReceived);
        curRc = approved.flatMap((p) => p.receipts.map((g) => ({ id: g.id, p, g }))).filter(rcMatch).sort((a, b) => String(b.g.gr_date).localeCompare(String(a.g.gr_date)));
        $('#tabs').innerHTML = `<button data-t="wait" class="${S.tab === 'wait' ? 'on' : ''}">PO Menunggu Penerimaan<span class="cnt">${wait.length}</span></button><button data-t="final" class="${S.tab === 'final' ? 'on' : ''}">Daftar Barang Penerimaan Final<span class="cnt">${fin.length}</span></button><button data-t="sj" class="${S.tab === 'sj' ? 'on' : ''}">Surat Jalan (Revisi / Hapus)<span class="cnt">${curRc.length}</span></button>`;
        if (S.tab === 'sj') {
          cur = [...new Map(curRc.map((r) => [r.p.id, r.p])).values()];
          $('#list').innerHTML = `<div class="note" style="margin-bottom:8px">Setiap baris = satu surat jalan. Gunakan ikon pensil untuk <b>merevisi</b> jumlah penerimaan atau ikon tempat sampah untuk <b>menghapus</b> (barang pada surat jalan itu dianggap belum diterima, dan PO otomatis menyesuaikan).</div>` + ERP.table(sjCols, curRc, { empty: 'Belum ada penerimaan barang.', cls: 'rpt t3' });
          return;
        }
        cur = S.tab === 'wait' ? wait : fin;
        const empty = S.tab === 'wait' ? 'Tidak ada PO yang menunggu penerimaan. (Hanya PO yang sudah di-approve Supervisor yang tampil di sini.)' : 'Belum ada PO yang barangnya diterima semua.';
        $('#list').innerHTML = `<div class="note" style="margin-bottom:8px">Untuk merevisi atau menghapus penerimaan, buka tab <b>Surat Jalan (Revisi / Hapus)</b>.</div>` + ERP.table(S.tab === 'wait' ? waitCols : finalCols, cur, { empty, rowCls: (p) => (p.urgent ? 'urgent' : '') });
      };
      draw();
      $('#q').oninput = ERP.debounce((e) => { S.q = norm(e.target.value.trim()); draw(); });
      $('#tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { S.tab = b.dataset.t; draw(); } };
      $('#b-exp').onclick = () => exportGR(cur, 'GoodsReceived_' + ERP.today() + '.xlsx');
      $('#b-prt').onclick = () => (S.tab === 'sj'
        ? ERP.printTable('Daftar Surat Jalan Penerimaan', [{ label: 'No SJ', v: (r) => r.g.delivery_note_no }, { label: 'Tgl Terima', v: (r) => fmtDate(r.g.gr_date) }, { label: 'No PO', v: (r) => r.p.po_number }, { label: 'Supplier', v: (r) => r.p.supplier.name }, { label: 'Good / Defect', v: (r) => { const [g, d] = rcTotals(r); return qty(g) + ' / ' + qty(d); } }, { label: 'Diterima oleh', v: (r) => r.g.received_by }], curRc)
        : S.tab === 'wait'
        ? ERP.printTable('PO Menunggu Penerimaan Barang', [{ label: 'No PO', v: (p) => p.po_number }, { label: 'Tanggal', v: (p) => fmtDate(p.po_date) }, { label: 'Supplier', v: (p) => p.supplier.name }, { label: 'Item', v: itemsTxt }, { label: 'Diterima', v: (p) => qty(p.received) + '/' + qty(p.ordered) }], cur)
        : ERP.printTable('Daftar Barang Penerimaan Final', finalCols.slice(0, 6).map((c) => ({ label: c.label, v: c.v || ((p) => p.po_number) })), cur));
      $('#list').onclick = (e) => {
        const sj = e.target.closest('[data-sj]');
        if (sj) {
          const p = data.pos.find((x) => x.id === sj.dataset.id), g = p && p.receipts.find((x) => x.id === sj.dataset.gid);
          if (!p || !g) return;
          const a = sj.dataset.sj;
          if (a === 'edit') reviseModal(p, g, data);
          else if (a === 'del') deleteReceipt(p, data, g);
          else if (a === 'print') printGR(p, g);
          else if (a === 'xls') exportGR([p], 'GoodsReceived_' + g.delivery_note_no.replace(/[\\/:*?"<>|]/g, '-') + '.xlsx');
          else historyModal(p);
          return;
        }
        const b = e.target.closest('[data-a]'); if (!b) return;
        const p = data.pos.find((x) => x.id === b.dataset.id);
        if (b.dataset.a === 'xls') exportGR([p], 'GoodsReceived_' + p.po_number + '.xlsx');
        else if (b.dataset.a === 'recv') receiveModal(p);
        else historyModal(p);
      };
      function historyModal(p) {
        {
          const m = ERP.modal({
            title: 'Penerimaan — ' + esc(p.po_number), wide: true,
            html: p.receipts.length ? p.receipts.map((g, n) => `<div class="card" style="margin-bottom:10px"><div class="page-head" style="margin:0 0 6px"><h3>${fmtDate(g.gr_date)} · SJ ${esc(g.delivery_note_no)}</h3>${btn('print', 'Print bukti penerimaan', `data-pr="${n}"`, 'sm')}${canR ? btn('edit', 'Revisi penerimaan', `data-rv="${n}"`, 'sm') + btn('trash', 'Hapus penerimaan', `data-rd="${n}"`, 'sm danger') : ''}</div><div class="note">Diterima oleh <b>${esc(g.received_by)}</b></div>${ERP.table([
              { label: 'Brand', html: (x) => `<b>${esc((p.items.find((i) => i.id === x.po_item_id) || {}).brand)}</b>`, m: 'mt' }, ...['model', 'compound', 'gender', 'color', 'size'].map((k) => ({ label: k[0].toUpperCase() + k.slice(1), v: (x) => (p.items.find((i) => i.id === x.po_item_id) || {})[k] })),
              { label: 'G/D', html: (x) => ERP.badge(x.grade === 'D' ? 'D' : 'G', x.grade === 'D' ? 'err' : 'ok') }, { label: 'Qty', html: (x) => qty(x.qty) + ' ' + esc((p.items.find((i) => i.id === x.po_item_id) || {}).unit), cls: 'n' }], g.items)}</div>`).join('') : '<div class="empty">Belum ada penerimaan.</div>',
          });
          m.el.addEventListener('click', (ev) => {
            const pb = ev.target.closest('[data-pr]'), rv = ev.target.closest('[data-rv]'), rd = ev.target.closest('[data-rd]');
            if (pb) printGR(p, p.receipts[+pb.dataset.pr]);
            else if (rv) reviseModal(p, p.receipts[+rv.dataset.rv], data, () => m.close());
            else if (rd) deleteReceipt(p, data, p.receipts[+rd.dataset.rd], () => m.close());
          });
        }
      };
    },
  });
})();
