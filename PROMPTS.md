# PROMPTS.md: Dari Nol Sampai Web Jadi (OpenCode + DeepSeek)

Kumpulan prompt berurutan untuk membangun marketplace celana cutbray berdasarkan `AGENTS.md`.

## Cara memakai

1. Pastikan `AGENTS.md` ada di akar proyek (`G:\Project web marketplace`).
2. **Satu prompt = satu sesi.** Mulai sesi baru (`/new`) untuk tiap prompt agar konteks tidak penuh.
3. Tempel prompt, baca rencana agent, setujui, biarkan mengerjakan.
4. Setelah selesai, **cek sendiri hasilnya** (jalankan perintah verifikasi), lalu `git commit`. Baru lanjut ke prompt berikutnya.
5. Jika agent salah arah, jangan debat panjang: `git restore .`, mulai sesi baru, dan perjelas prompt.
6. Model: `deepseek-reasoner` untuk prompt bertanda 🧠 (logika sulit), `deepseek-chat` untuk sisanya.

> **Lingkup: localhost saja.** Tidak ada deploy, domain, atau layanan cloud. Pembayaran, ongkir, WhatsApp, dan email memakai mock/sandbox lokal. Jika agent menawarkan Dockerfile produksi, nginx, CI/CD, Sentry, atau cloud, tolak.

> Prasyarat di Windows: Node.js 20+, Git, **Docker Desktop** (untuk PostgreSQL/Redis/MinIO), dan pnpm (`corepack enable` lalu `corepack prepare pnpm@latest --activate`).

---

## PROMPT A: Pembuka sesi (tempel di awal setiap sesi baru)

```
Baca AGENTS.md sepenuhnya. Ikuti bagian 0 (Cara Kerja Agent) dan bagian 4 (Konvensi).
Sebelum mengubah file apa pun, tulis rencana: daftar file yang akan dibuat/diubah dan alasannya.
Tunggu persetujuan saya. Setelah selesai, jalankan pnpm lint, pnpm typecheck, pnpm test
dan laporkan hasilnya apa adanya (termasuk yang gagal).
```

---

## FASE 0: Fondasi

### Prompt 0.1: Cek lingkungan
```
Cek lingkungan saya dan laporkan, jangan mengubah apa pun:
node --version, npm --version, pnpm --version, git --version, docker --version, docker compose version.
Beri tahu apa yang kurang dan cara memasangnya di Windows. Cek juga apakah folder ini sudah git repo.
```

### Prompt 0.2: Monorepo
```
Tugas: Fase 0, inisialisasi monorepo sesuai AGENTS.md bagian 3 (struktur repo).
Kerjakan:
1. git init (jika belum), .gitignore (node_modules, .env*, dist, .next, coverage), .editorconfig.
2. pnpm workspaces + Turborepo: pnpm-workspace.yaml, turbo.json, package.json akar dengan script
   dev, build, lint, typecheck, test.
3. packages/config: tsconfig dasar (strict true), eslint config, prettier config.
4. Folder kosong dengan package.json minimal: apps/api, apps/web, apps/pos, packages/shared, packages/ui.
5. Husky + commitlint (Conventional Commits).
Jangan membuat kode aplikasi dulu. Pin semua versi dependency.
Selesai bila: pnpm install berhasil, pnpm lint dan pnpm typecheck berjalan tanpa error.
```

### Prompt 0.3: Docker infrastruktur lokal
```
Tugas: buat infra/docker-compose.yml untuk pengembangan lokal berisi:
postgres:16, redis:7, minio (+ bucket awal "marketplace-media"), mailhog.
Gunakan volume bernama, port tidak bentrok, dan baca kredensial dari .env.
Buat .env.example (TANPA rahasia asli) dan README singkat di infra/ cara menjalankan.
Selesai bila: docker compose -f infra/docker-compose.yml up -d berjalan dan semua service healthy.
Jangan membuat file .env asli; instruksikan saya menyalin .env.example menjadi .env.
```

### Prompt 0.4: Skeleton API
```
Tugas: skeleton NestJS di apps/api.
- Struktur modul kosong sesuai AGENTS.md bagian 3 (identity, catalog, order, pos, booking, payment,
  inventory, production, accounting, notification, reporting, platform).
- Konfigurasi env tervalidasi dengan Zod (gagal start jika env salah).
- Endpoint GET /api/v1/health (cek koneksi DB dan Redis).
- Prefiks /api/v1, Swagger di /api/docs, pino logger, helmet, rate limit global, format error seragam.
- Prisma terpasang dengan schema.prisma awal (hanya datasource + generator), koneksi ke Postgres lokal.
Selesai bila: pnpm --filter api dev menyala, /api/v1/health mengembalikan status ok, ada 1 test untuk health.
```

