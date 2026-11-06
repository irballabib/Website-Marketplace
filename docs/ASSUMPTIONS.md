# Asumsi dan Keputusan Desain

Dokumen ini mencatat asumsi yang belum diatur eksplisit di `AGENTS.md`. Jika ada konflik, `AGENTS.md` tetap menjadi acuan.

## Identitas dan Autentikasi

- **Login single-tenant**: aplikasi tahap awal hanya melayani satu tenant. Login memakai email + password tanpa pemilih tenant. Saat multi-tenant diaktifkan, `tenantCode` harus ditambahkan ke request login dan lookup user wajib difilter per tenant.
- **Email unik per tenant** (sesuai schema). Karena belum ada pemilih tenant, praktiknya email harus unik secara global selama fase single-seller.
- **Refresh token opaque**: token acak 384-bit, disimpan sebagai hash SHA-256 di `sessions.refresh_token_hash`, dikirim lewat cookie `httpOnly` dengan path `/api/v1/auth`.
- **Rotasi refresh token**: setiap refresh mencabut sesi lama dan membuat sesi baru. Pemakaian ulang token lama ditolak. Deteksi pencurian token (mencabut seluruh family sesi) belum diterapkan.
- **Logout tidak mencabut access token** yang sudah terbit; access token tetap berlaku sampai TTL (default 15 menit). Denylist access token belum diperlukan pada tahap ini.
- **2FA** untuk admin/akuntan belum ditegakkan. Kolom `two_factor_enabled`/`two_factor_secret` sudah tersedia dan akan diaktifkan pada fase hardening.
- **RBAC** dicek di guard berdasarkan role/permission terbaru dari database pada setiap request, bukan hanya dari isi JWT.

## Pengujian

- Test integrasi (`stock.service.spec.ts`, `auth.service.spec.ts`, `auth.http.spec.ts`, `catalog.http.spec.ts` termasuk unggah media, `payment.http.spec.ts`, `payment.gateway.spec.ts`, `order.http.spec.ts`, `qr.http.spec.ts`, `pos.http.spec.ts`, `accounting.http.spec.ts`) memakai `DATABASE_URL` yang sedang aktif dan otomatis di-`skip` bila variabel tersebut tidak diisi. Jalankan `pnpm test` dengan `DATABASE_URL` untuk memverifikasi invariant stok, sesi, media, pembayaran, pesanan, QR, POS, dan akuntansi.
- Test media memakai direktori sementara untuk `STORAGE_LOCAL_PATH` dan menghapusnya setelah suite selesai, sehingga tidak meninggalkan file di folder `storage/` aplikasi.
- Database uji harus sudah dimigrasi (`prisma migrate deploy`) dan boleh berisi data seed; test membuat lalu membersihkan tenant-nya sendiri.
- `apps/api/vitest.config.mts` mentranspilasi TypeScript dengan `emitDecoratorMetadata` sebelum esbuild. Tanpa ini, DI NestJS tidak bisa me-resolve constructor pada test HTTP karena esbuild tidak meng-emit `design:paramtypes`.
- `next build` untuk `apps/web` melewati lint internal Next (`eslint.ignoreDuringBuilds`) karena konfigurasi ESLint type-aware bersama menghasilkan false positive di build. Lint tetap dijalankan sebagai task terpisah melalui `pnpm lint`.

## Stok

- `StockBalance` adalah cache turunan dari `StockLedger`; keduanya diubah dalam satu transaksi dengan row lock `SELECT ... FOR UPDATE`.
- Reservation tidak mengubah `qty_on_hand`; commit mengurangi on-hand dan reservation sekaligus. Constraint database menjaga nilai tidak negatif dan `qty_reserved <= qty_on_hand`.

## Katalog

