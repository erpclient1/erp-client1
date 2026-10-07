# ERP Pembelian (Web)

Aplikasi web responsif (desktop / laptop / HP) untuk perdagangan sepatu: Master Item (varian), Supplier, Client, Purchase Order (approval Supervisor),
Goods Received (Good/Defect), Delivery Order, Report, Stock, Analisa, Management User, dan Pengaturan.

- Frontend: HTML/CSS/JS murni (tanpa build). Cocok di-host di **GitHub Pages**.
- Backend: **Supabase** (PostgreSQL + Row Level Security + 2 Edge Function untuk login PIN & kelola user).
- Tanggal selalu `DD-MMM-YY`. Login: username + PIN 4 digit. Mode terang/gelap.

## 1. Coba dulu tanpa Supabase (Mode DEMO)

Biarkan `js/config.js` kosong, lalu jalankan server statis, misalnya:

```bash
python -m http.server 8765
```

Buka <http://127.0.0.1:8765>. Data tersimpan di browser. Akun demo: `admin/1111`, `spv/2222`, `gudang/3333`, `viewer/4444`.
Di menu **Pengaturan** ada tombol *Muat data contoh* / *Hapus data contoh*.

## 1b. Server lokal di PC sendiri (data terpusat, tanpa daftar akun apa pun)

Cocok untuk trial atau kantor kecil. Butuh **Node.js 22.13 atau lebih baru** (gratis, nodejs.org; tanpa akun).

1. Klik dua kali `start-server.bat` (atau `node server/server.js`).
2. Pertama kali jalan, jendela menampilkan **PIN admin acak** (username `admin`). Catat, lalu ganti di menu Pengguna.
3. Buka `http://localhost:8080` di PC itu, atau alamat `http://192.168.x.x:8080` yang tertera di jendela dari HP/laptop lain yang satu WiFi.
4. Data tersimpan di `server/data/erp.db`; salinan harian otomatis di `server/data/backup/` (30 hari terakhir). Backup manual: menu Pengaturan > *Unduh backup (JSON)*. Untuk memindahkan data, salin folder `server/data`.

**Akses dari internet (gratis, tanpa akun)** memakai Cloudflare Quick Tunnel: unduh `cloudflared` untuk Windows dari <https://github.com/cloudflare/cloudflared/releases> (file `cloudflared-windows-amd64.exe`), lalu jalankan:

```bash
cloudflared-windows-amd64.exe tunnel --url http://localhost:8080
```

Alamat `https://....trycloudflare.com` yang muncul bisa dibuka dari mana saja. Alamat berubah setiap kali dijalankan ulang dan layanan ini untuk uji coba (tanpa jaminan uptime). PC harus tetap menyala dan tidak sleep (Pengaturan Windows > Power & sleep > Never).

Aturan keamanan sama dengan versi Supabase, tetapi ditegakkan oleh server ini: hak akses per role/modul, approval PO hanya Admin/Supervisor, PIN ter-hash (scrypt), kunci 15 menit setelah 5x salah. Lewat WiFi kantor tanpa HTTPS, PIN terkirim tanpa enkripsi; lewat tunnel Cloudflare sudah HTTPS.

## 2. Pasang Supabase (data terpusat)

1. Buat proyek di <https://supabase.com> (region terdekat, mis. Singapore).
2. **SQL Editor** > New query > tempel seluruh isi `supabase/schema.sql` > Run. (Database yang sudah berjalan: jalankan migrasi yang belum dipakai, `supabase/migration_002.sql` lalu `supabase/migration_003.sql`.) (Jika skema versi lama pernah dijalankan: jalankan dulu `supabase/reset_dev.sql`, yang menghapus data bisnis.)
3. **Edge Functions**: deploy `pin-login` dan `admin-users` (isi dari folder `supabase/functions/...`).
   - Lewat CLI: `supabase login`, `supabase link --project-ref <ref>`, `supabase functions deploy pin-login` dan `supabase functions deploy admin-users`.
   - Atau lewat dashboard: Edge Functions > Deploy a new function > tempel kode `index.ts`.
4. Set **secrets** (Edge Functions > Secrets, atau `supabase secrets set`):
   - `PIN_LOGIN_SECRET` = teks acak panjang (≥ 32 karakter). **Jangan diubah setelah ada user**, kalau diubah semua user tidak bisa login.
   - `BOOTSTRAP_KEY` = teks acak sementara, hanya untuk membuat Admin pertama.