### Prompt 0.5: Skeleton web dan POS
```
Tugas: skeleton Next.js 15 (App Router, TypeScript) untuk apps/web dan apps/pos.
- Tailwind + shadcn/ui, komponen bersama diletakkan di packages/ui.
- apps/web: halaman beranda sederhana dan layout mobile-first (bahasa Indonesia).
- apps/pos: halaman login placeholder.
- Port berbeda (web 3000, pos 3001, api 3002).
- Klien API tipe-aman: tempat khusus di packages/shared untuk tipe dan skema Zod.
Selesai bila: kedua app tampil di browser dan pnpm build berhasil.
```

### Prompt 0.6: Skrip verifikasi lokal
```
Tugas: tambahkan script `pnpm verify` di package.json akar yang menjalankan berurutan: lint, typecheck,
test, build. Tambahkan juga script `pnpm dev:all` (menjalankan api, web, pos bersamaan) dan `pnpm db:reset`
(drop dan migrasi ulang database lokal + seed). Jangan membuat GitHub Actions atau konfigurasi CI.
Selesai bila: pnpm verify berjalan sampai akhir tanpa error dan README singkat menjelaskan ketiga script.
```

---

## FASE 1: Identity, Katalog, Stok, Pembayaran

### Prompt 1.1: 🧠 Skema database tahap 1
```
Tugas: Fase 1, skema Prisma untuk Identity, Catalog, Inventory (AGENTS.md bagian 5).
Tabel: User, Role, Permission, Session, AuditLog, Product, Variant (SKU, barcode, warna, ukuran),
Category, Price, Media, Location, StockLedger, StockBalance.
Aturan: UUID v7, tenant_id, created_at/updated_at/created_by, soft delete (deleted_at), uang Decimal,
StockLedger append-only, StockBalance dengan CHECK qty >= 0, index untuk sku dan barcode (unik).
Buat migrasi, seed (peran: superadmin, admin, kasir, gudang, akuntan; 1 lokasi gudang; 3 produk contoh
cutbray dengan varian warna dan ukuran). Selesai bila migrasi dan seed berjalan di DB kosong.
```

### Prompt 1.2: Auth dan RBAC
```
Tugas: modul identity: login, refresh, logout.
JWT akses pendek + refresh token di cookie httpOnly, Argon2id, rate limit khusus login, RBAC guard
berbasis izin granular (contoh pos.discount.approve, accounting.journal.post), decorator @RequirePermission.
2FA TOTP untuk peran admin dan akuntan. Catat login gagal ke AuditLog.
Test: login benar/salah, token kedaluwarsa, akses tanpa izin ditolak.
```

### Prompt 1.3: CRUD katalog
```
Tugas: modul catalog.
Endpoint admin untuk CRUD produk/varian/kategori/harga; endpoint publik baca katalog dengan paginasi
cursor, filter (kategori, warna, ukuran, harga) dan pencarian. Generator barcode (EAN-13) otomatis
untuk SKU baru. Upload gambar ke MinIO (presigned URL), validasi tipe dan ukuran, simpan versi WebP.
OpenAPI diperbarui. Test untuk validasi, SKU unik, dan paginasi.
```

### Prompt 1.4: 🧠 Layanan stok
```
Tugas: modul inventory: layanan stok.
Operasi: reserve, release, commit, adjust, transfer antar lokasi. SEMUA lewat StockLedger (append-only),
StockBalance diperbarui dalam transaksi yang sama. Cegah stok negatif dengan SELECT FOR UPDATE.
Reservasi punya batas waktu (default 15 menit) + job BullMQ yang melepas reservasi kedaluwarsa.
WAJIB test konkurensi: 50 permintaan reserve bersamaan untuk stok 10 -> tepat 10 berhasil.
Invarian: StockBalance = jumlah qty_delta di ledger.
```

