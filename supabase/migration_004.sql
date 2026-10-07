-- =====================================================================
-- MIGRASI 004 (07-Oct-26) — aman dijalankan di database yang sudah berisi data (idempotent)
--  * Pembayaran bisa dibayar dalam mata uang berbeda dari mata uang PO (USD/IDR) dengan kurs
--    payments.currency / payments.amount tetap = nilai setara dalam mata uang PO (dipakai untuk status PO)
--    pay_currency / pay_amount / pay_rate = yang benar-benar dibayarkan
-- =====================================================================
alter table payments add column if not exists pay_currency text;
alter table payments add column if not exists pay_amount   numeric(18,4);
alter table payments add column if not exists pay_rate     numeric(18,6);   -- IDR per 1 mata uang asing
