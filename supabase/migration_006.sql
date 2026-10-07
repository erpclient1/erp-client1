-- =====================================================================
-- MIGRASI 006 (07-Oct-26) — SALES ORDER (order dari client) — aman dijalankan ulang (idempotent)
--  * tabel sales_orders + so_items, trigger approval (seperti PO), RLS, realtime
--  * modul 'so' ditambahkan ke user Admin / Supervisor / Viewer yang sudah ada
--  * Link ke PO: po_items.order_no diisi No SO (manual atau pilih dari daftar SO)
-- =====================================================================
create table if not exists sales_orders (
  id              uuid primary key default gen_random_uuid(),
  so_number       text not null unique,                -- diisi manual
  so_date         date not null,
  client_id       uuid not null references clients(id) on delete restrict,
  currency        text not null default 'IDR',
  fx_rate         numeric(18,4),
  payment_type    text not null default 'cash' check (payment_type in ('cash','tempo')),
  tempo_mode      text,
  tempo_days      int,
  vat             boolean not null default false,
  urgent          boolean not null default false,
  discount_type   text not null default 'pct' check (discount_type in ('pct','amt')),
  discount_value  numeric(18,4) not null default 0,
  subtotal        numeric(18,4) not null default 0,
  discount_amount numeric(18,4) not null default 0,
  vat_amount      numeric(18,4) not null default 0,
  total           numeric(18,4) not null default 0,
  notes           text,
  status          text not null default 'pending' check (status in ('pending','approved')),
  revision        int  not null default 0,
  approved_by     uuid references app_users(id),
  approved_at     timestamptz,
  is_dummy        boolean not null default false,
  created_by      uuid default app_user_id() references app_users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

create table if not exists so_items (
  id         uuid primary key default gen_random_uuid(),
  so_id      uuid not null references sales_orders(id) on delete cascade,
  line_no    int  not null,
  item_id    uuid references items(id) on delete set null,
  brand text not null, model text not null, compound text, gender text, color text, size text, unit text,
  est_date   date,
  etd        date,
  xfd        date,
  qty        numeric(18,4) not null check (qty > 0),
  price      numeric(18,4) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists so_items_so on so_items(so_id);

-- approval: hanya Admin / Supervisor; mengubah isi SO yang sudah approved => kembali 'pending'
create or replace function so_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.approved_by := null; new.approved_at := null; new.revision := 0;
    new.created_by := coalesce(new.created_by, app_user_id());
    return new;
  end if;
  new.updated_at := now();
  if new.status = 'approved' and old.status <> 'approved' then
    if app_role() not in ('admin','supervisor') then raise exception 'Hanya Admin atau Supervisor yang dapat meng-approve Sales Order'; end if;
    new.approved_by := app_user_id(); new.approved_at := now();
  end if;
  if old.status = 'approved' and new.status = 'approved' and
     (old.so_date, old.client_id, old.currency, old.fx_rate, old.payment_type, old.tempo_mode, old.tempo_days, old.vat, old.urgent,
      old.discount_type, old.discount_value, old.subtotal, old.discount_amount, old.vat_amount, old.total, old.notes)
     is distinct from
     (new.so_date, new.client_id, new.currency, new.fx_rate, new.payment_type, new.tempo_mode, new.tempo_days, new.vat, new.urgent,
      new.discount_type, new.discount_value, new.subtotal, new.discount_amount, new.vat_amount, new.total, new.notes) then
    new.status := 'pending'; new.revision := old.revision + 1;
  end if;
  if new.status = 'pending' then new.approved_by := null; new.approved_at := null; end if;
  return new;
end $$;
drop trigger if exists trg_so_guard on sales_orders;
create trigger trg_so_guard before insert or update on sales_orders for each row execute function so_guard();

create or replace function so_items_reset() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and new.qty     is not distinct from old.qty
     and new.price   is not distinct from old.price
     and new.item_id is not distinct from old.item_id
     and new.so_id   is not distinct from old.so_id then
    return null;
  end if;
  update sales_orders set status = 'pending', revision = revision + 1
   where id = coalesce(new.so_id, old.so_id) and status = 'approved'
     and pg_trigger_depth() = 1;
  return null;
end $$;
drop trigger if exists trg_so_items_reset on so_items;
create trigger trg_so_items_reset after insert or update or delete on so_items for each row execute function so_items_reset();

-- RLS
alter table sales_orders enable row level security;
alter table so_items     enable row level security;
drop policy if exists "sales_orders_read" on sales_orders;
create policy "sales_orders_read" on sales_orders for select to authenticated using (app_has_any(array['so','po','gr','do','report','stock','analysis']));
drop policy if exists "sales_orders_write" on sales_orders;
create policy "sales_orders_write" on sales_orders for all to authenticated using (can_write() and app_has_module('so')) with check (can_write() and app_has_module('so'));
drop policy if exists "so_items_read" on so_items;
create policy "so_items_read" on so_items for select to authenticated using (app_has_any(array['so','po','gr','do','report','stock','analysis']));
drop policy if exists "so_items_write" on so_items;
create policy "so_items_write" on so_items for all to authenticated using (can_write() and app_has_module('so')) with check (can_write() and app_has_module('so'));

-- clients dibaca juga oleh modul Sales Order
drop policy if exists "clients_read" on clients;
create policy "clients_read" on clients for select to authenticated using (app_has_any(array['clients','do','so']));

-- Admin boleh menghapus data contoh
drop policy if exists "sales_orders_delete_dummy" on sales_orders;
create policy "sales_orders_delete_dummy" on sales_orders for delete to authenticated using (is_dummy and is_admin() and app_has_module('settings'));

-- Realtime
do $$ declare t text; begin
  foreach t in array array['sales_orders','so_items'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- modul 'so' untuk user yang sudah ada
update app_users set modules = array_append(modules, 'so')
 where role in ('admin','supervisor','viewer') and not ('so' = any(modules));