### Prompt 1.5: Pembayaran (mock + sandbox opsional)
```
Tugas: modul payment dengan pola adapter (interface PaymentGateway). Implementasi: MockGateway (DEFAULT,
untuk localhost) dan MidtransGateway (sandbox, aktif hanya jika kunci sandbox ada di .env).
- Buat tagihan (QRIS dan Virtual Account; untuk mock cukup kode palsu dan halaman "bayar" simulasi).
- Endpoint webhook /api/v1/payments/webhook/midtrans: verifikasi signature, IDEMPOTEN (kirim ulang tidak
  menggandakan efek), simpan payload mentah.
- Endpoint simulasi POST /api/v1/dev/payments/simulate yang aktif HANYA jika NODE_ENV=development, untuk
  menandai tagihan lunas/gagal/kedaluwarsa (karena gateway tidak bisa memanggil localhost).
- Event domain PaymentPaid ditulis ke tabel outbox_event dalam transaksi yang sama.
Test: signature salah ditolak, webhook ganda hanya 1 efek, status tidak mundur, endpoint simulasi
mengembalikan 404 di luar mode development.
```

---

## FASE 2: Penjualan

### Prompt 2.1: Katalog publik dan QR
```
Tugas: apps/web, katalog publik (SSR untuk SEO).
Halaman: daftar produk (filter dan pencarian), detail produk (pilih warna/ukuran, stok per ukuran,
panduan ukuran). Rute QR /c/{kode-lokasi} membuka katalog dengan konteks lokasi (untuk pelacakan kanal),
short-link dinamis /q/{kode}. Admin dapat membuat dan mengunduh QR (PNG/SVG) per lokasi dan per produk.
Mobile-first, gambar WebP responsif, Lighthouse Performance >= 90.
```

### Prompt 2.2: Keranjang dan checkout
```
Tugas: modul order + UI checkout.
Keranjang (lokal untuk tamu, tersimpan untuk akun), checkout dengan alamat, ongkir (adapter Biteship
dengan mock), pilihan ambil di toko, kode promo. Buat order PENDING_PAYMENT, reservasi stok 15 menit,
buat tagihan pembayaran. Handler event PaymentPaid: commit stok, status PAID.
Job kedaluwarsa: order tidak dibayar -> CANCELLED dan stok dilepas. Idempotency-Key pada POST /orders.
Test E2E Playwright: pilih produk -> checkout -> bayar (mock) -> status PAID dan stok berkurang.
```

### Prompt 2.3: Lacak pesanan dan notifikasi
```
Tugas: halaman lacak pesanan, status lengkap (PENDING_PAYMENT sampai COMPLETED, CANCELLED, RETURNED),
notifikasi lewat modul notification: email SMTP ke Mailhog, adapter WhatsApp yang hanya mencatat ke log, dan Web Push yang diuji di localhost.
Admin: daftar pesanan, ubah status, input nomor resi. Template pesan dalam bahasa Indonesia.
```

### Prompt 2.4: POS dasar
```
Tugas: apps/pos dan modul pos.
Login PIN kasir, buka/tutup shift (modal awal, kas akhir, selisih), layar transaksi: scan barcode
(BarcodeDetector dengan fallback @zxing/browser, dan input keyboard-wedge), pencarian manual,
diskon dibatasi izin (di atas ambang butuh PIN supervisor), multi-pembayaran dan split bayar
(tunai, QRIS, transfer, EDC manual), struk (print dialog 58/80 mm dan PDF), retur/void dengan otorisasi.
Nomor struk berurut per outlet. Test untuk perhitungan total, diskon, dan split bayar.
```

### Prompt 2.5: 🧠 POS offline-first
```
Tugas: mode offline untuk apps/pos.
- Salin katalog, harga, stok ke IndexedDB (Dexie).
- Transaksi diberi UUID klien sebagai idempotency key, disimpan lokal, diantrekan, dikirim lewat
  Background Sync ke POST /api/v1/pos/sync (batch).
- Server menolak duplikat berdasarkan key; stok tidak cukup -> tandai CONFLICT dan kembalikan ke kasir.
- Indikator status online/offline dan jumlah antrean di UI.
Test E2E: matikan jaringan, lakukan 3 transaksi, nyalakan jaringan -> semua tersinkron tepat sekali.
```

### Prompt 2.6: PWA
```
Tugas: jadikan apps/web dan apps/pos PWA.
Web App Manifest (ikon maskable 192/512, display standalone, start_url terpisah), service worker Workbox
dengan strategi: aset statis Cache First, katalog dan gambar Stale-While-Revalidate, stok/harga/status
Network First, endpoint tulis Background Sync. Web Push (izin diminta saat konteks relevan, bukan saat load).
Target Lighthouse PWA >= 90. Semua diuji di localhost (secure context). Dokumentasikan cara uji instal di Chrome desktop, emulasi mobile DevTools, dan uji di HP lewat WiFi (flag insecure origins).
```

