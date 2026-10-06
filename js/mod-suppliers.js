/* Database Supplier */
(function () {
  const ERP = window.ERP;
  const { $, esc, icon, btn, DB, norm } = Object.assign({ DB: ERP.DB }, ERP);

  const HEAD = ['ID Supplier', 'Kode Perusahaan', 'Nama Supplier', 'Currency', 'Kontak Person', 'Jabatan', 'No HP', 'No Kantor', 'Email', 'Alamat Pembayaran', 'NPWP', 'Tax Payer', 'NITKU', 'Tax Address'];
  const toRow = (s) => [s.code, s.company_code, s.name, s.currency, s.contact_person, s.position, s.mobile, s.office_phone, s.email, s.billing_address, s.npwp, s.tax_payer, s.nitku, s.tax_address].map((x) => x || '');

  function form(s) {
    s = s || {};
    const F = ERP.field;
    return `<div class="grid c2">
      ${F('Nama Supplier *', `<input name="name" value="${esc(s.name)}" required>`)}
      ${F('Kode Perusahaan * (untuk nomor PO, mis. DM)', `<input name="company_code" value="${esc(s.company_code)}" maxlength="6" style="text-transform:uppercase" autocapitalize="characters">`)}
      ${F('Currency', `<select name="currency">${ERP.options(ERP.currencies, s.currency || 'IDR', 'code', 'code')}</select>`)}
      ${F('Kontak Person', `<input name="contact_person" value="${esc(s.contact_person)}">`)}
      ${F('Jabatan', `<input name="position" value="${esc(s.position)}">`)}
      ${F('No HP', `<input name="mobile" type="tel" value="${esc(s.mobile)}">`)}
      ${F('No Kantor', `<input name="office_phone" type="tel" value="${esc(s.office_phone)}">`)}
      ${F('Email', `<input name="email" type="email" value="${esc(s.email)}">`)}
      ${F('Alamat Pembayaran', `<textarea name="billing_address" rows="2">${esc(s.billing_address)}</textarea>`, 'full')}
    </div>
    <div class="sec-t">Data Pajak</div>
    <div class="grid c2">
      ${F('NPWP', `<input name="npwp" value="${esc(s.npwp)}">`)}
      ${F('Tax Payer', `<input name="tax_payer" value="${esc(s.tax_payer)}">`)}
      ${F('NITKU', `<input name="nitku" value="${esc(s.nitku)}">`)}
      ${F('Tax Address', `<textarea name="tax_address" rows="2">${esc(s.tax_address)}</textarea>`, 'full')}
    </div>`;
  }

  function detailHTML(s) {
    const rows = [['ID Supplier', s.code], ['Kode Perusahaan', s.company_code], ['Nama Supplier', s.name], ['Currency', s.currency], ['Kontak Person', s.contact_person], ['Jabatan', s.position], ['No HP', s.mobile], ['No Kantor', s.office_phone], ['Email', s.email], ['Alamat Pembayaran', s.billing_address], ['NPWP', s.npwp], ['Tax Payer', s.tax_payer], ['NITKU', s.nitku], ['Tax Address', s.tax_address]];
    return `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v) || '-'}</dd>`).join('')}</dl>`;
  }
  function printSupplier(s) {
    const r = (k, v) => `<tr><td>${k}</td><td>${esc(v) || '-'}</td></tr>`;
    ERP.printHTML('Supplier ' + s.name, `<h1>Data Supplier</h1><div class="muted">${esc(s.code)}</div>
      <h2>Informasi Umum</h2><table class="kv">${r('Nama Supplier', s.name)}${r('Currency', s.currency)}${r('Kontak Person', s.contact_person)}${r('Jabatan', s.position)}${r('No HP', s.mobile)}${r('No Kantor', s.office_phone)}${r('Email', s.email)}${r('Alamat Pembayaran', s.billing_address)}</table>
      <h2>Data Pajak</h2><table class="kv">${r('NPWP', s.npwp)}${r('Tax Payer', s.tax_payer)}${r('NITKU', s.nitku)}${r('Tax Address', s.tax_address)}</table>`);
  }

  ERP.register('suppliers', {
    async render(v) {
      let rows = await DB.list('suppliers', { order: 'code' });
      const canW = ERP.can.write();
      let q = '';
      v.innerHTML = `<div class="toolbar">${ERP.searchBox('q', 'Cari nama supplier / kontak person…')}
        <div class="tb-actions">${canW ? btn('plus', 'Tambah Supplier', 'id="b-add"', 'primary') + btn('upload', 'Import dari Excel', 'id="b-imp"') + btn('template', 'Unduh template Excel', 'id="b-tpl"') : ''}${btn('download', 'Export ke Excel', 'id="b-exp"')}${btn('print', 'Print daftar', 'id="b-prt"')}</div></div><div id="list"></div>`;
      const filtered = () => rows.filter((s) => !q || norm(s.name).includes(q) || norm(s.contact_person).includes(q));
      const cols = [
        { label: 'ID', v: (s) => s.code, cls: 'nw', m: 'mh' },
        { label: 'Nama Supplier', html: (s) => `<b>${esc(s.name)}</b><small class="mob-only">${esc(s.code)}</small>`, m: 'mt' },
        { label: 'Kode', html: (s) => (s.company_code ? ERP.badge(s.company_code) : '<span class="neg">belum diisi</span>'), cls: 'nw' },
        { label: 'Currency', v: (s) => s.currency },
        { label: 'Kontak Person', html: (s) => esc(s.contact_person) + (s.position ? `<small>${esc(s.position)}</small>` : '') },
        { label: 'No HP', v: (s) => s.mobile, cls: 'nw' },
        { label: 'Email', v: (s) => s.email, cls: 'hide-md', m: 'mh' },
        { label: 'NPWP', v: (s) => s.npwp, cls: 'hide-md nw', m: 'mh' },
        { label: '', cls: 'act', html: (s) => btn('eye', 'Lihat detail', `data-a="view" data-id="${s.id}"`, 'sm') + btn('print', 'Print supplier', `data-a="print" data-id="${s.id}"`, 'sm') + (canW ? btn('edit', 'Edit', `data-a="edit" data-id="${s.id}"`, 'sm') + btn('trash', 'Hapus', `data-a="del" data-id="${s.id}"`, 'sm danger') : '') },
      ];
      const draw = () => { const f = filtered(); $('#list').innerHTML = ERP.table(cols, f, { empty: rows.length ? 'Tidak ada hasil.' : 'Belum ada supplier. Klik tombol + untuk menambah.' }); };
      draw();
      $('#q').oninput = ERP.debounce((e) => { q = norm(e.target.value.trim()); draw(); });

      const reload = async () => { rows = await DB.list('suppliers', { order: 'code' }); draw(); };
      const openForm = (s) => {
        ERP.modal({
          title: s ? 'Edit Supplier' : 'Tambah Supplier', html: form(s), wide: true,
          actions: [{ icon: 'check', tip: 'Simpan', cls: 'primary', onClick: async (m) => {
            const d = ERP.formData(m.el);
            if (!d.name) { ERP.toast('Nama supplier wajib diisi', 'err'); return; }
            d.company_code = String(d.company_code || '').toUpperCase();
            if (!/^[A-Z0-9]{2,6}$/.test(d.company_code)) { ERP.toast('Kode Perusahaan wajib diisi: 2–6 huruf/angka (mis. DM)', 'err'); return; }
            if (rows.some((r) => r.id !== (s || {}).id && String(r.company_code || '').toUpperCase() === d.company_code)) { ERP.toast('Kode Perusahaan sudah dipakai supplier lain', 'err'); return; }
            try { if (s) await DB.update('suppliers', s.id, d); else await DB.insert('suppliers', d); m.close(); ERP.toast('Supplier disimpan'); reload(); } catch (e) { ERP.toast(e.message, 'err'); }
          } }],
        });
      };
      const exportFile = (tpl) => ERP.xlsxExport(tpl ? 'Template_Supplier.xlsx' : 'Supplier_' + ERP.today() + '.xlsx', 'Supplier', HEAD, tpl ? [] : filtered().map(toRow));
      if ($('#b-add')) $('#b-add').onclick = () => openForm(null);
      $('#b-exp').onclick = () => exportFile(false);
      if ($('#b-tpl')) $('#b-tpl').onclick = () => exportFile(true);
      $('#b-prt').onclick = () => ERP.printTable('Daftar Supplier', [{ label: 'ID', v: (s) => s.code }, { label: 'Nama', v: (s) => s.name }, { label: 'Cur', v: (s) => s.currency }, { label: 'Kontak', v: (s) => s.contact_person }, { label: 'Jabatan', v: (s) => s.position }, { label: 'No HP', v: (s) => s.mobile }, { label: 'Email', v: (s) => s.email }, { label: 'NPWP', v: (s) => s.npwp }], filtered());
      if ($('#b-imp')) $('#b-imp').onclick = async () => {
        const f = await ERP.pickFile(); if (!f) return;
        try {
          const data = await ERP.xlsxRead(f);
          let nNew = 0, nUpd = 0, skip = 0;
          const byCode = Object.fromEntries(rows.map((s) => [norm(s.code), s])), byName = Object.fromEntries(rows.map((s) => [norm(s.name), s]));
          const curOk = new Set(ERP.currencies.map((c) => c.code));
          for (const r of data) {
            const g = (...k) => String(ERP.pick(r, ...k) ?? '').trim();
            const rec = { company_code: g('kode perusahaan', 'kode supplier', 'kode').toUpperCase(), name: g('nama supplier', 'nama'), currency: g('currency', 'mata uang').toUpperCase() || 'IDR', contact_person: g('kontak person', 'kontak'), position: g('jabatan'), mobile: g('no hp', 'hp'), office_phone: g('no kantor', 'telepon'), email: g('email'), billing_address: g('alamat pembayaran', 'alamat'), npwp: g('npwp'), tax_payer: g('tax payer'), nitku: g('nitku'), tax_address: g('tax address') };
            if (!rec.name) { skip++; continue; }
            if (!curOk.has(rec.currency)) rec.currency = 'IDR';
            if (rec.company_code && !/^[A-Z0-9]{2,6}$/.test(rec.company_code)) rec.company_code = '';
            if (!rec.company_code) delete rec.company_code;
            const ex = byCode[norm(g('id supplier', 'id'))] || byName[norm(rec.name)];
            if (ex) { await DB.update('suppliers', ex.id, rec); nUpd++; } else { const [ins] = await DB.insert('suppliers', rec); byName[norm(rec.name)] = ins; nNew++; }
          }
          ERP.toast(`Import selesai: ${nNew} baru, ${nUpd} diperbarui${skip ? ', ' + skip + ' dilewati' : ''}`);
          reload();
        } catch (e) { ERP.toast('Import gagal: ' + e.message, 'err'); }
      };

      $('#list').onclick = async (e) => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        const s = rows.find((x) => x.id === b.dataset.id);
        const a = b.dataset.a;
        if (a === 'view') ERP.modal({ title: esc(s.name), html: detailHTML(s), actions: [{ icon: 'print', tip: 'Print', onClick: () => printSupplier(s) }] });
        else if (a === 'print') printSupplier(s);
        else if (a === 'edit') openForm(s);
        else if (a === 'del') {
          const pos = await DB.list('purchase_orders', { eq: { supplier_id: s.id } });
          if (pos.length) { ERP.toast(`Tidak bisa dihapus: dipakai di ${pos.length} PO`, 'err'); return; }
          if (!(await ERP.confirm(`Hapus supplier <b>${esc(s.name)}</b>?`, { danger: true }))) return;
          try { await DB.remove('suppliers', s.id); ERP.toast('Supplier dihapus'); reload(); } catch (err) { ERP.toast(err.message, 'err'); }
        }
      };
    },
  });
})();