5. Buat **Admin pertama** (sekali saja; ganti nilai dalam `< >`):

   ```bash
   curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/admin-users" \
     -H "Authorization: Bearer <ANON_KEY>" -H "apikey: <ANON_KEY>" -H "Content-Type: application/json" \
     -d '{"action":"bootstrap","key":"<BOOTSTRAP_KEY>","username":"admin","full_name":"Nama Anda","pin":"1234"}'
   ```
   Setelah itu hapus secret `BOOTSTRAP_KEY` (bootstrap otomatis tertutup bila sudah ada user).
6. Isi `js/config.js` dengan **Project URL** dan **anon (publishable) key** (Project Settings > API).
   Jangan pernah menaruh *service_role key* di repo.
7. Login sebagai admin, tambah user lain di menu **Pengguna**, isi data perusahaan di **Pengaturan**.

## 3. Publikasi ke GitHub Pages

1. Buat repo GitHub (publik), unggah isi folder ini (kecuali `.claude/`).
2. Settings > Pages > Source: *Deploy from a branch* > `main` / root.
3. Alamat web: `https://<username>.github.io/<repo>/`. Update aplikasi = push ke repo.

> Repo publik berarti **kode** terlihat publik. **Data** tetap aman di Supabase karena dilindungi RLS dan login PIN.

## Hak akses

| Role | Kemampuan |
|---|---|
| Admin (superuser) | Semua fungsi: kelola Supplier, Item, Client, PO (buat/edit), invoice & pembayaran, penerimaan barang, DO, user, pengaturan, dan **approve PO**. |
| Supervisor | Kelola data/PO dan **approve PO** (tanpa kelola user dan pengaturan). |
| Gudang | Input penerimaan barang (Goods Received) dan buat Delivery Order. |
| Finance | Modul **Pembayaran**: input FP dan pembayaran supplier; melihat PO, Goods Received, Supplier. |
| Viewer | Hanya melihat. |

Modul yang tampil bisa diatur per user. Aturan ditegakkan di database (RLS + trigger), bukan hanya di tampilan.

## Aturan bisnis penting

- **Urutan menu:** Master Item, Supplier, Client, Purchase Order, Goods Received, Delivery Order, Report, Stock, Analisa (+ Pengguna, Pengaturan untuk Admin).
- **Master Item:** Brand, Model Name, Compound Name, Gender (GS/Man/Woman/INF/PS/JR/KID), Colour, Size (3T … 15), Satuan (PRS/KG). Tidak ada harga di master; kombinasi varian harus unik.
- **PO:** kolom No, Brand, Model, Compound, Gender, Color, Size, Qty, Satuan, Harga (harga diisi manual), plus **Est Date** (estimasi barang datang).
  - **No PO diisi manual** (harus unik; contoh `SSBI-DM-MAIN-202610005`). Bisa diedit dan semua modul yang terhubung (Goods Received, DO, Pembayaran, Report, Stock) langsung menampilkan nomor terbaru.
  - Total dibayar = (subtotal − diskon) + PPN 11% (opsional) − **PPh 23** (opsional, default 2% dari total sebelum PPN).
  - **Rate**: untuk PO mata uang asing isi rate → kolom *Harga IDR* dan *Jumlah IDR* muncul terpisah.
  - PO baru / PO yang diedit → **Menunggu Approval** sampai Admin/Supervisor menyetujui. Section: *PO Aktif* → *Barang Diterima Semua* → *PO Selesai* (diterima semua **dan** lunas).
  - Pembayaran **tidak** diinput dari PO; diisi lewat modul Pembayaran. Setiap PO punya tombol **Export Excel**.
