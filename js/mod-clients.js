/* Database Client (dipakai untuk Quotation, Delivery Order, Invoice) */
(function () {
  const ERP = window.ERP;
  const { $, esc, btn, norm } = ERP;
  const DB = ERP.DB;

  const HEAD = ['ID Client', 'Nama Client', 'Category', 'Currency', 'Nama Kontak / PIC', 'Jabatan', 'No HP', 'Email', 'Telp Kantor', 'Email Kantor', 'Alamat', 'Shipping Address', 'Billing Address', 'NPWP', 'Tax Payer Name', 'NITKU', 'Tax Address', 'Term of Payment', 'Tempo (hari)'];
  const termText = (c) => (c.payment_term === 'tempo' ? 'Tempo' + (c.tempo_days ? ' ' + c.tempo_days + ' hari' : '') : 'Cash');
  const toRow = (c) => [c.code, c.name, c.category, c.currency, c.contact_person, c.position, c.mobile, c.email, c.office_phone, c.office_email, c.address, c.shipping_address, c.billing_address, c.npwp, c.tax_payer, c.nitku, c.tax_address, c.payment_term === 'tempo' ? 'Tempo' : 'Cash', c.tempo_days || ''].map((x) => (x == null ? '' : x));

  function form(c, cats) {
    c = c || {}; const F = ERP.field;
    return `<div class="grid c2">
      ${F('Nama Client *', `<input name="name" value="${esc(c.name)}">`, 'full')}
      ${F('Category', `<input name="category" list="dl-cat" value="${esc(c.category)}" placeholder="mis. Retail, Distributor…"><datalist id="dl-cat">${cats.map((x) => `<option>${esc(x)}</option>`).join('')}</datalist>`)}
      ${F('Currency', `<select name="currency">${ERP.options(ERP.currencies, c.currency || 'IDR', 'code', 'code')}</select>`)}
      ${F('Nama Kontak / PIC', `<input name="contact_person" value="${esc(c.contact_person)}">`)}
      ${F('Jabatan', `<input name="position" value="${esc(c.position)}">`)}
      ${F('No HP', `<input name="mobile" type="tel" value="${esc(c.mobile)}">`)}
      ${F('Email', `<input name="email" type="email" value="${esc(c.email)}">`)}
      ${F('Telp Kantor', `<input name="office_phone" type="tel" value="${esc(c.office_phone)}">`)}
      ${F('Email Kantor', `<input name="office_email" type="email" value="${esc(c.office_email)}">`)}
      ${F('Alamat', `<textarea name="address" rows="2">${esc(c.address)}</textarea>`, 'full')}
      ${F('Shipping Address', `<textarea name="shipping_address" rows="2">${esc(c.shipping_address)}</textarea>`)}
      ${F('Billing Address', `<textarea name="billing_address" rows="2">${esc(c.billing_address)}</textarea>`)}
    </div>
    <div class="sec-t">Data Pajak</div>
    <div class="grid c2">
      ${F('NPWP', `<input name="npwp" value="${esc(c.npwp)}">`)}
      ${F('Tax Payer Name', `<input name="tax_payer" value="${esc(c.tax_payer)}">`)}
      ${F('NITKU', `<input name="nitku" value="${esc(c.nitku)}">`)}
      ${F('Tax Address', `<textarea name="tax_address" rows="2">${esc(c.tax_address)}</textarea>`)}
    </div>
    <div class="sec-t">Term of Payment</div>
    <div class="grid c2">
      ${F('Term', `<select name="payment_term"><option value="cash" ${c.payment_term !== 'tempo' ? 'selected' : ''}>Cash</option><option value="tempo" ${c.payment_term === 'tempo' ? 'selected' : ''}>Tempo</option></select>`)}
      ${F('Tempo (hari)', `<input name="tempo_days" inputmode="numeric" value="${c.tempo_days || ''}" placeholder="mis. 30">`)}
    </div>`;
  }
  const detailRows = (c) => [['ID Client', c.code], ['Nama Client', c.name], ['Category', c.category], ['Currency', c.currency], ['Nama Kontak / PIC', c.contact_person], ['Jabatan', c.position], ['No HP', c.mobile], ['Email', c.email], ['Telp Kantor', c.office_phone], ['Email Kantor', c.office_email], ['Alamat', c.address], ['Shipping Address', c.shipping_address], ['Billing Address', c.billing_address], ['NPWP', c.npwp], ['Tax Payer Name', c.tax_payer], ['NITKU', c.nitku], ['Tax Address', c.tax_address], ['Term of Payment', termText(c)]];
  const printClient = (c) => ERP.printHTML('Client ' + c.name, `<h1>Data Client</h1><div class="muted">${esc(c.code)}</div><table class="kv">${detailRows(c).map(([k, v]) => `<tr><td>${k}</td><td>${esc(v) || '-'}</td></tr>`).join('')}</table>`);

  ERP.register('clients', {
    async render(v) {
      let rows = await DB.list('clients', { order: 'code' });
      const canW = ERP.can.write();
      let q = '';
      v.innerHTML = `<div class="toolbar">${ERP.searchBox('q', 'Cari nama client / category / kontak…')}
        <div class="tb-actions">${canW ? btn('plus', 'Tambah Client', 'id="b-add"', 'primary') + btn('upload', 'Import dari Excel', 'id="b-imp"') + btn('template', 'Unduh template Excel', 'id="b-tpl"') : ''}${btn('download', 'Export ke Excel', 'id="b-exp"')}${btn('print', 'Print daftar', 'id="b-prt"')}</div></div><div id="list"></div>`;
      const filtered = () => rows.filter((c) => !q || norm(c.name).includes(q) || norm(c.category).includes(q) || norm(c.contact_person).includes(q));
      const cats = () => [...new Set(rows.map((c) => c.category).filter(Boolean))].sort();
      const cols = [
        { label: 'ID', v: (c) => c.code, cls: 'nw', m: 'mh' },
        { label: 'Nama Client', html: (c) => `<b>${esc(c.name)}</b><small class="mob-only">${esc(c.code)}</small>`, m: 'mt' },
        { label: 'Category', v: (c) => c.category },
        { label: 'Kontak / PIC', html: (c) => esc(c.contact_person) + (c.position ? `<small>${esc(c.position)}</small>` : '') },
        { label: 'No HP', v: (c) => c.mobile, cls: 'nw' },
        { label: 'Email', v: (c) => c.email, cls: 'hide-md', m: 'mh' },
        { label: 'Term', v: termText, cls: 'nw' },
        { label: 'Currency', v: (c) => c.currency, cls: 'hide-md', m: 'mh' },
        { label: '', cls: 'act', html: (c) => btn('eye', 'Lihat detail', `data-a="view" data-id="${c.id}"`, 'sm') + btn('print', 'Print client', `data-a="print" data-id="${c.id}"`, 'sm') + (canW ? btn('edit', 'Edit', `data-a="edit" data-id="${c.id}"`, 'sm') + btn('trash', 'Hapus', `data-a="del" data-id="${c.id}"`, 'sm danger') : '') },
      ];
      const draw = () => { $('#list').innerHTML = ERP.table(cols, filtered(), { empty: rows.length ? 'Tidak ada hasil.' : 'Belum ada client. Klik tombol + untuk menambah.' }); };
      draw();
      $('#q').oninput = ERP.debounce((e) => { q = norm(e.target.value.trim()); draw(); });
      const reload = async () => { rows = await DB.list('clients', { order: 'code' }); draw(); };
      const openForm = (c) => ERP.modal({
        title: c ? 'Edit Client' : 'Tambah Client', html: form(c, cats()), wide: true,
        actions: [{ icon: 'check', tip: 'Simpan', cls: 'primary', onClick: async (m) => {
          const d = ERP.formData(m.el);
          if (!d.name) { ERP.toast('Nama client wajib diisi', 'err'); return; }
          d.tempo_days = d.payment_term === 'tempo' ? parseInt(d.tempo_days) || null : null;
          try { if (c) await DB.update('clients', c.id, d); else await DB.insert('clients', d); m.close(); ERP.toast('Client disimpan'); reload(); } catch (e) { ERP.toast(e.message, 'err'); }
        } }],
      });
      const exportFile = (tpl) => ERP.xlsxExport(tpl ? 'Template_Client.xlsx' : 'Client_' + ERP.today() + '.xlsx', 'Client', HEAD, tpl ? [] : filtered().map(toRow));
      if ($('#b-add')) $('#b-add').onclick = () => openForm(null);
      $('#b-exp').onclick = () => exportFile(false);
      if ($('#b-tpl')) $('#b-tpl').onclick = () => exportFile(true);
      $('#b-prt').onclick = () => ERP.printTable('Daftar Client', [{ label: 'ID', v: (c) => c.code }, { label: 'Nama Client', v: (c) => c.name }, { label: 'Category', v: (c) => c.category }, { label: 'Kontak / PIC', v: (c) => c.contact_person }, { label: 'Jabatan', v: (c) => c.position }, { label: 'No HP', v: (c) => c.mobile }, { label: 'Email', v: (c) => c.email }, { label: 'Telp Kantor', v: (c) => c.office_phone }, { label: 'Term', v: termText }], filtered());
      if ($('#b-imp')) $('#b-imp').onclick = async () => {
        const f = await ERP.pickFile(); if (!f) return;
        try {
          const data = await ERP.xlsxRead(f);
          let nNew = 0, nUpd = 0, skip = 0;
          const byCode = Object.fromEntries(rows.map((c) => [norm(c.code), c])), byName = Object.fromEntries(rows.map((c) => [norm(c.name), c]));
          const curOk = new Set(ERP.currencies.map((c) => c.code));
          for (const r of data) {
            const g = (...k) => String(ERP.pick(r, ...k) ?? '').trim();
            const term = norm(g('term of payment', 'term'));
            const rec = { name: g('nama client', 'nama'), category: g('category', 'kategori'), currency: g('currency', 'mata uang').toUpperCase() || 'IDR', contact_person: g('nama kontak / pic', 'nama kontak', 'pic', 'kontak'), position: g('jabatan'), mobile: g('no hp', 'hp'), email: g('email'), office_phone: g('telp kantor', 'telepon'), office_email: g('email kantor'), address: g('alamat'), shipping_address: g('shipping address'), billing_address: g('billing address'), npwp: g('npwp'), tax_payer: g('tax payer name', 'tax payer'), nitku: g('nitku'), tax_address: g('tax address'), payment_term: term.startsWith('tempo') ? 'tempo' : 'cash', tempo_days: parseInt(g('tempo (hari)', 'tempo')) || null };
            if (!rec.name) { skip++; continue; }
            if (!curOk.has(rec.currency)) rec.currency = 'IDR';
            if (rec.payment_term !== 'tempo') rec.tempo_days = null;
            const ex = byCode[norm(g('id client', 'id'))] || byName[norm(rec.name)];
            if (ex) { await DB.update('clients', ex.id, rec); nUpd++; } else { const [ins] = await DB.insert('clients', rec); byName[norm(rec.name)] = ins; nNew++; }
          }
          ERP.toast(`Import selesai: ${nNew} baru, ${nUpd} diperbarui${skip ? ', ' + skip + ' dilewati' : ''}`);
          reload();
        } catch (e) { ERP.toast('Import gagal: ' + e.message, 'err'); }
      };
      $('#list').onclick = async (e) => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        const c = rows.find((x) => x.id === b.dataset.id);
        if (b.dataset.a === 'view') ERP.modal({ title: esc(c.name), html: `<dl class="kv">${detailRows(c).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v) || '-'}</dd>`).join('')}</dl>`, actions: [{ icon: 'print', tip: 'Print', onClick: () => printClient(c) }] });
        else if (b.dataset.a === 'print') printClient(c);
        else if (b.dataset.a === 'edit') openForm(c);
        else if (b.dataset.a === 'del') {
          const dos = await DB.list('delivery_orders', { eq: { client_id: c.id } });
          if (dos.length) { ERP.toast(`Tidak bisa dihapus: dipakai di ${dos.length} Delivery Order`, 'err'); return; }
          if (!(await ERP.confirm(`Hapus client <b>${esc(c.name)}</b>?`, { danger: true }))) return;
          try { await DB.remove('clients', c.id); ERP.toast('Client dihapus'); reload(); } catch (err) { ERP.toast(err.message, 'err'); }
        }
      };
    },
  });
})();
