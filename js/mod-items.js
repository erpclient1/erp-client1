/* Master Item: Brand, Model Name, Compound Name, Gender, Colour, Size, Satuan (PRS / KG) */
(function () {
  const ERP = window.ERP;
  const { $, esc, btn, norm } = ERP;
  const DB = ERP.DB;
  const HEAD = ['Brand', 'Model Name', 'Compound Name', 'Gender', 'Colour', 'Size', 'Satuan'];

  // form dipakai juga oleh PO (buat item cepat)
  ERP.itemForm = (it) => {
    it = it || {}; const F = ERP.field;
    const sel = (name, list, val, blank) => `<select name="${name}">${ERP.options(list, val || '', null, null, blank)}</select>`;
    return `<div class="grid c2">
      ${F('Brand *', `<input name="brand" value="${esc(it.brand)}">`)}
      ${F('Model Name *', `<input name="model" value="${esc(it.model)}">`)}
      ${F('Compound Name', `<input name="compound" value="${esc(it.compound)}">`)}
      ${F('Gender', sel('gender', ERP.GENDERS, it.gender, '—'))}
      ${F('Colour', `<input name="color" value="${esc(it.color)}">`)}
      ${F('Size', sel('size', ERP.SIZES, it.size, '—'))}
      ${F('Satuan', `<select name="unit">${ERP.options(ERP.units.map((u) => u.name), it.unit || (ERP.units.find((u) => u.name === 'PRS') || ERP.units[0] || {}).name)}</select>`)}
    </div>`;
  };
  ERP.itemRecord = (d) => ({ brand: d.brand, model: d.model, compound: d.compound || null, gender: d.gender || null, color: d.color || null, size: d.size || null, unit: d.unit });
  ERP.itemDup = (items, d, exceptId) => items.some((r) => r.id !== exceptId && ERP.itemKey(r) === ERP.itemKey(d) && (r.unit || '') === (d.unit || ''));

  // Revisi master item => atribut pada baris PO dan DO yang memakai item ini ikut berubah (modul terhubung)
  async function syncItem(id, rec) {
    const A = ['brand', 'model', 'compound', 'gender', 'color', 'size', 'unit'];
    try {
      for (const t of ['po_items', 'do_items']) {
        for (const r of await DB.list(t, { eq: { item_id: id } })) {
          if (A.some((k) => (r[k] || null) !== (rec[k] || null))) await DB.update(t, r.id, Object.fromEntries(A.map((k) => [k, rec[k] || null])));
        }
      }
      return '';
    } catch (e) { return 'Item tersimpan, tetapi sebagian PO/DO belum ikut diperbarui: ' + e.message; }
  }

  ERP.register('items', {
    async render(v) {
      let rows = await DB.list('items', { order: 'brand' });
      const canW = ERP.can.write();
      let q = '';
      v.innerHTML = `<div class="toolbar">${ERP.searchBox('q', 'Cari brand / model / compound / gender / colour / size…')}
        <div class="tb-actions">${canW ? btn('plus', 'Tambah Item', 'id="b-add"', 'primary') + btn('upload', 'Import dari Excel', 'id="b-imp"') + btn('template', 'Unduh template Excel', 'id="b-tpl"') : ''}${btn('download', 'Export ke Excel', 'id="b-exp"')}${btn('print', 'Print daftar', 'id="b-prt"')}</div></div><div id="list"></div>`;
      const sorted = () => rows.slice().sort((a, b) => ERP.attrText(a).localeCompare(ERP.attrText(b), undefined, { numeric: true }));
      const filtered = () => sorted().filter((i) => !q || ERP.attrText(i).toLowerCase().includes(q));
      const cols = [
        { label: 'Brand', html: (i) => `<b>${esc(i.brand)}</b>`, m: 'mt' }, { label: 'Model Name', v: (i) => i.model }, { label: 'Compound Name', v: (i) => i.compound },
        { label: 'Gender', v: (i) => i.gender }, { label: 'Colour', v: (i) => i.color }, { label: 'Size', v: (i) => i.size }, { label: 'Satuan', v: (i) => i.unit },
        { label: '', cls: 'act', html: (i) => canW ? btn('edit', 'Edit', `data-a="edit" data-id="${i.id}"`, 'sm') + btn('trash', 'Hapus', `data-a="del" data-id="${i.id}"`, 'sm danger') : '' },
      ];
      const draw = () => { $('#list').innerHTML = ERP.table(cols, filtered(), { empty: rows.length ? 'Tidak ada hasil.' : 'Belum ada item. Klik tombol + untuk menambah.' }); };
      draw();
      $('#q').oninput = ERP.debounce((e) => { q = norm(e.target.value.trim()); draw(); });
      const reload = async () => { rows = await DB.list('items', { order: 'brand' }); draw(); };
      const openForm = (it) => ERP.modal({
        title: it ? 'Edit Item' : 'Tambah Item', html: ERP.itemForm(it), wide: true,
        actions: [{ icon: 'check', tip: 'Simpan', cls: 'primary', onClick: async (m) => {
          const d = ERP.formData(m.el);
          if (!d.brand || !d.model) { ERP.toast('Brand dan Model Name wajib diisi', 'err'); return; }
          if (ERP.itemDup(rows, d, (it || {}).id)) { ERP.toast('Item dengan kombinasi yang sama sudah ada', 'err'); return; }
          try { const rec = ERP.itemRecord(d); if (it) { await DB.update('items', it.id, rec); const warn = await syncItem(it.id, rec); if (warn) ERP.toast(warn, 'err'); } else await DB.insert('items', rec); m.close(); ERP.toast('Item disimpan'); reload(); } catch (e) { ERP.toast(e.message, 'err'); }
        } }],
      });
      const toRow = (i) => [i.brand, i.model, i.compound || '', i.gender || '', i.color || '', i.size || '', i.unit || ''];
      const exportFile = (tpl) => ERP.xlsxExport(tpl ? 'Template_Item.xlsx' : 'Item_' + ERP.today() + '.xlsx', 'Item', HEAD, tpl ? [['Aero', 'Runner X', 'EVA-60', 'Man', 'Black', '9', 'PRS']] : filtered().map(toRow));
      if ($('#b-add')) $('#b-add').onclick = () => openForm(null);
      $('#b-exp').onclick = () => exportFile(false);
      if ($('#b-tpl')) $('#b-tpl').onclick = () => exportFile(true);
      $('#b-prt').onclick = () => ERP.printTable('Daftar Master Item', cols.slice(0, 7).map((c, i) => ({ label: c.label, v: c.v || ((r) => r.brand) })), filtered());
      if ($('#b-imp')) $('#b-imp').onclick = async () => {
        const f = await ERP.pickFile(); if (!f) return;
        try {
          const data = await ERP.xlsxRead(f);
          let nNew = 0, dup = 0, skip = 0;
          const unitOk = new Set(ERP.units.map((u) => u.name.toUpperCase()));
          const have = rows.slice();
          for (const r of data) {
            const g = (...k) => String(ERP.pick(r, ...k) ?? '').trim();
            const unit = g('satuan', 'unit').toUpperCase() || (ERP.units[0] || {}).name;
            const rec = { brand: g('brand'), model: g('model name', 'model'), compound: g('compound name', 'compound'), gender: g('gender'), color: g('colour', 'color'), size: g('size'), unit };
            if (!rec.brand || !rec.model || !unitOk.has(unit)) { skip++; continue; }
            const gm = ERP.GENDERS.find((x) => x.toLowerCase() === rec.gender.toLowerCase()); rec.gender = gm || '';
            const sz = ERP.SIZES.find((x) => x.toLowerCase() === rec.size.toLowerCase()); rec.size = sz || rec.size;
            if (ERP.itemDup(have, rec)) { dup++; continue; }
            const [ins] = await DB.insert('items', ERP.itemRecord(rec)); have.push(ins); nNew++;
          }
          ERP.toast(`Import selesai: ${nNew} baru${dup ? ', ' + dup + ' sudah ada' : ''}${skip ? ', ' + skip + ' dilewati (brand/model/satuan tidak valid)' : ''}`);
          reload();
        } catch (e) { ERP.toast('Import gagal: ' + e.message, 'err'); }
      };
      $('#list').onclick = async (e) => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        const it = rows.find((x) => x.id === b.dataset.id);
        if (b.dataset.a === 'edit') openForm(it);
        else if (b.dataset.a === 'del') {
          if (!(await ERP.confirm(`Hapus item <b>${esc(ERP.attrText(it))}</b>?<br><small>PO yang sudah dibuat tidak terpengaruh.</small>`, { danger: true }))) return;
          try { await DB.remove('items', it.id); ERP.toast('Item dihapus'); reload(); } catch (err) { ERP.toast(err.message, 'err'); }
        }
      };
    },
  });
})();
