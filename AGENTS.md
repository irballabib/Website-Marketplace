# AGENTS.md: Marketplace Celana Cutbray

Panduan untuk AI agent coding (OpenCode, provider DeepSeek). Baca seluruh file ini sebelum menulis kode. Jika ada konflik antara instruksi chat dan file ini, tanyakan dulu; jangan menebak.

---

## 0. Cara Kerja Agent (WAJIB)

1. **Kerjakan satu task kecil per sesi** (satu modul/fitur, maksimal ~300 baris perubahan). Jangan membangun seluruh sistem sekaligus.
2. **Rencana dulu, kode kemudian.** Sebelum mengubah file, tulis daftar file yang akan dibuat/diubah dan alasannya. Tunggu konfirmasi bila perubahan lebih dari 10 file.
3. **Jangan mengarang.** Jika persyaratan tidak ada di file ini, tulis asumsi di `docs/ASSUMPTIONS.md` dan lanjutkan dengan asumsi paling aman, atau tanyakan.
4. **Selalu jalankan** `pnpm lint && pnpm typecheck && pnpm test` sebelum menyatakan task selesai. Laporkan hasilnya apa adanya.
5. **Jangan menambah dependency** di luar daftar stack (bagian 2) tanpa persetujuan. Pin versi eksak.
6. **Jangan menyentuh** `.env*`, folder `migrations/` yang sudah ter-commit (buat migrasi baru), atau file di `infra/prod/`.
7. **Commit kecil** dengan format Conventional Commits (`feat(pos): ...`, `fix(inventory): ...`).
8. Setiap task selesai ditutup dengan ringkasan: file diubah, test ditambah, hal yang belum selesai.

### Tips khusus model DeepSeek
- Berikan jalur file eksplisit di setiap langkah; hindari instruksi samar.
- Untuk logika sulit (akuntansi, konkurensi stok, sinkronisasi offline) pakai mode reasoning (`deepseek-reasoner`) lalu minta rencana singkat sebelum kode.
- Untuk boilerplate (CRUD, DTO, komponen UI) pakai `deepseek-chat`.
- Jika output terpotong, minta lanjutan per file, jangan minta ulang dari awal.
- Setelah menulis kode, baca ulang file tersebut dan cek impor, tipe, dan nama fungsi yang benar-benar ada.

---

## 0.1 Lingkup: Localhost Saja (WAJIB)

Proyek ini **hanya berjalan di komputer lokal (localhost)**. TIDAK ada deploy, domain, server, atau layanan cloud.

- JANGAN membuat Dockerfile produksi, konfigurasi nginx/load balancer/CDN/WAF, Kubernetes, Terraform, atau skrip deploy.
- JANGAN memakai layanan cloud berbayar (R2/S3 asli, Sentry, Grafana Cloud, dsb.). File = MinIO lokal; email = Mailhog; log = pino ke konsol/file.
- Semua integrasi eksternal memakai **adapter + mock, dan mock adalah default**: pembayaran, ongkir, WhatsApp, email. Midtrans sandbox bersifat opsional, hanya bila saya mengisi kunci sandbox di `.env`.
- Gateway pembayaran tidak bisa memanggil webhook ke localhost. Sediakan endpoint **khusus dev** (aktif hanya jika `NODE_ENV=development`) untuk menyimulasikan webhook. Verifikasi signature dan idempotency tetap diimplementasikan agar siap bila kelak dipublikasikan.
- Kualitas kode tetap "siap produksi" (keamanan, idempotency, test), tetapi infrastruktur produksi di luar lingkup.
- PWA: `localhost` dianggap secure context, jadi service worker, instal PWA, dan push berfungsi. Untuk uji di HP lewat WiFi, alamat IP LAN tidak dianggap secure; gunakan emulasi mobile di Chrome DevTools atau flag "Insecure origins treated as secure" di `chrome://flags` pada HP uji.
- Backup = skrip `pg_dump` lokal. Tidak ada target uptime atau SLA.

---

## 1. Ringkasan Produk

Platform omnichannel brand **celana panjang cutbray**: toko online, penjualan toko fisik (POS), booking/pre-order dengan DP, produksi (bahan baku, BOM), dan akuntansi dalam satu database. Tahap awal **single-seller**; skema data tetap menyertakan `tenant_id` agar siap multi-tenant.

