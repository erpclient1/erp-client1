/* ERP Pembelian — server lokal (tanpa akun pihak ketiga).
 * Node >= 22.13: menyajikan aplikasi web + API, data di SQLite (server/data/erp.db).
 * Aturan yang sama dengan versi Supabase: hak akses per role/modul, approval PO hanya Supervisor,
 * PIN ter-hash dengan kunci 15 menit setelah 5x salah.
 * Jalankan:  node server/server.js   (atau klik start-server.bat) */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT) || 8080;
const DATA_DIR = process.env.ERP_DATA || path.join(__dirname, 'data');
const ROOT = path.join(__dirname, '..');
fs.mkdirSync(path.join(DATA_DIR, 'backup'), { recursive: true });

/* ---------------- Penyimpanan ---------------- */
const db = new DatabaseSync(path.join(DATA_DIR, 'erp.db'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
  CREATE TABLE IF NOT EXISTS docs(tbl TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY(tbl,id));
  CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
  CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL, exp INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS secrets(user_id TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, failed INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0);`);

const TABLES = ['app_users', 'units', 'currencies', 'settings', 'suppliers', 'items', 'purchase_orders', 'po_items', 'po_payments', 'goods_receipts', 'gr_items', 'hist_purchases', 'clients', 'delivery_orders', 'do_items'];
const CASCADE = { purchase_orders: [['po_items', 'po_id'], ['po_payments', 'po_id'], ['goods_receipts', 'po_id']], goods_receipts: [['gr_items', 'gr_id']], po_items: [['gr_items', 'po_item_id']], delivery_orders: [['do_items', 'do_id']] };
const store = Object.fromEntries(TABLES.map((t) => [t, []]));
for (const r of db.prepare('SELECT tbl, json FROM docs').all()) if (store[r.tbl]) store[r.tbl].push(JSON.parse(r.json));

const qPut = db.prepare('INSERT OR REPLACE INTO docs(tbl,id,json) VALUES(?,?,?)');
const qDel = db.prepare('DELETE FROM docs WHERE tbl=? AND id=?');
const put = (t, row) => qPut.run(t, row.id, JSON.stringify(row));
const del = (t, id) => qDel.run(t, id);
let txDepth = 0;
function reloadStore() { TABLES.forEach((t) => (store[t] = [])); for (const r of db.prepare('SELECT tbl, json FROM docs').all()) if (store[r.tbl]) store[r.tbl].push(JSON.parse(r.json)); }
// transaksi (boleh bersarang); bila gagal, memori disamakan kembali dengan database
const tx = (fn) => {
  if (txDepth > 0) return fn();
  txDepth++; db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); reloadStore(); throw e; } finally { txDepth--; }
};
const nextSeq = (name) => tx(() => {
  const r = db.prepare('SELECT v FROM meta WHERE k=?').get('seq_' + name);
  const n = (r ? Number(r.v) : 0) + 1;
  db.prepare('INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)').run('seq_' + name, String(n));
  return n;
});
const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const clone = (o) => JSON.parse(JSON.stringify(o));
const fail = (status, error, extra) => Object.assign(new Error(error), { status, error, ...extra });

/* ---------------- Seed awal ---------------- */
function seed() {
  if (!store.units.length) ['PRS', 'KG'].forEach((name) => { const r = { id: uuid(), name, created_at: now() }; store.units.push(r); put('units', r); });
  if (!store.currencies.length) [['IDR', 'Rupiah', 'Rp', 0], ['USD', 'US Dollar', '$', 2], ['EUR', 'Euro', '€', 2]].forEach(([code, name, symbol, decimals]) => { const r = { id: uuid(), code, name, symbol, decimals, created_at: now() }; store.currencies.push(r); put('currencies', r); });
  if (!store.app_users.length) {
    const pin = String(crypto.randomInt(0, 10000)).padStart(4, '0');
    createUser({ username: 'admin', full_name: 'Administrator', role: 'admin', modules: ALL_MODS.slice(), pin });
    console.log('\n  ==============================================================');
    console.log('  AKUN ADMIN PERTAMA DIBUAT');
    console.log('     username : admin');
    console.log('     PIN      : ' + pin + '   (catat, lalu ganti di menu Pengguna)');
    console.log('  ==============================================================\n');
  }
}
const ALL_MODS = ['items', 'suppliers', 'clients', 'po', 'gr', 'do', 'report', 'stock', 'analysis', 'users', 'settings'];
const ROLES = ['admin', 'supervisor', 'gudang', 'viewer'];

/* ---------------- PIN & sesi ---------------- */
function setPin(userId, pin) {
  if (!/^\d{4}$/.test(String(pin))) throw fail(400, 'PIN harus 4 digit angka');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  db.prepare('INSERT OR REPLACE INTO secrets(user_id,salt,hash,failed,locked_until) VALUES(?,?,?,0,0)').run(userId, salt, hash);
}
function createUser(p) {
  if (!/^[a-z0-9._-]{3,30}$/i.test(p.username || '')) throw fail(400, 'Username 3–30 karakter (huruf/angka . _ -)');
  if (!String(p.full_name || '').trim()) throw fail(400, 'Nama lengkap wajib diisi');
  if (!ROLES.includes(p.role)) throw fail(400, 'Role tidak valid');
  if (!Array.isArray(p.modules) || p.modules.some((m) => !ALL_MODS.includes(m))) throw fail(400, 'Modul tidak valid');
  if (store.app_users.some((u) => u.username.toLowerCase() === p.username.toLowerCase())) throw fail(400, 'Username sudah dipakai');
  const u = { id: uuid(), username: p.username.toLowerCase(), full_name: p.full_name.trim(), role: p.role, modules: p.modules, active: true, created_at: now() };
  tx(() => { store.app_users.push(u); put('app_users', u); setPin(u.id, p.pin); });
  return u;
}
function login(username, pin) {
  const u = store.app_users.find((x) => x.username.toLowerCase() === String(username || '').trim().toLowerCase() && x.active);
  if (!u) throw fail(401, 'invalid');
  const s = db.prepare('SELECT * FROM secrets WHERE user_id=?').get(u.id);
  if (!s) throw fail(401, 'invalid');
  if (s.locked_until > Date.now()) throw fail(423, 'locked', { until: new Date(s.locked_until).toISOString() });
  const h = crypto.scryptSync(String(pin), s.salt, 32);
  if (/^\d{4}$/.test(String(pin)) && crypto.timingSafeEqual(h, Buffer.from(s.hash, 'hex'))) {
    db.prepare('UPDATE secrets SET failed=0, locked_until=0 WHERE user_id=?').run(u.id);
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare('DELETE FROM sessions WHERE exp < ?').run(Date.now());
    db.prepare('INSERT INTO sessions(token,user_id,exp) VALUES(?,?,?)').run(token, u.id, Date.now() + 24 * 3600 * 1000);
    return { token, user: clone(u) };
  }
  const f = s.failed + 1;
  db.prepare('UPDATE secrets SET failed=?, locked_until=? WHERE user_id=?').run(f >= 5 ? 0 : f, f >= 5 ? Date.now() + 15 * 60000 : 0, u.id);
  throw fail(401, 'invalid');
}
function authUser(req) {
  const m = /^Bearer (\w+)$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token=? AND exp>?').get(m[1], Date.now());
  if (!s) return null;
  return store.app_users.find((u) => u.id === s.user_id && u.active) || null;
}

/* ---------------- Hak akses (setara RLS di Supabase) ---------------- */
const has = (u, m) => u.modules.includes(m);
const any = (u, ms) => ms.some((m) => has(u, m));
const canWrite = (u) => ['admin', 'supervisor'].includes(u.role);
const canReceive = (u) => ['admin', 'supervisor', 'gudang'].includes(u.role);
const PO_READ = ['po', 'gr', 'do', 'report', 'stock', 'analysis'];
const READ = {
  app_users: () => true, units: () => true, currencies: () => true, settings: () => true, suppliers: () => true, items: () => true,
  clients: (u) => any(u, ['clients', 'do']), purchase_orders: (u) => any(u, PO_READ), po_items: (u) => any(u, PO_READ), po_payments: (u) => any(u, ['po', 'analysis']),
  goods_receipts: (u) => any(u, ['po', 'gr', 'do', 'report', 'stock']), gr_items: (u) => any(u, ['po', 'gr', 'do', 'report', 'stock']),
  delivery_orders: (u) => any(u, ['do', 'report', 'stock']), do_items: (u) => any(u, ['do', 'report', 'stock']), hist_purchases: (u) => has(u, 'analysis'),
};
const WRITE = {
  app_users: () => false,
  units: (u) => u.role === 'admin' && has(u, 'settings'), currencies: (u) => u.role === 'admin' && has(u, 'settings'), settings: (u) => u.role === 'admin' && has(u, 'settings'),
  suppliers: (u) => canWrite(u) && has(u, 'suppliers'), items: (u) => canWrite(u) && any(u, ['items', 'po']), clients: (u) => canWrite(u) && has(u, 'clients'),
  purchase_orders: (u) => canWrite(u) && has(u, 'po'), po_items: (u) => canWrite(u) && has(u, 'po'), po_payments: (u) => canWrite(u) && has(u, 'po'),
  goods_receipts: (u) => canReceive(u) && has(u, 'gr'), gr_items: (u) => canReceive(u) && has(u, 'gr'),
  delivery_orders: (u) => canReceive(u) && has(u, 'do'), do_items: (u) => canReceive(u) && has(u, 'do'), hist_purchases: (u) => canWrite(u) && has(u, 'analysis'),
};
const DUMMY_DEL = ['purchase_orders', 'suppliers', 'items', 'clients', 'delivery_orders'];
function needRead(u, t) { if (!READ[t]) throw fail(400, 'Tabel tidak dikenal'); if (!READ[t](u)) throw fail(403, 'Tidak punya akses'); }
function needWrite(u, t, row, isDelete) {
  if (!WRITE[t]) throw fail(400, 'Tabel tidak dikenal');
  if (WRITE[t](u)) return;
  if (isDelete && row && row.is_dummy && DUMMY_DEL.includes(t) && u.role === 'admin' && has(u, 'settings')) return;
  throw fail(403, 'Tidak punya akses');
}

/* ---------------- Aturan data ---------------- */
const UNIQUE = { delivery_orders: ['do_number'], purchase_orders: ['po_number', 'po_seq'], suppliers: ['code'], clients: ['code'], items: ['item_number'], units: ['name'], currencies: ['code'] };
const variantKey = (r) => ['brand', 'model', 'compound', 'gender', 'color', 'size', 'unit'].map((k) => String(r[k] || '').trim().toLowerCase()).join('|');
function checkUnique(t, row) {
  for (const k of UNIQUE[t] || []) {
    if (row[k] != null && store[t].some((r) => r.id !== row.id && String(r[k]).toLowerCase() === String(row[k]).toLowerCase())) throw fail(400, `${k} sudah dipakai`);
  }
  if (t === 'items' && store.items.some((r) => r.id !== row.id && variantKey(r) === variantKey(row))) throw fail(400, 'Item dengan kombinasi yang sama sudah ada');
}
const PO_CONTENT = ['po_date', 'supplier_id', 'currency', 'fx_rate', 'payment_type', 'tempo_mode', 'tempo_days', 'tempo_date', 'vat', 'pph23', 'pph23_rate', 'pph23_amount', 'urgent', 'discount_type', 'discount_value', 'subtotal', 'discount_amount', 'vat_amount', 'total', 'notes'];
const same = (a, b) => (a == null && b == null) || String(a) === String(b);

function guardPO(old, row, user) {
  if (!old) { Object.assign(row, { status: 'pending', approved_by: null, approved_at: null, revision: 0, created_by: user.id }); return; }
  if (row.status === 'approved' && old.status !== 'approved') {
    if (user.role !== 'supervisor') throw fail(403, 'Hanya Supervisor yang dapat meng-approve PO');
    row.approved_by = user.id; row.approved_at = now();
  }
  if (old.status === 'approved' && row.status === 'approved' && PO_CONTENT.some((k) => !same(old[k], row[k]))) { row.status = 'pending'; row.revision = (old.revision || 0) + 1; }
  if (row.status === 'pending') { row.approved_by = null; row.approved_at = null; }
}
function resetPOIfItemsChanged(poId) {
  const p = store.purchase_orders.find((x) => x.id === poId);
  if (p && p.status === 'approved') { p.status = 'pending'; p.revision = (p.revision || 0) + 1; p.approved_by = null; p.approved_at = null; put('purchase_orders', p); }
}
function restrictDelete(t, row) {
  const used = (tbl, col, msg) => { if (store[tbl].some((r) => r[col] === row.id)) throw fail(400, msg); };
  if (t === 'suppliers') used('purchase_orders', 'supplier_id', 'Supplier dipakai di PO');
  if (t === 'clients') used('delivery_orders', 'client_id', 'Client dipakai di Delivery Order');
  if (t === 'purchase_orders') used('delivery_orders', 'po_id', 'PO dipakai di Delivery Order');
}

function removeRow(t, id) {
  const i = store[t].findIndex((r) => r.id === id);
  if (i < 0) return;
  const row = store[t][i];
  if (t === 'po_items') resetPOIfItemsChanged(row.po_id);
  store[t].splice(i, 1); del(t, id);
  (CASCADE[t] || []).forEach(([ct, col]) => store[ct].filter((r) => r[col] === id).forEach((r) => removeRow(ct, r.id)));
}

/* ---------------- Operasi API ---------------- */
const ops = {
  list(u, b) {
    needRead(u, b.table);
    let rows = store[b.table].slice();
    if (b.eq) for (const [k, v] of Object.entries(b.eq)) rows = rows.filter((r) => r[k] === v);
    if (b.order) rows.sort((a, c) => String(a[b.order] == null ? '' : a[b.order]).localeCompare(String(c[b.order] == null ? '' : c[b.order]), undefined, { numeric: true }) * (b.desc ? -1 : 1));
    return rows;
  },
  insert(u, b) {
    const t = b.table; needWrite(u, t);
    const arr = Array.isArray(b.rows) ? b.rows : [b.rows];
    return tx(() => arr.map((r) => {
      const row = { ...clone(r), id: uuid(), created_at: now() };
      if (t === 'suppliers' && !row.code) row.code = 'SUP-' + String(nextSeq('supplier')).padStart(4, '0');
      if (t === 'clients' && !row.code) row.code = 'CL-' + String(nextSeq('client')).padStart(4, '0');
      if (t === 'items' && !row.item_number) row.item_number = 'ITM-' + String(nextSeq('item')).padStart(4, '0');
      if (['po_payments', 'goods_receipts', 'delivery_orders'].includes(t)) row.created_by = u.id;
      if (t === 'gr_items' || t === 'do_items') row.grade = row.grade === 'D' ? 'D' : 'G';
      if (t === 'purchase_orders') guardPO(null, row, u);
      if (t === 'po_items') resetPOIfItemsChanged(row.po_id);
      checkUnique(t, row);
      store[t].push(row); put(t, row);
      return clone(row);
    }));
  },
  update(u, b) {
    const t = b.table; needWrite(u, t);
    const old = store[t].find((r) => r.id === b.id);
    if (!old) throw fail(404, 'Data tidak ditemukan');
    return tx(() => {
      const row = { ...old, ...clone(b.patch || {}), id: old.id, created_at: old.created_at, updated_at: now() };
      if (t === 'purchase_orders') { row.po_seq = old.po_seq; row.created_by = old.created_by; guardPO(old, row, u); }
      if (t === 'po_items') resetPOIfItemsChanged(old.po_id);
      checkUnique(t, row);
      store[t][store[t].indexOf(old)] = row; put(t, row);
      return clone(row);
    });
  },
  remove(u, b) {
    const t = b.table; const row = store[t] && store[t].find((r) => r.id === b.id);
    if (!row) return null;
    needWrite(u, t, row, true); restrictDelete(t, row);
    tx(() => removeRow(t, b.id));
    return null;
  },
  removeBy(u, b) {
    const t = b.table; needWrite(u, t);
    tx(() => store[t].filter((r) => r[b.col] === b.val).forEach((r) => removeRow(t, r.id)));
    return null;
  },
  nextPoSeq(u) { if (!(canWrite(u) && has(u, 'po'))) throw fail(403, 'Tidak punya akses'); return nextSeq('po'); },
  adminUser(u, b) {
    if (!(u.role === 'admin' && has(u, 'users'))) throw fail(403, 'Hanya Admin yang boleh mengelola user');
    if (b.action === 'create') { createUser(b); return null; }
    if (b.action === 'update') {
      const t = store.app_users.find((x) => x.id === b.id);
      if (!t) throw fail(404, 'User tidak ditemukan');
      if (!ROLES.includes(b.role) || !Array.isArray(b.modules) || b.modules.some((m) => !ALL_MODS.includes(m))) throw fail(400, 'Data tidak valid');
      if (!String(b.full_name || '').trim()) throw fail(400, 'Nama lengkap wajib diisi');
      if (b.id === u.id && (!b.active || b.role !== 'admin' || !b.modules.includes('users'))) throw fail(400, 'Tidak dapat menonaktifkan / menurunkan akses akun sendiri');
      if (b.pin && !/^\d{4}$/.test(String(b.pin))) throw fail(400, 'PIN harus 4 digit angka');
      tx(() => { Object.assign(t, { full_name: b.full_name.trim(), role: b.role, modules: b.modules, active: !!b.active, updated_at: now() }); put('app_users', t); if (b.pin) setPin(t.id, b.pin); });
      return null;
    }
    throw fail(400, 'Aksi tidak dikenal');
  },
};

/* ---------------- HTTP ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const send = (res, status, body, headers = {}) => { const s = typeof body === 'string' ? body : JSON.stringify(body); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }); res.end(s); };
const readBody = (req) => new Promise((ok, no) => { let n = 0; const chunks = []; req.on('data', (c) => { n += c.length; if (n > 20e6) { no(fail(413, 'Data terlalu besar')); req.destroy(); } else chunks.push(c); }); req.on('end', () => { try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch (_) { no(fail(400, 'JSON tidak valid')); } }); });

function serveStatic(req, res) {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const seg = p.split('/').filter(Boolean);
  const okTop = p === '/index.html' || ['css', 'js'].includes(seg[0]);
  const file = path.join(ROOT, p);
  if (!okTop || !file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Tidak ditemukan'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url.startsWith('/api/')) return serveStatic(req, res);
    const name = req.url.slice(5).split('?')[0];
    if (name === 'ping') return send(res, 200, { erp: true });
    if (req.method !== 'POST') return send(res, 405, { error: 'Metode tidak didukung' });
    const body = await readBody(req);
    if (name === 'login') { try { return send(res, 200, login(body.username, body.pin)); } catch (e) { return send(res, e.status || 500, { error: e.error || 'invalid', until: e.until }); } }
    const user = authUser(req);
    if (!user) return send(res, 401, { error: 'Belum login' });
    if (name === 'session') return send(res, 200, { user: clone(user) });
    if (name === 'logout') { db.prepare('DELETE FROM sessions WHERE token=?').run((req.headers.authorization || '').slice(7)); return send(res, 200, { ok: true }); }
    if (!ops[name]) return send(res, 404, { error: 'Aksi tidak dikenal' });
    return send(res, 200, { data: ops[name](user, body) });
  } catch (e) {
    if (!e.status) console.error(e);
    send(res, e.status || 500, { error: e.error || (e.status ? e.message : 'Kesalahan server') });
  }
});

/* ---------------- Start ---------------- */
function backup() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const f = path.join(DATA_DIR, 'backup', `erp-${stamp}.db`);
  if (!fs.existsSync(f)) { try { db.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`); } catch (e) { console.error('Backup gagal:', e.message); } }
  const all = fs.readdirSync(path.join(DATA_DIR, 'backup')).filter((x) => x.endsWith('.db')).sort();
  all.slice(0, Math.max(0, all.length - 30)).forEach((x) => fs.unlinkSync(path.join(DATA_DIR, 'backup', x)));
}
seed();
backup();
setInterval(backup, 6 * 3600 * 1000).unref();
server.listen(PORT, '0.0.0.0', () => {
  console.log('ERP Pembelian berjalan. Buka di browser:');
  console.log('   di PC ini        : http://localhost:' + PORT);
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log('   dari HP/laptop lain (WiFi yang sama): http://' + a.address + ':' + PORT);
  console.log('Data: ' + path.join(DATA_DIR, 'erp.db') + '  (backup harian otomatis di folder backup)');
  console.log('Tekan Ctrl+C untuk berhenti.');
});
process.on('SIGINT', () => { try { db.close(); } catch (_) {} process.exit(0); });
