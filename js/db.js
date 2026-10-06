/* Lapisan data: mode 'local' (demo, data di browser) atau 'supabase' (otomatis jika config.js terisi) */
(function () {
  const ERP = (window.ERP = window.ERP || {});
  const CFG = window.ERP_CONFIG || {};
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const useSB = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);

  /* ================= LOCAL ================= */
  const KEY = 'erp_local_db_v1';
  const SKEY = 'erp_local_session';
  const TABLES = ['app_users', 'units', 'currencies', 'settings', 'suppliers', 'items', 'purchase_orders', 'po_items', 'po_payments', 'goods_receipts', 'gr_items', 'hist_purchases', 'clients', 'delivery_orders', 'do_items'];
  const CASCADE = { purchase_orders: [['po_items', 'po_id'], ['po_payments', 'po_id'], ['goods_receipts', 'po_id']], goods_receipts: [['gr_items', 'gr_id']], po_items: [['gr_items', 'po_item_id']], delivery_orders: [['do_items', 'do_id']] };
  const MODS_ALL = ['items', 'suppliers', 'clients', 'po', 'gr', 'do', 'report', 'stock', 'analysis', 'users', 'settings'];
  ERP.ROLE_DEFAULT_MODS = {
    admin: MODS_ALL,
    supervisor: ['items', 'suppliers', 'clients', 'po', 'gr', 'do', 'report', 'stock', 'analysis'],
    gudang: ['items', 'po', 'gr', 'do', 'report', 'stock'],
    viewer: ['items', 'suppliers', 'clients', 'po', 'gr', 'do', 'report', 'stock', 'analysis'],
  };
  let store = null;
  const save = () => localStorage.setItem(KEY, JSON.stringify(store));
  const now = () => new Date().toISOString();

  const local = {
    mode: 'local',
    async init() {
      try { store = JSON.parse(localStorage.getItem(KEY)); } catch (_) { store = null; }
      if (store && (store.v || 0) < 3) store = null; // struktur Master Item/PO berubah: data demo lama dibuang
      if (!store) {
        store = { v: 3, seq: { supplier: 0, item: 0, po: 0, client: 0 } };
        TABLES.forEach((t) => (store[t] = []));
        const mk = (username, full_name, role, modules, pin) => ({ id: uuid(), username, full_name, role, modules, active: true, pin, created_at: now() });
        const R = ERP.ROLE_DEFAULT_MODS;
        store.app_users = [
          mk('admin', 'Admin Demo', 'admin', R.admin, '1111'),
          mk('spv', 'Supervisor Demo', 'supervisor', R.supervisor, '2222'),
          mk('gudang', 'Gudang Demo', 'gudang', R.gudang, '3333'),
          mk('viewer', 'Viewer Demo', 'viewer', R.viewer, '4444'),
        ];
        store.units = ['PRS', 'KG'].map((name) => ({ id: uuid(), name }));
        store.currencies = [['IDR', 'Rupiah', 'Rp', 0], ['USD', 'US Dollar', '$', 2], ['EUR', 'Euro', '€', 2]].map(([code, name, symbol, decimals]) => ({ id: uuid(), code, name, symbol, decimals }));
        save();
      }
      TABLES.forEach((t) => { if (!store[t]) store[t] = []; });
    },
    async list(table, o = {}) {
      let rows = clone(store[table] || []);
      if (o.eq) Object.entries(o.eq).forEach(([k, v]) => (rows = rows.filter((r) => r[k] === v)));
      if (o.order) rows.sort((a, b) => String(a[o.order] == null ? '' : a[o.order]).localeCompare(String(b[o.order] == null ? '' : b[o.order]), undefined, { numeric: true }) * (o.desc ? -1 : 1));
      return rows;
    },
    async insert(table, rows) {
      const arr = Array.isArray(rows) ? rows : [rows];
      const out = arr.map((r) => {
        const row = { id: uuid(), created_at: now(), ...clone(r) };
        if (table === 'suppliers' && !row.code) row.code = 'SUP-' + String(++store.seq.supplier).padStart(4, '0');
        if (table === 'items' && !row.item_number) row.item_number = 'ITM-' + String(++store.seq.item).padStart(4, '0');
        if (table === 'clients' && !row.code) row.code = 'CL-' + String(++store.seq.client).padStart(4, '0');
        if (table === 'delivery_orders') row.created_by = row.created_by || (ERP.user && ERP.user.id);
        if (table === 'gr_items') row.grade = row.grade || 'G';
        if (table === 'purchase_orders') { row.status = row.status || 'pending'; row.revision = row.revision || 0; row.created_by = row.created_by || (ERP.user && ERP.user.id); }
        if (['po_payments', 'goods_receipts'].includes(table)) row.created_by = row.created_by || (ERP.user && ERP.user.id);
        store[table].push(row);
        return clone(row);
      });
      save();
      return out;
    },
    async update(table, id, patch) {
      const row = store[table].find((r) => r.id === id);
      if (!row) throw new Error('Data tidak ditemukan');
      Object.assign(row, clone(patch), { updated_at: now() });
      save();
      return clone(row);
    },
    async remove(table, id) {
      const i = store[table].findIndex((r) => r.id === id);
      if (i < 0) return;
      store[table].splice(i, 1);
      (CASCADE[table] || []).forEach(([t, col]) => { store[t].filter((r) => r[col] === id).forEach((r) => this.remove(t, r.id)); });
      save();
    },
    async removeBy(table, col, val) { store[table].filter((r) => r[col] === val).forEach((r) => this.remove(table, r.id)); },
    async nextPoSeq() { store.seq.po += 1; save(); return store.seq.po; },
    async login(username, pin) {
      const u = store.app_users.find((x) => x.username.toLowerCase() === username.toLowerCase() && x.active);
      store.lock = store.lock || {};
      const k = username.toLowerCase();
      const L = store.lock[k] || { n: 0, until: 0 };
      if (L.until > Date.now()) throw Object.assign(new Error('locked'), { code: 'locked', until: L.until });
      if (!u || u.pin !== pin) {
        L.n += 1;
        if (L.n >= 5) { L.n = 0; L.until = Date.now() + 15 * 60000; }
        store.lock[k] = L; save();
        throw Object.assign(new Error('invalid'), { code: 'invalid' });
      }
      store.lock[k] = { n: 0, until: 0 }; save();
      sessionStorage.setItem(SKEY, u.id);
      return this.profile(u);
    },
    profile(u) { const { pin, ...rest } = u; return clone(rest); },
    async session() { const id = sessionStorage.getItem(SKEY); const u = store.app_users.find((x) => x.id === id && x.active); return u ? this.profile(u) : null; },
    async logout() { sessionStorage.removeItem(SKEY); },
    async adminUser(action, p) {
      if (action === 'create') {
        if (store.app_users.some((u) => u.username.toLowerCase() === p.username.toLowerCase())) throw new Error('Username sudah dipakai');
        store.app_users.push({ id: uuid(), username: p.username, full_name: p.full_name, role: p.role, modules: p.modules, active: true, pin: p.pin, created_at: now() });
      } else if (action === 'update') {
        const u = store.app_users.find((x) => x.id === p.id);
        Object.assign(u, { full_name: p.full_name, role: p.role, modules: p.modules, active: p.active });
        if (p.pin) u.pin = p.pin;
      }
      save();
    },
    async reset() { localStorage.removeItem(KEY); sessionStorage.removeItem(SKEY); location.reload(); },
  };

  /* ================= SUPABASE ================= */
  let sb = null;
  const sbAdapter = {
    mode: 'supabase',
    async init() { sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY); },
    async list(table, o = {}) {
      const out = [];
      for (let from = 0; ; from += 1000) {
        let q = sb.from(table).select('*');
        if (o.eq) Object.entries(o.eq).forEach(([k, v]) => (q = q.eq(k, v)));
        if (o.order) q = q.order(o.order, { ascending: !o.desc });
        q = q.order('id').range(from, from + 999);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        out.push(...data);
        if (data.length < 1000) break;
      }
      return out;
    },
    async insert(table, rows) {
      const arr = Array.isArray(rows) ? rows : [rows];
      const out = [];
      for (let i = 0; i < arr.length; i += 500) {
        const { data, error } = await sb.from(table).insert(arr.slice(i, i + 500)).select();
        if (error) throw new Error(error.message);
        out.push(...data);
      }
      return out;
    },
    async update(table, id, patch) {
      const { data, error } = await sb.from(table).update(patch).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
    async remove(table, id) { const { error } = await sb.from(table).delete().eq('id', id); if (error) throw new Error(error.message); },
    async removeBy(table, col, val) { const { error } = await sb.from(table).delete().eq(col, val); if (error) throw new Error(error.message); },
    async nextPoSeq() { const { data, error } = await sb.rpc('next_po_seq'); if (error) throw new Error(error.message); return data; },
    async login(username, pin) {
      let res;
      try {
        res = await fetch(CFG.SUPABASE_URL + '/functions/v1/pin-login', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY }, body: JSON.stringify({ username, pin }) });
      } catch (_) { throw Object.assign(new Error('network'), { code: 'network' }); }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(j.error || 'invalid'), { code: j.error || 'invalid', until: j.until ? Date.parse(j.until) : 0 });
      const { error } = await sb.auth.setSession({ access_token: j.access_token, refresh_token: j.refresh_token });
      if (error) throw new Error(error.message);
      return this.session();
    },
    async session() {
      const { data } = await sb.auth.getSession();
      if (!data.session) return null;
      const { data: u } = await sb.from('app_users').select('*').eq('auth_id', data.session.user.id).maybeSingle();
      return u && u.active ? u : null;
    },
    async logout() { await sb.auth.signOut(); },
    async adminUser(action, p) {
      const { data, error } = await sb.functions.invoke('admin-users', { body: { action, ...p } });
      if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch (_) {} throw new Error(m); }
      if (data && data.error) throw new Error(data.error);
    },
    async reset() { /* tidak berlaku di mode Supabase */ },
  };

  /* ================= API (server lokal: server/server.js) ================= */
  const TKEY = 'erp_api_token';
  const apiAdapter = {
    mode: 'api',
    token: null,
    async init() { try { this.token = localStorage.getItem(TKEY); } catch (_) { this.token = null; } },
    async call(name, body) {
      let res;
      try {
        res = await fetch('/api/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) }, body: JSON.stringify(body || {}) });
      } catch (_) { throw Object.assign(new Error('Tidak dapat terhubung ke server'), { code: 'network' }); }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(j.error || 'Kesalahan server'), { code: j.error || 'server', until: j.until ? Date.parse(j.until) : 0, status: res.status });
      return j.data !== undefined ? j.data : j;
    },
    list(table, o = {}) { return this.call('list', { table, ...o }); },
    insert(table, rows) { return this.call('insert', { table, rows }).then((r) => (Array.isArray(r) ? r : [r])); },
    update(table, id, patch) { return this.call('update', { table, id, patch }); },
    remove(table, id) { return this.call('remove', { table, id }); },
    removeBy(table, col, val) { return this.call('removeBy', { table, col, val }); },
    nextPoSeq() { return this.call('nextPoSeq'); },
    async login(username, pin) {
      const j = await this.call('login', { username, pin });
      this.token = j.token; try { localStorage.setItem(TKEY, j.token); } catch (_) {}
      return j.user;
    },
    async session() {
      if (!this.token) return null;
      try { return (await this.call('session')).user; } catch (e) { if (e.status === 401) { this.token = null; try { localStorage.removeItem(TKEY); } catch (_) {} return null; } throw e; }
    },
    async logout() { try { await this.call('logout'); } catch (_) {} this.token = null; try { localStorage.removeItem(TKEY); } catch (_) {} },
    adminUser(action, p) { return this.call('adminUser', { action, ...p }); },
    async reset() {},
  };

  // Adapter dipilih saat init: server lokal (/api/ping) > Supabase (config.js terisi) > demo di browser
  let cur = useSB ? sbAdapter : local;
  const choose = async () => {
    try {
      const r = await fetch('/api/ping', { cache: 'no-store' });
      if (r.ok && (await r.json()).erp) cur = apiAdapter;
    } catch (_) { /* bukan server ERP lokal */ }
    await cur.init();
  };
  ERP.DB = new Proxy({}, { get: (_, k) => (k === 'init' ? choose : typeof cur[k] === 'function' ? cur[k].bind(cur) : cur[k]) });
  ERP.MODS_ALL = MODS_ALL;
})();