### Padanan istilah
| Istilah awal | Implementasi |
|---|---|
| Scan barcode lihat menu | Scan QR membuka katalog `/c/{kode-lokasi}`; QR hangtag membuka detail produk |
| Kasir / POS | POS toko dan bazar, scan barcode SKU, multi-pembayaran, mode offline |
| Reservasi + bayar booking | Pre-order batch, custom ukuran, jadwal fitting; DP diatur admin |
| Stok dan bahan baku | Stok barang jadi (SKU) + bahan baku (kain, benang, kancing, ritsleting, label) + BOM + work order |
| Laporan keuangan | Jurnal double-entry, neraca, laba rugi, arus kas (SAK EMKM) |

### Aktor
Pelanggan, Kasir, Admin toko, Staf gudang/produksi, Akuntan/Owner, Super admin, sistem eksternal (payment gateway, kurir, WhatsApp/email).

---

## 2. Stack (JANGAN diganti)

| Area | Pilihan |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Frontend | Next.js 15 (App Router), React 19, TypeScript strict |
| UI | Tailwind CSS, shadcn/ui |
| State/data | TanStack Query, Zustand |
| PWA | Workbox (service worker), Web App Manifest |
| Offline POS | IndexedDB via Dexie.js |
| Scan barcode | `BarcodeDetector` API, fallback `@zxing/browser` |
| QR | library `qrcode`, QR dinamis via short-link `/q/{kode}` |
| Backend | NestJS (Node.js 22), TypeScript strict |
| ORM | Prisma |
| Database | PostgreSQL 16 |
| Cache/antrean | Redis 7 + BullMQ |
| Auth | JWT akses pendek + refresh token (cookie httpOnly), RBAC, Argon2id |
| File | MinIO (lokal) |
| Pembayaran | Adapter dengan mock gateway (default); Midtrans sandbox opsional |
| Pengiriman | Adapter ongkir/resi dengan mock (default) |
| Notifikasi | WhatsApp mock (dicatat ke log), SMTP ke Mailhog, Web Push (localhost) |
| Validasi | Zod (shared) + class-validator di NestJS |
| API doc | OpenAPI 3.1 (`@nestjs/swagger`) |
| Test | Vitest/Jest (unit), Supertest (API), Playwright (E2E) |
| Infrastruktur lokal | Docker Compose (postgres, redis, minio, mailhog) |
| Log | pino (log JSON ke konsol/file) |

---

## 3. Arsitektur

**Modular monolith**, API-first, event-driven internal (outbox pattern). Satu deployable NestJS; modul dipisah ketat.

```
Browser (3 PWA, localhost) -> NestJS API (modular) -> PostgreSQL
                                                  \-> Worker (BullMQ) -> Redis
                                                  \-> MinIO (file)
Eksternal (semua lewat adapter, default mock): Payment gateway, Kurir, WhatsApp, SMTP -> Mailhog
```

### Modul backend
`identity`, `catalog`, `order`, `pos`, `booking`, `payment`, `inventory`, `production`, `accounting`, `notification`, `reporting`, `platform` (settings, outbox, idempotency, QR link).

### Aturan antar-modul
- Modul **tidak boleh** mengimpor repository/entity modul lain. Komunikasi lewat service publik (interface) atau domain event.
- Efek samping lintas modul (potong stok, buat jurnal) dipicu **domain event** yang ditulis ke tabel `outbox_event` dalam transaksi yang sama, lalu diproses worker. Handler harus idempoten.
- Tidak ada logika bisnis di controller. Pola: `controller -> service (use case) -> repository`.

### Struktur repo
```
/
├─ AGENTS.md
├─ apps/
│  ├─ api/            # NestJS
│  │  └─ src/modules/{identity,catalog,order,pos,booking,payment,inventory,production,accounting,notification,reporting,platform}/
│  ├─ web/            # Next.js: PWA pelanggan + /admin
│  └─ pos/            # Next.js: PWA kasir (offline-first)
├─ packages/
│  ├─ shared/         # Zod schema, tipe, util uang/tanggal
│  ├─ ui/             # komponen shadcn bersama
│  └─ config/         # eslint, tsconfig, tailwind preset
├─ prisma/            # schema.prisma, migrations/, seed.ts
├─ infra/             # docker-compose.yml, Dockerfile, nginx, ci
└─ docs/              # ASSUMPTIONS.md, ADR/, openapi.json
```

