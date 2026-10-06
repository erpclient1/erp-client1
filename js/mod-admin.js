/* Management User + Pengaturan (perusahaan, satuan, mata uang, data dummy) */
(function () {
  const ERP = window.ERP;
  const { $, $$, esc, btn, norm, fmtDate } = ERP;
  const DB = ERP.DB;

  /* ================= USERS ================= */
  function userForm(u) {
    u = u || { role: 'viewer', modules: ERP.ROLE_DEFAULT_MODS.viewer, active: true };
    const F = ERP.field;
    return `<div class="grid c2">
      ${F('Username *', `<input name="username" value="${esc(u.username)}" ${u.id ? 'readonly' : ''} autocapitalize="off" spellcheck="false">`)}
      ${F('Nama lengkap *', `<input name="full_name" value="${esc(u.full_name)}">`)}
      ${F('Role', `<select name="role">${Object.entries(ERP.ROLE_LABEL).map(([k, l]) => `<option value="${k}" ${k === u.role ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
      ${F(u.id ? 'PIN baru (4 digit, kosong = tidak diubah)' : 'PIN (4 digit) *', `<input name="pin" inputmode="numeric" maxlength="4" pattern="\\d{4}" autocomplete="off" placeholder="••••">`)}
    </div>
    <div class="sec-t">Modul yang boleh diakses</div>
    <div class="chk-row" id="mods">${ERP.MODS_ALL.map((m) => `<label class="chk"><input type="checkbox" data-mod="${m}" ${u.modules.includes(m) ? 'checked' : ''}> ${esc(ERP.MOD_LABEL[m])}</label>`).join('')}</div>
    <div class="note">Admin (superuser): semua fungsi + <b>approve PO</b> + kelola user · Supervisor: kelola data, PO, pembayaran + <b>approve PO</b> · Gudang: input penerimaan barang · Viewer: hanya melihat. Modul Pengguna & Pengaturan hanya berlaku untuk role Admin.</div>
    <label class="chk" style="margin-top:8px"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Akun aktif</label>`;
  }

  ERP.register('users', {
    async render(v) {
      let rows = await DB.list('app_users', { order: 'username' });
      v.innerHTML = `<div class="toolbar">${ERP.searchBox('q', 'Cari username / nama…')}<div class="tb-actions">${btn('plus', 'Tambah user', 'id="b-add"', 'primary')}</div></div><div id="list"></div>`;
      let q = '';
      const cols = [
        { label: 'Username', html: (u) => `<b>${esc(u.username)}</b>`, m: 'mt' }, { label: 'Nama', v: (u) => u.full_name },
        { label: 'Role', html: (u) => ERP.badge(ERP.ROLE_LABEL[u.role]) },
        { label: 'Modul', html: (u) => u.modules.map((m) => esc(ERP.MOD_LABEL[m])).join(', '), m: 'mf' },
        { label: 'Status', html: (u) => (u.active ? ERP.badge('Aktif', 'ok') : ERP.badge('Nonaktif', 'mut')) },
        { label: '', cls: 'act', html: (u) => btn('edit', 'Edit user', `data-id="${u.id}"`, 'sm') },
      ];
      const draw = () => { $('#list').innerHTML = ERP.table(cols, rows.filter((u) => !q || norm(u.username).includes(q) || norm(u.full_name).includes(q))); };
      draw();
      $('#q').oninput = ERP.debounce((e) => { q = norm(e.target.value.trim()); draw(); });
      const open = (u) => ERP.modal({
        title: u ? 'Edit User' : 'Tambah User', html: userForm(u), wide: true,
        onMount: (m) => { m.q('[name=role]').onchange = (e) => { const d = ERP.ROLE_DEFAULT_MODS[e.target.value]; $$('[data-mod]', m.el).forEach((c) => (c.checked = d.includes(c.dataset.mod))); }; },
        actions: [{ icon: 'check', tip: 'Simpan', cls: 'primary', onClick: async (m) => {
          const d = ERP.formData(m.el);
          const modules = $$('[data-mod]', m.el).filter((c) => c.checked).map((c) => c.dataset.mod);
          if (!u && !/^[a-z0-9._-]{3,30}$/i.test(d.username)) { ERP.toast('Username 3–30 karakter (huruf/angka . _ -)', 'err'); return; }
          if (!d.full_name) { ERP.toast('Nama lengkap wajib diisi', 'err'); return; }
          if ((!u || d.pin) && !/^\d{4}$/.test(d.pin)) { ERP.toast('PIN harus 4 digit angka', 'err'); return; }
          if (u && u.id === ERP.user.id && (!d.active || d.role !== 'admin' || !modules.includes('users'))) { ERP.toast('Anda tidak dapat menonaktifkan / menurunkan akses akun sendiri', 'err'); return; }
          try {
            if (u) await DB.adminUser('update', { id: u.id, full_name: d.full_name, role: d.role, modules, active: d.active, pin: d.pin || undefined });
            else await DB.adminUser('create', { username: d.username.toLowerCase(), full_name: d.full_name, role: d.role, modules, pin: d.pin });
            m.close(); ERP.toast('User disimpan'); rows = await DB.list('app_users', { order: 'username' }); draw();
          } catch (e) { ERP.toast(e.message, 'err'); }
        } }],
      });
      $('#b-add').onclick = () => open(null);
      $('#list').onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) open(rows.find((x) => x.id === b.dataset.id)); };
    },
  });

  /* ================= DUMMY DATA ================= */
  async function loadDummy() {
    const canApprove = DB.mode === 'local' || ['admin', 'supervisor'].includes(ERP.user.role);
    const D = (o) => ({ ...o, is_dummy: true });
    const sup = await DB.insert('suppliers', [
      D({ name: 'PT Sumber Makmur (Contoh)', currency: 'IDR', contact_person: 'Budi Santoso', position: 'Sales Manager', mobile: '0812-0000-1111', office_phone: '021-5550001', email: 'budi@sumbermakmur.example', billing_address: 'Jl. Industri No. 1, Jakarta', npwp: '01.234.567.8-012.000', tax_payer: 'PT Sumber Makmur', nitku: '0123456789012340000000', tax_address: 'Jl. Industri No. 1, Jakarta' }),
      D({ name: 'CV Karya Teknik (Contoh)', currency: 'IDR', contact_person: 'Siti Rahma', position: 'Marketing', mobile: '0813-0000-2222', office_phone: '031-5550002', email: 'siti@karyateknik.example', billing_address: 'Jl. Raya Darmo 22, Surabaya', npwp: '02.345.678.9-023.000', tax_payer: 'CV Karya Teknik', nitku: '0234567890123450000000', tax_address: 'Jl. Raya Darmo 22, Surabaya' }),
      D({ name: 'Global Soles Ltd (Contoh)', currency: 'USD', contact_person: 'John Miller', position: 'Account Executive', mobile: '+1-555-0100', office_phone: '+1-555-0101', email: 'john@globalsoles.example', billing_address: '100 Industrial Ave, Singapore', npwp: '', tax_payer: '', nitku: '', tax_address: '' }),
    ]);
    const V = (brand, model, compound, gender, color, size, unit) => D({ brand, model, compound, gender, color, size, unit });
    const items = await DB.insert('items', [
      V('Aero', 'Runner X', 'EVA-60', 'Man', 'Black', '9', 'PRS'), V('Aero', 'Runner X', 'EVA-60', 'Man', 'Black', '10', 'PRS'), V('Aero', 'Runner X', 'EVA-60', 'Woman', 'White', '6', 'PRS'),
      V('Terra', 'Trail Pro', 'RB-45', 'Man', 'Brown', '8', 'PRS'), V('Terra', 'Trail Pro', 'RB-45', 'JR', 'Brown', '4T', 'PRS'), V('Kiddo', 'Mini Step', 'PU-30', 'KID', 'Pink', '11T', 'PRS'),
      V('Aero', 'Sole Sheet', 'TPR-70', 'GS', 'Grey', '', 'KG'), V('Kiddo', 'Mini Step', 'PU-30', 'INF', 'Blue', '5', 'PRS'),
    ]);
    const cl = await DB.insert('clients', [
      D({ name: 'PT Maju Bersama (Contoh)', category: 'Distributor', currency: 'IDR', contact_person: 'Rina Wijaya', position: 'Purchasing', mobile: '0811-1111-0001', email: 'rina@majubersama.example', office_phone: '021-5559991', office_email: 'info@majubersama.example', address: 'Jl. Sudirman No. 10, Jakarta', shipping_address: 'Gudang Cikarang Blok C-5, Bekasi', billing_address: 'Jl. Sudirman No. 10, Jakarta', npwp: '03.456.789.0-034.000', tax_payer: 'PT Maju Bersama', nitku: '0345678901234560000000', tax_address: 'Jl. Sudirman No. 10, Jakarta', payment_term: 'tempo', tempo_days: 30 }),
      D({ name: 'Toko Sentosa (Contoh)', category: 'Retail', currency: 'IDR', contact_person: 'Hendra', position: 'Pemilik', mobile: '0812-2222-0002', email: 'hendra@sentosa.example', office_phone: '', office_email: '', address: 'Jl. Pasar Baru 5, Bandung', shipping_address: 'Jl. Pasar Baru 5, Bandung', billing_address: 'Jl. Pasar Baru 5, Bandung', npwp: '', tax_payer: '', nitku: '', tax_address: '', payment_term: 'cash', tempo_days: null }),
    ]);
    // lines: [indexItem, qty, harga]; recv: [tanggal, no SJ, good (1 = semua | {baris:qty}), defect {baris:qty}]
    const specs = [
      { s: 0, date: '2026-01-12', pay: 'cash', vat: true, lines: [[0, 100, 185000], [1, 100, 185000]], recv: [['2026-01-20', 'SJ-A-001', 1, { 0: 4 }]], inv: ['INV-A-001', '2026-01-21', '010.000-26.00000001'], paid: [['2026-02-05', 1]] },
      { s: 1, date: '2026-02-03', pay: 'tempo', days: 30, vat: true, disc: 5, lines: [[3, 60, 210000], [4, 40, 160000]], recv: [['2026-02-12', 'SJ-B-001', 1, {}]], inv: ['INV-B-001', '2026-02-13', '010.000-26.00000002'], paid: [['2026-03-01', 0.5]] },
      { s: 0, date: '2026-03-10', pay: 'tempo', days: 14, vat: true, pph: true, urgent: true, lines: [[2, 80, 190000], [0, 50, 187000]], recv: [['2026-03-20', 'SJ-A-002', { 0: 50 }, {}]], inv: ['INV-A-002', '2026-03-21', ''], paid: [] },
      { s: 0, date: '2026-04-14', pay: 'cash', vat: true, lines: [[7, 50, 150000]], recv: [['2026-04-25', 'SJ-A-003', 1, {}]], inv: ['INV-A-003', '2026-04-26', ''], paid: [['2026-04-30', 1]] },
      { s: 2, date: '2026-05-15', pay: 'tempo', tdate: '2026-06-30', fx: 16300, lines: [[6, 500, 3.2], [5, 200, 9.5]], recv: [], inv: null, paid: [] },
      { s: 1, date: '2026-09-02', pay: 'cash', vat: true, lines: [[3, 30, 215000]], recv: [], inv: null, paid: [] },
      { s: 0, date: '2026-10-01', pay: 'tempo', days: 30, vat: true, urgent: true, lines: [[1, 200, 190000]], recv: [], inv: null, paid: [], forcePending: true },
    ];
    const made = [];
    for (const sp of specs) {
      const cur = sup[sp.s].currency;
      const ls = sp.lines.map(([i, q, p]) => ({ it: items[i], qty: q, price: p }));
      const c = ERP.calcPO(ls, 'pct', sp.disc || 0, !!sp.vat, !!sp.pph, 2, cur);
      const seq = await DB.nextPoSeq();
      const approved = canApprove && !sp.forcePending;
      const [po] = await DB.insert('purchase_orders', D({ po_seq: seq, po_number: ERP.poNumber(seq, sp.date), po_date: sp.date, supplier_id: sup[sp.s].id, currency: cur, fx_rate: sp.fx || null, payment_type: sp.pay, tempo_mode: sp.pay === 'tempo' ? (sp.tdate ? 'date' : 'days') : null, tempo_days: sp.days || null, tempo_date: sp.tdate || null, vat: !!sp.vat, pph23: !!sp.pph, pph23_rate: sp.pph ? 2 : null, pph23_amount: c.pphAmt, urgent: !!sp.urgent, discount_type: 'pct', discount_value: sp.disc || 0, subtotal: c.subtotal, discount_amount: c.disc, vat_amount: c.vatAmt, total: c.total, status: 'pending', revision: 0, notes: 'Data contoh' }));
      const lines = await DB.insert('po_items', ls.map((l, n) => ({ po_id: po.id, line_no: n + 1, item_id: l.it.id, brand: l.it.brand, model: l.it.model, compound: l.it.compound, gender: l.it.gender, color: l.it.color, size: l.it.size, unit: l.it.unit, qty: l.qty, price: l.price })));
      made.push({ po, lines });
      if (!approved) continue;
      await DB.update('purchase_orders', po.id, { status: 'approved', approved_by: ERP.user.id, approved_at: sp.date + 'T09:00:00Z' });
      if (sp.inv) await DB.update('purchase_orders', po.id, { invoice_no: sp.inv[0], invoice_date: sp.inv[1], fp_no: sp.inv[2] || null });
      for (const [gd, sj, good, def] of sp.recv) {
        const [g] = await DB.insert('goods_receipts', { po_id: po.id, gr_date: gd, delivery_note_no: sj, received_by: 'Gudang Contoh' });
        const rows = [];
        lines.forEach((l, n) => { const d = (def || {})[n] || 0, gq = good === 1 ? l.qty - d : good[n] || 0; if (gq > 0) rows.push({ gr_id: g.id, po_item_id: l.id, qty: gq, grade: 'G' }); if (d > 0) rows.push({ gr_id: g.id, po_item_id: l.id, qty: d, grade: 'D' }); });
        await DB.insert('gr_items', rows);
      }
      for (const [pd, f] of sp.paid) await DB.insert('po_payments', { po_id: po.id, pay_date: pd, amount: ERP.round(c.total * f, cur), note: 'Data contoh' });
    }
    if (canApprove) { // contoh Delivery Order terkait PO pertama (No DO diketik manual)
      const { po, lines } = made[0];
      const [d] = await DB.insert('delivery_orders', D({ do_number: 'SJ-001/CTH', do_date: '2026-02-10', client_id: cl[0].id, po_id: po.id, ship_to: cl[0].shipping_address, inv_no: 'INV-C-001', fp_no: '010.000-26.00000101', notes: 'Data contoh' }));
      await DB.insert('do_items', [[0, 30], [1, 40]].map(([n, q], k) => ({ do_id: d.id, line_no: k + 1, po_item_id: lines[n].id, item_id: lines[n].item_id, brand: lines[n].brand, model: lines[n].model, compound: lines[n].compound, gender: lines[n].gender, color: lines[n].color, size: lines[n].size, unit: lines[n].unit, grade: 'G', qty: q })));
    }
  }
  async function clearDummy() {
    for (const d of (await DB.list('delivery_orders')).filter((x) => x.is_dummy)) await DB.remove('delivery_orders', d.id);
    for (const p of (await DB.list('purchase_orders')).filter((x) => x.is_dummy)) await DB.remove('purchase_orders', p.id);
    for (const i of (await DB.list('items')).filter((x) => x.is_dummy)) await DB.remove('items', i.id);
    for (const s of (await DB.list('suppliers')).filter((x) => x.is_dummy)) await DB.remove('suppliers', s.id);
    for (const c of (await DB.list('clients')).filter((x) => x.is_dummy)) await DB.remove('clients', c.id);
  }

  /* ================= SETTINGS ================= */
  ERP.register('settings', {
    async render(v) {
      const [units, curs, sups, items, pos, hist] = await Promise.all([DB.list('units', { order: 'name' }), DB.list('currencies', { order: 'code' }), DB.list('suppliers'), DB.list('items'), DB.list('purchase_orders'), DB.list('hist_purchases')]);
      const co = ERP.company || {}; const F = ERP.field;
      const dummyN = sups.filter((x) => x.is_dummy).length + items.filter((x) => x.is_dummy).length + pos.filter((x) => x.is_dummy).length;
      v.innerHTML = `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr));align-items:start">
        <div class="card"><div class="sec-t" style="margin-top:0">Data perusahaan (kop cetakan)</div><div id="co" class="grid c2">
          ${F('Nama perusahaan', `<input name="name" value="${esc(co.name)}">`, 'full')}${F('Alamat', `<textarea name="address" rows="2">${esc(co.address)}</textarea>`, 'full')}
          ${F('Telepon', `<input name="phone" value="${esc(co.phone)}">`)}${F('Email', `<input name="email" value="${esc(co.email)}">`)}${F('NPWP', `<input name="npwp" value="${esc(co.npwp)}">`, 'full')}</div>
          <div style="margin-top:10px;text-align:right">${btn('check', 'Simpan data perusahaan', 'id="co-save"', 'primary')}</div></div>

        <div class="card"><div class="sec-t" style="margin-top:0">Satuan</div><div id="units"></div>
          <div class="tempo-box" style="margin-top:8px"><input id="u-new" placeholder="Satuan baru (mis. kg)" style="flex:1;width:auto">${btn('plus', 'Tambah satuan', 'id="u-add"', 'primary')}</div></div>

        <div class="card"><div class="sec-t" style="margin-top:0">Mata uang</div><div id="curs"></div>
          <div class="grid c4" style="margin-top:8px">${F('Kode', '<input id="c-code" maxlength="5" placeholder="SGD">')}${F('Nama', '<input id="c-name" placeholder="Singapore Dollar">')}${F('Simbol', '<input id="c-sym" placeholder="S$">')}${F('Desimal', '<input id="c-dec" inputmode="numeric" value="2">')}</div>
          <div style="margin-top:8px;text-align:right">${btn('plus', 'Tambah mata uang', 'id="c-add"', 'primary')}</div></div>

        <div class="card"><div class="sec-t" style="margin-top:0">Data contoh & pemeliharaan</div>
          <p class="note">Data contoh (3 supplier, 8 item sepatu, 2 client, 7 PO termasuk USD dan PPh 23, penerimaan Good/Defect, 1 Delivery Order) untuk mencoba semua fitur. Bisa dihapus kapan saja tanpa menyentuh data asli.${DB.mode === 'supabase' && ERP.user.role !== 'supervisor' ? ' Catatan: jika dimuat oleh Admin, PO contoh berstatus “Menunggu Approval” (Supervisor yang bisa approve).' : ''}</p>
          <div class="tb-actions">${btn('plus', 'Muat data contoh', 'id="d-load"', 'primary')}${btn('trash', `Hapus data contoh (${dummyN})`, 'id="d-clear"', 'danger')}${btn('trash', `Hapus riwayat import analisa (${hist.length})`, 'id="h-clear"', 'danger')}${btn('download', 'Unduh backup semua data (JSON)', 'id="d-backup"')}${DB.mode === 'local' ? btn('reset', 'Reset SEMUA data demo', 'id="d-reset"', 'danger') : ''}</div>
          <p class="note">Mode: <b>${DB.mode === 'local' ? 'DEMO (data di browser ini)' : DB.mode === 'api' ? 'Server lokal (data terpusat di PC server, backup harian otomatis)' : 'Supabase (data terpusat)'}</b></p></div></div>`;

      $('#co-save').onclick = async () => { try { await ERP.setSetting('company', ERP.formData($('#co'))); await ERP.loadRef(); ERP.toast('Data perusahaan disimpan'); } catch (e) { ERP.toast(e.message, 'err'); } };

      const drawUnits = () => {
        $('#units').innerHTML = ERP.table([{ label: 'Satuan', html: (u) => `<input value="${esc(u.name)}" data-uid="${u.id}" data-old="${esc(u.name)}" style="max-width:200px">`, m: 'mt' }, { label: '', cls: 'act', html: (u) => btn('trash', 'Hapus satuan', `data-udel="${u.id}"`, 'sm danger') }], units);
      };
      drawUnits();
      $('#u-add').onclick = async () => { const n = $('#u-new').value.trim(); if (!n) return; if (units.some((u) => norm(u.name) === norm(n))) { ERP.toast('Satuan sudah ada', 'err'); return; } try { await DB.insert('units', { name: n }); ERP.refresh(); } catch (e) { ERP.toast(e.message, 'err'); } };
      $('#units').onchange = async (e) => {
        const i = e.target.closest('[data-uid]'); if (!i) return; const nn = i.value.trim(), old = i.dataset.old;
        if (!nn || nn === old) { i.value = old; return; }
        if (units.some((u) => norm(u.name) === norm(nn) && u.id !== i.dataset.uid)) { ERP.toast('Satuan sudah ada', 'err'); i.value = old; return; }
        try { await DB.update('units', i.dataset.uid, { name: nn }); for (const it of items.filter((x) => x.unit === old)) await DB.update('items', it.id, { unit: nn }); ERP.toast('Satuan diubah (item master ikut diperbarui)'); ERP.refresh(); } catch (err) { ERP.toast(err.message, 'err'); }
      };
      $('#units').onclick = async (e) => {
        const b = e.target.closest('[data-udel]'); if (!b) return; const u = units.find((x) => x.id === b.dataset.udel);
        const n = items.filter((x) => x.unit === u.name).length;
        if (n) { ERP.toast(`Satuan dipakai ${n} item, tidak bisa dihapus`, 'err'); return; }
        if (await ERP.confirm(`Hapus satuan <b>${esc(u.name)}</b>?`, { danger: true })) { try { await DB.remove('units', u.id); ERP.refresh(); } catch (err) { ERP.toast(err.message, 'err'); } }
      };

      $('#curs').innerHTML = ERP.table([{ label: 'Kode', html: (c) => `<b>${esc(c.code)}</b>`, m: 'mt' }, { label: 'Nama', html: (c) => `<input value="${esc(c.name)}" data-cid="${c.id}" data-f="name">` }, { label: 'Simbol', html: (c) => `<input value="${esc(c.symbol)}" data-cid="${c.id}" data-f="symbol" style="max-width:70px">` }, { label: 'Desimal', html: (c) => `<input value="${c.decimals}" data-cid="${c.id}" data-f="decimals" inputmode="numeric" style="max-width:60px">` }, { label: '', cls: 'act', html: (c) => btn('trash', 'Hapus mata uang', `data-cdel="${c.id}"`, 'sm danger') }], curs);
      $('#curs').onchange = async (e) => {
        const i = e.target.closest('[data-cid]'); if (!i) return; let val = i.value.trim();
        if (i.dataset.f === 'decimals') { val = Math.max(0, Math.min(4, parseInt(val) || 0)); i.value = val; }
        try { await DB.update('currencies', i.dataset.cid, { [i.dataset.f]: val }); await ERP.loadRef(); ERP.toast('Mata uang diperbarui'); } catch (err) { ERP.toast(err.message, 'err'); }
      };
      $('#curs').onclick = async (e) => {
        const b = e.target.closest('[data-cdel]'); if (!b) return; const c = curs.find((x) => x.id === b.dataset.cdel);
        const used = sups.some((s) => s.currency === c.code) || items.some((i) => i.currency === c.code) || pos.some((p) => p.currency === c.code);
        if (used) { ERP.toast('Mata uang sudah dipakai di data, tidak bisa dihapus', 'err'); return; }
        if (await ERP.confirm(`Hapus mata uang <b>${esc(c.code)}</b>?`, { danger: true })) { try { await DB.remove('currencies', c.id); ERP.refresh(); } catch (err) { ERP.toast(err.message, 'err'); } }
      };
      $('#c-add').onclick = async () => {
        const code = $('#c-code').value.trim().toUpperCase(), name = $('#c-name').value.trim();
        if (!/^[A-Z]{2,5}$/.test(code) || !name) { ERP.toast('Isi kode (2–5 huruf) dan nama', 'err'); return; }
        if (curs.some((c) => c.code === code)) { ERP.toast('Kode sudah ada', 'err'); return; }
        try { await DB.insert('currencies', { code, name, symbol: $('#c-sym').value.trim(), decimals: Math.max(0, Math.min(4, parseInt($('#c-dec').value) || 0)) }); ERP.toast('Mata uang ditambahkan'); await ERP.loadRef(); ERP.refresh(); } catch (e) { ERP.toast(e.message, 'err'); }
      };

      $('#d-load').onclick = async () => { if (!(await ERP.confirm('Muat data contoh (supplier, item, dan PO)?'))) return; try { await loadDummy(); ERP.toast('Data contoh dimuat'); ERP.refresh(); } catch (e) { ERP.toast('Gagal: ' + e.message, 'err'); } };
      $('#d-clear').onclick = async () => { if (!(await ERP.confirm('Hapus semua <b>data contoh</b>? Data asli tidak terpengaruh.', { danger: true }))) return; try { await clearDummy(); ERP.toast('Data contoh dihapus'); ERP.refresh(); } catch (e) { ERP.toast('Gagal: ' + e.message, 'err'); } };
      $('#h-clear').onclick = async () => { if (!hist.length || !(await ERP.confirm(`Hapus ${hist.length} baris riwayat import analisa?`, { danger: true }))) return; try { for (const h of hist) await DB.remove('hist_purchases', h.id); ERP.toast('Riwayat import dihapus'); ERP.refresh(); } catch (e) { ERP.toast(e.message, 'err'); } };
      $('#d-backup').onclick = async () => {
        try {
          const out = { exported_at: new Date().toISOString(), mode: DB.mode };
          for (const t of ['units', 'currencies', 'settings', 'suppliers', 'clients', 'items', 'purchase_orders', 'po_items', 'po_payments', 'goods_receipts', 'gr_items', 'delivery_orders', 'do_items', 'hist_purchases', 'app_users']) out[t] = await DB.list(t);
          const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' })); a.download = 'backup_erp_' + ERP.today() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          ERP.toast('Backup diunduh');
        } catch (e) { ERP.toast('Backup gagal: ' + e.message, 'err'); }
      };
      if ($('#d-reset')) $('#d-reset').onclick = async () => { if (await ERP.confirm('Reset SEMUA data demo (termasuk user demo)? Tidak bisa dibatalkan.', { danger: true })) DB.reset(); };
    },
  });
})();