- **Resolusi tenant publik**: endpoint `GET /catalog/*` memakai header opsional `X-Tenant-Code`. Bila tidak dikirim, katalog memakai tenant aktif pertama (urut `created_at`). Admin memakai `tenantId` dari access token.
- **Paginasi kursor**: produk diurutkan `created_at DESC, id DESC`, `limit` default 20 dan maksimal 50, kursor adalah UUID v7 produk terakhir di halaman. Respons `{ data, nextCursor }`.
- **Unik**: `slug` produk unik per tenant; `sku` dan `barcode` unik global sesuai schema. Nilai milik baris yang sudah soft-delete tetap memesan keunikan sampai baris dihapus permanen.
- **Soft delete produk** menandai produk dan semua varian non-deleted dalam satu transaksi. Riwayat `StockLedger` tidak diubah karena bersifat append-only.
- **Uang dan berat** diterima sebagai string, divalidasi dengan `decimal.js`, dan dikembalikan dengan format tetap: harga 2 desimal, berat 3 desimal.
- **Media produk**: unggah/hapus gambar admin tersedia di `POST /api/v1/admin/catalog/products/:id/media` (multipart, field `file`, opsional `alt`, `isPrimary`, `sortOrder`) dan `DELETE /api/v1/admin/catalog/products/:productId/media/:mediaId`.
- **Penyimpanan media lokal**: adapter default `STORAGE_ADAPTER=mock` menulis file ke `<STORAGE_LOCAL_PATH>/catalog/<tenantId>/<uuid>.<ext>` dan API menyajikannya di `/uploads/catalog/...`. URL yang disimpan di `ProductMedia.url` bersifat relatif terhadap origin API, sehingga klien web/POS harus menambahkan base URL API saat menampilkan gambar.
- **Batasan media**: maksimal 5 MB; format JPEG, PNG, WebP, atau AVIF; MIME dan magic bytes divalidasi; nama file selalu dibuat server (nama dari klien tidak dipakai). Gambar pertama otomatis menjadi `isPrimary`; unggahan dengan `isPrimary=true` menurunkan primer lama; menghapus gambar primer mempromosikan gambar berikutnya.
- **Adapter MinIO belum diimplementasikan**: `STORAGE_ADAPTER=minio` akan gagal saat startup dengan pesan yang jelas. Adapter MinIO, audit log media, dan pembersihan file saat produk di-soft-delete masih ditunda.
- **Kategori** hanya tersedia untuk dibaca publik. CRUD kategori admin belum termasuk dalam task CRUD produk/varian ini.
- **Lokasi & stok publik**: `GET /catalog/locations/:code` mengembalikan lokasi aktif; `GET /catalog/products/:slug?locationCode=...` menambahkan `stockAvailable` per varian (qty on-hand minus reserved) untuk lokasi tersebut.
- **QR short-link**: `POST /api/v1/admin/qr` membuat QR untuk `locationCode`, `productSlug`, atau `targetUrl` path lokal; `GET /api/v1/qr/:code` adalah resolver publik; `GET /api/v1/admin/qr/:code/image?format=png|svg` mengunduh gambar. Base URL memakai `QR_BASE_URL` (default `http://localhost:3000`). Admin memakai izin `catalog.product.manage`.
- **UI katalog web**: `/` (daftar + cari/filter), `/produk/[slug]` (detail + pilih warna/ukuran + stok per lokasi), `/c/[code]` (katalog konteks lokasi QR), dan `/q/[code]` (redirect short-link). Halaman memakai SSR dinamis dan API lokal.
- **Design system web**: `design-system/cutbray/MASTER.md` dihasilkan UI UX Pro Max, lalu di-override sesuai permintaan: marketplace **Bale Store** dengan palet ala Tokopedia (primary `#047A0A`, aksen `#EA580C`, background `#FAFAFA`, border `#E5E7EB`) dan font **Open Sans**. Primary digelapkan dari `#028A0B` agar teks hijau di atas background terang lolos kontras WCAG AA. Nama produk/lini "Cutbray Classic" dan nama paket internal `@cutbray/*` tetap dipertahankan.
- **Keranjang & checkout**: keranjang tamu disimpan lokal di `localStorage` lewat Zustand (`cutbray-cart-v1`), halaman `/keranjang` dan `/checkout`, lalu `POST /orders` + `POST /payments/order/:id`. Jika Midtrans mengembalikan `redirectUrl`, browser diarahkan ke Snap; jika mock, pengguna diarahkan ke `/pesanan/[id]` dan bisa memakai tombol simulasi dev.
  - Item keranjang menyimpan `locationId` opsional dari halaman produk yang dibuka lewat QR lokasi. Checkout mengirim `locationId` itu agar reservasi stok memakai lokasi toko/bazar yang benar; keranjang dengan lebih dari satu lokasi ditolak dan harus dipecah per pesanan.
  - `shortcut:` ongkir masih flat Rp20.000 untuk `SHIP`; ganti dengan adapter Biteship saat ongkir nyata diaktifkan.
