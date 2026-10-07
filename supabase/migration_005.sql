-- =====================================================================
-- MIGRASI 005 (07-Oct-26) — aman dijalankan di database yang sudah berisi data (idempotent)
--  * PO: "No Order Customer" (header). Est Date pindah ke tiap baris item, plus "No Order" per baris.
--    purchase_orders.est_date tetap ada = Est Date terdekat dari baris item (dipakai daftar PO / Goods Received).
-- =====================================================================
alter table purchase_orders add column if not exists customer_order_no text;
alter table po_items add column if not exists order_no text;
alter table po_items add column if not exists est_date date;
-- PO lama: salin Est Date header ke tiap baris item yang masih kosong
update po_items i set est_date = p.est_date from purchase_orders p where p.id = i.po_id and i.est_date is null and p.est_date is not null;