---

## 4. Konvensi Kode

- TypeScript `strict: true`; dilarang `any` kecuali dengan komentar alasan.
- **Uang**: simpan sebagai `NUMERIC(18,2)` (Prisma `Decimal`), hitung dengan `decimal.js`. **Dilarang float/number untuk uang.** Mata uang IDR, tanpa konversi.
- **Waktu**: simpan UTC (`timestamptz`), tampilkan Asia/Jakarta.
- **ID**: UUID v7. Semua tabel transaksi punya `id, tenant_id, created_at, updated_at, created_by`. Hapus = soft delete (`deleted_at`).
- **Mutasi stok dan jurnal bersifat append-only**: koreksi dibuat sebagai catatan baru, bukan UPDATE/DELETE.
- Penamaan: tabel `snake_case` jamak, class `PascalCase`, file `kebab-case.ts`.
- API: REST, prefiks `/api/v1`, respons error seragam `{ code, message, details? }`. Paginasi cursor.
- Setiap endpoint tulis (POST/PUT/PATCH/DELETE) yang rawan duplikasi menerima header `Idempotency-Key`.
- Teks UI bahasa Indonesia, kode dan komentar bahasa Inggris.
- Frontend: komponen server secara default; `"use client"` hanya bila perlu. Target sentuh minimal 44 px, mobile-first.

---

## 5. Model Data Inti

Domain dan entitas utama (buat skema Prisma bertahap per fase, jangan sekaligus):

| Domain | Entitas |
|---|---|
| Identity | User, Role, Permission, Session, AuditLog |
| Catalog | Product, Variant (SKU), Category, Price, Promotion, Media |
| Order | Cart, Order, OrderItem, Shipment, Return |
| POS | Outlet, Register, Shift, PosSale, PosSaleItem, PosPayment |
| Booking | BookingType, BookingPolicy, Booking, BookingPayment, Slot |
| Inventory | Location, StockLedger, StockBalance, StockOpname, Transfer |
| Production | Material, Supplier, BOM, BOMItem, PurchaseOrder, GoodsReceipt, WorkOrder |
| Accounting | Account, JournalEntry, JournalLine, FiscalPeriod, TaxRate, BankReconciliation |
| Platform | Notification, Setting, OutboxEvent, IdempotencyKey, QRLink |
| Payment | Payment (order_id atau booking_id, metode, jumlah, status, ref_gateway) |

Relasi kunci: `Product 1:* Variant`, `Variant 1:* StockLedger`, `Order 1:* OrderItem *:1 Variant`, `Order 1:* Payment`, `Booking *:1 BookingPolicy`, `JournalEntry 1:* JournalLine`.

**Variant (SKU) adalah poros** stok dan pesanan: `sku` unik, `barcode` (EAN-13/Code128), `warna`, `ukuran`.

---

## 6. Spesifikasi Modul dan Aturan Bisnis

### 6.1 Pemesanan dengan QR (pelanggan)
- Alur: scan QR -> `/c/{kode-lokasi}` -> pilih model, warna, ukuran -> keranjang -> checkout -> bayar -> lacak.
- QR per lokasi (toko, bazar, booth) untuk pelacakan kanal; QR per produk di hangtag. QR dinamis (short-link) agar tujuan bisa diganti.
- Keranjang tersimpan lokal dan akun; guest checkout dengan OTP WhatsApp.
- Tipe pesanan: kirim atau ambil di toko (pickup).
- Status: `PENDING_PAYMENT -> PAID -> PROCESSING -> PACKED -> SHIPPED -> COMPLETED`, cabang `CANCELLED`, `RETURNED`.
- **Reservasi stok 15 menit** saat checkout. Pembayaran kedaluwarsa -> pesanan otomatis `CANCELLED` dan stok dilepas (job terjadwal).
- **Stok dipotong (commit) hanya setelah webhook pembayaran terverifikasi.** Webhook wajib: verifikasi tanda tangan, idempoten, aman diulang.
- Ulasan dan rating setelah `COMPLETED`.

