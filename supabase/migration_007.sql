-- =====================================================================
-- MIGRASI 007 (08-Oct-26) — Sales Order mengikuti template PO: PPh 23, tempo tanggal, No Order per baris
-- =====================================================================
alter table sales_orders add column if not exists tempo_date date;
alter table sales_orders add column if not exists pph23 boolean not null default false;
alter table sales_orders add column if not exists pph23_rate numeric(8,4);
alter table sales_orders add column if not exists pph23_amount numeric(18,4) not null default 0;
alter table so_items add column if not exists order_no text;

create or replace function so_guard() returns trigger language plpgsql security definer set search_path = public as $f$
begin
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.approved_by := null; new.approved_at := null; new.revision := 0; new.created_by := coalesce(new.created_by, app_user_id()); return new;
  end if;
  new.updated_at := now();
  if new.status = 'approved' and old.status <> 'approved' then
    if app_role() not in ('admin','supervisor') then raise exception 'Hanya Admin atau Supervisor yang dapat meng-approve Sales Order'; end if;
    new.approved_by := app_user_id(); new.approved_at := now();
  end if;
  if old.status = 'approved' and new.status = 'approved' and
     (old.so_date, old.client_id, old.currency, old.fx_rate, old.payment_type, old.tempo_mode, old.tempo_days, old.tempo_date, old.vat, old.pph23, old.pph23_rate, old.pph23_amount, old.urgent, old.discount_type, old.discount_value, old.subtotal, old.discount_amount, old.vat_amount, old.total, old.notes)
     is distinct from
     (new.so_date, new.client_id, new.currency, new.fx_rate, new.payment_type, new.tempo_mode, new.tempo_days, new.tempo_date, new.vat, new.pph23, new.pph23_rate, new.pph23_amount, new.urgent, new.discount_type, new.discount_value, new.subtotal, new.discount_amount, new.vat_amount, new.total, new.notes) then
    new.status := 'pending'; new.revision := old.revision + 1;
  end if;
  if new.status = 'pending' then new.approved_by := null; new.approved_at := null; end if;
  return new;
end $f$;
