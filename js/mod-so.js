/* Sales Order: order yang diterima dari client. No SO dipakai sebagai "No Order" di baris Purchase Order. */
(function () {
  const ERP = window.ERP;
  const { $, $$, esc, btn, norm, fmtMoney, fmtDate } = ERP;
  const DB = ERP.DB;
  const S = { tab: 'active', q: '' };
  const qty = (n) => ERP.fmtNum(n, Number.isInteger(+n) ? 0 : 2);
  const STAGES = [['pending', 'Menunggu Approval'], ['active', 'SO Aktif'], ['done', 'Barang Diterima Semua']];
  const fxOf = (s) => (s.fx_rate > 0 && s.currency !== 'IDR' ? Number(s.fx_rate) : 0);
  const dstr = (d) => (d ? fmtDate(d) : '');
  const minDate = (items, k) => items.map((i) => i[k]).filter(Boolean).sort()[0] || '';
  const calc = (lines, dt, dv, vat, pph, pr, cur) => ERP.calcPO(lines, dt, dv, vat, pph, pr, cur);
  const calcOf = (s) => calc(s.items, s.discount_type, s.discount_value, s.vat, s.pph23, s.pph23_rate, s.currency);
  const idr = (n, fx) => 'IDR ' + ERP.fmtNum(n * fx, 0);
  const termOf = (c) => (c && c.payment_term === 'tempo' ? { payment_type: 'tempo', tempo_mode: 'days', tempo_days: Number(c.tempo_days) || 0, tempo_date: null } : { payment_type: 'cash', tempo_mode: null, tempo_days: null, tempo_date: null });

  /* ---------- Print SO (format sama dengan PO) ---------- */
  function printSO(s, userMap) {
    const cur = s.currency, c = s.client || {}, dec = ERP.decimals(cur), fx = fxOf(s), t = calcOf(s), n = (v) => ERP.fmtNum(v, dec), I = (v) => ERP.fmtNum(v * fx, 0);
    const rows = s.items.map((i, k) => `<tr><td class="center">${k + 1}</td><td>${esc(i.brand)}</td><td>${esc(i.model)}</td><td>${esc(i.compound)}</td><td>${esc(i.gender)}</td><td>${esc(i.color)}</td><td>${esc(i.size)}</td><td>${esc(i.order_no)}</td><td>${dstr(i.est_date)}</td><td>${dstr(i.etd)}</td><td>${dstr(i.xfd)}</td><td class="n">${qty(i.qty)}</td><td>${esc(i.unit)}</td><td class="n">${n(i.price)}</td>${fx ? `<td class="n">${I(i.price)}</td>` : ''}<td class="n">${n(i.qty * i.price)}</td>${fx ? `<td class="n">${I(i.qty * i.price)}</td>` : ''}</tr>`).join('');
    const approver = s.approved_by && userMap[s.approved_by] ? userMap[s.approved_by].full_name : '', creator = s.created_by && userMap[s.created_by] ? userMap[s.created_by].full_name : '';
    const tot = (l, v, b, v2) => `<tr><td>${l}</td><td class="n">${b ? '<b>' + v + '</b>' : v}</td>${fx ? `<td class="n">${v2 == null ? '' : b ? '<b>' + v2 + '</b>' : v2}</td>` : ''}</tr>`;
    ERP.printHTML(s.so_number, `<h1>SALES ORDER</h1><div class="muted">${esc(s.so_number)}</div>
      ${s.urgent ? '<div class="urgent">URGENT — SO MENDESAK</div>' : ''}
      ${s.status !== 'approved' ? '<div class="wm">BELUM DISETUJUI SUPERVISOR — DRAFT</div>' : ''}
      <div class="grid2"><div class="box"><b>Dari Client:</b><br><b>${esc(c.name)}</b><br>${esc(c.contact_person || '')}${c.position ? ' (' + esc(c.position) + ')' : ''}<br>${esc(c.billing_address || c.address || '')}<br>${esc([c.mobile, c.office_phone].filter(Boolean).join(' / '))}<br>${esc(c.email || '')}</div>
      <div class="box"><table class="kv"><tr><td>No SO</td><td><b>${esc(s.so_number)}</b></td></tr><tr><td>Tanggal</td><td>${fmtDate(s.so_date)}</td></tr><tr><td>Mata uang</td><td>${esc(cur)}${fx ? ' · Rate ' + ERP.fmtNum(fx, 2) + ' IDR' : ''}</td></tr><tr><td>Pembayaran</td><td>${esc(ERP.termText(s))}</td></tr></table></div></div>
      <table><thead><tr><th class="center">No</th><th>Brand</th><th>Model</th><th>Compound</th><th>Gender</th><th>Color</th><th>Size</th><th>No Order</th><th>Est Date</th><th>ETD</th><th>XFD</th><th class="n">Qty</th><th>Satuan</th><th class="n">Harga (${esc(cur)})</th>${fx ? '<th class="n">Harga (IDR)</th>' : ''}<th class="n">Jumlah (${esc(cur)})</th>${fx ? '<th class="n">Jumlah (IDR)</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>
      <table class="tot" style="width:${fx ? 70 : 50}%;margin-left:auto">
        ${fx ? `<tr><td></td><td class="n muted">${esc(cur)}</td><td class="n muted">IDR</td></tr>` : ''}
        ${tot('Subtotal', n(t.subtotal), false, I(t.subtotal))}
        ${t.disc > 0 ? tot('Diskon' + (s.discount_type === 'pct' ? ' (' + ERP.fmtNum(s.discount_value, 2) + '%)' : ''), '- ' + n(t.disc), false, '- ' + I(t.disc)) : ''}
        ${tot('Total sebelum PPN', n(t.dpp), true, I(t.dpp))}
        ${s.vat ? tot('PPN 11%', n(t.vatAmt), false, I(t.vatAmt)) : ''}
        ${s.pph23 ? tot('PPh 23 (' + ERP.fmtNum(s.pph23_rate, 2) + '%)', '- ' + n(t.pphAmt), false, '- ' + I(t.pphAmt)) : ''}
        ${s.vat || s.pph23 ? tot('Total', n(t.total), true, I(t.total)) : ''}
      </table>
      ${s.notes ? `<div class="box"><b>Catatan:</b><br>${esc(s.notes).replace(/\n/g, '<br>')}</div>` : ''}
      <div class="sign"><div><div class="line"></div>Dibuat oleh<br><b>${esc(creator)}</b></div><div><div class="line"></div>Disetujui oleh<br><b>${esc(approver)}</b></div><div><div class="line"></div>Client<br>&nbsp;</div></div>`, { landscape: true });
  }

  /* ---------- Aksi ---------- */
  async function deleteSO(s, after) {
    if (!ERP.can.write()) { ERP.toast('Hanya Admin atau Supervisor yang dapat menghapus Sales Order', 'err'); return; }
    if (s.poLinks.length) { ERP.toast(`${s.so_number} tidak bisa dihapus karena dipakai sebagai No Order di ${s.poLinks.length} baris PO (${[...new Set(s.poLinks.map((x) => x.p.po_number))].join(', ')}). Ubah No Order di PO itu dulu.`, 'err'); return; }
    if (!(await ERP.confirm(`Hapus <b>${esc(s.so_number)}</b> (${esc(s.client.name)}, ${fmtMoney(s.total, s.currency)})?<br><small>SO dan seluruh baris itemnya dihapus permanen.</small>`, { danger: true }))) return;
    try { await DB.remove('sales_orders', s.id); ERP.toast('Sales Order dihapus'); if (after) after(); ERP.refresh(); } catch (e) { ERP.toast(e.message, 'err'); }
  }
  async function approve(s) {
    if (!ERP.can.approve()) { ERP.toast('Hanya Admin atau Supervisor yang dapat approve', 'err'); return; }
    if (!(await ERP.confirm(`Approve <b>${esc(s.so_number)}</b> (${fmtMoney(s.total, s.currency)})?`))) return;
    try { await DB.update('sales_orders', s.id, { status: 'approved', approved_by: ERP.user.id, approved_at: new Date().toISOString() }); ERP.toast('Sales Order disetujui'); ERP.refresh(); } catch (e) { ERP.toast(e.message, 'err'); }
  }

  function detailModal(s, data) {
    const um = data.userMap, cur = s.currency, fx = fxOf(s), dec = ERP.decimals(cur), t = calcOf(s), M = (n) => fmtMoney(n, cur), I = (n) => (fx ? ` <small>≈ ${idr(n, fx)}</small>` : '');
    const lines = ERP.table([
      { label: 'Brand', html: (i) => `<b>${esc(i.brand)}</b>`, m: 'mt' }, { label: 'Model', v: (i) => i.model }, { label: 'Compound', v: (i) => i.compound }, { label: 'Gender', v: (i) => i.gender }, { label: 'Color', v: (i) => i.color }, { label: 'Size', v: (i) => i.size },
      { label: 'No Order', v: (i) => i.order_no },
      { label: 'Est Date', html: (i) => (i.est_date ? dstr(i.est_date) + (i.est_date < ERP.today() && i.recv < Number(i.qty) ? '<small class="neg">terlambat</small>' : '') : ''), cls: 'nw' }, { label: 'ETD', v: (i) => dstr(i.etd), cls: 'nw' }, { label: 'XFD', v: (i) => dstr(i.xfd), cls: 'nw' },
      { label: 'Qty', html: (i) => qty(i.qty) + ' ' + esc(i.unit), cls: 'n nw' },
      { label: 'Diterima via PO', html: (i) => `${qty(i.recv)}${i.recv >= Number(i.qty) ? ' ✓' : ''}`, cls: 'n nw' },
      { label: 'Harga', html: (i) => ERP.fmtNum(i.price, dec) + (fx ? `<small>${ERP.fmtNum(i.price * fx, 0)} IDR</small>` : ''), cls: 'n' },
      { label: 'Jumlah', html: (i) => ERP.fmtNum(i.qty * i.price, dec) + (fx ? `<small>${ERP.fmtNum(i.qty * i.price * fx, 0)} IDR</small>` : ''), cls: 'n' },
    ], s.items);
    const pos = [...new Set(s.poLinks.map((x) => x.p.po_number))];
    return ERP.modal({
      title: esc(s.so_number) + (s.urgent ? ' <span class="urgent-tag">URGENT</span>' : ''), wide: true,
      html: `<dl class="kv"><dt>Tanggal</dt><dd>${fmtDate(s.so_date)}</dd><dt>Client</dt><dd>${esc(s.client.name)}</dd><dt>Pembayaran</dt><dd>${esc(ERP.termText(s))}</dd>
        ${fx ? `<dt>Rate</dt><dd>1 ${esc(cur)} = IDR ${ERP.fmtNum(fx, 2)}</dd>` : ''}
        <dt>Status</dt><dd>${ERP.approvalBadge(s)} ${s.approved_by && um[s.approved_by] ? '<small>oleh ' + esc(um[s.approved_by].full_name) + ', ' + ERP.fmtDate((s.approved_at || '').slice(0, 10)) + '</small>' : ''}</dd>
        <dt>Dibuat oleh</dt><dd>${esc((um[s.created_by] || {}).full_name || '-')}</dd>
        <dt>Est Date</dt><dd>${dstr(s.est)}</dd><dt>PO terkait</dt><dd>${esc(pos.join(', ')) || '-'}</dd>
        ${s.notes ? `<dt>Catatan</dt><dd>${esc(s.notes)}</dd>` : ''}</dl>
        <div class="sec-t">Item</div>${lines}
        <div class="totals"><div><span>Subtotal</span><span>${M(t.subtotal)}${I(t.subtotal)}</span></div>${t.disc > 0 ? `<div><span>Diskon</span><span>- ${M(t.disc)}</span></div>` : ''}<div><span>Total sebelum PPN</span><span>${M(t.dpp)}${I(t.dpp)}</span></div>${s.vat ? `<div><span>PPN 11%</span><span>${M(t.vatAmt)}</span></div>` : ''}${s.pph23 ? `<div><span>PPh 23 (${ERP.fmtNum(s.pph23_rate, 2)}%)</span><span>- ${M(t.pphAmt)}</span></div>` : ''}<div class="gt"><span>Total</span><span>${M(t.total)}${I(t.total)}</span></div></div>
        <div class="sec-t">Penerimaan barang (via PO terkait)</div><div class="note">Diterima ${qty(s.received)} dari ${qty(s.ordered)} pcs/pasang${s.allReceived ? ' — semua barang sudah diterima' : ''}.</div>`,
      actions: [
        { icon: 'print', tip: 'Print SO', onClick: () => printSO(s, um) },
        ...(ERP.can.write() ? [{ icon: 'edit', tip: 'Edit SO', onClick: (mm) => { mm.close(); location.hash = '#/so/edit/' + s.id; } }] : []),
        ...(ERP.can.approve() && s.status !== 'approved' ? [{ icon: 'check', tip: 'Approve SO', cls: 'ok', onClick: (mm) => { mm.close(); approve(s); } }] : []),
        { icon: 'download', tip: 'Export Excel SO ini', onClick: () => exportSOs([s], 'SO_' + s.so_number + '.xlsx') },
        ...(ERP.can.write() ? [{ icon: 'trash', tip: 'Hapus SO', cls: 'danger', onClick: (mm) => deleteSO(s, () => mm.close()) }] : []),
      ],
    });
  }

  /* ---------- Export Excel (ringkasan SO + detail item) ---------- */
  function exportSOs(list, filename) {
    if (!list.length) { ERP.toast('Tidak ada Sales Order untuk diexport', 'err'); return; }
    const sum = list.map((s) => [s.so_number, fmtDate(s.so_date), dstr(s.est), s.client.name, s.currency, fxOf(s) || '', ERP.termText(s), s.vat ? 'YA' : '', s.pph23 ? 'YA ' + s.pph23_rate + '%' : '', s.urgent ? 'YA' : '', Number(s.subtotal), Number(s.discount_amount), Number(s.subtotal) - Number(s.discount_amount), Number(s.vat_amount), Number(s.pph23_amount || 0), Number(s.total), s.status === 'approved' ? 'Approved' : 'Menunggu approval', s.received, s.ordered, [...new Set(s.poLinks.map((x) => x.p.po_number))].join(', ')]);
    const det = [];
    list.forEach((s) => s.items.forEach((i, n) => det.push([s.so_number, fmtDate(s.so_date), s.client.name, s.currency, n + 1, i.brand, i.model, i.compound || '', i.gender || '', i.color || '', i.size || '', i.order_no || '', dstr(i.est_date), dstr(i.etd), dstr(i.xfd), Number(i.qty), i.unit, Number(i.price), ERP.round(i.qty * i.price, s.currency), fxOf(s) ? Number(i.price) * fxOf(s) : '', i.recv, i.out])));
    ERP.xlsxExportMulti(filename, [
      { name: 'Ringkasan SO', headers: ['No SO', 'Tanggal', 'Est Date (terdekat)', 'Client', 'Mata Uang', 'Rate IDR', 'Pembayaran', 'PPN 11%', 'PPh 23', 'Urgent', 'Subtotal', 'Diskon', 'Total sebelum PPN', 'PPN', 'PPh 23 (nilai)', 'Total', 'Approval', 'Qty diterima', 'Qty dipesan', 'PO terkait'], rows: sum },
      { name: 'Detail Item', headers: ['No SO', 'Tanggal', 'Client', 'Mata Uang', 'No', 'Brand', 'Model', 'Compound', 'Gender', 'Color', 'Size', 'No Order', 'Est Date', 'ETD', 'XFD', 'Qty', 'Satuan', 'Harga', 'Jumlah', 'Harga IDR', 'Diterima (via PO)', 'Keluar (DO)'], rows: det },
    ]);
  }

  /* ---------- Import SO dari Excel ---------- */
  // Satu baris Excel = satu baris item. Baris dengan No SO sama digabung jadi satu SO (data header cukup diisi di baris pertama).
  const SO_HEAD = ['No SO', 'Tanggal SO', 'Client', 'Pembayaran', 'Tempo (hari)', 'Rate IDR', 'PPN', 'PPh 23 (%)', 'Diskon', 'Jenis Diskon', 'URGENT', 'Catatan', 'Brand', 'Model', 'Compound', 'Gender', 'Color', 'Size', 'No Order', 'Est Date', 'ETD', 'XFD', 'Qty', 'Harga IDR', 'Harga USD'];
  const SO_SAMPLE = [
    ['SO-CONTOH-001', '05-Jan-26', 'PT Contoh Client', 'Tempo', 30, 16300, 'YA', '', 0, '%', 'TIDAK', 'Contoh catatan', 'Aero', 'Runner X', 'EVA-60', 'Man', 'Black', '9', '', '20-Feb-26', '06-Mar-26', '27-Mar-26', 100, '', 25],
    ['', '', '', '', '', '', '', '', '', '', '', '', 'Aero', 'Runner X', 'EVA-60', 'Man', 'Black', '10', '', '20-Feb-26', '06-Mar-26', '27-Mar-26', 150, '', 25],
  ];
  function parseSOImport(rows, data) {
    const yes = (v) => ['ya', 'yes', 'y', '1', 'true', 'x'].includes(norm(String(v ?? '').trim()));
    const cliBy = new Map(); data.clients.forEach((c) => [c.name, c.code].forEach((k) => k && cliBy.set(norm(k).trim(), c)));
    const itemBy = new Map(); data.items.forEach((i) => { const k = ERP.itemKey(i); if (!itemBy.has(k)) itemBy.set(k, i); });
    const existing = new Set(data.sos.map((s) => norm(s.so_number).trim()));
    const groups = new Map(); let last = null;
    rows.forEach((r, n) => {
      const g = (...k) => String(ERP.pick(r, ...k) ?? '').trim();
      const no = g('no so', 'so', 'nomor so') || last;
      if (!no) return;
      last = no;
      const k = norm(no).trim();
      if (!groups.has(k)) groups.set(k, { no, rows: [] });
      groups.get(k).rows.push({ r, g, line: n + 2 });
    });
    const out = [];
    groups.forEach((G) => {
      const errs = [], first = (...k) => { for (const x of G.rows) { const v = x.g(...k); if (v) return v; } return ''; };
      const raw = (k) => { for (const x of G.rows) { const v = ERP.pick(x.r, k); if (v !== '' && v != null) return v; } return ''; };
      if (existing.has(norm(G.no).trim())) errs.push('No SO sudah ada di sistem');
      const date = ERP.toISO(raw('tanggal so') || raw('tanggal')); if (!date) errs.push('Tanggal SO kosong / tidak valid');
      const cli = cliBy.get(norm(first('client', 'nama client', 'id client')).trim()); if (!cli) errs.push(`Client "${first('client', 'nama client', 'id client')}" tidak ditemukan di database Client`);
      const pay = norm(first('pembayaran', 'term')).startsWith('tempo') ? 'tempo' : first('pembayaran', 'term') ? 'cash' : '', days = parseInt(first('tempo (hari)', 'tempo')) || 0;
      if (pay === 'tempo' && !(days > 0)) errs.push('Pembayaran Tempo butuh jumlah hari (kolom "Tempo (hari)")');
      const pph = ERP.num(raw('pph 23 (%)') || raw('pph 23') || 0);
      const vat = yes(first('ppn', 'ppn 11%')), dv = ERP.num(raw('diskon') || 0), dt = /nilai|amt|rp|usd/i.test(first('jenis diskon')) ? 'amt' : 'pct';
      const lines = [], lineCurs = [];
      G.rows.forEach(({ r, g, line }) => {
        const rec = { brand: g('brand'), model: g('model', 'model name'), compound: g('compound', 'compound name'), gender: g('gender'), color: g('color', 'colour'), size: g('size') };
        if (!rec.brand && !rec.model) return;
        const gm = ERP.GENDERS.find((x) => x.toLowerCase() === rec.gender.toLowerCase()); if (gm) rec.gender = gm;
        const sz = ERP.SIZES.find((x) => x.toLowerCase() === rec.size.toLowerCase()); if (sz) rec.size = sz;
        const it = itemBy.get(ERP.itemKey(rec));
        const pI = ERP.pick(r, 'harga idr'), pU = ERP.pick(r, 'harga usd'), pL = ERP.pick(r, 'harga', 'harga satuan', 'price');
        let lc = '', price = 0;
        if (pI !== '' && pU !== '') lc = 'both'; else if (pI !== '') { lc = 'IDR'; price = ERP.num(pI); } else if (pU !== '') { lc = 'USD'; price = ERP.num(pU); } else if (pL !== '') { lc = cli ? cli.currency || 'IDR' : 'IDR'; price = ERP.num(pL); }
        const q = ERP.num(ERP.pick(r, 'qty', 'jumlah'));
        if (lc === 'both') { errs.push(`Baris Excel ${line}: Harga IDR dan Harga USD sama-sama terisi — isi salah satu`); return; }
        if (!it) { errs.push(`Baris Excel ${line}: item "${ERP.attrText(rec)}" tidak ada di Master Item`); return; }
        if (!(q > 0)) { errs.push(`Baris Excel ${line}: Qty harus > 0`); return; }
        if (!lc || price < 0) { errs.push(`Baris Excel ${line}: Harga IDR / Harga USD harus diisi (boleh 0)`); return; }
        lineCurs.push(lc);
        lines.push({ item_id: it.id, brand: it.brand, model: it.model, compound: it.compound || null, gender: it.gender || null, color: it.color || null, size: it.size || null, unit: it.unit, order_no: g('no order', 'no order cust') || null, est_date: ERP.toISO(ERP.pick(r, 'est date', 'est. date')) || null, etd: ERP.toISO(ERP.pick(r, 'etd')) || null, xfd: ERP.toISO(ERP.pick(r, 'xfd')) || null, qty: q, price });
      });
      if (!lines.length && !errs.length) errs.push('Tidak ada baris item');
      const curs = [...new Set(lineCurs)];
      if (curs.length > 1) errs.push(`Satu SO hanya boleh satu mata uang, tetapi baris mengisi ${curs.join(' dan ')}. Pisahkan menjadi No SO yang berbeda`);
      const cur = curs[0] || (cli ? cli.currency || 'IDR' : 'IDR');
      const warns = []; if (cli && lines.length && cur !== (cli.currency || 'IDR')) warns.push(`Mata uang ${cur} berbeda dari data client (${cli.currency || 'IDR'})`);
      const fx = cur !== 'IDR' ? ERP.num(raw('rate idr') || raw('rate')) : 0;
      const c = calc(lines, dt, dv, vat, pph > 0, pph, cur);
      out.push({ no: G.no, date, cli, cur, errs, warns, lines, total: c.total, hdr: cli && date ? {
        so_number: G.no, so_date: date, client_id: cli.id, currency: cur, fx_rate: fx || null, ...(pay ? { payment_type: pay, tempo_mode: pay === 'tempo' ? 'days' : null, tempo_days: pay === 'tempo' ? days : null, tempo_date: null } : termOf(cli)), vat, pph23: pph > 0, pph23_rate: pph > 0 ? pph : null, pph23_amount: c.pphAmt, urgent: yes(first('urgent')),
        discount_type: dt, discount_value: dv, subtotal: c.subtotal, discount_amount: c.disc, vat_amount: c.vatAmt, total: c.total, notes: first('catatan', 'notes') || null } : null });
    });
    return out;
  }
  async function importSOs(data) {
    const f = await ERP.pickFile(); if (!f) return;
    let list;
    try { list = parseSOImport(await ERP.xlsxRead(f), data); } catch (e) { ERP.toast('File tidak bisa dibaca: ' + e.message, 'err'); return; }
    if (!list.length) { ERP.toast('Tidak ada data di file. Gunakan template (kolom No SO, Client, Brand, Model, Qty, Harga).', 'err'); return; }
    const good = list.filter((x) => !x.errs.length), bad = list.filter((x) => x.errs.length);
    const okTbl = good.length ? ERP.table([{ label: 'No SO', html: (x) => `<b>${esc(x.no)}</b>`, m: 'mt' }, { label: 'Tanggal', v: (x) => fmtDate(x.date), cls: 'nw' }, { label: 'Client', v: (x) => x.cli.name }, { label: 'Baris item', v: (x) => x.lines.length, cls: 'n' }, { label: 'Total', html: (x) => fmtMoney(x.total, x.cur), cls: 'n nw' }, { label: 'Catatan', html: (x) => (x.warns.length ? `<span class="neg">${esc(x.warns.join('; '))}</span>` : ''), m: 'mf' }], good.map((x, i) => ({ ...x, id: 'g' + i }))) : '';
    const errBox = bad.length ? `<div class="sec-t">Tidak bisa diimport (${bad.length} SO)</div>${bad.map((x) => `<div class="note"><b>${esc(x.no)}</b><br>${x.errs.map((e) => '• ' + esc(e)).join('<br>')}</div>`).join('')}` : '';
    ERP.modal({
      title: 'Import Sales Order dari Excel', wide: true,
      html: `<div class="note">${good.length} SO siap diimport${bad.length ? `, ${bad.length} SO bermasalah akan dilewati (perbaiki di Excel lalu import lagi — SO yang sudah masuk tidak akan terduplikasi)` : ''}. SO hasil import berstatus <b>Menunggu Approval</b>.</div>${okTbl}${errBox}`,
      actions: good.length ? [{ icon: 'check', tip: `Import ${good.length} SO`, cls: 'primary', onClick: async (m) => {
        let n = 0; const fails = [];
        for (const x of good) {
          let id = null;
          try {
            const [so] = await DB.insert('sales_orders', { ...x.hdr, status: 'pending', revision: 0 }); id = so.id;
            await DB.insert('so_items', x.lines.map((l, i) => ({ ...l, so_id: id, line_no: i + 1 }))); n++;
          } catch (e) { fails.push(x.no + ': ' + e.message); if (id) { try { await DB.remove('sales_orders', id); } catch (_) {} } }
        }
        m.close(); S.tab = 'pending';
        ERP.toast(`${n} SO diimport${fails.length ? ', gagal: ' + fails.join('; ') : ''}`, fails.length ? 'err' : undefined);
        ERP.refresh();
      } }] : [],
    });
  }

  /* ---------- Daftar ---------- */
  async function renderList(v) {
    const data = await ERP.loadPO();
    const canW = ERP.can.write();
    const matches = (s) => !S.q || norm(s.so_number).includes(S.q) || norm(s.client.name).includes(S.q) || s.items.some((i) => norm(ERP.attrText(i)).includes(S.q));
    v.innerHTML = `<div class="toolbar">${ERP.searchBox('q', 'Cari client / brand / model / compound / color / size / no SO…')}
      <div class="tb-actions">${canW ? btn('plus', 'Buat Sales Order baru', 'id="b-new"', 'primary') + btn('upload', 'Import SO dari Excel', 'id="b-imp"') + btn('template', 'Unduh template import SO', 'id="b-tpl"') : ''}${btn('print', 'Print daftar', 'id="b-prt"')}${btn('download', 'Export ke Excel', 'id="b-exp"')}</div></div>
      <div class="tabs" id="tabs"></div><div id="list"></div>`;
    $('#q').value = S.q;
    const bar = (a, b, ok) => `<div class="bar ${ok ? 'ok' : ''}"><i style="width:${b > 0 ? Math.min(100, (a / b) * 100) : 0}%"></i></div>`;
    const cols = [
      { label: 'No SO', html: (s) => `<b>${esc(s.so_number)}</b>${s.urgent ? '<span class="urgent-tag">URGENT</span>' : ''}`, cls: 'nw', m: 'mt' },
      { label: 'Tanggal', v: (s) => fmtDate(s.so_date), cls: 'nw' },
      { label: 'Client', v: (s) => s.client.name },
      { label: 'Total', html: (s) => fmtMoney(s.total, s.currency) + (fxOf(s) ? `<small>≈ ${idr(s.total, fxOf(s))}</small>` : ''), cls: 'n nw' },
      { label: 'Approval', html: (s) => ERP.approvalBadge(s) },
      { label: 'Diterima via PO', html: (s) => `${qty(s.received)} / ${qty(s.ordered)}${bar(s.received, s.ordered, s.allReceived)}`, cls: 'nw' },
      { label: 'Pembayaran', v: (s) => ERP.termText(s), cls: 'hide-md', m: 'mh' },
      { label: 'Est Date', html: (s) => (s.est ? fmtDate(s.est) + (s.est < ERP.today() && !s.allReceived ? '<small class="neg">terlambat</small>' : '') : '-'), cls: 'nw hide-md', m: 'mh' },
      { label: 'ETD', v: (s) => dstr(minDate(s.items, 'etd')), cls: 'nw hide-md', m: 'mh' },
      { label: '', cls: 'act', html: (s) => btn('eye', 'Lihat detail', `data-a="view" data-id="${s.id}"`, 'sm') + btn('print', 'Print SO', `data-a="print" data-id="${s.id}"`, 'sm')
        + (canW ? btn('edit', 'Edit (perlu approval ulang)', `data-a="edit" data-id="${s.id}"`, 'sm') : '')
        + (ERP.can.approve() && s.status !== 'approved' ? btn('check', 'Approve SO', `data-a="approve" data-id="${s.id}"`, 'sm ok') : '')
        + btn('download', 'Export Excel SO ini', `data-a="xls" data-id="${s.id}"`, 'sm')
        + (canW ? btn('trash', 'Hapus SO', `data-a="del" data-id="${s.id}"`, 'sm danger') : '') },
    ];
    const draw = () => {
      const base = data.sos.filter(matches);
      $('#tabs').innerHTML = STAGES.map(([k, l]) => `<button data-t="${k}" class="${S.tab === k ? 'on' : ''}">${l}<span class="cnt">${base.filter((s) => s.stage === k).length}</span></button>`).join('');
      const rows = base.filter((s) => s.stage === S.tab);
      const empty = { pending: 'Tidak ada SO yang menunggu approval.', active: 'Tidak ada SO aktif.', done: 'Belum ada SO yang barangnya diterima semua.' }[S.tab];
      $('#list').innerHTML = ERP.table(cols, rows, { empty, rowCls: (s) => (s.urgent ? 'urgent' : '') });
      draw.rows = rows;
    };
    draw();
    $('#q').oninput = ERP.debounce((e) => { S.q = norm(e.target.value.trim()); draw(); });
    $('#tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { S.tab = b.dataset.t; draw(); } };
    if ($('#b-new')) $('#b-new').onclick = () => (location.hash = '#/so/new');
    if ($('#b-imp')) $('#b-imp').onclick = () => importSOs(data);
    if ($('#b-tpl')) $('#b-tpl').onclick = () => ERP.xlsxExport('Template_Import_SO.xlsx', 'SO', SO_HEAD, SO_SAMPLE);
    $('#b-prt').onclick = () => ERP.printTable('Daftar Sales Order — ' + STAGES.find((x) => x[0] === S.tab)[1], [{ label: 'No SO', v: (s) => s.so_number }, { label: 'Tanggal', v: (s) => fmtDate(s.so_date) }, { label: 'Client', v: (s) => s.client.name }, { label: 'Total', num: true, v: (s) => fmtMoney(s.total, s.currency) }, { label: 'Approval', v: (s) => (s.status === 'approved' ? 'Approved' : 'Menunggu') }, { label: 'Diterima', v: (s) => qty(s.received) + '/' + qty(s.ordered) }], draw.rows);
    $('#b-exp').onclick = () => exportSOs(draw.rows, 'SO_' + ERP.today() + '.xlsx');
    $('#list').onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const s = data.sos.find((x) => x.id === b.dataset.id);
      ({ view: () => detailModal(s, data), print: () => printSO(s, data.userMap), edit: () => (location.hash = '#/so/edit/' + s.id), approve: () => approve(s), xls: () => exportSOs([s], 'SO_' + s.so_number + '.xlsx'), del: () => deleteSO(s) })[b.dataset.a]();
    };
  }

  /* ---------- Form (susunan sama dengan form PO) ---------- */
  async function renderForm(v, id) {
    const data = await ERP.loadPO();
    const clients = data.clients;
    let items = data.items;
    const old = id ? data.sos.find((s) => s.id === id) : null;
    if (id && !old) { v.innerHTML = '<div class="empty">Sales Order tidak ditemukan.</div>'; return; }
    const A = ['brand', 'model', 'compound', 'gender', 'color', 'size', 'unit'];
    const pickA = (o) => Object.fromEntries(A.map((k) => [k, o[k] || '']));
    const newLine = () => ({ k: Math.random(), item_id: null, brand: '', model: '', compound: '', gender: '', color: '', size: '', order_no: '', est: '', etd: '', xfd: '', unit: '', qty: 1, price: '' });
    const st = old ? {
      no: old.so_number, date: old.so_date, client: old.client && old.client.id ? old.client : null, payType: old.payment_type, tempoMode: old.tempo_mode || 'days', tempoDays: old.tempo_days || 30, tempoDate: old.tempo_date || '',
      vat: !!old.vat, pph: !!old.pph23, pphRate: old.pph23 ? old.pph23_rate : 2, urgent: !!old.urgent, discType: old.discount_type || 'pct', discVal: old.discount_value || 0, notes: old.notes || '', fx: Number(old.fx_rate) || 0,
      lines: old.items.map((i) => ({ k: Math.random(), id: i.id, item_id: i.item_id, ...pickA(i), order_no: i.order_no || '', est: i.est_date || '', etd: i.etd || '', xfd: i.xfd || '', qty: i.qty, price: i.price })),
    } : { no: '', date: ERP.today(), client: null, payType: 'cash', tempoMode: 'days', tempoDays: 30, tempoDate: '', vat: false, pph: false, pphRate: 2, urgent: false, discType: 'pct', discVal: 0, notes: '', fx: 0, lines: [] };
    if (!st.lines.length) st.lines.push(newLine());
    const cur0 = old ? old.currency : null, cli0 = old ? old.client_id : null;   // SO hasil import bisa bermata uang beda dari client
    const cur = () => (st.client ? (cur0 && st.client.id === cli0 ? cur0 : st.client.currency || 'IDR') : 'IDR');
    const fx = () => (cur() !== 'IDR' && st.fx > 0 ? st.fx : 0);
    const locked = !!(old && old.poLinks.length);   // No SO sudah dipakai di PO: tidak boleh diganti

    v.innerHTML = `<div class="page-head">${btn('back', 'Kembali ke daftar SO', 'id="b-back"')}<h3>${old ? 'Edit ' + esc(old.so_number) : 'Buat Sales Order Baru'}</h3>${btn('check', old ? 'Simpan perubahan (butuh approval ulang)' : 'Simpan SO', 'id="b-save"', 'primary')}</div>
      ${old && old.status === 'approved' ? '<div class="card" style="margin-bottom:10px;border-color:var(--warn)">SO ini sudah di-approve. Setelah disimpan, status kembali <b>Menunggu Approval</b> dan harus disetujui ulang oleh Supervisor.</div>' : ''}
      ${locked ? '<div class="card" style="margin-bottom:10px">No SO ini sudah dipakai sebagai No Order di PO, jadi <b>No SO tidak bisa diganti</b>.</div>' : ''}
      <div class="card"><div class="grid c4 po-top">
        ${ERP.field('No SO * (diisi manual)', `<input id="f-sono" value="${esc(st.no)}" autocomplete="off" ${locked ? 'readonly' : ''} placeholder="mis. MBF26090005">`)}
        ${ERP.field('Tanggal SO', ERP.dateInput('so_date', st.date))}
        ${ERP.field('Client *', `<input id="f-cl" placeholder="Cari nama client…" value="${esc(st.client ? st.client.name : '')}" autocomplete="off">`, 'po-sup')}
        ${ERP.field('Mata uang', `<input id="f-cur" value="${esc(cur())}" readonly>`, 'po-cur')}
        <label class="fld po-fx" id="fx-wrap"><span id="fx-lbl">Rate → IDR</span><input id="f-fx" inputmode="decimal" placeholder="mis. 16.300 (kosongkan jika tidak perlu)"></label>
      </div>
      <div class="grid c3" style="margin-top:10px">
        <div class="fld"><span>Pembayaran</span><div class="chk-row"><label class="chk"><input type="checkbox" id="f-cash"> Cash</label><label class="chk"><input type="checkbox" id="f-tempo"> Tempo</label></div>
          <div class="tempo-box" id="tempo-box" style="margin-top:4px"><select id="f-tmode"><option value="days">Jumlah hari</option><option value="date">Tanggal tertentu</option></select><span id="tm-days"><input id="f-tdays" inputmode="numeric" style="width:90px" placeholder="hari"> hari</span><span id="tm-date">${ERP.dateInput('tempo_date', st.tempoDate)}</span></div></div>
        <div class="fld"><span>Opsi</span><div class="chk-row"><label class="chk"><input type="checkbox" id="f-vat"> Tambah PPN 11%</label><label class="chk"><input type="checkbox" id="f-pph"> PPh 23</label><span id="pph-box" class="tempo-box"><input id="f-pphr" inputmode="decimal" style="width:70px"> %</span></div>
          <label class="chk"><input type="checkbox" id="f-urg"> <b style="color:var(--err)">URGENT (SO Mendesak)</b></label></div>
        <div class="fld"><span>Diskon</span><div class="tempo-box"><select id="f-dt" style="width:auto"><option value="pct">%</option><option value="amt">Nilai</option></select><input id="f-dv" inputmode="decimal" style="width:130px"></div></div>
      </div></div>
      <div class="card" style="margin-top:12px"><div class="page-head" style="margin:0"><h3>Item</h3>${btn('plus', 'Buat item master baru', 'id="b-newitem"')}${btn('plus', 'Tambah baris item', 'id="b-addline"', 'primary')}</div>
        <div class="lines"><div id="lines-head"></div><div id="lines" class="lines"></div></div>
        <div class="totals" id="totals"></div></div>
      <div class="card" style="margin-top:12px">${ERP.field('Catatan (opsional)', `<textarea id="f-notes" rows="2">${esc(st.notes)}</textarea>`)}</div>`;

    $('#f-cash').checked = st.payType === 'cash'; $('#f-tempo').checked = st.payType === 'tempo';
    $('#f-tmode').value = st.tempoMode; $('#f-tdays').value = st.tempoDays;
    $('#f-vat').checked = st.vat; $('#f-pph').checked = st.pph; $('#f-pphr').value = st.pphRate; $('#f-urg').checked = st.urgent; $('#f-dt').value = st.discType; $('#f-dv').value = st.discVal || ''; $('#f-fx').value = st.fx || '';
    const syncTempo = () => { $('#tempo-box').style.display = st.payType === 'tempo' ? 'flex' : 'none'; $('#tm-days').style.display = st.tempoMode === 'days' ? '' : 'none'; $('#tm-date').style.display = st.tempoMode === 'date' ? '' : 'none'; };
    const syncFx = () => { $('#fx-wrap').style.display = cur() === 'IDR' ? 'none' : ''; $('#fx-lbl').textContent = `Rate ${cur()} → IDR`; $('#pph-box').style.display = st.pph ? 'flex' : 'none'; };
    syncTempo(); syncFx();
    $('#f-cash').onchange = (e) => { st.payType = e.target.checked ? 'cash' : 'tempo'; $('#f-cash').checked = st.payType === 'cash'; $('#f-tempo').checked = st.payType === 'tempo'; syncTempo(); };
    $('#f-tempo').onchange = (e) => { st.payType = e.target.checked ? 'tempo' : 'cash'; $('#f-cash').checked = st.payType === 'cash'; $('#f-tempo').checked = st.payType === 'tempo'; syncTempo(); };
    $('#f-tmode').onchange = (e) => { st.tempoMode = e.target.value; syncTempo(); };
    $('#f-tdays').oninput = (e) => (st.tempoDays = parseInt(e.target.value) || 0);
    const LK = { l_est: 'est', l_etd: 'etd', l_xfd: 'xfd' };
    v.onchange = (e) => {
      const n = e.target.name;
      if (n === 'tempo_date') st.tempoDate = ERP.parseDate(e.target.value);
      if (n === 'so_date') st.date = ERP.parseDate(e.target.value) || st.date;
      if (LK[n]) { const l = st.lines.find((x) => String(x.k) === e.target.dataset.k); if (l) l[LK[n]] = ERP.parseDate(e.target.value); }
    };
    $('#f-vat').onchange = (e) => { st.vat = e.target.checked; totals(); };
    $('#f-pph').onchange = (e) => { st.pph = e.target.checked; syncFx(); totals(); };
    $('#f-pphr').oninput = (e) => { st.pphRate = e.target.value; totals(); };
    $('#f-urg').onchange = (e) => (st.urgent = e.target.checked);
    $('#f-dt').onchange = (e) => { st.discType = e.target.value; totals(); };
    $('#f-dv').oninput = (e) => { st.discVal = e.target.value; totals(); };
    $('#f-fx').oninput = (e) => { st.fx = ERP.num(e.target.value); drawLines(); };
    $('#f-notes').oninput = (e) => (st.notes = e.target.value);
    $('#f-sono').oninput = (e) => (st.no = e.target.value);
    const applyTerm = (c) => { const t = termOf(c); st.payType = t.payment_type; st.tempoMode = 'days'; st.tempoDays = t.tempo_days || 30; $('#f-cash').checked = st.payType === 'cash'; $('#f-tempo').checked = st.payType === 'tempo'; $('#f-tmode').value = 'days'; $('#f-tdays').value = st.tempoDays; syncTempo(); };
    ERP.combo($('#f-cl'), (q) => { const n = norm(q); return clients.filter((c) => !n || norm(c.name).includes(n) || norm(c.code).includes(n) || norm(c.category).includes(n) || norm(c.contact_person).includes(n)).map((c) => ({ c, label: c.name, sub: `${c.code} · ${c.currency || 'IDR'}${c.contact_person ? ' · ' + c.contact_person : ''}` })); },
      (it) => { st.client = it.c; $('#f-cl').value = it.c.name; $('#f-cur').value = cur(); applyTerm(it.c); syncFx(); drawLines(); });
    $('#f-cl').addEventListener('input', () => { if (st.client && st.client.name !== $('#f-cl').value) { st.client = null; $('#f-cur').value = 'IDR'; syncFx(); drawLines(); } });

    /* baris item: No - Brand - Model - Compound - Gender - Color - Size - No Order - Est Date - ETD - XFD - Qty - Satuan - Harga [- Harga IDR] - Jumlah [- Jumlah IDR] */
    const linesEl = $('#lines');
    const fillItem = (l, it) => Object.assign(l, { item_id: it.id }, pickA(it));
    const headHTML = () => `<div class="line head so ${fx() ? 'fx' : ''}"><span>No</span><span>Brand (cari item)</span><span>Model</span><span>Compound</span><span>Gender</span><span>Color</span><span>Size</span><span>No Order</span><span>Est Date</span><span>ETD</span><span>XFD</span><span>Qty</span><span>Satuan</span><span>Harga ${esc(cur())}</span>${fx() ? '<span>Harga IDR</span>' : ''}<span>Jumlah ${esc(cur())}</span>${fx() ? '<span>Jumlah IDR</span>' : ''}<span></span></div>`;
    function drawLines() {
      $('#lines-head').innerHTML = headHTML();
      const F = fx();
      linesEl.innerHTML = st.lines.map((l, n) => `<div class="line so ${F ? 'fx' : ''}" data-k="${l.k}"><span class="no">${n + 1}</span>
        <div class="it"><input class="li-item" placeholder="Cari item…" value="${esc(l.brand)}" autocomplete="off"></div>
        <span class="at">${esc(l.model)}</span><span class="at">${esc(l.compound)}</span><span class="at">${esc(l.gender)}</span><span class="at">${esc(l.color)}</span><span class="at">${esc(l.size)}</span>
        <span class="at-all">${esc(ERP.attrText(l))}</span>
        <div class="oo"><input class="li-ord" value="${esc(l.order_no)}" placeholder="No Order" autocomplete="off"></div>
        <div class="dd">${ERP.dateInput('l_est', l.est, `data-k="${l.k}"`)}</div><div class="dd">${ERP.dateInput('l_etd', l.etd, `data-k="${l.k}"`)}</div><div class="dd">${ERP.dateInput('l_xfd', l.xfd, `data-k="${l.k}"`)}</div>
        <div class="qt"><input class="li-qty r" inputmode="decimal" value="${l.qty}"></div>
        <span class="un">${esc(l.unit)}</span>
        <div class="pr"><input class="li-price r" inputmode="decimal" value="${l.price === '' ? '' : l.price}" placeholder="Harga"></div>
        ${F ? '<span class="amt pi"></span>' : ''}<span class="amt aa"></span>${F ? '<span class="amt ai"></span>' : ''}
        <div class="rm">${btn('trash', 'Hapus baris', 'data-rm', 'sm danger')}</div></div>`).join('');
      $$('.line[data-k]', linesEl).forEach((row) => {
        const l = st.lines.find((x) => String(x.k) === row.dataset.k);
        ERP.combo($('.li-item', row), (q) => { const n = norm(q); return items.filter((i) => !n || norm(ERP.attrText(i)).includes(n)).sort((a, b) => ERP.attrText(a).localeCompare(ERP.attrText(b), undefined, { numeric: true })).map((i) => ({ i, label: ERP.attrText(i), sub: i.unit })); }, (it) => { fillItem(l, it.i); drawLines(); });
        $('.li-ord', row).oninput = (e) => (l.order_no = e.target.value);
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
      $('#totals').innerHTML = `<div><span>Subtotal</span><span>${m(c.subtotal)}${ii(c.subtotal)}</span></div>${c.disc > 0 ? `<div><span>Diskon</span><span>- ${m(c.disc)}</span></div>` : ''}<div><b>Total (sebelum PPN)</b><b>${m(c.dpp)}${ii(c.dpp)}</b></div>${st.vat ? `<div><span>PPN 11%</span><span>${m(c.vatAmt)}</span></div>` : ''}${st.pph ? `<div><span>PPh 23 (${ERP.fmtNum(ERP.num(st.pphRate), 2)}%)</span><span>- ${m(c.pphAmt)}</span></div>` : ''}<div class="gt"><span>Total</span><span>${m(c.total)}${ii(c.total)}</span></div>`;
      $$('.line[data-k]', linesEl).forEach((row) => amt(row, st.lines.find((x) => String(x.k) === row.dataset.k)));
    }
    linesEl.onclick = (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; const k = b.closest('.line').dataset.k; st.lines = st.lines.filter((x) => String(x.k) !== k); if (!st.lines.length) st.lines.push(newLine()); drawLines(); };
    $('#b-addline').onclick = () => { st.lines.push(newLine()); drawLines(); const ins = $$('.li-item', linesEl); ins[ins.length - 1].focus(); };
    $('#b-newitem').onclick = () => ERP.modal({
      title: 'Buat Item Master Baru', html: ERP.itemForm(null), wide: true,
      actions: [{ icon: 'check', tip: 'Simpan & pakai di SO', cls: 'primary', onClick: async (m) => {
        const d = ERP.formData(m.el); if (!d.brand || !d.model) { ERP.toast('Brand dan Model Name wajib diisi', 'err'); return; }
        if (ERP.itemDup(items, d)) { ERP.toast('Item dengan kombinasi yang sama sudah ada', 'err'); return; }
        try { const [it] = await DB.insert('items', ERP.itemRecord(d)); items = items.concat(it); const empty = st.lines.find((l) => !l.item_id); const l = empty || newLine(); fillItem(l, it); if (!empty) st.lines.push(l); m.close(); drawLines(); ERP.toast('Item dibuat & ditambahkan'); } catch (e) { ERP.toast(e.message, 'err'); }
      } }],
    });
    $('#b-back').onclick = () => (location.hash = '#/so');
    drawLines();

    $('#b-save').onclick = async () => {
      const lines = st.lines.filter((l) => l.item_id || l.brand);
      st.no = String(st.no || '').trim();
      if (!st.no) { ERP.toast('No SO wajib diisi', 'err'); return; }
      if (data.sos.some((s) => s.id !== (old || {}).id && norm(s.so_number) === norm(st.no))) { ERP.toast('No SO sudah dipakai SO lain', 'err'); return; }
      if (!st.client) { ERP.toast('Pilih client dari daftar', 'err'); return; }
      if (!st.date) { ERP.toast('Tanggal SO tidak valid', 'err'); return; }
      if (!lines.length || lines.some((l) => !l.item_id)) { ERP.toast('Setiap baris harus memilih item dari master item', 'err'); return; }
      if (lines.some((l) => ERP.num(l.qty) <= 0)) { ERP.toast('Qty harus lebih dari 0', 'err'); return; }
      if (lines.some((l) => !(ERP.num(l.price) >= 0) || l.price === '')) { ERP.toast('Isi harga untuk semua baris (boleh 0)', 'err'); return; }
      if (st.payType === 'tempo' && st.tempoMode === 'days' && !(st.tempoDays > 0)) { ERP.toast('Isi jumlah hari tempo', 'err'); return; }
      if (st.payType === 'tempo' && st.tempoMode === 'date' && !st.tempoDate) { ERP.toast('Isi tanggal tempo', 'err'); return; }
      if (st.pph && !(ERP.num(st.pphRate) > 0)) { ERP.toast('Isi tarif PPh 23', 'err'); return; }
      const c = calc(lines, st.discType, st.discVal, st.vat, st.pph, st.pphRate, cur());
      const hdr = { so_number: st.no, so_date: st.date, client_id: st.client.id, currency: cur(), fx_rate: fx() || null, payment_type: st.payType, tempo_mode: st.payType === 'tempo' ? st.tempoMode : null, tempo_days: st.payType === 'tempo' && st.tempoMode === 'days' ? st.tempoDays : null, tempo_date: st.payType === 'tempo' && st.tempoMode === 'date' ? st.tempoDate : null,
        vat: st.vat, pph23: st.pph, pph23_rate: st.pph ? ERP.num(st.pphRate) : null, pph23_amount: c.pphAmt, urgent: st.urgent, discount_type: st.discType, discount_value: ERP.num(st.discVal), subtotal: c.subtotal, discount_amount: c.disc, vat_amount: c.vatAmt, total: c.total, notes: st.notes || null };
      const rec = (l, n, soId) => ({ so_id: soId, line_no: n + 1, item_id: l.item_id, brand: l.brand, model: l.model, compound: l.compound || null, gender: l.gender || null, color: l.color || null, size: l.size || null, unit: l.unit, order_no: String(l.order_no || '').trim() || null, est_date: l.est || null, etd: l.etd || null, xfd: l.xfd || null, qty: ERP.num(l.qty), price: ERP.num(l.price) });
      const btnSave = $('#b-save'); btnSave.disabled = true;
      try {
        let soId;
        if (!old) {
          const [so] = await DB.insert('sales_orders', { ...hdr, status: 'pending', revision: 0 });
          soId = so.id;
          await DB.insert('so_items', lines.map((l, n) => rec(l, n, soId)));
        } else {
          soId = old.id;
          await DB.update('sales_orders', soId, { ...hdr, status: 'pending', revision: old.status === 'approved' ? (old.revision || 0) + 1 : old.revision || 0, approved_by: null, approved_at: null });
          const keep = new Set(lines.filter((l) => l.id).map((l) => l.id));
          for (const i of old.items) if (!keep.has(i.id)) await DB.remove('so_items', i.id);
          for (let n = 0; n < lines.length; n++) { const l = lines[n]; if (l.id) { const { so_id, ...r } = rec(l, n, soId); await DB.update('so_items', l.id, r); } else await DB.insert('so_items', rec(l, n, soId)); }
        }
        ERP.toast(old ? 'SO diperbarui — menunggu approval Supervisor' : 'SO dibuat — menunggu approval Supervisor');
        S.tab = 'pending'; location.hash = '#/so';
      } catch (e) { btnSave.disabled = false; ERP.toast('Gagal menyimpan: ' + e.message, 'err'); }
    };
  }

  ERP.register('so', {
    async render(v, parts) {
      if (parts[0] === 'new' || parts[0] === 'edit') {
        if (!ERP.can.write()) { v.innerHTML = '<div class="empty">Akun ini tidak dapat membuat/mengedit Sales Order.</div>'; return; }
        return renderForm(v, parts[0] === 'edit' ? parts[1] : null);
      }
      return renderList(v);
    },
  });
})();