### 6.2 POS Kasir
- Login PIN, buka/tutup shift (modal awal, kas akhir, selisih).
- Scan barcode (kamera atau scanner USB/Bluetooth keyboard-wedge), pencarian manual.
- Diskon dibatasi peran; di atas ambang butuh PIN supervisor (`pos.discount.approve`).
- Multi-pembayaran dan split bayar: tunai, QRIS, transfer, EDC manual.
- Struk: thermal 58/80 mm (ESC/POS), PDF, kirim WhatsApp. Nomor struk berurut per outlet.
- Retur/tukar wajib merujuk transaksi asal; void butuh otorisasi dan audit log.
- **Offline-first**: katalog dan harga disalin ke IndexedDB; transaksi diberi UUID klien (idempotency key); antre dan Background Sync saat online. Server menolak duplikat berdasarkan key. Stok tidak cukup saat sync -> tandai `CONFLICT` dan beri peringatan ke kasir.

### 6.3 Booking dan DP
Jenis booking (aktif/nonaktif oleh admin): `PREORDER_BATCH`, `CUSTOM_SIZE`, `FITTING_SLOT`.

Parameter `BookingPolicy` (disimpan di DB, diubah admin tanpa deploy):

| Parameter | Nilai |
|---|---|
| `dp_type` | `PERCENT` atau `FIXED` |
| `dp_value` | mis. 30 (%) atau 50000 |
| berlaku untuk | per jenis, per produk, atau per kategori |
| `pay_deadline_minutes` | mis. 60, 360, 1440 |
| aturan batal | refund penuh sampai H-3, 50% sampai H-1, hangus setelahnya (konfigurable) |
| kuota/kapasitas | kuota batch, slot per jam |
| periode buka/tutup | tanggal mulai dan akhir |
| `dp_creditable` | DP dipotong dari harga akhir atau tidak |
| pelunasan | batas akhir dan pengingat otomatis |

State machine booking:

```
DRAFT -> WAITING_DP -> CONFIRMED -> IN_PRODUCTION -> READY_FOR_SETTLEMENT -> COMPLETED
WAITING_DP -> EXPIRED (waktu bayar habis)
CONFIRMED  -> CANCELLED -> REFUNDED (sesuai kebijakan)
```
Transisi harus divalidasi di satu tempat (state machine class), bukan tersebar. Booking baru masuk produksi setelah `CONFIRMED` (DP lunas).

### 6.4 Stok dan Bahan Baku
- **Stok barang jadi**: multi-lokasi (gudang, toko, bazar), transfer antar lokasi, stok minimum + peringatan. Semua mutasi lewat `StockLedger` (append-only); `StockBalance` adalah turunan/cache yang di-update dalam transaksi yang sama.
- **Stok opname** dengan scan barcode; selisih otomatis menjadi penyesuaian + jurnal.
- **Bahan baku**: master Material (satuan meter/kg/pcs), Supplier, BOM per model dan ukuran (contoh: celana cutbray size 30 = 1,3 m denim + 1 ritsleting + 1 kancing + benang + label).
- Alur pembelian: PO -> GRN (penerimaan) -> faktur pemasok -> utang usaha.
- **Work Order**: pilih model + jumlah -> sistem hitung kebutuhan dari BOM -> potong stok bahan -> tambah stok barang jadi -> catat biaya (bahan + tenaga kerja + overhead).
- Penilaian persediaan: **moving average** (default) atau FIFO; dipilih sekali per perusahaan di `Setting`.
- Lacak batch/lot kain, analisis susut (waste), HPP per unit.
- **Mencegah stok negatif**: gunakan transaksi + `SELECT ... FOR UPDATE` (atau constraint `CHECK (qty >= 0)` pada balance) untuk reservasi dan commit.

### 6.5 Akuntansi
- Chart of Accounts hierarkis (Aset, Liabilitas, Ekuitas, Pendapatan, HPP, Beban); template SAK EMKM, bisa dikustomisasi.
- Jurnal double-entry: validasi **debit = kredit**, periode akuntansi, penguncian periode, jurnal balik/penyesuaian, penomoran berurut, approval untuk jurnal manual.
- **Jurnal otomatis dari modul lain** (dipicu event, idempoten):

