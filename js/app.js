/* Inti aplikasi: tema, login PIN, layout, router, hak akses, loader data bersama */
(function () {
  const ERP = window.ERP;
  const { $, $$, esc, icon, btn } = ERP;
  const DB = ERP.DB;

  /* ---------- Modul terdaftar ---------- */
  ERP.modules = {};
  ERP.register = (id, def) => (ERP.modules[id] = def);
  const NAV = [
    ['items', 'Master Item', 'box'], ['suppliers', 'Supplier', 'building'], ['clients', 'Client', 'user'], ['po', 'Purchase Order', 'cart'],
    ['gr', 'Goods Received', 'truck'], ['do', 'Delivery Order', 'send'], ['payment', 'Pembayaran', 'wallet'], ['report', 'Report', 'list'], ['stock', 'Stock', 'layers'],
    ['analysis', 'Analisa', 'chart'], ['users', 'Pengguna', 'users'], ['settings', 'Pengaturan', 'gear'],
  ];
  const ROLE_LABEL = { admin: 'Admin', supervisor: 'Supervisor', gudang: 'Gudang', finance: 'Finance', viewer: 'Viewer' };
  ERP.ROLE_LABEL = ROLE_LABEL;
  ERP.MOD_LABEL = Object.fromEntries(NAV.map((n) => [n[0], n[1]]));

  /* ---------- Hak akses ---------- */
  ERP.can = {
    module: (m) => !!ERP.user && ERP.user.modules.includes(m) && (!['users', 'settings'].includes(m) || ERP.user.role === 'admin'),
    write: () => !!ERP.user && ['admin', 'supervisor'].includes(ERP.user.role),
    receive: () => !!ERP.user && ['admin', 'supervisor', 'gudang'].includes(ERP.user.role),
    approve: () => !!ERP.user && ['admin', 'supervisor'].includes(ERP.user.role),
    pay: () => !!ERP.user && ['admin', 'supervisor', 'finance'].includes(ERP.user.role) && ERP.user.modules.includes('payment'),
  };

  /* ---------- Tema ---------- */
  const setTheme = (t) => { document.documentElement.dataset.theme = t; try { localStorage.setItem('erp_theme', t); } catch (_) {} };
  const initTheme = () => {
    let t = null;
    try { t = localStorage.getItem('erp_theme'); } catch (_) {}
    setTheme(t || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  };
  const themeBtn = () => btn(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', document.documentElement.dataset.theme === 'dark' ? 'Mode terang' : 'Mode gelap', 'data-theme-toggle');
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-theme-toggle]')) { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); $$('[data-theme-toggle]').forEach((b) => b.outerHTML = themeBtn()); }
  });

  /* ---------- Data acuan ---------- */
  ERP.loadRef = async () => {
    const [units, currencies, settings, divisions, banks] = await Promise.all([DB.list('units', { order: 'name' }), DB.list('currencies', { order: 'code' }), DB.list('settings'), DB.list('divisions', { order: 'code' }), DB.list('banks', { order: 'name' })]);
    ERP.units = units; ERP.currencies = currencies; ERP.divisions = divisions; ERP.banks = banks;
    ERP.curMap = Object.fromEntries(currencies.map((c) => [c.code, c]));
    const co = settings.find((s) => s.key === 'company');
    ERP.company = co ? co.value : {};
    ERP.coCode = () => String((ERP.company && ERP.company.code) || 'SSBI').toUpperCase();
    ERP.divCode = (u) => { const d = ERP.divisions.find((x) => x.id === (u || ERP.user || {}).division_id); return d ? d.code : ''; };
  };
  ERP.setSetting = async (key, value) => {
    const cur = (await DB.list('settings')).find((s) => s.key === key);
    if (cur) await DB.update('settings', cur.id, { value }); else await DB.insert('settings', { key, value });
  };

  /* ---------- Loader PO + turunan (dipakai PO, GR, DO, Report, Stock, Analisa) ---------- */
  ERP.loadPO = async () => {
    const [pos, lines, pays, grs, gri, sups, users, items, dos, doi, clients, pmts, pmi] = await Promise.all([
      DB.list('purchase_orders', { order: 'po_date', desc: true }), DB.list('po_items', { order: 'line_no' }), DB.list('po_payments', { order: 'pay_date' }),
      DB.list('goods_receipts', { order: 'gr_date' }), DB.list('gr_items'), DB.list('suppliers', { order: 'name' }), DB.list('app_users'), DB.list('items', { order: 'brand' }),
      DB.list('delivery_orders', { order: 'do_date' }), DB.list('do_items'), DB.list('clients', { order: 'name' }), DB.list('payments', { order: 'pay_date' }), DB.list('payment_items'),
    ]);
    const pmtMap = Object.fromEntries(pmts.map((x) => [x.id, x]));
    const paidByGr = {}, fpByPo = {}, invByPo = {};
    pmi.forEach((x) => { paidByGr[x.gr_item_id] = (paidByGr[x.gr_item_id] || 0) + Number(x.amount); const f = (pmtMap[x.payment_id] || {}).fp_no; if (f) (fpByPo[x.po_id] = fpByPo[x.po_id] || new Set()).add(f); const iv = (pmtMap[x.payment_id] || {}).invoice_no; if (iv) (invByPo[x.po_id] = invByPo[x.po_id] || new Set()).add(iv); });
    const supMap = Object.fromEntries(sups.map((s) => [s.id, s])), userMap = Object.fromEntries(users.map((u) => [u.id, u])), cliMap = Object.fromEntries(clients.map((c) => [c.id, c]));
    const group = (arr, k) => arr.reduce((m, x) => ((m[x[k]] = m[x[k]] || []).push(x), m), {});
    const L = group(lines, 'po_id'), P = group(pays, 'po_id'), G = group(grs, 'po_id'), GI = group(gri, 'gr_id'), DOs = group(dos, 'po_id'), DI = group(doi, 'do_id');
    const add = (m, id, grade, q) => { m[id] = m[id] || { G: 0, D: 0 }; m[id][grade === 'D' ? 'D' : 'G'] += Number(q); };
    dos.forEach((d) => { d.client = cliMap[d.client_id] || { name: '(dihapus)' }; d.items = DI[d.id] || []; d.total = ERP.sum(d.items, (i) => Number(i.qty)); d.creator = (userMap[d.created_by] || {}).full_name || ''; });
    pos.sort((a, b) => String(b.po_date).localeCompare(String(a.po_date)) || String(b.po_number).localeCompare(String(a.po_number)));
    pos.forEach((p) => {
      p.supplier = supMap[p.supplier_id] || { name: '(dihapus)', id: null };
      p.items = (L[p.id] || []).sort((a, b) => a.line_no - b.line_no);
      p.payments = P[p.id] || [];
      p.receipts = (G[p.id] || []).map((g) => ({ ...g, items: GI[g.id] || [] }));
      p.dos = DOs[p.id] || [];
      p.fpNos = [...(fpByPo[p.id] || [])];
      p.invNos = [...(invByPo[p.id] || [])];
      const rc = {}, ou = {}, lastG = {};
      p.receipts.forEach((g) => g.items.forEach((i) => { add(rc, i.po_item_id, i.grade, i.qty); lastG[i.po_item_id + '|' + (i.grade === 'D' ? 'D' : 'G')] = g.gr_date; }));
      p.dos.forEach((d) => d.items.forEach((i) => add(ou, i.po_item_id, i.grade, i.qty)));
      p.rc = rc; p.ou = ou; p.lastRecv = lastG;
      p.recv = {};                                   // total diterima (Good + Defect) per baris PO
      p.items.forEach((i) => { const r = rc[i.id] || { G: 0, D: 0 }; p.recv[i.id] = r.G + r.D; });
      p.ordered = ERP.sum(p.items, (i) => Number(i.qty));
      p.received = ERP.sum(p.items, (i) => Math.min(Number(i.qty), p.recv[i.id] || 0));
      p.allReceived = p.items.length > 0 && p.items.every((i) => (p.recv[i.id] || 0) >= Number(i.qty));
      p.paid = ERP.sum(p.payments, (x) => Number(x.amount));
      p.fullyPaid = Number(p.total) > 0 && p.paid >= Number(p.total) - 0.005;
      p.stage = p.allReceived && p.fullyPaid ? 'done' : p.allReceived ? 'received' : 'active';
      p.paidDate = null;
      if (p.fullyPaid) { let acc = 0; for (const x of p.payments) { acc += Number(x.amount); if (acc >= Number(p.total) - 0.005) { p.paidDate = x.pay_date; break; } } }
      p.lastRecvDate = p.receipts.length ? p.receipts[p.receipts.length - 1].gr_date : null;
    });
    return { pos, sups, items, users, supMap, userMap, dos, clients, cliMap, payments: pmts, payItems: pmi, paidByGr, pmtMap };
  };

  /* ---------- Login ---------- */
  function showLogin(msg) {
    const root = $('#root');
    let pin = '', username = '', busy = false;
    root.innerHTML = `<div class="login-wrap"><div class="login-tools">${themeBtn()}</div>
      <div class="login-card">
        <div class="brand big">${icon('cart', 28)}<span>ERP Pembelian</span></div>
        <label class="fld"><span>Username</span><input id="lg-user" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="username"></label>
        <div class="pin-dots" id="lg-dots">${'<i></i>'.repeat(4)}</div>
        <div class="login-msg" id="lg-msg">${msg || ''}</div>
        <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-k="${n}">${n}</button>`).join('')}
          <button type="button" data-k="clr" class="sm" aria-label="Hapus semua">C</button><button type="button" data-k="0">0</button><button type="button" data-k="del" class="sm" aria-label="Hapus">${icon('backspace', 22)}</button></div>
        ${DB.mode === 'supabase' ? '<a href="#" id="lg-boot" class="boot-link">Pertama kali? Buat akun admin</a>' : ''}
        ${DB.mode === 'local' ? `<div class="demo-hint">Mode DEMO · data di browser ini<br>admin/1111 · spv/2222 · gudang/3333 · viewer/4444</div>` : ''}
      </div></div>`;
    const dots = () => $$('#lg-dots i').forEach((d, i) => d.classList.toggle('on', i < pin.length));
    const setMsg = (m) => ($('#lg-msg').textContent = m || '');
    const submit = async () => {
      username = $('#lg-user').value.trim();
      if (!username) { setMsg('Isi username dulu.'); pin = ''; dots(); $('#lg-user').focus(); return; }
      busy = true; setMsg('Memeriksa…');
      try {
        ERP.user = await DB.login(username, pin);
        await startApp();
      } catch (e) {
        pin = ''; dots(); busy = false;
        const dots_el = $('#lg-dots'); dots_el.classList.remove('shake'); void dots_el.offsetWidth; dots_el.classList.add('shake');
        if (e.code === 'locked') setMsg('Akun terkunci sementara. Coba lagi ' + (e.until ? 'pukul ' + new Date(e.until).toTimeString().slice(0, 5) : 'beberapa menit lagi') + '.');
        else if (e.code === 'network') setMsg('Tidak dapat terhubung ke server.');
        else setMsg('Username atau PIN salah.');
      }
    };
    root.addEventListener('click', (e) => {
      const k = e.target.closest('[data-k]'); if (!k || busy) return;
      const v = k.dataset.k;
      if (v === 'del') pin = pin.slice(0, -1); else if (v === 'clr') pin = ''; else if (pin.length < 4) pin += v;
      dots(); setMsg('');
      if (pin.length === 4) submit();
    });
    document.onkeydown = (e) => {
      if (!$('#lg-dots') || busy) return;
      if (e.target.id === 'lg-user') { if (e.key === 'Enter') { e.preventDefault(); $('#lg-user').blur(); } return; }
      if (/^\d$/.test(e.key) && pin.length < 4) { pin += e.key; dots(); if (pin.length === 4) submit(); }
      else if (e.key === 'Backspace') { pin = pin.slice(0, -1); dots(); }
    };
    if ($('#lg-boot')) $('#lg-boot').onclick = (e) => {
      e.preventDefault();
      ERP.modal({
        title: 'Buat akun admin pertama',
        html: `<p class="note">Hanya bisa dipakai sekali, saat belum ada user. Isi <b>kunci bootstrap</b> yang Anda simpan sebagai secret <code>BOOTSTRAP_KEY</code> di Supabase.</p><div class="grid c2">
          ${ERP.field('Kunci bootstrap', '<input name="key" type="password" autocomplete="off">', 'full')}
          ${ERP.field('Username', '<input name="username" autocomplete="off" autocapitalize="off" value="admin">')}
          ${ERP.field('Nama lengkap', '<input name="full_name" autocomplete="off">')}
          ${ERP.field('PIN (4 digit)', '<input name="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password">')}</div>`,
        actions: [{ icon: 'check', tip: 'Buat admin', cls: 'primary', onClick: async (m) => {
          const d = ERP.formData(m.el);
          if (!d.key || !d.username || !d.full_name || !/^\d{4}$/.test(d.pin)) { ERP.toast('Lengkapi semua kolom (PIN 4 digit angka)', 'err'); return; }
          try { await DB.bootstrap(d); m.close(); ERP.toast('Admin dibuat. Silakan login dengan username dan PIN tadi.'); $('#lg-user').value = d.username; } catch (err) { ERP.toast(err.message, 'err'); }
        } }],
      });
    };
    $('#lg-user').focus();
  }

  /* ---------- Layout ---------- */
  async function startApp() {
    document.onkeydown = null;
    await ERP.loadRef();
    const mods = NAV.filter((n) => ERP.can.module(n[0]));
    const link = (n, cls) => `<a href="#/${n[0]}" data-nav="${n[0]}" class="${cls || ''}" data-tip="${esc(n[1])}"><span class="ni">${icon(n[2], 20)}</span><span class="nl">${esc(n[1])}</span></a>`;
    const main = mods.filter((n) => !['users', 'settings'].includes(n[0]));
    const adm = mods.filter((n) => ['users', 'settings'].includes(n[0]));
    $('#root').innerHTML = `<div class="shell">
      <aside class="side"><div class="brand">${icon('cart', 22)}<span>ERP Pembelian</span></div>
        <nav>${main.map((n) => link(n)).join('')}${adm.length ? '<div class="sep"></div>' + adm.map((n) => link(n)).join('') : ''}</nav>
        <div class="side-foot"><div class="who"><b>${esc(ERP.user.full_name)}</b><small>${ROLE_LABEL[ERP.user.role]}</small></div></div></aside>
      <div class="main">
        <header class="top"><h2 id="page-title"></h2>
          ${DB.mode === 'local' ? '<span class="demo-pill" title="Data tersimpan di browser ini saja">DEMO</span>' : ''}
          <div class="top-r"><span class="who-m">${esc(ERP.user.full_name)}</span>
            ${adm.map((n) => `<a class="ibtn mob-only" href="#/${n[0]}" data-tip="${esc(n[1])}" aria-label="${esc(n[1])}">${icon(n[2])}</a>`).join('')}
            ${themeBtn()}${btn('logout', 'Keluar', 'id="btn-logout"')}</div></header>
        <div id="chg" class="chg-banner" hidden></div>
        <main id="view" class="view"></main>
      </div>
      <nav class="bottom">${main.map((n) => link(n)).join('')}</nav></div>`;
    $('#btn-logout').onclick = async () => { if (ERP._unsub) { ERP._unsub(); ERP._unsub = null; } await DB.logout(); ERP.user = null; location.hash = ''; showLogin(); };
    window.onhashchange = route;
    if (ERP._unsub) ERP._unsub();
    ERP._unsub = DB.subscribe ? DB.subscribe(onRemoteChange) : null;
    if (!location.hash || location.hash === '#/' ) location.hash = '#/' + (main[0] ? main[0][0] : 'suppliers');
    route();
  }

  // Peringatan: data diubah pengguna lain -> user perlu memuat ulang
  function onRemoteChange() {
    if ((ERP._w || 0) > 0 || Date.now() - (ERP.ownWriteAt || 0) < 3500) return; // perubahan dari diri sendiri
    const el = $('#chg'); if (!el) return;
    const editing = /\/(new|edit)/.test(location.hash);
    el.innerHTML = `<span>${icon('alert', 18)}</span><span class="chg-msg"><b>Data telah diubah oleh pengguna lain.</b> ${editing ? 'Simpan isian Anda dulu, lalu muat ulang agar data terbaru tampil.' : 'Muat ulang agar data terbaru tampil.'}</span>${btn('reset', 'Muat ulang data', 'id="chg-reload"', 'primary')}<button type="button" class="chg-x" id="chg-close" aria-label="Tutup">×</button>`;
    el.hidden = false;
    $('#chg-reload').onclick = () => { el.hidden = true; ERP.refresh(); };
    $('#chg-close').onclick = () => { el.hidden = true; };
  }
  const hideChange = () => { const el = $('#chg'); if (el) el.hidden = true; };

  async function route() {
    if (!ERP.user) return;
    const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    const id = parts[0];
    const nav = NAV.find((n) => n[0] === id);
    const view = $('#view');
    if (!nav || !ERP.can.module(id)) { view.innerHTML = '<div class="empty">Modul tidak tersedia untuk akun ini.</div>'; return; }
    $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === id));
    $('#page-title').textContent = nav[1];
    document.title = nav[1] + ' · ERP Pembelian';
    hideChange();
    view.innerHTML = '<div class="loading">Memuat…</div>';
    window.scrollTo(0, 0);
    try { await ERP.modules[id].render(view, parts.slice(1)); }
    catch (e) { console.error(e); view.innerHTML = `<div class="empty err">Gagal memuat: ${esc(e.message)}</div>`; }
  }
  ERP.refresh = route;

  /* ---------- Boot ---------- */
  async function boot() {
    initTheme();
    try {
      await DB.init();
      ERP.user = await DB.session();
    } catch (e) { console.error(e); $('#root').innerHTML = `<div class="empty err">Gagal menghubungi database: ${esc(e.message)}</div>`; return; }
    if (ERP.user) startApp(); else showLogin();
  }
  window.addEventListener('DOMContentLoaded', boot);
})();
