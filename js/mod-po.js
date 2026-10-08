/* Purchase Order ke supplier */
(function () {
  const ERP = window.ERP;
  const { $, $$, esc, btn, norm, fmtMoney, fmtDate } = ERP;
  const DB = ERP.DB;
  const S = { tab: 'active', q: '' };
  const qty = (n) => ERP.fmtNum(n, Number.isInteger(+n) ? 0 : 2);
  const STAGES = [['active', 'PO Aktif'], ['received', 'Barang Diterima Semua'], ['done', 'PO Selesai']];

  // No PO diisi MANUAL oleh user (harus unik)
  ERP.termText = (p) => p.payment_type === 'tempo' ? (p.tempo_mode === 'date' ? 'Tempo s/d ' + fmtDate(p.tempo_date) : `Tempo ${p.tempo_days} hari`) : 'Cash';
  ERP.approvalBadge = (p) => p.status === 'approved' ? ERP.badge('Approved', 'ok') : ERP.badge('Menunggu Approval' + (p.revision > 0 ? ' (rev ' + p.revision + ')' : ''), 'warn');
  const fxOf = (p) => (p.fx_rate > 0 && p.currency !== 'IDR' ? Number(p.fx_rate) : 0);
  const idr = (n, fx) => 'IDR ' + ERP.fmtNum(n * fx, 0);

  // total = (subtotal - diskon) + PPN 11% - PPh 23  (= jumlah yang dibayar ke supplier)
  function calc(lines, dt, dv, vat, pph, pphRate, cur) {
    const subtotal = ERP.round(ERP.sum(lines, (l) => ERP.num(l.qty) * ERP.num(l.price)), cur);
    let disc = dt === 'pct' ? (subtotal * Math.min(Math.max(ERP.num(dv), 0), 100)) / 100 : ERP.num(dv);
    disc = ERP.round(Math.min(Math.max(disc, 0), subtotal), cur);
    const dpp = ERP.round(subtotal - disc, cur);
    const vatAmt = vat ? ERP.round(dpp * 0.11, cur) : 0;
    const pphAmt = pph ? ERP.round((dpp * Math.max(ERP.num(pphRate), 0)) / 100, cur) : 0;
    return { subtotal, disc, dpp, vatAmt, pphAmt, total: ERP.round(dpp + vatAmt - pphAmt, cur) };
  }
  ERP.calcPO = calc;
  const calcOf = (p) => calc(p.items, p.discount_type, p.discount_value, p.vat, p.pph23, p.pph23_rate, p.currency);

  /* ---------- Print PO ---------- */
  function printPO(p, userMap) {
    const cur = p.currency, s = p.supplier || {}, dec = ERP.decimals(cur), fx = fxOf(p);
    const c = calcOf(p);
    const rows = p.items.map((i, n) => `<tr><td class="center">${n + 1}</td><td>${esc(i.brand)}</td><td>${esc(i.model)}</td><td>${esc(i.compound)}</td><td>${esc(i.gender)}</td><td>${esc(i.color)}</td><td>${esc(i.size)}</td><td>${esc(i.order_no)}</td><td>${i.est_date ? fmtDate(i.est_date) : ''}</td><td class="n">${qty(i.qty)}</td><td>${esc(i.unit)}</td><td class="n">${ERP.fmtNum(i.price, dec)}</td>${fx ? `<td class="n">${ERP.fmtNum(i.price * fx, 0)}</td>` : ''}<td class="n">${ERP.fmtNum(i.qty * i.price, dec)}</td>${fx ? `<td class="n">${ERP.fmtNum(i.qty * i.price * fx, 0)}</td>` : ''}</tr>`).join('');
    const approver = p.approved_by && userMap[p.approved_by] ? userMap[p.approved_by].full_name : '';
    const creator = p.created_by && userMap[p.created_by] ? userMap[p.created_by].full_name : '';
    const n = (v) => ERP.fmtNum(v, dec);
    const tot = (l, v, b, v2) => `<tr><td>${l}</td><td class="n">${b ? '<b>' + v + '</b>' : v}</td>${fx ? `<td class="n">${v2 == null ? '' : b ? '<b>' + v2 + '</b>' : v2}</td>` : ''}</tr>`;
    const I = (v) => ERP.fmtNum(v * fx, 0);
    ERP.printHTML(p.po_number, `<h1>PURCHASE ORDER</h1><div class="muted">${esc(p.po_number)}</div>
      ${p.urgent ? '<div class="urgent">URGENT — PO MENDESAK</div>' : ''}
      ${p.status !== 'approved' ? '<div class="wm">BELUM DISETUJUI SUPERVISOR — DRAFT</div>' : ''}
      <div class="grid2"><div class="box"><b>Kepada:</b><br><b>${esc(s.name)}</b><br>${esc(s.contact_person || '')}${s.position ? ' (' + esc(s.position) + ')' : ''}<br>${esc(s.billing_address || '')}<br>${esc([s.mobile, s.office_phone].filter(Boolean).join(' / '))}<br>${esc(s.email || '')}</div>
      <div class="box"><table class="kv"><tr><td>No PO</td><td><b>${esc(p.po_number)}</b></td></tr><tr><td>Tanggal</td><td>${fmtDate(p.po_date)}</td></tr><tr><td>Mata uang</td><td>${esc(cur)}${fx ? ' · Rate ' + ERP.fmtNum(fx, 2) + ' IDR' : ''}</td></tr><tr><td>Pembayaran</td><td>${esc(ERP.termText(p))}</td></tr></table></div></div>
      <table><thead><tr><th class="center">No</th><th>Brand</th><th>Model</th><th>Compound</th><th>Gender</th><th>Color</th><th>Size</th><th>No Order</th><th>Est Date</th><th class="n">Qty</th><th>Satuan</th><th class="n">Harga (${esc(cur)})</th>${fx ? '<th class="n">Harga (IDR)</th>' : ''}<th class="n">Jumlah (${esc(cur)})</th>${fx ? '<th class="n">Jumlah (IDR)</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>
      <table class="tot" style="width:${fx ? 70 : 50}%;margin-left:auto">
        ${fx ? `<tr><td></td><td class="n muted">${esc(cur)}</td><td class="n muted">IDR</td></tr>` : ''}
        ${tot('Subtotal', n(c.subtotal), false, I(c.subtotal))}
        ${c.disc > 0 ? tot('Diskon' + (p.discount_type === 'pct' ? ' (' + ERP.fmtNum(p.discount_value, 2) + '%)' : ''), '- ' + n(c.disc), false, '- ' + I(c.disc)) : ''}
        ${tot('Total sebelum PPN', n(c.dpp), true, I(c.dpp))}
        ${p.vat ? tot('PPN 11%', n(c.vatAmt), false, I(c.vatAmt)) : ''}
        ${p.pph23 ? tot('PPh 23 (' + ERP.fmtNum(p.pph23_rate, 2) + '%)', '- ' + n(c.pphAmt), false, '- ' + I(c.pphAmt)) : ''}
        ${p.vat || p.pph23 ? tot('Total dibayar', n(c.total), true, I(c.total)) : ''}
      </table>
      ${p.notes ? `<div class="box"><b>Catatan:</b><br>${esc(p.notes).replace(/\n/g, '<br>')}</div>` : ''}
      <div class="sign"><div><div class="line"></div>Dibuat oleh<br><b>${esc(creator)}</b></div><div><div class="line"></div>Disetujui oleh<br><b>${esc(approver)}</b></div><div><div class="line"></div>Supplier<br>&nbsp;</div></div>`, { landscape: true });
  }

  /* ---------- Aksi ---------- */
  // Hapus PO: hanya bila belum ada data terkait (penerimaan barang, Delivery Order, pembayaran)
  async function deletePO(p, after) {
    if (!ERP.can.write()) { ERP.toast('Hanya Admin atau Supervisor yang dapat menghapus PO', 'err'); return; }
    const used = [];
    if (p.receipts.length) used.push(`${p.receipts.length} penerimaan barang (Goods Received)`);
    if (p.dos.length) used.push(`${p.dos.length} Delivery Order`);
    if (p.payments.length) used.push(`${p.payments.length} pembayaran`);
    if (used.length) { ERP.toast(`PO ${p.po_number} tidak bisa dihapus karena sudah ada ${used.join(', ')}. Hapus data terkait itu dulu.`, 'err'); return; }
    if (!(await ERP.confirm(`Hapus <b>${esc(p.po_number)}</b> (${esc(p.supplier.name)}, ${fmtMoney(p.total, p.currency)})?<br><small>PO dan seluruh baris itemnya dihapus permanen.</small>`, { danger: true }))) return;
    try { await DB.remove('purchase_orders', p.id); ERP.toast('PO dihapus'); if (after) after(); ERP.refresh(); } catch (e) { ERP.toast(e.message, 'err'); }
  }

  async function approve(p) {
    if (!ERP.can.approve()) { ERP.toast('Hanya Admin atau Supervisor yang dapat approve', 'err'); return; }
    if (!(await ERP.confirm(`Approve <b>${esc(p.po_number)}</b> (${fmtMoney(p.total, p.currency)})?`))) return;
    try { await DB.update('purchase_orders', p.id, { status: 'approved', approved_by: ERP.user.id, approved_at: new Date().toISOString() }); ERP.toast('PO disetujui'); ERP.refresh(); }
    catch (e) { ERP.toast(e.message, 'err'); }
  }
  function detailModal(p, data) {
    const um = data.userMap, cur = p.currency, fx = fxOf(p), dec = ERP.decimals(cur);
    const c = calcOf(p), M = (n) => fmtMoney(n, cur), I = (n) => (fx ? ` <small>≈ ${idr(n, fx)}</small>` : '');
    const lines = ERP.table([
      { label: 'Brand', html: (i) => `<b>${esc(i.brand)}</b>`, m: 'mt' }, { label: 'Model', v: (i) => i.model }, { label: 'Compound', v: (i) => i.compound }, { label: 'Gender', v: (i) => i.gender }, { label: 'Color', v: (i) => i.color }, { label: 'Size', v: (i) => i.size }, { label: 'No Order', v: (i) => i.order_no }, { label: 'Est Date', html: (i) => (i.est_date ? fmtDate(i.est_date) + (i.est_date < ERP.today() && !((p.rc[i.id] || { G: 0, D: 0 }).G + (p.rc[i.id] || { G: 0, D: 0 }).D >= Number(i.qty)) ? '<small class="neg">terlambat</small>' : '') : ''), cls: 'nw' },
      { label: 'Qty', html: (i) => qty(i.qty) + ' ' + esc(i.unit), cls: 'n nw' },
      { label: 'Diterima G/D', html: (i) => { const r = p.rc[i.id] || { G: 0, D: 0 }; return `${qty(r.G)} / ${qty(r.D)}`; }, cls: 'n nw' },
      { label: 'Harga', html: (i) => ERP.fmtNum(i.price, dec) + (fx ? `<small>${ERP.fmtNum(i.price * fx, 0)} IDR</small>` : ''), cls: 'n' },
      { label: 'Jumlah', html: (i) => ERP.fmtNum(i.qty * i.price, dec) + (fx ? `<small>${ERP.fmtNum(i.qty * i.price * fx, 0)} IDR</small>` : ''), cls: 'n' },
    ], p.items);
    const rcv = p.receipts.length ? ERP.table([{ label: 'Tanggal', v: (g) => fmtDate(g.gr_date) }, { label: 'No Surat Jalan', v: (g) => g.delivery_note_no }, { label: 'Diterima oleh', v: (g) => g.received_by }, { label: 'Item', v: (g) => g.items.map((x) => { const it = p.items.find((i) => i.id === x.po_item_id); return (it ? ERP.attrText(it) : '?') + ' ' + (x.grade === 'D' ? 'D' : 'G') + '×' + qty(x.qty); }).join('; '), m: 'mf' }], p.receipts) : '<div class="note">Belum ada penerimaan.</div>';
    const pays = p.payments.length ? ERP.table([{ label: 'Tanggal', v: (x) => fmtDate(x.pay_date) }, { label: 'Jumlah', html: (x) => fmtMoney(x.amount, cur), cls: 'n' }, { label: 'Catatan', v: (x) => x.note || '' }], p.payments) : '<div class="note">Belum ada pembayaran. Pembayaran diinput Finance di modul Pembayaran.</div>';
    const m = ERP.modal({
      title: esc(p.po_number) + (p.urgent ? ' <span class="urgent-tag">URGENT</span>' : ''), wide: true,
      html: `<dl class="kv"><dt>Tanggal</dt><dd>${fmtDate(p.po_date)}</dd><dt>Supplier</dt><dd>${esc(p.supplier.name)}</dd><dt>Pembayaran</dt><dd>${esc(ERP.termText(p))}</dd>
        ${fx ? `<dt>Rate</dt><dd>1 ${esc(cur)} = IDR ${ERP.fmtNum(fx, 2)}</dd>` : ''}
        <dt>Status</dt><dd>${ERP.approvalBadge(p)} ${p.approved_by && um[p.approved_by] ? '<small>oleh ' + esc(um[p.approved_by].full_name) + ', ' + ERP.fmtDate((p.approved_at || '').slice(0, 10)) + '</small>' : ''}</dd>
        <dt>Dibuat oleh</dt><dd>${esc((um[p.created_by] || {}).full_name || '-')}</dd>
        <dt>No FP</dt><dd>${esc((p.fpNos || []).join(', ')) || '-'}</dd><dt>No Invoice</dt><dd>${esc((p.invNos || []).join(', ')) || '-'}</dd>
        ${p.notes ? `<dt>Catatan</dt><dd>${esc(p.notes)}</dd>` : ''}</dl>
        <div class="sec-t">Item</div>${lines}
        <div class="totals"><div><span>Subtotal</span><span>${M(c.subtotal)}${I(c.subtotal)}</span></div>${c.disc > 0 ? `<div><span>Diskon</span><span>- ${M(c.disc)}</span></div>` : ''}<div><span>Total sebelum PPN</span><span>${M(c.dpp)}${I(c.dpp)}</span></div>${p.vat ? `<div><span>PPN 11%</span><span>${M(c.vatAmt)}</span></div>` : ''}${p.pph23 ? `<div><span>PPh 23 (${ERP.fmtNum(p.pph23_rate, 2)}%)</span><span>- ${M(c.pphAmt)}</span></div>` : ''}<div class="gt"><span>Total dibayar</span><span>${M(c.total)}${I(c.total)}</span></div>
        <div><span>Sudah dibayar</span><span>${M(p.paid)}</span></div><div><span>Sisa</span><span>${M(Math.max(0, c.total - p.paid))}</span></div></div>
        <div class="sec-t">Pembayaran</div>${pays}<div class="sec-t">Penerimaan barang</div>${rcv}`,
      actions: [
        { icon: 'print', tip: 'Print PO', onClick: () => printPO(p, um) },
        ...(ERP.can.write() ? [{ icon: 'edit', tip: 'Edit PO', onClick: (mm) => { mm.close(); location.hash = '#/po/edit/' + p.id; } }] : []),
        ...(ERP.can.approve() && p.status !== 'approved' ? [{ icon: 'check', tip: 'Approve PO', cls: 'ok', onClick: (mm) => { mm.close(); approve(p); } }] : []),
        { icon: 'download', tip: 'Export Excel PO ini', onClick: () => exportPOs([p], 'PO_' + p.po_number + '.xlsx') },
        ...(ERP.can.write() ? [{ icon: 'trash', tip: 'Hapus PO', cls: 'danger', onClick: (mm) => deletePO(p, () => mm.close()) }] : []),
      ],
    });
    return m;
  }

  /* ---------- Export Excel (ringkasan PO + detail item) ---------- */
  function exportPOs(list, filename) {
    if (!list.length) { ERP.toast('Tidak ada PO untuk diexport', 'err'); return; }
    const stage = (p) => STAGES.find((s) => s[0] === p.stage)[1];
    const sum = list.map((p) => [p.po_number, fmtDate(p.po_date), fmtDate(p.est_date), p.supplier.name, p.supplier.company_code || '', p.currency, fxOf(p) || '', ERP.termText(p), p.vat ? 'YA' : '', p.pph23 ? 'YA ' + p.pph23_rate + '%' : '', p.urgent ? 'YA' : '', Number(p.subtotal), Number(p.discount_amount), Number(p.subtotal) - Number(p.discount_amount), Number(p.vat_amount), Number(p.pph23_amount || 0), Number(p.total), p.paid, p.status === 'approved' ? 'Approved' : 'Menunggu approval', p.received, p.ordered, (p.fpNos || []).join(', '), (p.invNos || []).join(', '), stage(p)]);
    const det = [];
    list.forEach((p) => p.items.forEach((i, n) => { const r = p.rc[i.id] || { G: 0, D: 0 }; det.push([p.po_number, fmtDate(p.po_date), p.supplier.name, p.currency, n + 1, i.brand, i.model, i.compound || '', i.gender || '', i.color || '', i.size || '', i.order_no || '', i.est_date ? fmtDate(i.est_date) : '', Number(i.qty), i.unit, Number(i.price), ERP.round(i.qty * i.price, p.currency), fxOf(p) ? Number(i.price) * fxOf(p) : '', r.G, r.D]); }));
    ERP.xlsxExportMulti(filename, [
      { name: 'Ringkasan PO', headers: ['No PO', 'Tanggal', 'Est Date (terdekat)', 'Supplier', 'Kode Supplier', 'Mata Uang', 'Rate IDR', 'Pembayaran', 'PPN 11%', 'PPh 23', 'Urgent', 'Subtotal', 'Diskon', 'Total sebelum PPN', 'PPN', 'PPh 23 (nilai)', 'Total dibayar', 'Sudah dibayar', 'Approval', 'Qty diterima', 'Qty dipesan', 'No FP', 'No Invoice', 'Status'], rows: sum },
      { name: 'Detail Item', headers: ['No PO', 'Tanggal', 'Supplier', 'Mata Uang', 'No', 'Brand', 'Model', 'Compound', 'Gender', 'Color', 'Size', 'No Order', 'Est Date', 'Qty', 'Satuan', 'Harga', 'Jumlah', 'Harga IDR', 'Diterima Good', 'Diterima Defect'], rows: det },
    ]);
  }

  /* ---------- Import PO dari Excel ---------- */
  // Satu baris Excel = satu baris item. Baris dengan No PO sama digabung jadi satu PO (data header cukup diisi di baris pertama).
  const PO_HEAD = ['No PO', 'Tanggal PO', 'Supplier', 'Pembayaran', 'Tempo (hari)', 'Rate IDR', 'PPN', 'PPh 23 (%)', 'Diskon', 'Jenis Diskon', 'URGENT', 'Catatan', 'Brand', 'Model', 'Compound', 'Gender', 'Color', 'Size', 'No Order', 'Est Date', 'Qty', 'Harga IDR', 'Harga USD'];
  const PO_SAMPLE = [
    ['PO-CONTOH-001', '05-Jan-26', 'PT Contoh Supplier', 'Tempo', 30, 16300, 'YA', '', 5, '%', 'TIDAK', 'Contoh catatan', 'Aero', 'Runner X', 'EVA-60', 'Man', 'Black', '9', 'SO-001', '20-Feb-26', 100, '', 18.5],
    ['', '', '', '', '', '', '', '', '', '', '', '', 'Aero', 'Runner X', 'EVA-60', 'Man', 'Black', '10', 'SO-001', '20-Feb-26', 150, '', 18.5],
  ];
  function parsePOImport(rows, data) {
    const yes = (v) => ['ya', 'yes', 'y', '1', 'true', 'x'].includes(norm(String(v ?? '').trim()));
    const supBy = new Map(); data.sups.forEach((s) => [s.name, s.code, s.company_code].forEach((k) => k && supBy.set(norm(k).trim(), s)));
    const itemBy = new Map(); data.items.forEach((i) => { const k = ERP.itemKey(i); if (!itemBy.has(k)) itemBy.set(k, i); });
    const existing = new Set(data.pos.map((p) => norm(p.po_number).trim()));
    const groups = new Map(); let last = null;
    rows.forEach((r, n) => {
      const g = (...k) => String(ERP.pick(r, ...k) ?? '').trim();
      const no = g('no po', 'po', 'nomor po') || last;
      if (!no) return;                       // baris kosong
      last = no;
      const k = norm(no).trim();
      if (!groups.has(k)) groups.set(k, { no, rows: [] });
      groups.get(k).rows.push({ r, g, line: n + 2 });
    });
    const out = [];
    groups.forEach((G) => {
      const errs = [], first = (...k) => { for (const x of G.rows) { const v = x.g(...k); if (v) return v; } return ''; };
      const raw = (k) => { for (const x of G.rows) { const v = ERP.pick(x.r, k); if (v !== '' && v != null) return v; } return ''; };
      if (existing.has(norm(G.no).trim())) errs.push('No PO sudah ada di sistem');
      const date = ERP.toISO(raw('tanggal po') || raw('tanggal')); if (!date) errs.push('Tanggal PO kosong / tidak valid');
      const sup = supBy.get(norm(first('supplier', 'nama supplier', 'kode supplier')).trim()); if (!sup) errs.push(`Supplier "${first('supplier', 'nama supplier', 'kode supplier')}" tidak ditemukan di database Supplier`);
      const pay = norm(first('pembayaran', 'term')).startsWith('tempo') ? 'tempo' : 'cash', days = parseInt(first('tempo (hari)', 'tempo')) || 0;
      if (pay === 'tempo' && !(days > 0)) errs.push('Pembayaran Tempo butuh jumlah hari (kolom "Tempo (hari)")');
      const pph = ERP.num(raw('pph 23 (%)') || raw('pph 23') || 0), vat = yes(first('ppn', 'ppn 11%'));
      const dv = ERP.num(raw('diskon') || 0), dt = /nilai|amt|rp|usd/i.test(first('jenis diskon')) ? 'amt' : 'pct';
      const lines = [], lineCurs = [];
      G.rows.forEach(({ r, g, line }) => {
        const rec = { brand: g('brand'), model: g('model', 'model name'), compound: g('compound', 'compound name'), gender: g('gender'), color: g('color', 'colour'), size: g('size') };
        if (!rec.brand && !rec.model) return;
        const gm = ERP.GENDERS.find((x) => x.toLowerCase() === rec.gender.toLowerCase()); if (gm) rec.gender = gm;
        const sz = ERP.SIZES.find((x) => x.toLowerCase() === rec.size.toLowerCase()); if (sz) rec.size = sz;
        const it = itemBy.get(ERP.itemKey(rec));
        const pI = ERP.pick(r, 'harga idr'), pU = ERP.pick(r, 'harga usd'), pL = ERP.pick(r, 'harga', 'harga satuan', 'price');
        let lc = '', price = 0;
        if (pI !== '' && pU !== '') lc = 'both'; else if (pI !== '') { lc = 'IDR'; price = ERP.num(pI); } else if (pU !== '') { lc = 'USD'; price = ERP.num(pU); } else if (pL !== '') { lc = sup ? sup.currency || 'IDR' : 'IDR'; price = ERP.num(pL); }
        const q = ERP.num(ERP.pick(r, 'qty', 'jumlah'));
        if (lc === 'both') { errs.push(`Baris Excel ${line}: Harga IDR dan Harga USD sama-sama terisi — isi salah satu`); return; }
        if (!it) { errs.push(`Baris Excel ${line}: item "${ERP.attrText(rec)}" tidak ada di Master Item`); return; }
        if (!(q > 0)) { errs.push(`Baris Excel ${line}: Qty harus > 0`); return; }
        if (!(price > 0)) { errs.push(`Baris Excel ${line}: Harga IDR / Harga USD harus diisi (> 0)`); return; }
        lineCurs.push(lc);
        lines.push({ item_id: it.id, brand: it.brand, model: it.model, compound: it.compound || null, gender: it.gender || null, color: it.color || null, size: it.size || null, unit: it.unit, order_no: g('no order', 'no order cust') || null, est_date: ERP.toISO(ERP.pick(r, 'est date', 'est. date', 'estimasi')) || null, qty: q, price });
      });
      if (!lines.length && !errs.length) errs.push('Tidak ada baris item');
      const curs = [...new Set(lineCurs)];
      if (curs.length > 1) errs.push(`Satu PO hanya boleh satu mata uang, tetapi baris mengisi ${curs.join(' dan ')}. Pisahkan menjadi No PO yang berbeda`);
      const cur = curs[0] || (sup ? sup.currency || 'IDR' : 'IDR');
      const warns = []; if (sup && lines.length && cur !== (sup.currency || 'IDR')) warns.push(`Mata uang ${cur} berbeda dari data supplier (${sup.currency || 'IDR'})`);
      const fx = cur !== 'IDR' ? ERP.num(raw('rate idr') || raw('rate')) : 0;
      const c = calc(lines, dt, dv, vat, pph > 0, pph, cur);
      out.push({ no: G.no, date, sup, cur, errs, warns, lines, total: c.total, hdr: sup && date ? {
        po_number: G.no, po_date: date, supplier_id: sup.id, currency: cur, fx_rate: fx || null, payment_type: pay, tempo_mode: pay === 'tempo' ? 'days' : null, tempo_days: pay === 'tempo' ? days : null, tempo_date: null,
        vat, pph23: pph > 0, pph23_rate: pph > 0 ? pph : null, pph23_amount: c.pphAmt, urgent: yes(first('urgent')), discount_type: dt, discount_value: dv, subtotal: c.subtotal, discount_amount: c.disc, vat_amount: c.vatAmt, total: c.total, notes: first('catatan', 'notes') || null,
        est_date: lines.map((l) => l.est_date).filter(Boolean).sort()[0] || null } : null });
    });
    return out;
  }
  async function importPOs(data) {
    const f = await ERP.pickFile(); if (!f) return;
    let list;
    try { list = parsePOImport(await ERP.xlsxRead(f), data); } catch (e) { ERP.toast('File tidak bisa dibaca: ' + e.message, 'err'); return; }
    if (!list.length) { ERP.toast('Tidak ada data di file. Gunakan template (kolom No PO, Supplier, Brand, Model, Qty, Harga).', 'err'); return; }
    const good = list.filter((x) => !x.errs.length), bad = list.filter((x) => x.errs.length);
    const okTbl = good.length ? ERP.table([{ label: 'No PO', html: (x) => `<b>${esc(x.no)}</b>`, m: 'mt' }, { label: 'Tanggal', v: (x) => fmtDate(x.date), cls: 'nw' }, { label: 'Supplier', v: (x) => x.sup.name }, { label: 'Baris item', v: (x) => x.lines.length, cls: 'n' }, { label: 'Total', html: (x) => fmtMoney(x.total, x.cur), cls: 'n nw' }, { label: 'Catatan', html: (x) => (x.warns.length ? `<span class="neg">${esc(x.warns.join('; '))}</span>` : ''), m: 'mf' }], good.map((x, i) => ({ ...x, id: 'g' + i }))) : '';
    const errBox = bad.length ? `<div class="sec-t">Tidak bisa diimport (${bad.length} PO)</div>${bad.map((x) => `<div class="note"><b>${esc(x.no)}</b><br>${x.errs.map((e) => '• ' + esc(e)).join('<br>')}</div>`).join('')}` : '';
    ERP.modal({
      title: 'Import PO dari Excel', wide: true,
      html: `<div class="note">${good.length} PO siap diimport${bad.length ? `, ${bad.length} PO bermasalah akan dilewati (perbaiki di Excel lalu import lagi — PO yang sudah masuk tidak akan terduplikasi)` : ''}. PO hasil import berstatus <b>Menunggu Approval</b>.</div>${okTbl}${errBox}`,
      actions: good.length ? [{ icon: 'check', tip: `Import ${good.length} PO`, cls: 'primary', onClick: async (m) => {
        let n = 0; const fails = [];
        for (const x of good) {
          let poId = null;
          try {
            const [po] = await DB.insert('purchase_orders', { ...x.hdr, status: 'pending', revision: 0 }); poId = po.id;
            await DB.insert('po_items', x.lines.map((l, i) => ({ ...l, po_id: poId, line_no: i + 1 }))); n++;
          } catch (e) { fails.push(x.no + ': ' + e.message); if (poId) { try { await DB.remove('purchase_orders', poId); } catch (_) {} } }
        }
        m.close(); S.tab = 'active';
        ERP.toast(`${n} PO diimport${fails.length ? ', gagal: ' + fails.join('; ') : ''}`, fails.length ? 'err' : undefined);
        ERP.refresh();
      } }] : [],
    });
  }

  /* ---------- Daftar ---------- */
  async function renderList(v) {
    const data = await ERP.loadPO();
    const canW = ERP.can.write();
    const matches = (p) => !S.q || norm(p.po_number).includes(S.q) || norm(p.supplier.name).includes(S.q) || p.items.some((i) => norm(ERP.attrText(i)).includes(S.q));
    v.innerHTML = `<div class="toolbar">${ERP.searchBox('q', 'Cari nama supplier / brand / model / compound / color / size / no PO…')}
      <div class="tb-actions">${canW ? btn('plus', 'Buat PO baru', 'id="b-new"', 'primary') + btn('upload', 'Import PO dari Excel', 'id="b-imp"') + btn('template', 'Unduh template import PO', 'id="b-tpl"') : ''}${btn('print', 'Print daftar', 'id="b-prt"')}${btn('download', 'Export ke Excel', 'id="b-exp"')}</div></div>
      <div class="tabs" id="tabs"></div><div id="list"></div>`;
    $('#q').value = S.q;
    const bar = (a, b, ok) => `<div class="bar ${ok ? 'ok' : ''}"><i style="width:${b > 0 ? Math.min(100, (a / b) * 100) : 0}%"></i></div>`;
    const cols = [
      { label: 'No PO', html: (p) => `<b>${esc(p.po_number)}</b>${p.urgent ? '<span class="urgent-tag">URGENT</span>' : ''}`, cls: 'nw', m: 'mt' },
      { label: 'Tanggal', v: (p) => fmtDate(p.po_date), cls: 'nw' },
      { label: 'Supplier', v: (p) => p.supplier.name },
      { label: 'Total dibayar', html: (p) => fmtMoney(p.total, p.currency) + (fxOf(p) ? `<small>≈ ${idr(p.total, fxOf(p))}</small>` : ''), cls: 'n nw' },
      { label: 'Approval', html: (p) => ERP.approvalBadge(p) },
      { label: 'Diterima', html: (p) => `${qty(p.received)} / ${qty(p.ordered)}${bar(p.received, p.ordered, p.allReceived)}`, cls: 'nw' },
      { label: 'Dibayar', html: (p) => `${ERP.fmtNum(p.paid, ERP.decimals(p.currency))}${bar(p.paid, p.total, p.fullyPaid)}`, cls: 'nw' },
      { label: 'Pembayaran', v: (p) => ERP.termText(p), cls: 'hide-md', m: 'mh' },
      { label: 'Est Date', html: (p) => (p.est_date ? fmtDate(p.est_date) + (p.est_date < ERP.today() && !p.allReceived ? '<small class="neg">terlambat</small>' : '') : '-'), cls: 'nw hide-md', m: 'mh' },
      { label: '', cls: 'act', html: (p) => btn('eye', 'Lihat detail', `data-a="view" data-id="${p.id}"`, 'sm') + btn('print', 'Print PO', `data-a="print" data-id="${p.id}"`, 'sm')
        + (canW ? btn('edit', 'Edit (perlu approval ulang)', `data-a="edit" data-id="${p.id}"`, 'sm') : '')
        + (ERP.can.approve() && p.status !== 'approved' ? btn('check', 'Approve PO', `data-a="approve" data-id="${p.id}"`, 'sm ok') : '')
        + btn('download', 'Export Excel PO ini', `data-a="xls" data-id="${p.id}"`, 'sm')
        + (canW ? btn('trash', 'Hapus PO', `data-a="del" data-id="${p.id}"`, 'sm danger') : '') },
    ];
    const draw = () => {
      const base = data.pos.filter(matches);
      $('#tabs').innerHTML = STAGES.map(([k, l]) => `<button data-t="${k}" class="${S.tab === k ? 'on' : ''}">${l}<span class="cnt">${base.filter((p) => p.stage === k).length}</span></button>`).join('');
      const rows = base.filter((p) => p.stage === S.tab);
      const empty = { active: 'Tidak ada PO aktif.', received: 'Belum ada PO yang barangnya diterima semua.', done: 'Belum ada PO selesai.' }[S.tab];
      $('#list').innerHTML = ERP.table(cols, rows, { empty, rowCls: (p) => (p.urgent ? 'urgent' : '') });
      draw.rows = rows;
    };
    draw();
    $('#q').oninput = ERP.debounce((e) => { S.q = norm(e.target.value.trim()); draw(); });
    $('#tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { S.tab = b.dataset.t; draw(); } };
    if ($('#b-new')) $('#b-new').onclick = () => (location.hash = '#/po/new');
    if ($('#b-imp')) $('#b-imp').onclick = () => importPOs(data);
    if ($('#b-tpl')) $('#b-tpl').onclick = () => ERP.xlsxExport('Template_Import_PO.xlsx', 'PO', PO_HEAD, PO_SAMPLE);
    $('#b-prt').onclick = () => ERP.printTable('Daftar PO — ' + STAGES.find((s) => s[0] === S.tab)[1], [{ label: 'No PO', v: (p) => p.po_number + (p.urgent ? ' (URGENT)' : '') }, { label: 'Tanggal', v: (p) => fmtDate(p.po_date) }, { label: 'Supplier', v: (p) => p.supplier.name }, { label: 'Total dibayar', num: true, v: (p) => fmtMoney(p.total, p.currency) }, { label: 'Approval', v: (p) => (p.status === 'approved' ? 'Approved' : 'Menunggu') }, { label: 'Diterima', v: (p) => qty(p.received) + '/' + qty(p.ordered) }, { label: 'Dibayar', num: true, v: (p) => fmtMoney(p.paid, p.currency) }, { label: 'Pembayaran', v: (p) => ERP.termText(p) }, { label: 'Est Date', v: (p) => fmtDate(p.est_date) }, { label: 'No FP', v: (p) => (p.fpNos || []).join(', ') }], draw.rows);
    $('#b-exp').onclick = () => exportPOs(draw.rows, 'PO_' + ERP.today() + '.xlsx');
    $('#list').onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const p = data.pos.find((x) => x.id === b.dataset.id);
      ({ view: () => detailModal(p, data), print: () => printPO(p, data.userMap), edit: () => (location.hash = '#/po/edit/' + p.id), approve: () => approve(p), xls: () => exportPOs([p], 'PO_' + p.po_number + '.xlsx'), del: () => deletePO(p) })[b.dataset.a]();
    };
  }

  /* ---------- Form PO ---------- */
  async function renderForm(v, id) {
    const data = await ERP.loadPO();
    let sups = data.sups, items = data.items;
    const old = id ? data.pos.find((p) => p.id === id) : null;
    if (id && !old) { v.innerHTML = '<div class="empty">PO tidak ditemukan.</div>'; return; }
    const A = ['brand', 'model', 'compound', 'gender', 'color', 'size', 'unit'];
    const pickA = (o) => Object.fromEntries(A.map((k) => [k, o[k] || '']));
    function newLine() { return { k: Math.random(), item_id: null, brand: '', model: '', compound: '', gender: '', color: '', size: '', order_no: '', est: '', unit: '', qty: 1, price: '', recvd: 0 }; }
    const st = old ? {
      no: old.po_number, date: old.po_date, supplier: old.supplier.id ? old.supplier : null, payType: old.payment_type, tempoMode: old.tempo_mode || 'days', tempoDays: old.tempo_days || 30, tempoDate: old.tempo_date || '',
      vat: !!old.vat, pph: !!old.pph23, pphRate: old.pph23 ? old.pph23_rate : 2, urgent: !!old.urgent, discType: old.discount_type || 'pct', discVal: old.discount_value || 0, notes: old.notes || '', fx: Number(old.fx_rate) || 0,
      lines: old.items.map((i) => ({ k: Math.random(), id: i.id, item_id: i.item_id, order_no: i.order_no || '', est: i.est_date || '', ...pickA(i), qty: i.qty, price: i.price, recvd: old.recv[i.id] || 0 })),
    } : { no: '', date: ERP.today(), supplier: null, payType: 'cash', tempoMode: 'days', tempoDays: 30, tempoDate: '', vat: false, pph: false, pphRate: 2, urgent: false, discType: 'pct', discVal: 0, notes: '', fx: 0, lines: [] };
    if (!st.lines.length) st.lines.push(newLine());
    const cur0 = old ? old.currency : null, sup0 = old ? old.supplier_id : null;   // PO hasil import bisa bermata uang beda dari supplier
    const cur = () => (st.supplier ? (cur0 && st.supplier.id === sup0 ? cur0 : st.supplier.currency || 'IDR') : 'IDR');
    const fx = () => (cur() !== 'IDR' && st.fx > 0 ? st.fx : 0);

    v.innerHTML = `<div class="page-head">${btn('back', 'Kembali ke daftar PO', 'id="b-back"')}<h3>${old ? 'Edit ' + esc(old.po_number) : 'Buat PO Baru'}</h3>${btn('check', old ? 'Simpan perubahan (butuh approval ulang)' : 'Simpan PO', 'id="b-save"', 'primary')}</div>
      ${old && old.status === 'approved' ? '<div class="card" style="margin-bottom:10px;border-color:var(--warn)">PO ini sudah di-approve. Setelah disimpan, status kembali <b>Menunggu Approval</b> dan harus disetujui ulang oleh Supervisor.</div>' : ''}
      <div class="card"><div class="grid c4 po-top">
        ${ERP.field('No PO * (diisi manual)', `<input id="f-pono" value="${esc(st.no)}" autocomplete="off" placeholder="mis. SSBI-DM-MAIN-202610005">`)}
        ${ERP.field('Tanggal PO', ERP.dateInput('po_date', st.date))}
                ${ERP.field('Supplier *', `<input id="f-sup" placeholder="Cari nama supplier…" value="${esc(st.supplier ? st.supplier.name : '')}" autocomplete="off">`, 'po-sup')}
        ${ERP.field('Mata uang', `<input id="f-cur" value="${esc(cur())}" readonly>`, 'po-cur')}
        <label class="fld po-fx" id="fx-wrap"><span id="fx-lbl">Rate → IDR</span><input id="f-fx" inputmode="decimal" placeholder="mis. 16.300 (kosongkan jika tidak perlu)"></label>
      </div>
      <div class="grid c3" style="margin-top:10px">
        <div class="fld"><span>Pembayaran</span><div class="chk-row"><label class="chk"><input type="checkbox" id="f-cash"> Cash</label><label class="chk"><input type="checkbox" id="f-tempo"> Tempo</label></div>
          <div class="tempo-box" id="tempo-box" style="margin-top:4px"><select id="f-tmode"><option value="days">Jumlah hari</option><option value="date">Tanggal tertentu</option></select><span id="tm-days"><input id="f-tdays" inputmode="numeric" style="width:90px" placeholder="hari"> hari</span><span id="tm-date">${ERP.dateInput('tempo_date', st.tempoDate)}</span></div></div>
        <div class="fld"><span>Opsi</span><div class="chk-row"><label class="chk"><input type="checkbox" id="f-vat"> Tambah PPN 11%</label><label class="chk"><input type="checkbox" id="f-pph"> PPh 23</label><span id="pph-box" class="tempo-box"><input id="f-pphr" inputmode="decimal" style="width:70px"> %</span></div>
          <label class="chk"><input type="checkbox" id="f-urg"> <b style="color:var(--err)">URGENT (PO Mendesak)</b></label></div>
        <div class="fld"><span>Diskon</span><div class="tempo-box"><select id="f-dt" style="width:auto"><option value="pct">%</option><option value="amt">Nilai</option></select><input id="f-dv" inputmode="decimal" style="width:130px"></div></div>
      </div></div>
      <div class="card" style="margin-top:12px"><div class="page-head" style="margin:0"><h3>Item</h3>${btn('plus', 'Buat item master baru', 'id="b-newitem"')}${btn('plus', 'Tambah baris item', 'id="b-addline"', 'primary')}</div>
        <div class="lines"><div id="lines-head"></div><div id="lines" class="lines"></div></div>
        <div class="totals" id="totals"></div></div>
      <div class="card" style="margin-top:12px">${ERP.field('Catatan untuk supplier (opsional)', `<textarea id="f-notes" rows="2">${esc(st.notes)}</textarea>`)}</div>`;

    $('#f-cash').checked = st.payType === 'cash'; $('#f-tempo').checked = st.payType === 'tempo';
    $('#f-tmode').value = st.tempoMode; $('#f-tdays').value = st.tempoDays;
    $('#f-vat').checked = st.vat; $('#f-pph').checked = st.pph; $('#f-pphr').value = st.pphRate; $('#f-urg').checked = st.urgent; $('#f-dt').value = st.discType; $('#f-dv').value = st.discVal || '';
    $('#f-fx').value = st.fx || '';
    const syncTempo = () => { $('#tempo-box').style.display = st.payType === 'tempo' ? 'flex' : 'none'; $('#tm-days').style.display = st.tempoMode === 'days' ? '' : 'none'; $('#tm-date').style.display = st.tempoMode === 'date' ? '' : 'none'; };
    const syncFx = () => { $('#fx-wrap').style.display = cur() === 'IDR' ? 'none' : ''; $('#fx-lbl').textContent = `Rate ${cur()} → IDR`; $('#pph-box').style.display = st.pph ? 'flex' : 'none'; };
    syncTempo(); syncFx();
    $('#f-cash').onchange = (e) => { st.payType = e.target.checked ? 'cash' : 'tempo'; $('#f-cash').checked = st.payType === 'cash'; $('#f-tempo').checked = st.payType === 'tempo'; syncTempo(); };
    $('#f-tempo').onchange = (e) => { st.payType = e.target.checked ? 'tempo' : 'cash'; $('#f-cash').checked = st.payType === 'cash'; $('#f-tempo').checked = st.payType === 'tempo'; syncTempo(); };
    $('#f-tmode').onchange = (e) => { st.tempoMode = e.target.value; syncTempo(); };
    $('#f-tdays').oninput = (e) => (st.tempoDays = parseInt(e.target.value) || 0);
    v.onchange = (e) => { if (e.target.name === 'tempo_date') st.tempoDate = ERP.parseDate(e.target.value); if (e.target.name === 'po_date') st.date = ERP.parseDate(e.target.value) || st.date; if (e.target.name === 'line_est') { const l = st.lines.find((x) => String(x.k) === e.target.dataset.k); if (l) l.est = ERP.parseDate(e.target.value); } };
    $('#f-vat').onchange = (e) => { st.vat = e.target.checked; totals(); };
    $('#f-pph').onchange = (e) => { st.pph = e.target.checked; syncFx(); totals(); };
    $('#f-pphr').oninput = (e) => { st.pphRate = e.target.value; totals(); };
    $('#f-urg').onchange = (e) => (st.urgent = e.target.checked);
    $('#f-dt').onchange = (e) => { st.discType = e.target.value; totals(); };
    $('#f-dv').oninput = (e) => { st.discVal = e.target.value; totals(); };
    $('#f-fx').oninput = (e) => { st.fx = ERP.num(e.target.value); drawLines(); };
    $('#f-notes').oninput = (e) => (st.notes = e.target.value);
    $('#f-pono').oninput = (e) => (st.no = e.target.value);

    ERP.combo($('#f-sup'), (q) => { const n = norm(q); return sups.filter((s) => !n || norm(s.name).includes(n) || norm(s.code).includes(n) || norm(s.contact_person).includes(n)).map((s) => ({ s, label: s.name, sub: `${s.code} · ${s.currency}${s.contact_person ? ' · ' + s.contact_person : ''}` })); },
      (it) => { st.supplier = it.s; $('#f-sup').value = it.s.name; $('#f-cur').value = cur(); syncFx(); drawLines(); });
    $('#f-sup').addEventListener('input', () => { if (st.supplier && st.supplier.name !== $('#f-sup').value) { st.supplier = null; $('#f-cur').value = 'IDR'; syncFx(); drawLines(); } });

    /* baris item: No - Brand - Model - Compound - Gender - Color - Size - No Order - Est Date - Qty - Satuan - Harga [- Harga IDR] - Jumlah [- Jumlah IDR] */
    const linesEl = $('#lines');
    const fillItem = (l, it) => Object.assign(l, { item_id: it.id }, pickA(it));
    const headHTML = () => `<div class="line head po ${fx() ? 'fx' : ''}"><span>No</span><span>Brand (cari item)</span><span>Model</span><span>Compound</span><span>Gender</span><span>Color</span><span>Size</span><span>No Order</span><span>Est Date</span><span>Qty</span><span>Satuan</span><span>Harga ${esc(cur())}</span>${fx() ? '<span>Harga IDR</span>' : ''}<span>Jumlah ${esc(cur())}</span>${fx() ? '<span>Jumlah IDR</span>' : ''}<span></span></div>`;
    function drawLines() {
      $('#lines-head').innerHTML = headHTML();
      const F = fx();
      linesEl.innerHTML = st.lines.map((l, n) => `<div class="line po ${F ? 'fx' : ''}" data-k="${l.k}"><span class="no">${n + 1}</span>
        <div class="it"><input class="li-item" placeholder="Cari item…" value="${esc(l.brand)}" autocomplete="off"></div>
        <span class="at">${esc(l.model)}</span><span class="at">${esc(l.compound)}</span><span class="at">${esc(l.gender)}</span><span class="at">${esc(l.color)}</span><span class="at">${esc(l.size)}</span>
        <span class="at-all">${esc(ERP.attrText(l))}</span>
        <div class="oo"><input class="li-ord" value="${esc(l.order_no)}" placeholder="No Order (ketik / pilih SO)" autocomplete="off"></div>
        <div class="ed">${ERP.dateInput('line_est', l.est, `data-k="${l.k}"`)}</div>
        <div class="qt"><input class="li-qty r" inputmode="decimal" value="${l.qty}" ${l.recvd ? `title="Sudah diterima ${l.recvd}"` : ''}></div>
        <span class="un">${esc(l.unit)}</span>
        <div class="pr"><input class="li-price r" inputmode="decimal" value="${l.price === '' ? '' : l.price}" placeholder="Harga"></div>
        ${F ? '<span class="amt pi"></span>' : ''}<span class="amt aa"></span>${F ? '<span class="amt ai"></span>' : ''}
        <div class="rm">${l.recvd ? '' : btn('trash', 'Hapus baris', 'data-rm', 'sm danger')}</div></div>`).join('');
      $$('.line[data-k]', linesEl).forEach((row) => {
        const l = st.lines.find((x) => String(x.k) === row.dataset.k);
        ERP.combo($('.li-item', row), (q) => { const n = norm(q); return items.filter((i) => !n || norm(ERP.attrText(i)).includes(n)).sort((a, b) => ERP.attrText(a).localeCompare(ERP.attrText(b), undefined, { numeric: true })).map((i) => ({ i, label: ERP.attrText(i), sub: i.unit })); }, (it) => { fillItem(l, it.i); drawLines(); });
        $('.li-ord', row).oninput = (e) => (l.order_no = e.target.value);
        ERP.combo($('.li-ord', row), (q) => { const n = norm(q); return (data.sos || []).filter((s) => !n || norm(s.so_number).includes(n) || norm(s.client.name).includes(n)).map((s) => ({ s, label: s.so_number, sub: `${s.client.name} · ${fmtDate(s.so_date)}${s.status !== 'approved' ? ' · belum approved' : ''}` })); }, (it) => { l.order_no = it.s.so_number; $('.li-ord', row).value = it.s.so_number; });
        $('.li-qty', row).oninput = (e) => { l.qty = ERP.num(e.target.value); amt(row, l); totals(); };
        $('.li-price', row).oninput = (e) => { l.price = e.target.value === '' ? '' : ERP.num(e.target.value); amt(row, l); totals(); };
        amt(row, l);
      });
      totals();
    }
    function amt(row, l) {
      const c = cur(), F = fx(), a = ERP.num(l.qty) * ERP.num(l.price);
      $('.aa', row).textContent = ERP.fmtNum(a, ERP.decimals(c));
      if (F) { $('.pi', row).textContent = ERP.fmtNum(ERP.num(l.price) * F, 0); $('.ai', row).textContent = ERP.fmtNum(a * F, 0); }
    }
    function totals() {
      const c = calc(st.lines, st.discType, st.discVal, st.vat, st.pph, st.pphRate, cur()), F = fx(); const m = (n) => fmtMoney(n, cur()); const ii = (n) => (F ? `<small class="idr">≈ ${idr(n, F)}</small>` : '');
      $('#totals').innerHTML = `<div><span>Subtotal</span><span>${m(c.subtotal)}${ii(c.subtotal)}</span></div>${c.disc > 0 ? `<div><span>Diskon</span><span>- ${m(c.disc)}</span></div>` : ''}<div><b>Total (sebelum PPN)</b><b>${m(c.dpp)}${ii(c.dpp)}</b></div>${st.vat ? `<div><span>PPN 11%</span><span>${m(c.vatAmt)}</span></div>` : ''}${st.pph ? `<div><span>PPh 23 (${ERP.fmtNum(ERP.num(st.pphRate), 2)}%)</span><span>- ${m(c.pphAmt)}</span></div>` : ''}<div class="gt"><span>Total dibayar</span><span>${m(c.total)}${ii(c.total)}</span></div>`;
      $$('.line[data-k]', linesEl).forEach((row) => amt(row, st.lines.find((x) => String(x.k) === row.dataset.k)));
    }
    linesEl.onclick = (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; const k = b.closest('.line').dataset.k; st.lines = st.lines.filter((x) => String(x.k) !== k); if (!st.lines.length) st.lines.push(newLine()); drawLines(); };
    $('#b-addline').onclick = () => { st.lines.push(newLine()); drawLines(); const ins = $$('.li-item', linesEl); ins[ins.length - 1].focus(); };
    $('#b-newitem').onclick = () => ERP.modal({
      title: 'Buat Item Master Baru', html: ERP.itemForm(null), wide: true,
      actions: [{ icon: 'check', tip: 'Simpan & pakai di PO', cls: 'primary', onClick: async (m) => {
        const d = ERP.formData(m.el); if (!d.brand || !d.model) { ERP.toast('Brand dan Model Name wajib diisi', 'err'); return; }
        if (ERP.itemDup(items, d)) { ERP.toast('Item dengan kombinasi yang sama sudah ada', 'err'); return; }
        try { const [it] = await DB.insert('items', ERP.itemRecord(d)); items = items.concat(it); const empty = st.lines.find((l) => !l.item_id); const l = empty || newLine(); fillItem(l, it); if (!empty) st.lines.push(l); m.close(); drawLines(); ERP.toast('Item dibuat & ditambahkan'); } catch (e) { ERP.toast(e.message, 'err'); }
      } }],
    });
    $('#b-back').onclick = () => (location.hash = '#/po');
    drawLines();

    /* simpan */
    $('#b-save').onclick = async () => {
      const lines = st.lines.filter((l) => l.item_id || l.brand);
      if (!st.supplier) { ERP.toast('Pilih supplier dari daftar', 'err'); return; }
      if (!st.date) { ERP.toast('Tanggal PO tidak valid', 'err'); return; }
      if (!lines.length || lines.some((l) => !l.item_id)) { ERP.toast('Setiap baris harus memilih item dari master item', 'err'); return; }
      if (lines.some((l) => ERP.num(l.qty) <= 0)) { ERP.toast('Qty harus lebih dari 0', 'err'); return; }
      if (lines.some((l) => !(ERP.num(l.price) > 0))) { ERP.toast('Isi harga untuk semua baris', 'err'); return; }
      if (lines.some((l) => l.recvd && ERP.num(l.qty) < l.recvd)) { ERP.toast('Qty tidak boleh kurang dari jumlah yang sudah diterima', 'err'); return; }
      if (st.payType === 'tempo' && st.tempoMode === 'days' && !(st.tempoDays > 0)) { ERP.toast('Isi jumlah hari tempo', 'err'); return; }
      if (st.payType === 'tempo' && st.tempoMode === 'date' && !st.tempoDate) { ERP.toast('Isi tanggal tempo', 'err'); return; }
      if (st.pph && !(ERP.num(st.pphRate) > 0)) { ERP.toast('Isi tarif PPh 23', 'err'); return; }
      st.no = String(st.no || '').trim();
      if (!st.no) { ERP.toast('No PO wajib diisi', 'err'); return; }
      if (data.pos.some((p) => p.id !== (old || {}).id && norm(p.po_number) === norm(st.no))) { ERP.toast('No PO sudah dipakai PO lain', 'err'); return; }
      const c = calc(lines, st.discType, st.discVal, st.vat, st.pph, st.pphRate, cur());
      const hdr = { po_number: st.no, po_date: st.date, est_date: lines.map((l) => l.est).filter(Boolean).sort()[0] || null, supplier_id: st.supplier.id, currency: cur(), fx_rate: fx() || null, payment_type: st.payType, tempo_mode: st.payType === 'tempo' ? st.tempoMode : null, tempo_days: st.payType === 'tempo' && st.tempoMode === 'days' ? st.tempoDays : null, tempo_date: st.payType === 'tempo' && st.tempoMode === 'date' ? st.tempoDate : null,
        vat: st.vat, pph23: st.pph, pph23_rate: st.pph ? ERP.num(st.pphRate) : null, pph23_amount: c.pphAmt, urgent: st.urgent, discount_type: st.discType, discount_value: ERP.num(st.discVal), subtotal: c.subtotal, discount_amount: c.disc, vat_amount: c.vatAmt, total: c.total, notes: st.notes || null };
      const rec = (l, n, poId) => ({ po_id: poId, line_no: n + 1, item_id: l.item_id, brand: l.brand, model: l.model, compound: l.compound || null, gender: l.gender || null, color: l.color || null, size: l.size || null, order_no: String(l.order_no || '').trim() || null, est_date: l.est || null, unit: l.unit, qty: ERP.num(l.qty), price: ERP.num(l.price) });
      const btnSave = $('#b-save'); btnSave.disabled = true;
      try {
        let poId;
        if (!old) {
          const [po] = await DB.insert('purchase_orders', { ...hdr, status: 'pending', revision: 0 });
          poId = po.id;
          await DB.insert('po_items', lines.map((l, n) => rec(l, n, poId)));
        } else {
          poId = old.id;
          await DB.update('purchase_orders', poId, { ...hdr, status: 'pending', revision: old.status === 'approved' ? (old.revision || 0) + 1 : old.revision || 0, approved_by: null, approved_at: null });
          const keep = new Set(lines.filter((l) => l.id).map((l) => l.id));
          for (const i of old.items) if (!keep.has(i.id)) await DB.remove('po_items', i.id);
          for (let n = 0; n < lines.length; n++) { const l = lines[n]; if (l.id) { const { po_id, ...r } = rec(l, n, poId); await DB.update('po_items', l.id, r); } else await DB.insert('po_items', rec(l, n, poId)); }
        }
        ERP.toast(old ? 'PO diperbarui — menunggu approval Supervisor' : 'PO dibuat — menunggu approval Supervisor');
        S.tab = 'active'; location.hash = '#/po';
      } catch (e) { btnSave.disabled = false; ERP.toast('Gagal menyimpan: ' + e.message, 'err'); }
    };
  }

  ERP.register('po', {
    async render(v, parts) {
      if (parts[0] === 'new' || parts[0] === 'edit') {
        if (!ERP.can.write()) { v.innerHTML = '<div class="empty">Akun ini tidak dapat membuat/mengedit PO.</div>'; return; }
        return renderForm(v, parts[0] === 'edit' ? parts[1] : null);
      }
      return renderList(v);
    },
  });
})();
