/* Delivery Order / Surat Jalan ke client: nomor diketik manual, terkait PO, tanpa harga */
(function () {
  const ERP = window.ERP;
  const { $, $$, esc, btn, norm, fmtDate } = ERP;
  const DB = ERP.DB;
  const S = { q: '' };
  const qty = (n) => ERP.fmtNum(n, Number.isInteger(+n) ? 0 : 2);
  const avail = (p, i) => { const r = p.rc[i.id] || { G: 0, D: 0 }, o = p.ou[i.id] || { G: 0, D: 0 }; return { G: Math.max(0, r.G - o.G), D: Math.max(0, r.D - o.D) }; };

  function printDO(d, poNo) {
    const c = d.client;
    const rows = d.items.map((i, n) => `<tr><td class="center">${n + 1}</td><td>${esc(i.brand)}</td><td>${esc(i.model)}</td><td>${esc(i.compound)}</td><td>${esc(i.gender)}</td><td>${esc(i.color)}</td><td>${esc(i.size)}</td><td class="center">${i.grade === 'D' ? 'D' : 'G'}</td><td class="n">${qty(i.qty)} ${esc(i.unit)}</td></tr>`).join('');
    ERP.printHTML(d.do_number, `<h1>DELIVERY ORDER / SURAT JALAN</h1><div class="muted">${esc(d.do_number)}</div>
      <div class="grid2"><div class="box"><b>Kepada:</b><br><b>${esc(c.name)}</b><br>${esc(c.contact_person || '')}${c.position ? ' (' + esc(c.position) + ')' : ''}<br>${esc([c.mobile, c.office_phone].filter(Boolean).join(' / '))}<br><br><b>Alamat pengiriman:</b><br>${esc(d.ship_to || c.shipping_address || c.address || '-').replace(/\n/g, '<br>')}</div>
      <div class="box"><table class="kv"><tr><td>No DO</td><td><b>${esc(d.do_number)}</b></td></tr><tr><td>Tanggal</td><td>${fmtDate(d.do_date)}</td></tr><tr><td>Ref. PO</td><td>${esc(poNo)}</td></tr>${d.inv_no ? `<tr><td>No Invoice</td><td>${esc(d.inv_no)}</td></tr>` : ''}${d.fp_no ? `<tr><td>No FP</td><td>${esc(d.fp_no)}</td></tr>` : ''}</table></div></div>
      <table><thead><tr><th class="center">No</th><th>Brand</th><th>Model</th><th>Compound</th><th>Gender</th><th>Color</th><th>Size</th><th class="center">G/D</th><th class="n">Qty</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="muted">Total qty: ${qty(d.total)}</div>
      ${d.notes ? `<div class="box"><b>Catatan:</b><br>${esc(d.notes).replace(/\n/g, '<br>')}</div>` : ''}
      <div class="sign"><div><div class="line"></div>Dibuat oleh<br><b>${esc(d.creator)}</b></div><div><div class="line"></div>Pengirim</div><div><div class="line"></div>Penerima<br>(nama jelas &amp; tanda tangan)</div></div>`, { landscape: true });
  }

  const itemCols = [
    { label: 'Brand', html: (i) => `<b>${esc(i.brand)}</b>`, m: 'mt' }, { label: 'Model', v: (i) => i.model }, { label: 'Compound', v: (i) => i.compound }, { label: 'Gender', v: (i) => i.gender },
    { label: 'Color', v: (i) => i.color }, { label: 'Size', v: (i) => i.size }, { label: 'G/D', html: (i) => ERP.badge(i.grade === 'D' ? 'D' : 'G', i.grade === 'D' ? 'err' : 'ok') },
    { label: 'Qty', html: (i) => qty(i.qty) + ' ' + esc(i.unit), cls: 'n nw' },
  ];

  function invModal(d) {
    ERP.modal({
      title: 'Invoice & Faktur Pajak — ' + esc(d.do_number),
      html: `<div class="grid c2">${ERP.field('No Invoice', `<input name="inv_no" value="${esc(d.inv_no)}">`)}${ERP.field('No FP (Faktur Pajak)', `<input name="fp_no" value="${esc(d.fp_no)}">`)}</div>`,
      actions: [{ icon: 'check', tip: 'Simpan', cls: 'primary', onClick: async (m) => { const f = ERP.formData(m.el); try { await DB.update('delivery_orders', d.id, { inv_no: f.inv_no || null, fp_no: f.fp_no || null }); m.close(); ERP.toast('Tersimpan'); ERP.refresh(); } catch (e) { ERP.toast(e.message, 'err'); } } }],
    });
  }

  async function renderList(v) {
    const data = await ERP.loadPO();
    const poMap = Object.fromEntries(data.pos.map((p) => [p.id, p]));
    const dos = data.dos.slice().sort((a, b) => (b.do_date || '').localeCompare(a.do_date || ''));
    const canR = ERP.can.receive();
    v.innerHTML = `<div class="toolbar">${ERP.searchBox('q', 'Cari client / no DO / no PO / brand / model / color / size…')}<div class="tb-actions">${canR ? btn('plus', 'Buat Delivery Order', 'id="b-new"', 'primary') : ''}${btn('print', 'Print daftar', 'id="b-prt"')}</div></div><div id="list"></div>`;
    $('#q').value = S.q;
    const poNo = (d) => (poMap[d.po_id] || {}).po_number || '-';
    const filtered = () => dos.filter((d) => !S.q || norm(d.do_number).includes(S.q) || norm(d.client.name).includes(S.q) || norm(poNo(d)).includes(S.q) || d.items.some((i) => norm(ERP.attrText(i)).includes(S.q)));
    const cols = [
      { label: 'No DO', html: (d) => `<b>${esc(d.do_number)}</b>`, cls: 'nw', m: 'mt' }, { label: 'Tanggal', v: (d) => fmtDate(d.do_date), cls: 'nw' }, { label: 'Client', v: (d) => d.client.name },
      { label: 'No PO', v: poNo, cls: 'nw' },
      { label: 'Item', v: (d) => [...new Set(d.items.map((i) => [i.brand, i.model].filter(Boolean).join(' ')))].join(', '), cls: 'hide-md', m: 'mf' }, { label: 'Total Qty', v: (d) => qty(d.total), cls: 'n' },
      { label: 'Invoice / FP', html: (d) => (d.inv_no || d.fp_no) ? esc(d.inv_no || '-') + (d.fp_no ? `<small>FP ${esc(d.fp_no)}</small>` : '') : '-', cls: 'hide-md', m: 'mh' },
      { label: '', cls: 'act', html: (d) => btn('eye', 'Lihat detail', `data-a="view" data-id="${d.id}"`, 'sm') + btn('print', 'Print Delivery Order', `data-a="print" data-id="${d.id}"`, 'sm') + (canR ? btn('file', 'Input invoice & FP', `data-a="inv" data-id="${d.id}"`, 'sm') + btn('trash', 'Batalkan DO', `data-a="del" data-id="${d.id}"`, 'sm danger') : '') },
    ];
    const draw = () => { $('#list').innerHTML = ERP.table(cols, filtered(), { empty: dos.length ? 'Tidak ada hasil.' : 'Belum ada Delivery Order.' }); };
    draw();
    $('#q').oninput = ERP.debounce((e) => { S.q = norm(e.target.value.trim()); draw(); });
    if ($('#b-new')) $('#b-new').onclick = () => (location.hash = '#/do/new');
    $('#b-prt').onclick = () => ERP.printTable('Daftar Delivery Order', [{ label: 'No DO', v: (d) => d.do_number }, { label: 'Tanggal', v: (d) => fmtDate(d.do_date) }, { label: 'Client', v: (d) => d.client.name }, { label: 'No PO', v: poNo }, { label: 'Item', v: (d) => d.items.map((i) => i.brand + ' ' + i.model).join(', ') }, { label: 'Total Qty', num: true, v: (d) => qty(d.total) }, { label: 'Invoice', v: (d) => d.inv_no || '' }, { label: 'No FP', v: (d) => d.fp_no || '' }], filtered());
    $('#list').onclick = async (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const d = dos.find((x) => x.id === b.dataset.id);
      if (b.dataset.a === 'print') printDO(d, poNo(d));
      else if (b.dataset.a === 'inv') invModal(d);
      else if (b.dataset.a === 'view') ERP.modal({ title: esc(d.do_number), wide: true, html: `<dl class="kv"><dt>Tanggal</dt><dd>${fmtDate(d.do_date)}</dd><dt>Client</dt><dd>${esc(d.client.name)}</dd><dt>Ref. PO</dt><dd>${esc(poNo(d))}</dd><dt>Alamat kirim</dt><dd>${esc(d.ship_to || '-')}</dd><dt>Invoice / FP</dt><dd>${esc(d.inv_no) || '-'} / ${esc(d.fp_no) || '-'}</dd>${d.notes ? `<dt>Catatan</dt><dd>${esc(d.notes)}</dd>` : ''}<dt>Dibuat oleh</dt><dd>${esc(d.creator)}</dd></dl><div class="sec-t">Item</div>${ERP.table(itemCols, d.items)}`, actions: [{ icon: 'print', tip: 'Print', onClick: () => printDO(d, poNo(d)) }] });
      else if (b.dataset.a === 'del') {
        if (!(await ERP.confirm(`Batalkan <b>${esc(d.do_number)}</b>? Qty keluar dikembalikan ke stok PO.`, { danger: true }))) return;
        try { await DB.remove('delivery_orders', d.id); ERP.toast('DO dibatalkan'); ERP.refresh(); } catch (err) { ERP.toast(err.message, 'err'); }
      }
    };
  }

  async function renderForm(v) {
    const data = await ERP.loadPO();
    const { clients, dos } = data;
    const pos = data.pos.filter((p) => p.status === 'approved' && p.items.some((i) => { const a = avail(p, i); return a.G + a.D > 0; }));
    const st = { date: ERP.today(), client: null, po: null, ship: '' };
    v.innerHTML = `<div class="page-head">${btn('back', 'Kembali ke daftar', 'id="b-back"')}<h3>Buat Delivery Order</h3>${btn('check', 'Simpan Delivery Order', 'id="b-save"', 'primary')}</div>
      <div class="card"><div class="grid c4 po-top">${ERP.field('No DO * (ketik manual)', '<input name="do_number" id="f-no" autocomplete="off">')}${ERP.field('Tanggal', ERP.dateInput('do_date', st.date))}
        ${ERP.field('Client *', '<input id="f-cl" placeholder="Cari nama client…" autocomplete="off">', 'po-sup')}
        ${ERP.field('Ref. PO *', '<input id="f-po" placeholder="Cari no PO / supplier…" autocomplete="off">', 'po-cur')}</div>
        <div class="grid c3" style="margin-top:10px">${ERP.field('Alamat pengiriman', '<textarea id="f-ship" rows="2"></textarea>')}${ERP.field('No Invoice (opsional)', '<input id="f-inv">')}${ERP.field('No FP (opsional)', '<input id="f-fp">')}</div>
        <div style="margin-top:10px">${ERP.field('Catatan (opsional)', '<textarea id="f-notes" rows="2"></textarea>')}</div></div>
      <div class="card" style="margin-top:12px"><div class="sec-t" style="margin-top:0">Barang yang dikirim (dari penerimaan PO)</div><div id="lines"><div class="empty">Pilih Ref. PO terlebih dahulu.</div></div></div>`;
    v.onchange = (e) => { if (e.target.name === 'do_date') st.date = ERP.parseDate(e.target.value) || st.date; };
    $('#f-ship').oninput = (e) => (st.ship = e.target.value);
    ERP.combo($('#f-cl'), (q) => { const n = norm(q); return clients.filter((c) => !n || norm(c.name).includes(n) || norm(c.code).includes(n) || norm(c.category).includes(n) || norm(c.contact_person).includes(n)).map((c) => ({ c, label: c.name, sub: `${c.code}${c.category ? ' · ' + c.category : ''}${c.contact_person ? ' · ' + c.contact_person : ''}` })); },
      (it) => { st.client = it.c; $('#f-cl').value = it.c.name; st.ship = it.c.shipping_address || it.c.address || ''; $('#f-ship').value = st.ship; });
    $('#f-cl').addEventListener('input', () => { if (st.client && st.client.name !== $('#f-cl').value) st.client = null; });
    ERP.combo($('#f-po'), (q) => { const n = norm(q); return pos.filter((p) => !n || norm(p.po_number).includes(n) || norm(p.supplier.name).includes(n)).map((p) => ({ p, label: p.po_number, sub: `${p.supplier.name} · ${fmtDate(p.po_date)}` })); },
      (it) => { st.po = it.p; $('#f-po').value = it.p.po_number; drawLines(); });
    $('#f-po').addEventListener('input', () => { if (st.po && st.po.po_number !== $('#f-po').value) { st.po = null; drawLines(); } });

    function drawLines() {
      const p = st.po; const box = $('#lines');
      if (!p) { box.innerHTML = '<div class="empty">Pilih Ref. PO terlebih dahulu.</div>'; return; }
      const rows = p.items.map((i) => ({ i, a: avail(p, i) })).filter((x) => x.a.G + x.a.D > 0);
      box.innerHTML = `<div class="tbl-wrap"><table class="tbl t3"><thead><tr><th>Brand</th><th>Model</th><th>Compound</th><th>Gender</th><th>Color</th><th>Size</th><th class="n">Tersedia G</th><th class="n">Tersedia D</th><th class="n">Kirim G</th><th class="n">Kirim D</th></tr></thead><tbody>${rows.map(({ i, a }) => `<tr data-id="${i.id}"><td data-label="Brand" class="mt"><b>${esc(i.brand)}</b></td><td data-label="Model">${esc(i.model)}</td><td data-label="Compound">${esc(i.compound)}</td><td data-label="Gender">${esc(i.gender)}</td><td data-label="Color">${esc(i.color)}</td><td data-label="Size">${esc(i.size)}</td>
        <td data-label="Tersedia G" class="n">${qty(a.G)} ${esc(i.unit)}</td><td data-label="Tersedia D" class="n">${qty(a.D)}</td>
        <td data-label="Kirim G" class="n"><span style="display:inline-flex;gap:4px;align-items:center"><input class="kq g" inputmode="decimal" style="width:80px;text-align:right" value="0" data-max="${a.G}" ${a.G ? '' : 'disabled'}>${a.G ? btn('check', 'Kirim semua yang tersedia', 'data-all', 'sm') : ''}</span></td>
        <td data-label="Kirim D" class="n"><input class="kq d" inputmode="decimal" style="width:80px;text-align:right" value="0" data-max="${a.D}" ${a.D ? '' : 'disabled'}></td></tr>`).join('')}</tbody></table></div>`;
    }
    $('#lines').onclick = (e) => { const b = e.target.closest('[data-all]'); if (b) { const i = b.parentNode.querySelector('.kq'); i.value = i.dataset.max; } };
    $('#b-back').onclick = () => (location.hash = '#/do');

    $('#b-save').onclick = async () => {
      const no = $('#f-no').value.trim();
      if (!no) { ERP.toast('No DO wajib diisi', 'err'); return; }
      if (dos.some((d) => norm(d.do_number) === norm(no))) { ERP.toast('No DO sudah dipakai', 'err'); return; }
      if (!st.client) { ERP.toast('Pilih client dari daftar', 'err'); return; }
      if (!st.po) { ERP.toast('Pilih Ref. PO dari daftar', 'err'); return; }
      if (!st.date) { ERP.toast('Tanggal tidak valid', 'err'); return; }
      const out = []; let bad = false;
      $$('tr[data-id]', $('#lines')).forEach((tr) => {
        ['g', 'd'].forEach((k) => {
          const inp = $('.kq.' + k, tr), n = ERP.num(inp.value);
          if (n < 0 || n > Number(inp.dataset.max) + 1e-9) bad = true;
          if (n > 0) out.push({ po_item_id: tr.dataset.id, grade: k.toUpperCase(), qty: n });
        });
      });
      if (bad) { ERP.toast('Qty kirim melebihi stok yang tersedia', 'err'); return; }
      if (!out.length) { ERP.toast('Isi qty barang yang dikirim', 'err'); return; }
      const b = $('#b-save'); b.disabled = true;
      try {
        const [d] = await DB.insert('delivery_orders', { do_number: no, do_date: st.date, client_id: st.client.id, po_id: st.po.id, ship_to: st.ship || null, inv_no: $('#f-inv').value.trim() || null, fp_no: $('#f-fp').value.trim() || null, notes: $('#f-notes').value.trim() || null });
        await DB.insert('do_items', out.map((x, n) => { const it = st.po.items.find((i) => i.id === x.po_item_id); return { do_id: d.id, line_no: n + 1, po_item_id: it.id, item_id: it.item_id, brand: it.brand, model: it.model, compound: it.compound || null, gender: it.gender || null, color: it.color || null, size: it.size || null, unit: it.unit, grade: x.grade, qty: x.qty }; }));
        ERP.toast('Delivery Order dibuat'); location.hash = '#/do';
      } catch (e) { b.disabled = false; ERP.toast('Gagal menyimpan: ' + e.message, 'err'); }
    };
  }

  ERP.register('do', { async render(v, parts) { if (parts[0] === 'new') { if (!ERP.can.receive()) { v.innerHTML = '<div class="empty">Akun ini tidak dapat membuat Delivery Order.</div>'; return; } return renderForm(v); } return renderList(v); } });
})();
