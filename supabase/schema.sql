-- =====================================================================
-- ERP Pembelian — skema Supabase (PostgreSQL) + Row Level Security
-- Revisi 06-Oct-26: item = Brand/Model/Compound/Gender/Colour/Size, PPh 23, rate mata uang,
-- Good/Defect pada penerimaan, DO manual terkait PO, modul Report & Stock.
-- Jalankan SELURUH file ini di Supabase > SQL Editor.
-- Jika sebelumnya sudah menjalankan skema versi lama, jalankan dulu reset_dev.sql
-- (menghapus data bisnis; tabel user dipertahankan), lalu file ini.
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- Pengguna ----------
create table if not exists app_users (
  id          uuid primary key default gen_random_uuid(),
  auth_id     uuid unique,
  username    text not null unique,
  full_name   text not null,
  role        text not null check (role in ('admin','supervisor','gudang','viewer')),
  modules     text[] not null default '{}',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- PIN disimpan ter-hash di tabel terpisah; TANPA policy => tidak terbaca dari browser
create table if not exists user_secrets (
  user_id         uuid primary key references app_users(id) on delete cascade,
  pin_hash        text not null,
  failed_attempts int  not null default 0,
  locked_until    timestamptz
);
alter table user_secrets enable row level security;

-- ---------- Fungsi bantu hak akses ----------
create or replace function app_user_id() returns uuid
language sql stable security definer set search_path = public as
$$ select id from app_users where auth_id = auth.uid() and active $$;

create or replace function app_role() returns text
language sql stable security definer set search_path = public as
$$ select role from app_users where auth_id = auth.uid() and active $$;

create or replace function app_has_module(m text) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select m = any(modules) from app_users where auth_id = auth.uid() and active), false) $$;

create or replace function app_has_any(ms text[]) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select modules && ms from app_users where auth_id = auth.uid() and active), false) $$;

-- ---------- Acuan ----------
create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);
create table if not exists currencies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  symbol text default '',
  decimals int not null default 2
);
create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'
);
insert into units(name) values ('PRS'),('KG') on conflict do nothing;
insert into currencies(code,name,symbol,decimals) values ('IDR','Rupiah','Rp',0),('USD','US Dollar','$',2),('EUR','Euro','€',2) on conflict do nothing;

-- ---------- Supplier ----------
create sequence if not exists supplier_seq;
create table if not exists suppliers (
  id              uuid primary key default gen_random_uuid(),
  code            text unique not null default ('SUP-' || lpad(nextval('supplier_seq')::text, 4, '0')),
  name            text not null,
  currency        text not null default 'IDR',
  contact_person  text, position text, mobile text, office_phone text, email text,
  billing_address text,
  npwp text, tax_payer text, nitku text, tax_address text,
  is_dummy        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

-- ---------- Client ----------
create sequence if not exists client_seq;
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default ('CL-' || lpad(nextval('client_seq')::text, 4, '0')),
  name text not null, category text, currency text not null default 'IDR',
  contact_person text, position text, mobile text, email text, office_phone text, office_email text,
  address text, shipping_address text, billing_address text,
  npwp text, tax_payer text, nitku text, tax_address text,
  payment_term text not null default 'cash' check (payment_term in ('cash','tempo')),
  tempo_days int,
  is_dummy boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz
);

-- ---------- Master item ----------
create sequence if not exists item_seq;
create table if not exists items (
  id          uuid primary key default gen_random_uuid(),
  item_number text unique not null default ('ITM-' || lpad(nextval('item_seq')::text, 4, '0')),  -- kode internal (tidak ditampilkan)
  brand       text not null,
  model       text not null,         -- Model Name
  compound    text,                  -- Compound Name
  gender      text check (gender is null or gender in ('GS','Man','Woman','INF','PS','JR','KID')),
  color       text,                  -- Colour
  size        text,
  unit        text not null,         -- PRS / KG
  is_dummy    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);