- **Goods Received:** hanya PO yang sudah di-approve; penerimaan boleh sebagian, dicatat **Good (G)** dan **Defect (D)**; tanpa harga. Setiap surat jalan bisa **direvisi** (jumlah/No SJ/tanggal/penerima) atau **dihapus** (barang dianggap belum diterima); PO, Report, Stock, dan Pembayaran ikut menyesuaikan. Penerimaan ditolak diubah/dihapus bila akan membuat jumlah lebih kecil dari yang sudah dikirim lewat DO atau yang sudah dibayar.
- **Delivery Order:** **No DO diketik manual** (harus unik), client dari Database Client, **terkait satu PO** (barang yang boleh dikirim = hasil penerimaan PO itu, per G/D), tanpa harga. No Invoice & No FP ke client bisa diisi saat membuat atau sesudahnya.
- **Pembayaran (Finance):** pilih supplier → daftar barang yang sudah diterima per surat jalan (G/D) dengan harga dari PO → centang → **Input FP & Pembayaran** (No Faktur Pajak, **No Invoice**, Tanggal, Jumlah, Bank Asal, Catatan). Nilai bayar per baris = qty × harga × (total PO ÷ subtotal PO) (diskon, PPN, PPh 23 proporsional). Jumlah boleh sebagian (dibagi proporsional). Setelah disimpan, pembayaran otomatis tercatat di PO terkait; tiap baris berstatus Belum / Sebagian / Lunas. Daftar bank dikelola di Pengaturan.
- **Report:** satu baris = satu varian pada satu PO (per G/D): Qty PO, Qty Diterima, **Kurang** (Qty PO − Good − Defect), Qty Out (lewat DO), **Balance** = Qty Diterima − Qty Out.
- **Stock:** barang yang sudah diterima lewat Goods Received: Qty In, Qty Out (DO), **Balance = stok di tangan**; tab *Ringkasan per varian* menjumlahkan semua PO.
- Analisa: dari PO berstatus Approved (+ riwayat import Excel), dipisah per mata uang, per varian. Fluktuasi = (tertinggi − terendah) ÷ terendah.
- PIN salah 5x → akun terkunci 15 menit.

## Struktur

```
index.html            halaman tunggal
css/style.css         tampilan (desktop + HP, terang/gelap)
js/config.js          URL & anon key Supabase (kosong = mode demo)
js/util.js            helper (format tanggal, ikon, modal, tabel, Excel, print)
js/db.js              lapisan data: adapter demo (browser), server lokal, dan Supabase (dipilih otomatis)
server/server.js      server lokal Node + SQLite (opsional)
start-server.bat      menjalankan server lokal di Windows
js/app.js             login PIN, layout, router, hak akses
js/mod-*.js           modul: items, suppliers, clients, po, gr, do, payment, report (+stock), analysis, admin (user, divisi, pengaturan)
supabase/schema.sql   tabel, RLS, trigger approval, fungsi PIN (sudah memuat revisi 002)
supabase/migration_002.sql  migrasi untuk database yang sudah berjalan (divisi, pembayaran, nomor PO baru)
supabase/functions/   pin-login, admin-users
```

## Sales Order & Report Balance (07-Oct-26)
- **Sales Order** (modul `so`): order dari client, bentuknya seperti PO (No SO manual, client, mata uang & pembayaran mengikuti data client, PPN, diskon, URGENT, approval Admin/Supervisor, edit → approval ulang). Kolom item: No – Brand – Model – Compound – Gender – Color – Size – Est Date – ETD – XFD – Qty – Satuan – Harga – Jumlah.
- **Link ke PO:** kolom **No Order** pada baris PO bisa diketik manual atau dipilih dari daftar Sales Order. Hubungan SO ↔ PO = No Order sama dengan No SO + item master yang sama. SO yang sudah dipakai di PO tidak bisa dihapus / diganti nomornya.
- **Stock:** tab baru *Rincian per SO*; tiap baris di 3 tab punya tombol export format **Report Balance** (kolom ukuran 1, 1T … 20, 20T = qty diterima, Total, balance), plus tombol export Report Balance untuk seluruh isi tab. TYPE = SALES bila No Order cocok dengan sebuah SO, selain itu SHTG.
- Database: jalankan `supabase/migration_006.sql` (sudah dijalankan di proyek live). Edge Function `admin-users` perlu di-deploy ulang (daftar modul bertambah `so`).

- **Import Excel (07-Oct-26):** Master Item, Supplier, Client (sudah ada) dan **Purchase Order** (tombol Import + Unduh template di daftar PO). Import PO: satu baris Excel = satu item; baris dengan No PO sama digabung; supplier & item harus sudah ada di database; PO bermasalah dilewati dengan alasan; hasil berstatus Menunggu Approval.
- **Import SO:** tombol Import + Unduh template di daftar Sales Order (client harus sudah ada; cara kerja sama dengan import PO).
