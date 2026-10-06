// Edge Function: login dengan username + PIN 4 digit.
// Verifikasi PIN (ter-hash, dengan kunci 15 menit setelah 5x salah) dilakukan di database,
// lalu server menerbitkan sesi Supabase biasa sehingga Row Level Security tetap berlaku.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

async function derivePassword(userId: string) {
  const secret = Deno.env.get('PIN_LOGIN_SECRET');
  if (!secret) throw new Error('PIN_LOGIN_SECRET belum diset');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(userId));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const emailFor = (id: string) => `${id}@erp.local`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { username, pin } = await req.json();
    if (typeof username !== 'string' || !username.trim() || !/^\d{4}$/.test(String(pin))) return json({ error: 'invalid' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data, error } = await admin.rpc('verify_pin', { p_username: username.trim(), p_pin: String(pin) });
    if (error) throw error;
    if (!data.ok) return json({ error: data.error, until: data.until }, data.error === 'locked' ? 423 : 401);

    const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
    const { data: s, error: e2 } = await anon.auth.signInWithPassword({ email: emailFor(data.user_id), password: await derivePassword(data.user_id) });
    if (e2 || !s.session) return json({ error: 'invalid' }, 401);
    return json({ access_token: s.session.access_token, refresh_token: s.session.refresh_token });
  } catch (e) {
    console.error(e);
    return json({ error: 'server' }, 500);
  }
});