---

## FASE 3: Booking dan Produksi

### Prompt 3.1: Pengaturan booking (admin)
```
Tugas: modul booking, bagian pengaturan.
Entitas BookingType (PREORDER_BATCH, CUSTOM_SIZE, FITTING_SLOT) dan BookingPolicy dengan parameter di
AGENTS.md 6.3 (dp_type PERCENT/FIXED, dp_value, pay_deadline_minutes, aturan batal bertingkat, kuota,
periode buka/tutup, dp_creditable, batas pelunasan). Panel admin untuk membuat dan mengubah kebijakan
TANPA deploy ulang. Validasi ketat (persen 0-100, nominal > 0). Test untuk validasi dan perhitungan DP.
```

### Prompt 3.2: 🧠 Alur booking dan DP
```
Tugas: alur booking pelanggan.
Form booking di website, hitung DP dari kebijakan, buat tagihan DP lewat modul payment, state machine
booking di SATU class: DRAFT -> WAITING_DP -> CONFIRMED -> IN_PRODUCTION -> READY_FOR_SETTLEMENT ->
COMPLETED; cabang EXPIRED, CANCELLED -> REFUNDED. Validasi transisi hanya di state machine.
Job: kedaluwarsa DP, pengingat pelunasan H-1, perhitungan refund sesuai aturan batal.
Test: setiap transisi sah dan tidak sah, refund bertingkat, kuota tidak terlampaui saat booking bersamaan.
```

### Prompt 3.3: Bahan baku dan pembelian
```
Tugas: modul production bagian master dan pembelian.
Material (satuan meter/kg/pcs, stok minimum), Supplier, BOM + BOMItem per model dan ukuran,
PurchaseOrder -> GoodsReceipt (GRN) dengan pelacakan batch/lot kain. Mutasi stok bahan lewat ledger.
Penilaian persediaan moving average (opsi FIFO lewat Setting). Test perhitungan harga rata-rata.
```

### Prompt 3.4: 🧠 Work order
```
Tugas: Work Order produksi.
Pilih model + jumlah -> sistem hitung kebutuhan dari BOM -> cek stok bahan -> potong bahan -> tambah stok
barang jadi -> catat biaya (bahan + tenaga kerja + overhead) -> hitung HPP per unit dan susut (waste).
Semuanya dalam satu transaksi dan menerbitkan event untuk akuntansi. Test: kebutuhan bahan sesuai BOM,
stok bahan tidak negatif, HPP benar pada contoh angka.
```

---

## FASE 4: Akuntansi

### Prompt 4.1: 🧠 Inti akuntansi
```
Tugas: modul accounting inti.
Chart of Accounts hierarkis (template SAK EMKM), periode fiskal, JournalEntry dan JournalLine.
Validasi debit = kredit, penomoran berurut, jurnal tidak bisa diubah setelah diposting (koreksi dengan
jurnal balik), penguncian periode, approval untuk jurnal manual.
Test: jurnal tidak seimbang ditolak, periode terkunci menolak posting, jurnal balik benar.
```

### Prompt 4.2: 🧠 Jurnal otomatis
```
Tugas: handler event -> jurnal otomatis sesuai tabel AGENTS.md 6.5.
Penjualan (kas/bank, penjualan, PPN), HPP, uang muka booking, pelunasan booking, pembelian bahan kredit,
pemakaian bahan, produksi selesai, biaya payment gateway. Handler HARUS idempoten: satu event menghasilkan
paling banyak satu jurnal (unique constraint pada sumber+id).
Test: skenario lengkap pesanan online, penjualan POS, siklus booking dari DP sampai selesai.
```

### Prompt 4.3: Laporan keuangan
```
Tugas: modul reporting.
Neraca saldo, buku besar, laba rugi, neraca, perubahan ekuitas, arus kas (metode langsung dan tidak langsung),
umur piutang/utang, laporan HPP, penjualan per kanal/produk/kasir. SEMUA dihitung dari jurnal.
Ekspor Excel dan PDF. Endpoint GET /api/v1/reports/{jenis}?from=&to=.
Test: neraca seimbang (Aset = Liabilitas + Ekuitas) pada dataset uji, total laporan cocok dengan transaksi.
```

### Prompt 4.4: Rekonsiliasi dan dashboard
```
Tugas: rekonsiliasi bank dan settlement payment gateway harian, dashboard owner (penjualan harian,
stok menipis, booking aktif, laba kotor). Halaman admin akuntansi di apps/web/admin dengan izin ketat.
```

