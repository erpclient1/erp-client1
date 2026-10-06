-- Hanya untuk tahap pengembangan: menghapus SEMUA data bisnis (supplier, item, client, PO, GR, DO, riwayat)
-- agar skema.sql versi terbaru bisa dipasang bersih. Tabel pengguna (app_users, user_secrets) TIDAK dihapus.
drop table if exists do_items, delivery_orders, gr_items, goods_receipts, po_payments, po_items, purchase_orders,
  hist_purchases, items, clients, suppliers cascade;
drop function if exists next_do_seq();
drop function if exists gr_stock() cascade;
drop function if exists do_stock() cascade;
drop sequence if exists do_seq;
delete from units;