| Peristiwa | Debit | Kredit |
|---|---|---|
| Penjualan tunai/QRIS | Kas/Bank | Penjualan, PPN Keluaran (bila PKP) |
| HPP saat penjualan | HPP | Persediaan Barang Jadi |
| Uang muka booking | Kas/Bank | Uang Muka Pelanggan (liabilitas) |
| Pelunasan booking | Kas/Bank, Uang Muka Pelanggan | Penjualan |
| Pembelian bahan kredit | Persediaan Bahan Baku | Utang Usaha |
| Pemakaian bahan produksi | Barang Dalam Proses | Persediaan Bahan Baku |
| Produksi selesai | Persediaan Barang Jadi | Barang Dalam Proses |
| Biaya payment gateway | Beban Admin Pembayaran | Kas/Bank |

- Laporan: Neraca, Laba Rugi, Perubahan Ekuitas, Arus Kas (langsung dan tidak langsung), Buku Besar, Neraca Saldo, Buku Kas/Bank, Umur Piutang/Utang, HPP, penjualan per kanal/produk/kasir. Ekspor Excel dan PDF.
- Rekonsiliasi bank dan settlement payment gateway harian. PPh Final UMKM 0,5% (laporan dasar).
- **Semua laporan dihitung dari jurnal**, bukan dari tabel operasional.
- Jurnal tidak boleh diubah setelah diposting; koreksi dengan jurnal balik.

---

## 7. PWA

- Manifest: nama, ikon maskable 192/512, `display: standalone`, `start_url` terpisah untuk `web` dan `pos`.
- Strategi cache (Workbox):
  - aset statis: Cache First (versioned)
  - katalog dan gambar: Stale-While-Revalidate
  - stok, harga, status pesanan: Network First dengan fallback cache
  - endpoint tulis: Background Sync ke antrean IndexedDB
- Web Push untuk status pesanan, pengingat booking H-1, stok menipis (admin).
- Target Lighthouse PWA dan Performance >= 90; LCP < 2,5 dtk di 4G; gambar WebP/AVIF responsif; WCAG 2.1 AA.

---

## 8. Keamanan

- Argon2id; 2FA wajib untuk admin dan akuntan. (TLS/HSTS tidak berlaku di localhost.)
- RBAC izin granular (contoh: `pos.discount.approve`, `accounting.journal.post`). Cek izin di guard, bukan di UI saja.
- Lindungi dari OWASP Top 10: validasi input (Zod), query parameterized, CSP, CSRF token, rate limiting, helmet.
- Jangan menyimpan data kartu. Data pribadi mengikuti UU PDP No. 27/2022 (persetujuan, hak akses dan hapus, retensi).
- Audit log untuk perubahan harga, stok, jurnal, peran.
- Jangan log data sensitif (token, PIN, nomor telepon utuh). Rahasia hanya dari environment variable; sediakan `.env.example`.

---

## 9. Daftar Endpoint Awal (acuan)

```
POST   /api/v1/auth/login | /refresh | /logout
GET    /api/v1/catalog/products?cursor=&q=&category=
GET    /api/v1/catalog/variants/{sku}
GET    /api/v1/qr/{code}                       # resolve short-link
POST   /api/v1/cart/items
POST   /api/v1/orders                          # checkout, header Idempotency-Key
GET    /api/v1/orders/{id}
POST   /api/v1/payments/webhook/midtrans       # verifikasi signature, idempoten
POST   /api/v1/dev/payments/simulate           # HANYA NODE_ENV=development
POST   /api/v1/pos/shifts/open | /close
POST   /api/v1/pos/sales                       # header Idempotency-Key (UUID klien)
POST   /api/v1/pos/sync                        # batch transaksi offline
POST   /api/v1/bookings
GET    /api/v1/bookings/{id}
PUT    /api/v1/admin/booking-policies/{id}
POST   /api/v1/inventory/adjustments | /transfers | /opnames
POST   /api/v1/production/work-orders
POST   /api/v1/accounting/journals             # manual, butuh approval
GET    /api/v1/reports/{balance-sheet|income-statement|cash-flow|trial-balance}?from=&to=
```