- **Validasi ID order**: `variantId`/`locationId` diperlakukan sebagai string opaque karena data seed lama tidak selalu lolos format UUID ketat. ID baru tetap UUID v7.
- **Audit log** untuk perubahan produk/harga belum ditulis pada task ini; akan ditambahkan bersama modul audit pada fase hardening.

## Pembayaran

- **Model `Payment`** ditambahkan lewat migrasi `20261023093417_add_payment_model`; kolom `snap_token` dan `redirect_url` ditambahkan lewat `20261023095622_add_payment_snap_fields`. `order_id` dan `booking_id` masih berupa string opsional tanpa foreign key.
- **Adapter**: `PAYMENT_ADAPTER=mock` (default) membuat charge `PENDING` dengan referensi `MOCK-...`. `PAYMENT_ADAPTER=midtrans` memanggil Snap API sandbox (`https://api.sandbox.midtrans.com/snap/v1/transactions`) memakai `MIDTRANS_SERVER_KEY` dan `MIDTRANS_IS_PRODUCTION=false`; hasil `token` dan `redirect_url` disimpan di payment.
- **Signature webhook**: adapter mock memakai HMAC-SHA256 dari `orderId:status:gatewayReference:amount:statusCode` dengan `PAYMENT_MOCK_SECRET` (default `dev-mock-payment-secret`). Midtrans memakai SHA512 `order_id + status_code + gross_amount + server_key`.
- **Idempotensi**: create payment memakai `Payment.idempotencyKey` unik per tenant dari header `Idempotency-Key`. Webhook memakai tabel `IdempotencyKey` dengan scope `payment.webhook`, id hash `gatewayReference:orderId:status`, dan TTL 30 hari. Webhook ganda mengembalikan `updated: false` tanpa efek kedua.
- **Status**: `PENDING -> PAID | FAILED | EXPIRED`; status terminal. Transisi lain ditolak dengan 409.
- **Endpoint**: `POST /api/v1/payments` (`order.manage`), `GET /api/v1/payments/:id` (`order.view`), `POST /api/v1/payments/order/:orderId` (publik, membuat/mengulang pembayaran order), `POST /api/v1/payments/webhook/midtrans` (publik, signature wajib), dan `POST /api/v1/dev/payments/simulate` (publik, hanya `NODE_ENV=development`, mendukung mock dan Midtrans).
- **Midtrans lokal**: Midtrans tidak dapat memanggil webhook ke localhost. Untuk development gunakan endpoint simulate; untuk sandbox end-to-end, arahkan notifikasi ke URL publik/tunnel (di luar lingkup localhost). Signature tetap diverifikasi.
- **Integrasi order**: webhook `PAID` memanggil `OrderService.markPaid`, mengubah order `PENDING_PAYMENT -> PAID`, dan meng-commit reservasi stok. Order yang sudah `CANCELLED`/kedaluwarsa ditolak `409 ORDER_NOT_PAYABLE`.
- **Gagal/kedaluwarsa**: webhook Midtrans `deny/cancel/expire` memanggil `OrderService.cancelUnpaidOrder`, mengubah order `PENDING_PAYMENT -> CANCELLED`, dan melepas reservasi stok. Normalisasi payload Midtrans (`settlement`, `transaction_id`, `gross_amount`, `signature_key`) diuji terpisah.
- **Env Midtrans**: `PAYMENT_ADAPTER=midtrans`, `MIDTRANS_SERVER_KEY=SB-Mid-server-...`, `MIDTRANS_CLIENT_KEY=SB-Mid-client-...`, `MIDTRANS_IS_PRODUCTION=false`. Token tidak ditulis di repo.

## Pesanan Online

