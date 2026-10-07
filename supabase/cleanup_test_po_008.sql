-- =====================================================================
-- Pembersihan entri test: PO "PO 008 / X / 2026" (format lama, dibuat sebelum modul Pembayaran ada)
-- LANGKAH 1: jalankan bagian PRATINJAU dulu dan pastikan isinya memang entri test.
-- LANGKAH 2: jalankan bagian HAPUS (dihapus berurutan: DO -> PO; penerimaan, item dan pembayaran lama ikut terhapus).
-- =====================================================================

-- ---------- PRATINJAU ----------
select p.po_number, p.po_date, p.status, p.total, p.currency,
       (select count(*) from po_items i where i.po_id = p.id)                                   as baris_item,
       (select count(*) from goods_receipts g where g.po_id = p.id)                             as penerimaan,
       (select count(*) from delivery_orders d where d.po_id = p.id)                            as delivery_order,
       (select count(*) from po_payments x where x.po_id = p.id)                                as pembayaran_lama_di_po,
       (select count(*) from po_payments x where x.po_id = p.id and x.payment_id is not null)   as pembayaran_via_modul,
       (select count(*) from payment_items pi where pi.po_id = p.id)                            as payment_items
  from purchase_orders p
 where p.po_number = 'PO 008 / X / 2026';

-- ---------- HAPUS (jalankan setelah pratinjau sesuai) ----------
-- delete from delivery_orders where po_id in (select id from purchase_orders where po_number = 'PO 008 / X / 2026');
-- delete from purchase_orders where po_number = 'PO 008 / X / 2026';
