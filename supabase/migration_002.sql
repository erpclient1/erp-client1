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
