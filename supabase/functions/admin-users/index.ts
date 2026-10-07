// Edge Function: manajemen user (hanya Admin dengan modul "users").
// action: create | update | bootstrap (membuat Admin pertama, perlu BOOTSTRAP_KEY)
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const ROLES = ['admin', 'supervisor', 'gudang', 'finance', 'viewer'];
const MODULES = ['items', 'suppliers', 'clients', 'so', 'po', 'gr', 'do', 'payment', 'report', 'stock', 'analysis', 'users', 'settings'];

async function derivePassword(userId: string) {
  const secret = Deno.env.get('PIN_LOGIN_SECRET');
  if (!secret) throw new Error('PIN_LOGIN_SECRET belum diset');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(userId));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const emailFor = (id: string) => `${id}@erp.local`;

function validate(p: any, creating: boolean) {
  if (creating && !/^[a-z0-9._-]{3,30}$/i.test(p.username || '')) throw new Error('Username 3–30 karakter (huruf/angka . _ -)');
  if (!String(p.full_name || '').trim()) throw new Error('Nama lengkap wajib diisi');
  if (!ROLES.includes(p.role)) throw new Error('Role tidak valid');
  if (!Array.isArray(p.modules) || p.modules.some((m: string) => !MODULES.includes(m))) throw new Error('Modul tidak valid');
  if ((creating || p.pin) && !/^\d{4}$/.test(String(p.pin))) throw new Error('PIN harus 4 digit angka');
}

async function createUser(admin: any, p: any) {
  validate(p, true);
  const { data: row, error } = await admin.from('app_users')
    .insert({ username: p.username.toLowerCase(), full_name: p.full_name.trim(), role: p.role, modules: p.modules, division_id: p.division_id || null, active: true })
    .select().single();
  if (error) throw new Error(error.code === '23505' ? 'Username sudah dipakai' : error.message);
  try {
    const { data: au, error: e2 } = await admin.auth.admin.createUser({ email: emailFor(row.id), password: await derivePassword(row.id), email_confirm: true });
    if (e2) throw e2;
    const { error: e3 } = await admin.from('app_users').update({ auth_id: au.user.id }).eq('id', row.id);
    if (e3) throw e3;
    const { error: e4 } = await admin.rpc('set_pin', { p_user: row.id, p_pin: String(p.pin) });
    if (e4) throw e4;
  } catch (e) {
    await admin.from('app_users').delete().eq('id', row.id); // batalkan
    throw e;
  }
  return { ok: true, id: row.id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json();
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

    if (body.action === 'bootstrap') {
      const key = Deno.env.get('BOOTSTRAP_KEY');
      if (!key || body.key !== key) return json({ error: 'Tidak diizinkan' }, 403);
      const { count } = await admin.from('app_users').select('id', { count: 'exact', head: true });
      if (count) return json({ error: 'Sudah ada user; bootstrap ditutup' }, 400);
      return json(await createUser(admin, { username: body.username, full_name: body.full_name, role: 'admin', modules: MODULES, pin: body.pin }));
    }

    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } }, auth: { persistSession: false } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: 'Belum login' }, 401);
    const { data: me } = await admin.from('app_users').select('id,role,active,modules').eq('auth_id', user.id).maybeSingle();
    if (!me || !me.active || me.role !== 'admin' || !me.modules.includes('users')) return json({ error: 'Hanya Admin yang boleh mengelola user' }, 403);

    if (body.action === 'create') return json(await createUser(admin, body));

    if (body.action === 'update') {
      validate({ ...body, pin: body.pin || undefined }, false);
      if (body.id === me.id && (!body.active || body.role !== 'admin' || !body.modules.includes('users')))
        return json({ error: 'Tidak dapat menonaktifkan / menurunkan akses akun sendiri' }, 400);
      const { error } = await admin.from('app_users')
        .update({ full_name: body.full_name.trim(), role: body.role, modules: body.modules, division_id: body.division_id || null, active: !!body.active }).eq('id', body.id);
      if (error) throw error;
      if (body.pin) { const { error: e2 } = await admin.rpc('set_pin', { p_user: body.id, p_pin: String(body.pin) }); if (e2) throw e2; }
      return json({ ok: true });
    }
    return json({ error: 'Aksi tidak dikenal' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || 'Kesalahan server' }, 400);
  }
});
