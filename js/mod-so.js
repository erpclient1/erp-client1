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
  const calc = (lines, dt, dv, vat, cur) => ERP.calcPO(lines, dt, dv, vat, false, 0, cur);
  const calcOf = (s) => calc(s.items, s.discount_type, s.discount_value, s.vat, s.currency);
  const termOf = (c) => (c && c.payment_term === 'tempo' ? { payment_type: 'tempo', tempo_mode: 'days', tempo_days: Number(c.tempo_days) || 0 } : { payment_type: 'cash', tempo_mode: null, tempo_days: null });

  /* ---------- Print ---------- */
  function printSO(s, userMap) {
    const cur = s.currency, c = s.client || {}, dec = ERP.decimals(cur), fx = fxOf(s), t = calcOf(s), n = (v) => ERP.fmtNum(v, dec);
    const rows = s.items.map((i, k) => `<tr><td class="center">${k + 1}</td><td>${esc(i.brand)}</td><td>${esc(i.model)}</td><td>${esc(i.compound)}</td><td>${esc(i.gender)}</td><td>${esc(i.color)}</td><td>${esc(i.size)}</td><td>${dstr(i.est_date)}</td><td>${dstr(i.etd)}</td><td>${dstr(i.xfd)}</td><td class="n">${qty(i.qty)}</td><td>${esc(i.unit)}</td><td class="n">${n(i.price)}</td><td class="n">${n(i.qty * i.price)}</td></tr>`).join('');
    const approver = s.approved_by && userMap[s.approved_by] ? userMap[s.approved_by].full_name : '', creator = s.created_by && userMap[s.created_by] ? userMap[s.created_by].full_name : '';
    const tot = (l, v, b) => `<tr><td>${l}</td><td class="n">${b ? '<b>' + v + '</b>' : v}</td></tr>`;
    ERP.printHTML(s.so_number, `<h1>SALES ORDER</h1><div class="muted">${esc(s.so_number)}</div>
      ${s.urgent ? '<div class="urgent">URGENT</div>' : ''}${s.status !== 'approved' ? '<div class="wm">BELUM DISETUJUI SUPERVISOR — DRAFT</div>' : ''}
      <div class="grid2"><div class="box"><b>Client:</b><br><b>${esc(c.name)}</b><br>${esc(c.contact_person || '')}<br>${esc(c.billing_address || c.address || '')}<br>${esc([c.mobile, c.office_phone].filter(Boolean).join(' / '))}</div>
      <div class="box"><table class="kv"><tr><td>No SO</td><td><b>${esc(s.so_number)}</b></td></tr><tr><td>Tanggal</td><td>${fmtDate(s.so_date)}</td></tr><tr><td>Mata uang</td><td>${esc(cur)}${fx ? ' · Rate ' + ERP.fmtNum(fx, 2) + ' IDR' : ''}</td></tr><tr><td>Pembayaran</td><td>${esc(ERP.termText(s))}</td></tr></table></div></div>
      <table><thead><tr><th class="center">No</th><th>Brand</th><th>Model</th><th>Compound</th><th>Gender</th><th>Color</th><th>Size</th><th>Est Date</th><th>ETD</th><th>XFD</th><th class="n">Qty</th><th>Satuan</th><th class="n">Harga (${esc(cur)})</th><th class="n">Jumlah (${esc(cur)})</th></tr></thead><tbody>${rows}</tbody></table>
      <table class="tot" style="width:45%;margin-left:auto">${tot('Subtotal', n(t.subtotal))}${t.disc > 0 ? tot('Diskon', '- ' + n(t.disc)) : ''}${tot('Total sebelum PPN', n(t.dpp), true)}${s.vat ? tot('PPN 11%', n(t.vatAmt)) : ''}${s.vat ? tot('Total', n(t.total), true) : ''}</table>
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
    const um = data.userMap, cur = s.currency, dec = ERP.decimals(cur), t = calcOf(s), M = (n) => fmtMoney(n, cur);
    const lines = ERP.table([
      { label: 'Brand', html: (i) => `<b>${esc(i.brand)}</b>`, m: 'mt' }, { label: 'Model', v: (i) => i.model }, { label: 'Compound', v: (i) => i.compound }, { label: 'Gender', v: (i) => i.gender }, { label: 'Color', v: (i) => i.color }, { label: 'Size', v: (i) => i.size },
      { label: 'Est Date', v: (i) => dstr(i.est_date), cls: 'nw' }, { label: 'ETD', v: (i) => dstr(i.etd), cls: 'nw' }, { label: 'XFD', v: (i) => dstr(i.xfd), cls: 'nw' },
      { label: 'Qty', html: (i) => qty(i.qty) + ' ' + esc(i.unit), cls: 'n nw' },
      { label: 'Diterima (via PO)', html: (i) => `${qty(i.recv)}${i.recv >= Number(i.qty) ? ' ✓' : ''}`, cls: 'n nw' },
      { label: 'Harga', v: (i) => ERP.fmtNum(i.price, dec), cls: 'n' }, { label: 'Jumlah', v: (i) => ERP.fmtNum(i.qty * i.price, dec), cls: 'n' },
    ], s.items);
    const pos = [...new Set(s.poLinks.map((x) => x.p.po_number))];
    return ERP.modal({
      title: esc(s.so_number) + (s.urgent ? ' <span class="urgent-tag">URGENT</span>' : ''), wide: true,
      html: `<dl class="kv"><dt>Tanggal</dt><dd>${fmtDate(s.so_date)}</dd><dt>Client</dt><dd>${esc(s.client.name)}</dd><dt>Pembayaran</dt><dd>${esc(ERP.termText(s))}</dd>
        ${fxOf(s) ? `<dt>Rate</dt><dd>1 ${esc(cur)} = IDR ${ERP.fmtNum(fxOf(s), 2)}</dd>` : ''}
        <dt>Status</dt><dd>${ERP.approvalBadge(s)} ${s.approved_by && um[s.approved_by] ? '<small>oleh ' + esc(um[s.approved_by].full_name) + '</small>' : ''}</dd>
        <dt>Dibuat oleh</dt><dd>${esc((um[s.created_by] || {}).full_name || '-')}</dd><dt>PO terkait</dt><dd>${esc(pos.join(', ')) || '-'}</dd>
        ${s.notes ? `<dt>Catatan</dt><dd>${esc(s.notes)}</dd>` : ''}</dl>
        <div class="sec-t">Item</div>${lines}
        <div class="totals"><div><span>Subtotal</span><span>${M(t.subtotal)}</span></div>${t.disc > 0 ? `<div><span>Diskon</span><span>- ${M(t.disc)}</span></div>` : ''}<div><span>Total sebelum PPN</span><span>${M(t.dpp)}</span></div>${s.vat ? `<div><span>PPN 11%</span><span>${M(t.vatAmt)}</span></div>` : ''}<div class="gt"><span>Total</span><span>${M(t.total)}</span></div></div>`,
      actions: [
        { icon: 'print', tip: 'Print Sales Order', onClick: () => printSO(s, um) },
        ...(ERP.can.write() ? [{ icon: 'edit', tip: 'Edit SO', onClick: (mm) => { mm.close(); location.hash = '#/so/edit/' + s.id; } }] : []),
        ...(ERP.can.approve() && s.status !== 'approved' ? [{ icon: 'check', tip: 'Approve SO', cls: 'ok', onClick: (mm) => { mm.close(); approve(s); } }] : []),
        { icon: 'download', tip: 'Export Excel SO ini', onClick: () => exportSOs([s], 'SO_' + s.so_number + '.xlsx') },
        ...(ERP.can.write() ? [{ icon: 'trash', tip: 'Hapus SO', cls: 'danger', onClick: (mm) => deleteSO(s, () => mm.close()) }] : []),
      ],
    });
  }

  function exportSOs(list, filename) {
    if (!list.length) { ERP.toast('Tidak ada Sales Order untuk diexport', 'err'); return; }
    const sum = list.map((s) => [s.so_number, fmtDate(s.so_date), s.client.name, s.currency, fxOf(s) || '', ERP.termText(s), s.vat ? 'YA' : '', s.urgent ? 'YA' : '', Number(s.subtotal), Number(s.discount_amount), Number(s.vat_amount), Number(s.total), s.status === 'approved' ? 'Approved' : 'Menunggu approval', s.received, s.ordered, [...new Set(s.poLinks.map((x) => x.p.po_number))].join(', ')]);
    const det = [];
    list.forEach((s) => s.items.forEach((i, n) => det.push([s.so_number, fmtDate(s.so_date), s.client.name, s.currency, n + 1, i.brand, i.model, i.compound || '', i.gender || '', i.color || '', i.size || '', dstr(i.est_date), dstr(i.etd), dstr(i.xfd), Number(i.qty), i.unit, Number(i.price), ERP.round(i.qty * i.price, s.currency), i.recv, i.out])));
    ERP.xlsxExportMulti(filename, [
      { name: 'Ringkasan SO', headers: ['No SO', 'Tanggal', 'Client', 'Mata Uang', 'Rate IDR', 'Pembayaran', 'PPN 11%', 'Urgent', 'Subtotal', 'Diskon', 'PPN', 'Total', 'Approval', 'Qty diterima', 'Qty dipesan', 'PO terkait'], rows: sum },
      { name: 'Detail Item', headers: ['No SO', 'Tanggal', 'Client', 'Mata Uang', 'No', 'Brand', 'Model', 'Compound', 'Gender', 'Color', 'Size', 'Est Date', 'ETD', 'XFD', 'Qty', 'Satuan', 'Harga', 'Jumlah', 'Diterima (via PO)', 'Keluar (DO)'], rows: det },
    ]);
  }

  /* ---------- Daftar ---------- */
  async function renderList(v) {
    const data = await ERP.loadPO();
    const canW = ERP.can.write();
    const matches = (s) => !S.q || norm(s.so_number).includes(S.q) || norm(s.client.name).includes(S.q) || s.items.some((i) => norm(ERP.attrText(i)).includes(S.q));
    v.innerHTML = `<div class="toolbar">${ERP.searchBox('q', 'Cari client / brand / model / compound / color / size / no SO…')}
      <div class="tb-actions">${canW ? btn('plus', 'Buat Sales Order baru', 'id="b-new"', 'primary') : ''}${btn('print', 'Print daftar', 'id="b-prt"')}${btn('download', 'Export ke Excel', 'id="b-exp"')}</div></div>
      <div class="tabs" id="tabs"></div><div id="list"></div>`;
    $('#q').value = S.q;
    const bar = (a, b, ok) => `<div class="bar ${ok ? 'ok' : ''}"><i style="width:${b > 0 ? Math.min(100, (a / b) * 100) : 0}%"></i></div>`;
    const cols = [
      { label: 'No SO', html: (s) => `<b>${esc(s.so_number)}</b>${s.urgent ? '<span class="urgent-tag">URGENT</span>' : ''}`, cls: 'nw', m: 'mt' },
      { label: 'Tanggal', v: (s) => fmtDate(s.so_date), cls: 'nw' },
      { label: 'Client', v: (s) => s.client.name },
      { label: 'Total', html: (s) => fmtMoney(s.total, s.currency), cls: 'n nw' },
      { label: 'Approval', html: (s) => ERP.approvalBadge(s) },
      { label: 'Diterima via PO', html: (s) => `${qty(s.received)} / ${qty(s.ordered)}${bar(s.received, s.ordered, s.allReceived)}`, cls: 'nw' },
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
    $('#b-prt').onclick = () => ERP.printTable('Daftar Sales Order — ' + STAGES.find((x) => x[0] === S.tab)[1], [{ label: 'No SO', v: (s) => s.so_number }, { label: 'Tanggal', v: (s) => fmtDate(s.so_date) }, { label: 'Client', v: (s) => s.client.name }, { label: 'Total', num: true, v: (s) => fmtMoney(s.total, s.currency) }, { label: 'Approval', v: (s) => (s.status === 'approved' ? 'Approved' : 'Menunggu') }, { label: 'Diterima', v: (s) => qty(s.received) + '/' + qty(s.ordered) }], draw.rows);
    $('#b-exp').onclick = () => exportSOs(draw.rows, 'SO_' + ERP.today() + '.xlsx');
    $('#list').onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const s = data.sos.find((x) => x.id === b.dataset.id);
      ({ view: () => detailModal(s, data), print: () => printSO(s, data.userMap), edit: () => (location.hash = '#/so/edit/' + s.id), approve: () => approve(s), xls: () => exportSOs([s], 'SO_' + s.so_number + '.xlsx'), del: () => deleteSO(s) })[b.dataset.a]();
    };
  }

  /* ---------- Form ---------- */
  async function renderForm(v, id) {
    const data = await ERP.loadPO();
    const clients = data.clients, items = data.items;
    let masterItems = items;
    const old = id ? data.sos.find((s) => s.id === id) : null;
    if (id && !old) { v.innerHTML = '<div class="empty">Sales Order tidak ditemukan.</div>'; return; }
    const A = ['brand', 'model', 'compound', 'gender', 'color', 'size', 'unit'];
    const pickA = (o) => Object.fromEntries(A.map((k) => [k, o[k] || '']));
    const newLine = () => ({ k: Math.random(), item_id: null, brand: '', model: '', compound: '', gender: '', color: '', size: '', unit: '', est: '', etd: '', xfd: '', qty: 1, price: '' });
    const st = old ? {
      no: old.so_number, date: old.so_date, client: old.client && old.client.id ? old.client : null, vat: !!old.vat, urgent: !!old.urgent, discType: old.discount_type || 'pct', discVal: old.discount_value || 0, notes: old.notes || '', fx: Number(old.fx_rate) || 0,
      lines: old.items.map((i) => ({ k: Math.random(), id: i.id, item_id: i.item_id, ...pickA(i), est: i.est_date || '', etd: i.etd || '', xfd: i.xfd || '', qty: i.qty, price: i.price })),
    } : { no: '', date: ERP.today(), client: null, vat: false, urgent: false, discType: 'pct', discVal: 0, notes: '', fx: 0, lines: [] };
    if (!st.lines.length) st.lines.push(newLine());
    const cur = () => (st.client ? st.client.currency || 'IDR' : 'IDR');
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
        <div class="fld"><span>Pembayaran</span><div class="note" id="f-term" style="margin:0">-</div></div>
        <div class="fld"><span>Opsi</span><div class="chk-row"><label class="chk"><input type="checkbox" id="f-vat"> Tambah PPN 11%</label></div>
          <label class="chk"><input type="checkbox" id="f-urg"> <b style="color:var(--err)">URGENT</b></label></div>
        <div class="fld"><span>Diskon</span><div class="tempo-box"><select id="f-dt" style="width:auto"><option value="pct">%</option><option value="amt">Nilai</option></select><input id="f-dv" inputmode="decimal" style="width:130px"></div></div>
      </div></div>
      <div class="card" style="margin-top:12px"><div class="page-head" style="margin:0"><h3>Item</h3>${btn('plus', 'Tambah baris item', 'id="b-addline"', 'primary')}</div>
        <div class="lines"><div id="lines-head"></div><div id="lines" class="lines"></div></div>
        <div class="totals" id="totals"></div></div>
      <div class="card" style="margin-top:12px">${ERP.field('Catatan (opsional)', `<textarea id="f-notes" rows="2">${esc(st.notes)}</textarea>`)}</div>`;

    $('#f-vat').checked = st.vat; $('#f-urg').checked = st.urgent; $('#f-dt').value = st.discType; $('#f-dv').value = st.discVal || ''; $('#f-fx').value = st.fx || '';
    const syncTop = () => { $('#fx-wrap').style.display = cur() === 'IDR' ? 'none' : ''; $('#fx-lbl').textContent = `Rate ${cur()} → IDR`; $('#f-term').textContent = st.client ? ERP.termText(termOf(st.client)) : 'Mengikuti data client'; };
    syncTop();
    const LK = { l_est: 'est', l_etd: 'etd', l_xfd: 'xfd' };
    v.onchange = (e) => {
      const n = e.target.name;
      if (n === 'so_date') st.date = ERP.parseDate(e.target.value) || st.date;
      if (LK[n]) { const l = st.lines.find((x) => String(x.k) === e.target.dataset.k); if (l) l[LK[n]] = ERP.parseDate(e.target.value); }
    };
    $('#f-vat').onchange = (e) => { st.vat = e.target.checked; totals(); };
    $('#f-urg').onchange = (e) => (st.urgent = e.target.checked);
    $('#f-dt').onchange = (e) => { st.discType = e.target.value; totals(); };
    $('#f-dv').oninput = (e) => { st.discVal = e.target.value; totals(); };
    $('#f-fx').oninput = (e) => { st.fx = ERP.num(e.target.value); totals(); };
    $('#f-notes').oninput = (e) => (st.notes = e.target.value);
    $('#f-sono').oninput = (e) => (st.no = e.target.value);
    ERP.combo($('#f-cl'), (q) => { const n = norm(q); return clients.filter((c) => !n || norm(c.name).includes(n) || norm(c.code).includes(n) || norm(c.category).includes(n) || norm(c.contact_person).includes(n)).map((c) => ({ c, label: c.name, sub: `${c.code} · ${c.currency || 'IDR'}${c.contact_person ? ' · ' + c.contact_person : ''}` })); },
      (it) => { st.client = it.c; $('#f-cl').value = it.c.name; $('#f-cur').value = cur(); syncTop(); drawLines(); });
    $('#f-cl').addEventListener('input', () => { if (st.client && st.client.name !== $('#f-cl').value) { st.client = null; $('#f-cur').value = 'IDR'; syncTop(); drawLines(); } });

    /* baris item: No - Brand - Model - Compound - Gender - Color - Size - Est Date - ETD - XFD - Qty - Satuan - Harga - Jumlah */
    const linesEl = $('#lines');
    const fillItem = (l, it) => Object.assign(l, { item_id: it.id }, pickA(it));
    const headHTML = () => `<div class="line head so"><span>No</span><span>Brand (cari item)</span><span>Model</span><span>Compound</span><span>Gender</span><span>Color</span><span>Size</span><span>Est Date</span><span>ETD</span><span>XFD</span><span>Qty</span><span>Satuan</span><span>Harga ${esc(cur())}</span><span>Jumlah ${esc(cur())}</span><span></span></div>`;
    function drawLines() {
      $('#lines-head').innerHTML = headHTML();
      linesEl.innerHTML = st.lines.map((l, n) => `<div class="line so" data-k="${l.k}"><span class="no">${n + 1}</span>
        <div class="it"><input class="li-item" placeholder="Cari item…" value="${esc(l.brand)}" autocomplete="off"></div>
        <span class="at">${esc(l.model)}</span><span class="at">${esc(l.compound)}</span><span class="at">${esc(l.gender)}</span><span class="at">${esc(l.color)}</span><span class="at">${esc(l.size)}</span>
        <span class="at-all">${esc(ERP.attrText(l))}</span>
        <div class="dd">${ERP.dateInput('l_est', l.est, `data-k="${l.k}"`)}</div><div class="dd">${ERP.dateInput('l_etd', l.etd, `data-k="${l.k}"`)}</div><div class="dd">${ERP.dateInput('l_xfd', l.xfd, `data-k="${l.k}"`)}</div>
        <div class="qt"><input class="li-qty r" inputmode="decimal" value="${l.qty}"></div>
        <span class="un">${esc(l.unit)}</span>
        <div class="pr"><input class="li-price r" inputmode="decimal" value="${l.price === '' ? '' : l.price}" placeholder="Harga"></div>
        <span class="amt aa"></span>
        <div class="rm">${btn('trash', 'Hapus baris', 'data-rm', 'sm danger')}</div></div>`).join('');
      $$('.line[data-k]', linesEl).forEach((row) => {
        const l = st.lines.find((x) => String(x.k) === row.dataset.k);
        ERP.combo($('.li-item', row), (q) => { const n = norm(q); return masterItems.filter((i) => !n || norm(ERP.attrText(i)).includes(n)).sort((a, b) => ERP.attrText(a).localeCompare(ERP.attrText(b), undefined, { numeric: true })).map((i) => ({ i, label: ERP.attrText(i), sub: i.unit })); }, (it) => { fillItem(l, it.i); drawLines(); });
        $('.li-qty', row).oninput = (e) => { l.qty = ERP.num(e.target.value); amt(row, l); totals(); };
        $('.li-price', row).oninput = (e) => { l.price = e.target.value === '' ? '' : ERP.num(e.target.value); amt(row, l); totals(); };
        amt(row, l);
      });
      totals();
    }
    function amt(row, l) { $('.aa', row).textContent = ERP.fmtNum(ERP.num(l.qty) * ERP.num(l.price), ERP.decimals(cur())); }
    function totals() {
      const c = calc(st.lines, st.discType, st.discVal, st.vat, cur()), F = fx(), m = (n) => fmtMoney(n, cur()), ii = (n) => (F ? `<small class="idr">≈ IDR ${ERP.fmtNum(n * F, 0)}</small>` : '');
      $('#totals').innerHTML = `<div><span>Subtotal</span><span>${m(c.subtotal)}${ii(c.subtotal)}</span></div>${c.disc > 0 ? `<div><span>Diskon</span><span>- ${m(c.disc)}</span></div>` : ''}<div><b>Total (sebelum PPN)</b><b>${m(c.dpp)}${ii(c.dpp)}</b></div>${st.vat ? `<div><span>PPN 11%</span><span>${m(c.vatAmt)}</span></div>` : ''}<div class="gt"><span>Total</span><span>${m(c.total)}${ii(c.total)}</span></div>`;
      $$('.line[data-k]', linesEl).forEach((row) => amt(row, st.lines.find((x) => String(x.k) === row.dataset.k)));
    }
    linesEl.onclick = (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; const k = b.closest('.line').dataset.k; st.lines = st.lines.filter((x) => String(x.k) !== k); if (!st.lines.length) st.lines.push(newLine()); drawLines(); };
    $('#b-addline').onclick = () => { st.lines.push(newLine()); drawLines(); const ins = $$('.li-item', linesEl); ins[ins.length - 1].focus(); };
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
      const c = calc(lines, st.discType, st.discVal, st.vat, cur());
      const hdr = { so_number: st.no, so_date: st.date, client_id: st.client.id, currency: cur(), fx_rate: fx() || null, ...termOf(st.client), vat: st.vat, urgent: st.urgent, discount_type: st.discType, discount_value: ERP.num(st.discVal), subtotal: c.subtotal, discount_amount: c.disc, vat_amount: c.vatAmt, total: c.total, notes: st.notes || null };
      const rec = (l, n, soId) => ({ so_id: soId, line_no: n + 1, item_id: l.item_id, brand: l.brand, model: l.model, compound: l.compound || null, gender: l.gender || null, color: l.color || null, size: l.size || null, unit: l.unit, est_date: l.est || null, etd: l.etd || null, xfd: l.xfd || null, qty: ERP.num(l.qty), price: ERP.num(l.price) });
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