---

## 10. Rencana Implementasi (kerjakan BERURUTAN)

Setiap fase = beberapa task kecil. Jangan lompat fase. Satu task = satu PR/commit set.

### Fase 0: Fondasi repo
- [ ] Inisialisasi monorepo pnpm + Turborepo, tsconfig strict, ESLint, Prettier, Husky + commitlint.
- [ ] `infra/docker-compose.yml`: postgres, redis, minio, mailhog.
- [ ] Skeleton NestJS (`apps/api`) dengan health check `/health`, konfigurasi env tervalidasi (Zod).
- [ ] Skeleton Next.js (`apps/web`, `apps/pos`) + Tailwind + shadcn/ui.
- [ ] Skrip lokal `pnpm verify` (lint + typecheck + test + build).
- **Selesai bila**: `docker compose up` + `pnpm dev` menjalankan ketiga app; `pnpm verify` hijau.

### Fase 1: Identity, Katalog, Stok barang jadi, Pembayaran
- [ ] Prisma schema + migrasi: Identity, Catalog, Inventory (Location, StockLedger, StockBalance).
- [ ] Auth JWT + refresh, RBAC guard, seed peran (superadmin, admin, kasir, gudang, akuntan).
- [ ] CRUD produk/varian/SKU + barcode, upload gambar ke MinIO.
- [ ] Layanan stok: reservasi, commit, release, penyesuaian (semua lewat ledger) + test konkurensi.
- [ ] Adapter pembayaran: mock gateway (default) + Midtrans sandbox opsional; endpoint webhook (verifikasi signature, idempoten) + endpoint simulasi webhook khusus dev + test.
- **Selesai bila**: admin dapat membuat produk+SKU; stok tidak pernah negatif pada test konkurensi; webhook ganda tidak menggandakan efek.

### Fase 2: Penjualan (QR, checkout online, POS)
- [ ] Katalog publik SSR + halaman `/c/{kode-lokasi}`, generator QR dinamis, short-link.
- [ ] Keranjang, checkout, reservasi 15 menit, job kedaluwarsa, status pesanan, lacak pesanan.
- [ ] Ongkir dan resi (adapter Biteship), notifikasi WhatsApp/email.
- [ ] POS: shift, scan barcode, diskon, multi-pembayaran, struk, retur/void.
- [ ] POS offline: Dexie, antrean, Background Sync, endpoint `/pos/sync`, penanganan konflik.
- [ ] PWA manifest + service worker untuk `web` dan `pos`.
- **Selesai bila**: pesanan online lunas memotong stok; POS tetap bisa transaksi saat offline lalu sinkron tanpa duplikat (test E2E dengan network dimatikan).

### Fase 3: Booking dan Produksi
- [ ] `BookingType`, `BookingPolicy`, panel admin pengaturan DP/batas bayar/aturan batal/kuota.
- [ ] Booking form di website, pembayaran DP via gateway, state machine, pengingat pelunasan, refund sesuai kebijakan.
- [ ] Master Material, Supplier, BOM, PO, GRN.
- [ ] Work order: kebutuhan bahan dari BOM, potong bahan, tambah stok jadi, biaya produksi.
- **Selesai bila**: perubahan aturan DP di admin langsung berlaku tanpa deploy; work order menghasilkan mutasi stok yang benar dan konsisten dengan BOM.

### Fase 4: Akuntansi
- [ ] CoA (template SAK EMKM), periode fiskal, JournalEntry/JournalLine dengan validasi debit = kredit.
- [ ] Handler event -> jurnal otomatis sesuai tabel bagian 6.5 (idempoten; satu event = paling banyak satu jurnal).
- [ ] Laporan: neraca saldo, buku besar, laba rugi, neraca, arus kas, umur piutang/utang; ekspor Excel/PDF.
- [ ] Rekonsiliasi bank dan settlement gateway; penguncian periode.
- **Selesai bila**: neraca seimbang (Aset = Liabilitas + Ekuitas) pada dataset uji; total laporan cocok dengan jumlah transaksi operasional.