- **Model `Order`/`OrderItem`** ditambahkan lewat migrasi `20261023095017_add_order_model`. Total uang memakai `Decimal(18,2)`, kuantitas item `Int`, dan nomor pesanan `ORD-<10 karakter UUID>` unik per tenant.
- **Checkout publik**: `POST /api/v1/orders` dan `GET /api/v1/orders/:id`. Tenant dipilih lewat header opsional `X-Tenant-Code`; tanpa header dipakai tenant aktif pertama. `Idempotency-Key` opsional mengembalikan pesanan yang sama.
- **Reservasi stok atomik**: semua item direservasi lewat `StockService` di dalam transaksi yang sama dengan pembuatan order. Jika salah satu varian kurang, seluruh transaksi rollback dan tidak ada reservasi yang tertinggal. `StockService` sekarang menerima `Prisma.TransactionClient` opsional.
- **Lokasi stok**: `locationId` opsional; bila kosong dipilih lokasi `WAREHOUSE` aktif pertama, lalu lokasi aktif mana pun. Alamat wajib untuk `fulfillmentType=SHIP`; `shippingCost` diterima sebagai string desimal.
- **Kedaluwarsa**: reservasi berlaku 15 menit. Sweep berjalan tiap 60 detik di proses API dan juga tersedia lewat `POST /api/v1/dev/orders/expire` (hanya `NODE_ENV=development`). Sweep mengubah order menjadi `CANCELLED` dan melepas reservasi secara idempoten.
  - `shortcut:` timer in-process hanya aman untuk satu instance API; ganti ke job BullMQ saat API dijalankan multi-instance.
- **Pembayaran**: `POST /api/v1/payments/order/:orderId` membuat atau memakai ulang payment `PENDING`; adaptor Midtrans mengembalikan `snapToken`/`redirectUrl`. Webhook `PAID` mengubah order menjadi `PAID` dan meng-commit reservasi stok lewat `OrderService.markPaid` (idempoten). Order `CANCELLED` tidak bisa dibayar dan mengembalikan `409 ORDER_NOT_PAYABLE`.
- **Pelacakan**: migrasi `20261023104027_add_order_tracking` menambah `courier`, `tracking_number`, `shipped_at`, `completed_at`. Admin dapat `GET /api/v1/admin/orders`, `PATCH /api/v1/admin/orders/:id/status`, dan `PATCH /api/v1/admin/orders/:id/shipment` (izin `order.view`/`order.manage`). Transisi: `PENDING_PAYMENT -> CANCELLED`, `PAID -> PROCESSING -> PACKED -> SHIPPED -> COMPLETED`; `SHIPPED` hanya lewat endpoint shipment. Pembatalan `PENDING_PAYMENT` melepas stok.
- **Halaman lacak**: `/lacak` mencari berdasarkan ID pesanan, lalu `/pesanan/[id]` menampilkan timeline status, kurir, dan nomor resi.
- **Notifikasi mock**: modul `notification` mencatat WhatsApp/email/Web Push ke log pino dengan nomor/email disamarkan. SMTP Mailhog dan Web Push asli belum diaktifkan; WA tetap mock.
- **Ditunda**: cart tersimpan, QR katalog, ongkir/resi nyata, notifikasi SMTP/WA/Web Push asli, admin UI pesanan, refund untuk pembayaran yang datang setelah order batal, dan POS offline.

## POS