create unique index if not exists items_variant_uq on items (
  lower(brand), lower(model), lower(coalesce(compound,'')), lower(coalesce(gender,'')), lower(coalesce(color,'')), lower(coalesce(size,'')), unit);

-- ---------- Purchase Order ----------
create sequence if not exists po_seq;   -- nomor urut PO: berlanjut terus, tidak reset per tahun
create or replace function next_po_seq() returns bigint
language sql security definer set search_path = public as
$$ select case when app_role() in ('admin','supervisor') and app_has_module('po') then nextval('po_seq') end $$;

create table if not exists purchase_orders (
  id              uuid primary key default gen_random_uuid(),
  po_seq          int  not null unique,
  po_number       text not null unique,               -- mis. "PO 001 / I / 2026"
  po_date         date not null,
  supplier_id     uuid not null references suppliers(id) on delete restrict,
  currency        text not null default 'IDR',
  fx_rate         numeric(18,4),                      -- rate mata uang asing -> IDR (opsional)
  payment_type    text not null check (payment_type in ('cash','tempo')),
  tempo_mode      text check (tempo_mode in ('days','date')),
  tempo_days      int,
  tempo_date      date,
  vat             boolean not null default false,     -- PPN 11%
  pph23           boolean not null default false,
  pph23_rate      numeric(8,4),
  pph23_amount    numeric(18,4) not null default 0,
  urgent          boolean not null default false,
  discount_type   text not null default 'pct' check (discount_type in ('pct','amt')),
  discount_value  numeric(18,4) not null default 0,
  subtotal        numeric(18,4) not null default 0,
  discount_amount numeric(18,4) not null default 0,
  vat_amount      numeric(18,4) not null default 0,
  total           numeric(18,4) not null default 0,   -- yang dibayar = sebelum PPN + PPN - PPh 23
  notes           text,
  status          text not null default 'pending' check (status in ('pending','approved')),
  revision        int  not null default 0,
  approved_by     uuid references app_users(id),
  approved_at     timestamptz,
  invoice_no      text,
  invoice_date    date,
  fp_no           text,                               -- Faktur Pajak dari supplier
  is_dummy        boolean not null default false,
  created_by      uuid default app_user_id() references app_users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

create table if not exists po_items (
  id          uuid primary key default gen_random_uuid(),
  po_id       uuid not null references purchase_orders(id) on delete cascade,
  line_no     int  not null,
  item_id     uuid references items(id) on delete set null,
  brand text not null, model text not null, compound text, gender text, color text, size text, unit text,
  qty         numeric(18,4) not null check (qty > 0),
  price       numeric(18,4) not null default 0,       -- harga diisi manual
  created_at  timestamptz not null default now()
);
create index if not exists po_items_po on po_items(po_id);

create table if not exists po_payments (
  id         uuid primary key default gen_random_uuid(),
  po_id      uuid not null references purchase_orders(id) on delete cascade,
  pay_date   date not null,
  amount     numeric(18,4) not null check (amount > 0),
  note       text,
  created_by uuid default app_user_id() references app_users(id),
  created_at timestamptz not null default now()
);
create index if not exists po_payments_po on po_payments(po_id);

-- ---------- Goods received (tanpa harga; Good / Defect) ----------
create table if not exists goods_receipts (
  id               uuid primary key default gen_random_uuid(),
  po_id            uuid not null references purchase_orders(id) on delete cascade,
  gr_date          date not null,
  delivery_note_no text not null,
  received_by      text not null,
  created_by       uuid default app_user_id() references app_users(id),
  created_at       timestamptz not null default now()
);
create index if not exists gr_po on goods_receipts(po_id);

create table if not exists gr_items (
  id         uuid primary key default gen_random_uuid(),
  gr_id      uuid not null references goods_receipts(id) on delete cascade,
  po_item_id uuid not null references po_items(id) on delete cascade,
  grade      text not null default 'G' check (grade in ('G','D')),   -- G = Good, D = Defect
  qty        numeric(18,4) not null check (qty > 0),
  created_at timestamptz not null default now()
);
create index if not exists gr_items_gr on gr_items(gr_id);

-- ---------- Delivery Order (No DO manual, terkait PO, tanpa harga) ----------
create table if not exists delivery_orders (
  id uuid primary key default gen_random_uuid(),
  do_number text not null unique,
  do_date date not null,
  client_id uuid not null references clients(id) on delete restrict,
  po_id uuid not null references purchase_orders(id) on delete restrict,
  ship_to text, inv_no text, fp_no text, notes text,
  is_dummy boolean not null default false,
  created_by uuid default app_user_id() references app_users(id),
  created_at timestamptz not null default now()
);
create table if not exists do_items (
  id uuid primary key default gen_random_uuid(),
  do_id uuid not null references delivery_orders(id) on delete cascade,
  line_no int not null,
  po_item_id uuid references po_items(id) on delete set null,
  item_id uuid references items(id) on delete set null,
  brand text, model text, compound text, gender text, color text, size text, unit text,
  grade text not null default 'G' check (grade in ('G','D')),
  qty numeric(18,4) not null check (qty > 0),
  created_at timestamptz not null default now()
);
create index if not exists do_items_do on do_items(do_id);
create index if not exists do_items_poi on do_items(po_item_id);

-- ---------- Riwayat pembelian hasil import (untuk Analisa) ----------
create table if not exists hist_purchases (
  id uuid primary key default gen_random_uuid(),
  tx_date date not null,
  supplier_name text, brand text, model text, compound text, gender text, color text, size text,
  currency text not null default 'IDR',
  qty numeric(18,4) not null default 1, price numeric(18,4) not null,
  invoice_date date, pay_date date,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- Trigger kontrol approval PO
--  * hanya ADMIN (superuser) dan SUPERVISOR yang boleh mengubah status menjadi 'approved'
--  * mengubah isi PO yang sudah approved => otomatis kembali 'pending'
-- =====================================================================
create or replace function po_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.approved_by := null; new.approved_at := null; new.revision := 0;
    new.created_by := coalesce(new.created_by, app_user_id());
    return new;
  end if;
  new.updated_at := now();
  if new.status = 'approved' and old.status <> 'approved' then
    if app_role() not in ('admin','supervisor') then raise exception 'Hanya Admin atau Supervisor yang dapat meng-approve PO'; end if;
    new.approved_by := app_user_id(); new.approved_at := now();
  end if;
  if old.status = 'approved' and new.status = 'approved' and
     (old.po_date, old.supplier_id, old.currency, old.fx_rate, old.payment_type, old.tempo_mode, old.tempo_days, old.tempo_date, old.vat, old.pph23, old.pph23_rate, old.pph23_amount, old.urgent,
      old.discount_type, old.discount_value, old.subtotal, old.discount_amount, old.vat_amount, old.total, old.notes)
     is distinct from
     (new.po_date, new.supplier_id, new.currency, new.fx_rate, new.payment_type, new.tempo_mode, new.tempo_days, new.tempo_date, new.vat, new.pph23, new.pph23_rate, new.pph23_amount, new.urgent,
      new.discount_type, new.discount_value, new.subtotal, new.discount_amount, new.vat_amount, new.total, new.notes) then
    new.status := 'pending'; new.revision := old.revision + 1;
  end if;
  if new.status = 'pending' then new.approved_by := null; new.approved_at := null; end if;
  return new;
end $$;
drop trigger if exists trg_po_guard on purchase_orders;
create trigger trg_po_guard before insert or update on purchase_orders for each row execute function po_guard();

-- perubahan baris item pada PO approved => PO kembali menunggu approval
create or replace function po_items_reset() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update purchase_orders set status = 'pending', revision = revision + 1
   where id = coalesce(new.po_id, old.po_id) and status = 'approved'
     and pg_trigger_depth() = 1;
  return null;
end $$;
drop trigger if exists trg_po_items_reset on po_items;
create trigger trg_po_items_reset after insert or update or delete on po_items for each row execute function po_items_reset();

-- =====================================================================
-- Row Level Security  (baca: sesuai modul; tulis: sesuai role + modul)
-- =====================================================================
do $$ declare t text; begin
  foreach t in array array['app_users','units','currencies','settings','suppliers','items','purchase_orders','po_items','po_payments','goods_receipts','gr_items','hist_purchases','clients','delivery_orders','do_items'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

create or replace function is_active_user() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from app_users where auth_id = auth.uid() and active) $$;
create or replace function can_write() returns boolean
language sql stable security definer set search_path = public as
$$ select app_role() in ('admin','supervisor') $$;
create or replace function can_receive() returns boolean
language sql stable security definer set search_path = public as
$$ select app_role() in ('admin','supervisor','gudang') $$;
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select app_role() = 'admin' $$;

do $$
declare r record;
begin
  for r in select * from (values
    -- tabel,            baca,                                                                          tulis (insert/update/delete)
    ('app_users',       'is_active_user()',                                                              'false'),
    ('units',           'is_active_user()',                                                              'is_admin() and app_has_module(''settings'')'),
    ('currencies',      'is_active_user()',                                                              'is_admin() and app_has_module(''settings'')'),
    ('settings',        'is_active_user()',                                                              'is_admin() and app_has_module(''settings'')'),
    ('suppliers',       'is_active_user()',                                                              'can_write() and app_has_module(''suppliers'')'),
    ('items',           'is_active_user()',                                                              'can_write() and (app_has_module(''items'') or app_has_module(''po''))'),
    ('clients',         'app_has_any(array[''clients'',''do''])',                                        'can_write() and app_has_module(''clients'')'),
    ('purchase_orders', 'app_has_any(array[''po'',''gr'',''do'',''report'',''stock'',''analysis''])',    'can_write() and app_has_module(''po'')'),
    ('po_items',        'app_has_any(array[''po'',''gr'',''do'',''report'',''stock'',''analysis''])',    'can_write() and app_has_module(''po'')'),
    ('po_payments',     'app_has_any(array[''po'',''analysis''])',                                       'can_write() and app_has_module(''po'')'),
    ('goods_receipts',  'app_has_any(array[''po'',''gr'',''do'',''report'',''stock''])',                 'can_receive() and app_has_module(''gr'')'),
    ('gr_items',        'app_has_any(array[''po'',''gr'',''do'',''report'',''stock''])',                 'can_receive() and app_has_module(''gr'')'),
    ('delivery_orders', 'app_has_any(array[''do'',''report'',''stock''])',                               'can_receive() and app_has_module(''do'')'),
    ('do_items',        'app_has_any(array[''do'',''report'',''stock''])',                               'can_receive() and app_has_module(''do'')'),
    ('hist_purchases',  'app_has_module(''analysis'')',                                                  'can_write() and app_has_module(''analysis'')')
  ) as v(tbl, rd, wr) loop
    execute format('drop policy if exists "%1$s_read" on %1$I', r.tbl);
    execute format('create policy "%1$s_read" on %1$I for select to authenticated using (%2$s)', r.tbl, r.rd);
    if r.wr <> 'false' then
      execute format('drop policy if exists "%1$s_write" on %1$I', r.tbl);
      execute format('create policy "%1$s_write" on %1$I for all to authenticated using (%2$s) with check (%2$s)', r.tbl, r.wr);
    end if;
  end loop;
end $$;

-- Admin dapat menghapus data contoh (is_dummy) saat membersihkan data contoh
do $$ declare t text; begin
  foreach t in array array['purchase_orders','suppliers','items','clients','delivery_orders'] loop
    execute format('drop policy if exists "%1$s_delete_dummy" on %1$I', t);
    execute format('create policy "%1$s_delete_dummy" on %1$I for delete to authenticated using (is_dummy and is_admin() and app_has_module(''settings''))', t);
  end loop;
end $$;

-- =====================================================================
-- Fungsi PIN — HANYA bisa dipanggil oleh service_role (Edge Function)
-- =====================================================================
create or replace function verify_pin(p_username text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u app_users; s user_secrets;
begin
  select * into u from app_users where lower(username) = lower(p_username) and active;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select * into s from user_secrets where user_id = u.id;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if s.locked_until is not null and s.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked', 'until', s.locked_until);
  end if;
  if s.pin_hash = crypt(p_pin, s.pin_hash) then
    update user_secrets set failed_attempts = 0, locked_until = null where user_id = u.id;
    return jsonb_build_object('ok', true, 'user_id', u.id);
  end if;
  update user_secrets
     set failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
         locked_until    = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
   where user_id = u.id;
  return jsonb_build_object('ok', false, 'error', 'invalid');
end $$;

create or replace function set_pin(p_user uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_pin !~ '^\d{4}$' then raise exception 'PIN harus 4 digit angka'; end if;
  insert into user_secrets(user_id, pin_hash) values (p_user, crypt(p_pin, gen_salt('bf')))
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null;
end $$;

revoke all on function verify_pin(text, text) from public, anon, authenticated;
revoke all on function set_pin(uuid, text)    from public, anon, authenticated;
grant execute on function verify_pin(text, text) to service_role;
grant execute on function set_pin(uuid, text)    to service_role;
revoke all on function next_po_seq() from public, anon;
grant execute on function next_po_seq() to authenticated;

-- ===== REVISI 002 (digabung dari migration_002.sql) =====
-- =====================================================================
-- MIGRASI 002 (06-Oct-26) — aman dijalankan di database yang sudah berisi data (idempotent)
--  * Divisi + role Finance + kode perusahaan supplier
--  * Nomor PO baru SSBI-DM-MAIN-202610005 (urut per supplier per tahun) + Est Date
--  * Modul Pembayaran (payments, payment_items, banks) yang mengisi po_payments
-- =====================================================================

-- ---------- Divisi ----------
create table if not exists divisions (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);
insert into divisions(code, name) values ('MAIN', 'Main Office') on conflict (code) do nothing;

alter table app_users add column if not exists division_id uuid references divisions(id) on delete restrict;
alter table app_users drop constraint if exists app_users_role_check;
alter table app_users add constraint app_users_role_check check (role in ('admin','supervisor','gudang','finance','viewer'));
update app_users set division_id = (select id from divisions where code = 'MAIN') where role = 'admin' and division_id is null;

-- ---------- Supplier: kode perusahaan ----------
alter table suppliers add column if not exists company_code text;
create unique index if not exists suppliers_company_code_uq on suppliers (upper(company_code)) where company_code is not null;

-- ---------- PO: Est Date + nomor urut per supplier per tahun ----------
alter table purchase_orders add column if not exists est_date date;
alter table purchase_orders drop constraint if exists purchase_orders_po_seq_key;   -- po_seq kini per supplier/tahun, keunikan dijaga po_number

create table if not exists po_counters (
  supplier_id uuid not null references suppliers(id) on delete cascade,
  year        int  not null,
  last        int  not null default 0,
  primary key (supplier_id, year)
);
alter table po_counters enable row level security;   -- tanpa policy: hanya lewat fungsi di bawah

drop function if exists next_po_seq();
create or replace function next_po_seq(p_supplier uuid, p_year int) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not (app_role() in ('admin','supervisor') and app_has_module('po')) then raise exception 'Tidak punya akses membuat PO'; end if;
  insert into po_counters(supplier_id, year, last) values (p_supplier, p_year, 1)
  on conflict (supplier_id, year) do update set last = po_counters.last + 1
  returning last into n;
  return n;
end $$;
revoke all on function next_po_seq(uuid, int) from public, anon;
grant execute on function next_po_seq(uuid, int) to authenticated;

-- ---------- Bank, Pembayaran ----------
create table if not exists banks (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists payments (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete restrict,
  currency    text not null default 'IDR',
  fp_no       text,
  pay_date    date not null,
  amount      numeric(18,4) not null check (amount > 0),
  bank        text not null,
  note        text,
  created_by  uuid default app_user_id() references app_users(id),
  created_at  timestamptz not null default now()
);
create table if not exists payment_items (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid not null references payments(id) on delete cascade,
  gr_item_id  uuid not null references gr_items(id) on delete cascade,
  po_id       uuid not null references purchase_orders(id) on delete cascade,
  amount      numeric(18,4) not null check (amount > 0),
  created_at  timestamptz not null default now()
);
create index if not exists payment_items_pay on payment_items(payment_id);
create index if not exists payment_items_gr on payment_items(gr_item_id);
alter table po_payments add column if not exists payment_id uuid references payments(id) on delete cascade;

-- ---------- Hak akses ----------
create or replace function can_pay() returns boolean
language sql stable security definer set search_path = public as
$$ select app_role() in ('admin','supervisor','finance') $$;

alter table divisions     enable row level security;
alter table banks         enable row level security;
alter table payments      enable row level security;
alter table payment_items enable row level security;

drop policy if exists "divisions_read" on divisions;
create policy "divisions_read" on divisions for select to authenticated using (is_active_user());
drop policy if exists "divisions_write" on divisions;
create policy "divisions_write" on divisions for all to authenticated using (is_admin() and app_has_module('users')) with check (is_admin() and app_has_module('users'));

drop policy if exists "banks_read" on banks;
create policy "banks_read" on banks for select to authenticated using (is_active_user());
drop policy if exists "banks_write" on banks;
create policy "banks_write" on banks for all to authenticated using (is_admin() and app_has_module('settings')) with check (is_admin() and app_has_module('settings'));

drop policy if exists "payments_read" on payments;
create policy "payments_read" on payments for select to authenticated using (app_has_any(array['po','gr','do','payment','report','stock','analysis']));
drop policy if exists "payments_write" on payments;
create policy "payments_write" on payments for all to authenticated using (can_pay() and app_has_module('payment')) with check (can_pay() and app_has_module('payment'));

drop policy if exists "payment_items_read" on payment_items;
create policy "payment_items_read" on payment_items for select to authenticated using (app_has_any(array['po','gr','do','payment','report','stock','analysis']));
drop policy if exists "payment_items_write" on payment_items;
create policy "payment_items_write" on payment_items for all to authenticated using (can_pay() and app_has_module('payment')) with check (can_pay() and app_has_module('payment'));

-- po_payments: kini diisi lewat modul Pembayaran (Finance), bukan dari layar PO
drop policy if exists "po_payments_read" on po_payments;
create policy "po_payments_read" on po_payments for select to authenticated using (app_has_any(array['po','payment','analysis']));
drop policy if exists "po_payments_write" on po_payments;
create policy "po_payments_write" on po_payments for all to authenticated
  using      ((can_write() and app_has_module('po')) or (can_pay() and app_has_module('payment') and payment_id is not null))
  with check ((can_write() and app_has_module('po')) or (can_pay() and app_has_module('payment') and payment_id is not null));

-- pengguna Finance perlu membaca PO / penerimaan
drop policy if exists "purchase_orders_read" on purchase_orders;
create policy "purchase_orders_read" on purchase_orders for select to authenticated using (app_has_any(array['po','gr','do','payment','report','stock','analysis']));
drop policy if exists "po_items_read" on po_items;
create policy "po_items_read" on po_items for select to authenticated using (app_has_any(array['po','gr','do','payment','report','stock','analysis']));
drop policy if exists "goods_receipts_read" on goods_receipts;
create policy "goods_receipts_read" on goods_receipts for select to authenticated using (app_has_any(array['po','gr','do','payment','report','stock']));
drop policy if exists "gr_items_read" on gr_items;
create policy "gr_items_read" on gr_items for select to authenticated using (app_has_any(array['po','gr','do','payment','report','stock']));

-- Admin boleh membersihkan data contoh (payments milik supplier contoh dihapus lewat policy payments_write)