### Fase 5: Hardening lokal dan serah terima (tanpa deploy)
- [ ] Uji beban lokal (k6) pada checkout dan POS sync; tuning indeks.
- [ ] Audit keamanan (`pnpm audit`), rate limiting, cek RBAC; skrip backup + restore `pg_dump` yang teruji.
- [ ] Log terstruktur dan halaman admin sederhana untuk melihat kegagalan pembayaran dan sinkronisasi.
- [ ] Skrip data awal (seed realistis), panduan pengguna, UAT di localhost.

---

## 11. Pengujian (Definition of Done)

Sebuah task dianggap selesai bila:
1. `pnpm lint && pnpm typecheck && pnpm test` hijau.
2. Logika domain kritis punya unit test: **stok, jurnal, pembayaran/webhook, state machine booking, perhitungan DP**. Cakupan >= 70% pada modul ini.
3. Endpoint baru punya test API (Supertest) termasuk kasus gagal dan duplikat (idempotency).
4. Alur utama punya E2E Playwright: checkout QR, transaksi POS offline-sync, booking dengan DP.
5. Skema OpenAPI diperbarui; migrasi Prisma baru dibuat (tidak mengubah migrasi lama).
6. Tidak ada `console.log`, `TODO` tanpa isu, atau rahasia di kode.

### Invarian yang wajib dijaga oleh test
- Total debit = total kredit di setiap jurnal.
- `StockBalance` = jumlah `qty_delta` di `StockLedger`; tidak pernah < 0.
- Webhook/endpoint ber-idempotency-key yang dikirim 2x menghasilkan efek 1x.
- Reservasi yang kedaluwarsa mengembalikan stok.
- Neraca seimbang pada akhir setiap periode.

---

## 12. Kebutuhan Non-Fungsional (target)

| Atribut | Target |
|---|---|
| Latensi API | p95 < 300 ms baca, < 800 ms tulis |
| Kapasitas awal | 500 pengguna bersamaan, 10.000 SKU, 5.000 transaksi/hari |
| Kompatibilitas | Chrome, Edge, Firefox, Safari iOS 16+, Android 8+ |
| Backup | skrip pg_dump + restore teruji (lokal) |

---

## 13. Konfigurasi OpenCode (contoh)

Simpan sebagai `opencode.json` di akar repo. Verifikasi nama model dan format terbaru di dokumentasi OpenCode dan DeepSeek sebelum dipakai.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "deepseek/deepseek-chat",
  "small_model": "deepseek/deepseek-chat",
  "instructions": ["AGENTS.md"]
}
```

Autentikasi: jalankan `opencode auth login`, pilih DeepSeek, masukkan API key. **Jangan** menaruh API key di repo.

Contoh prompt pembuka per task:

```
Baca AGENTS.md. Kerjakan Fase 1, task "Layanan stok: reservasi, commit, release".
Rencanakan dulu: daftar file yang akan dibuat/diubah. Setelah saya setuju, implementasikan
beserta test konkurensi. Jalankan lint, typecheck, test, dan laporkan hasilnya.
```

---

## 14. Risiko dan Mitigasi (ingat saat menulis kode)

| Risiko | Mitigasi di kode |
|---|---|
| Selisih stok online vs toko | Satu StockLedger terpusat, reservasi stok, opname terjadwal |
| Transaksi POS ganda saat sync | Idempotency key per transaksi, unique constraint |
| Bayar sukses tapi pesanan belum update | Webhook idempoten + job rekonsiliasi berkala |
| Laporan keuangan tidak cocok | Jurnal otomatis diuji dengan skenario akuntan; penguncian periode |
| Scope membengkak | Kerjakan per fase; catat di ASSUMPTIONS.md; jangan menambah fitur di luar daftar |

---

## 15. Referensi

Blueprint lengkap dengan 7 diagram UML (komponen, use case, class/ERD, sequence checkout, state machine booking, activity POS offline, deployment) ada di dokumen blueprint proyek. Jika berkas diagram tersedia di `docs/uml/`, jadikan acuan; bila ada perbedaan dengan AGENTS.md, **AGENTS.md yang menang** dan catat selisihnya di `docs/ASSUMPTIONS.md`.