- **Model** `PosShift`, `PosSale`, `PosSaleItem`, `PosPayment`, `PosSequence` ditambahkan lewat migrasi `20261023104804_add_pos_core`. Nomor struk berurut per lokasi (`POS-<kode lokasi>-000001`).
- **Endpoint**: `POST /api/v1/pos/shifts/open`, `POST /api/v1/pos/shifts/:id/close`, `GET /api/v1/pos/shifts/current`, `GET /api/v1/pos/locations`, `GET /api/v1/pos/catalog?locationId=...`, `POST /api/v1/pos/sales` (wajib `Idempotency-Key`), `GET /api/v1/pos/sales`, `GET /api/v1/pos/sales/:id`, `POST /api/v1/pos/sales/:id/void`.
- **Izin**: `pos.shift.manage`, `pos.sale.create`, `pos.sale.void`, `pos.discount.approve`.
- **Penjualan**: harga diambil dari database, bukan dari klien. Multi-pembayaran (`CASH/QRIS/TRANSFER/EDC`) harus sama dengan total. Diskon di atas Rp10.000 membutuhkan izin `pos.discount.approve`; override PIN supervisor belum diimplementasikan.
- **Stok**: penjualan mengurangi on-hand lewat `StockService.adjust` dalam transaksi yang sama. Void mengembalikan stok dan menandai sale `VOID` (bukan menghapus).
- **Shift**: tutup shift menghitung `expectedCash = openingCash + total pembayaran CASH` dan menyimpan `difference`.
- **UI POS**: login email/password (bukan PIN), pilih lokasi, buka/tutup shift, katalog + stok, pencarian manual/SKU, keranjang, split payment, dan struk yang bisa dicetak lewat browser. Barcode kamera, ESC/POS, PDF, retur, dan mode offline belum diimplementasikan.
- **Sesi POS**: access token hanya diizinkan di memori JavaScript; refresh token tinggal di cookie `httpOnly` yang sama dengan API. Saat access token kedaluwarsa (15 menit), POS akan mencoba refresh sendirian melalui `/api/v1/auth/refresh` dengan otomatis; jika gagal, keranjang masih disimpan dan kasir login kembali tanpa kehilangan keranjang yang belum dibayar. Manual logout tetap mengosongkan keranjang. owner/location/shift mismatch membuang keranjang.
- **Aksesibilitas UI**: manifest web/POS memakai nama Bale Store, ikon PNG lokal 192/512, favicon, dan apple-touch-icon; halaman 404 web memakai layout Bale Store. Kontrol POS diberi label, target sentuh minimal 44 px, dan zoom browser diaktifkan. Halaman POS memakai landmark `main`.
- **Ditunda**: POS offline (Dexie/Background Sync), service worker/instalasi PWA, dan approval diskon lewat PIN supervisor (izin `pos.discount.approve` sudah dicek di API).

## Akuntansi

- **Inti**: `AccountingService` memakai `Account`, `JournalEntry`, `JournalLine` yang sudah ada, plus `AccountingSequence` untuk nomor jurnal berurut per tenant. Migrasi `20261023110000_add_accounting_core` menambahkan unique `reference_type + reference_id` agar jurnal otomatis idempoten.
- **Jurnal manual**: `POST /api/v1/accounting/journals` (`accounting.journal.post`) memvalidasi debit = kredit dan langsung berstatus `POSTED`. Approval/fiscal period lock belum diterapkan.
- **Jurnal otomatis**: penjualan online yang `PAID` dan penjualan POS membuat jurnal penjualan + HPP secara otomatis di transaksi yang sama. Jika Chart of Accounts tenant belum lengkap (kode 1100/1110/1130/4100/5100), jurnal dilewati dengan warning agar transaksi penjualan tidak ikut gagal.
- **Laporan**: `GET /api/v1/reports/trial-balance`, `/income-statement`, `/balance-sheet` (`report.view`) dihitung dari `JournalEntry` berstatus `POSTED`. Neraca memasukkan laba periode berjalan ke ekuitas dan mengembalikan flag `balanced`.
- **Belum**: PPN, jurnal balik, penguncian periode, approval jurnal manual, rekonsiliasi bank, ekspor Excel/PDF, dan laporan arus kas/perubahan ekuitas.
- **UI laporan**: belum ada; endpoint siap dipakai halaman admin berikutnya.

## Data Stok

- **Admin API**: `GET /api/v1/admin/inventory/stock`, `/ledger`, `/locations`; `POST /adjustments`; `POST /transfers`. Semua memakai izin `inventory.adjust`.
- **Penyesuaian**: qty bertanda (positif masuk, negatif keluar), append-only ke `StockLedger`, `StockBalance` di-update dalam transaksi yang sama.
- **Transfer**: satu transaksi dengan dua leg `TRANSFER` dan reference yang sama; jika stok sumber kurang, seluruh transfer rollback.
- **Ledger**: 100 baris terakhir, filter varian/lokasi, menampilkan `qtyDelta`, `qtyReservedDelta`, reference, dan catatan.
- **Belum**: opname terstruktur, stok minimum/peringatan, transfer antar-tenant, dan UI admin stok.

