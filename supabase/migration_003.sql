-- =====================================================================
-- MIGRASI 003 (06-Oct-26) — aman dijalankan di database yang sudah berisi data (idempotent)
--  * No PO diisi manual (po_seq tidak lagi wajib)
--  * No Invoice pada pembayaran
--  * Penerimaan (Goods Received) yang sudah dibayar tidak bisa dihapus/dikurangi diam-diam
--  * Koreksi atribut item pada baris PO tidak mereset approval PO
-- =====================================================================

alter table purchase_orders alter column po_seq drop not null;

alter table payments add column if not exists invoice_no text;

-- baris penerimaan yang sudah dibayar: penghapusan ditolak oleh database (sebelumnya ikut terhapus diam-diam)
alter table payment_items drop constraint if exists payment_items_gr_item_id_fkey;
alter table payment_items add constraint payment_items_gr_item_id_fkey
  foreign key (gr_item_id) references gr_items(id) on delete restrict;

-- hanya perubahan qty / harga / item yang mengembalikan PO ke "Menunggu Approval"
create or replace function po_items_reset() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and new.qty     is not distinct from old.qty
     and new.price   is not distinct from old.price
     and new.item_id is not distinct from old.item_id
     and new.po_id   is not distinct from old.po_id then
    return null;
  end if;
  update purchase_orders set status = 'pending', revision = revision + 1
   where id = coalesce(new.po_id, old.po_id) and status = 'approved'
     and pg_trigger_depth() = 1;
  return null;
end $$;