---

## FASE 5: Hardening Lokal dan Serah Terima

### Prompt 5.1: Keamanan
```
Tugas: audit keamanan. Jalankan pnpm audit, periksa CSP, CSRF, rate limiting, validasi input di semua
endpoint, pastikan tidak ada rahasia/PII di log, cek RBAC di setiap controller. Buat laporan temuan di
docs/SECURITY-REVIEW.md dan perbaiki yang prioritas tinggi. Jangan mengubah perilaku bisnis.
```

### Prompt 5.2: Performa dan beban
```
Tugas: uji beban dengan k6 pada checkout dan POS sync (skenario 100 pengguna bersamaan, sesuaikan dengan kemampuan laptop), analisis query
lambat, tambahkan index yang perlu lewat migrasi baru, catat hasil sebelum dan sesudah di docs/PERFORMANCE.md.
```

### Prompt 5.3: Log dan backup lokal
```
Tugas: log terstruktur (pino) ke konsol dan file di folder logs/ (diabaikan git), halaman admin sederhana
untuk melihat kegagalan pembayaran dan sinkronisasi POS, skrip backup (pg_dump) dan restore di scripts/
beserta panduan di docs/RUNBOOK.md. JANGAN membuat Dockerfile produksi, Sentry, Prometheus, atau
konfigurasi deploy apa pun: proyek ini hanya untuk localhost.
```

### Prompt 5.4: Dokumen penutup
```
Tugas: lengkapi README.md (cara menjalankan lokal, env, perintah), docs/USER-GUIDE.md (panduan admin,
kasir, gudang, akuntan dalam bahasa Indonesia), skrip migrasi data awal (produk, stok, saldo awal akuntansi),
dan checklist UAT di docs/UAT.md.
```

---

## Prompt Pendukung

### Review kode sebelum commit
```
Review perubahan terakhir (git diff) sebagai reviewer ketat. Periksa: pelanggaran AGENTS.md, bug logika,
stok/jurnal yang bisa tidak konsisten, kurang test, masalah keamanan, impor/nama fungsi yang tidak ada.
Daftar temuan berdasarkan tingkat keparahan. Jangan memperbaiki dulu; tunggu persetujuan saya.
```

### Agent terhenti atau salah arah
```
Berhenti. Jangan menulis kode baru. Jelaskan: (1) apa yang sudah selesai, (2) apa yang gagal dan pesan
error lengkapnya, (3) tiga kemungkinan penyebab, (4) rencana perbaikan terkecil. Tunggu persetujuan saya.
```

### Error build atau test
```
Berikut error-nya: <tempel error lengkap>.
Temukan akar masalah (bukan sekadar membungkam error), jelaskan singkat, perbaiki dengan perubahan
sekecil mungkin, lalu jalankan ulang lint, typecheck, dan test. Jangan menghapus atau melonggarkan test
agar lolos.
```

### Uji tampilan dengan Chrome DevTools MCP
```
Jalankan app web di localhost, buka dengan Chrome DevTools MCP pada ukuran layar mobile (390x844),
telusuri alur: katalog -> detail -> checkout. Ambil screenshot tiap langkah, tampilkan console error,
request jaringan yang gagal, dan hasil Lighthouse (Performance dan PWA). Rangkum masalah dan perbaiki
yang kecil; tanyakan dulu untuk yang besar.
```

### Catat keputusan
```
Tambahkan catatan ke docs/ASSUMPTIONS.md: semua asumsi yang kamu buat di sesi ini, alasannya, dan dampaknya
bila salah. Jika ada yang bertentangan dengan AGENTS.md, tandai jelas.
```

---

## Checklist akhir "web jadi"

- [ ] `docker compose up -d` + `pnpm dev` menjalankan api, web, pos
- [ ] Pelanggan bisa scan QR -> pilih produk -> bayar -> lacak
- [ ] Kasir bisa transaksi dengan scan barcode, termasuk saat offline
- [ ] Booking dengan DP sesuai aturan admin berjalan sampai selesai
- [ ] Stok jadi dan bahan baku konsisten (ledger = balance)
- [ ] Neraca seimbang, laporan keuangan cocok dengan transaksi
- [ ] Lighthouse PWA dan Performance >= 90
- [ ] Backup dan restore lokal (pg_dump) sudah diuji
- [ ] UAT dengan data nyata selesai
