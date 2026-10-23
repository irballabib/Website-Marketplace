# Cutbray Marketplace

Platform omnichannel brand **celana panjang cutbray**: toko online, POS kasir offline-first, booking/pre-order dengan DP, produksi (BOM, work order), dan akuntansi SAK EMKM dalam satu database.

## 🏗️ Arsitektur

```
Monorepo (pnpm + Turborepo)
├── apps/
│   ├── api/          # NestJS 10 (REST API, modular monolith)
│   ├── web/          # Next.js 15 (PWA pelanggan + /admin)
│   └── pos/          # Next.js 15 (PWA kasir offline-first)
├── packages/
│   ├── shared/       # Zod schemas, types, money/date utils
│   ├── ui/           # shadcn/ui components (shared)
│   └── config/       # ESLint, TypeScript, Tailwind presets
├── prisma/           # Schema & migrations (di apps/api/prisma)
└── infra/            # Docker Compose (opsional)
```

## 🚀 Quick Start

### Prasyarat
- Node.js ≥ 22.12.0
- pnpm ≥ 9 (`npm install -g pnpm@latest`)
- PostgreSQL 16 (via Laragon)
- Redis 7 (via Laragon)

### Install & Run
```bash
# Install dependencies
pnpm install

# Copy env & setup database
cp .env.example .env
# Edit .env dengan konfigurasi Laragon Anda
# DATABASE_URL="postgresql://postgres@localhost:5432/cutbray_dev?schema=public"

# Generate Prisma client & push schema
pnpm db:generate
pnpm db:push
pnpm db:seed

# Jalankan development (3 apps bersamaan)
pnpm dev
```

Akses:
- **Web (Pelanggan)**: http://localhost:3000
- **POS (Kasir)**: http://localhost:3002
- **API**: http://localhost:3001/api/v1
- **Swagger Docs**: http://localhost:3001/docs

### Verifikasi Kualitas
```bash
pnpm verify    # lint + typecheck + test + build
```

## 📦 Stack Utama

| Layer | Teknologi |
|-------|-----------|
| Monorepo | pnpm workspaces + Turborepo |
| Backend | NestJS 10, TypeScript strict, Prisma ORM |
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS |
| UI | shadcn/ui (Radix UI), lucide-react |
| State | TanStack Query, Zustand |
| Auth | JWT + refresh token (httpOnly cookie), Argon2id, RBAC |
| Database | PostgreSQL 16 |
| Cache/Queue | Redis 7 + BullMQ |
| File Storage | MinIO (mock adapter: local filesystem) |
| Email | SMTP via Mailhog (mock adapter: console log) |
| Payment | Adapter pattern (mock default, Midtrans sandbox opsional) |
| Shipping | Adapter pattern (mock default) |
| Notifikasi | WhatsApp mock, SMTP, Web Push |
| PWA | Workbox, Web App Manifest |
| Offline POS | IndexedDB (Dexie.js), Background Sync |
| Test | Vitest (unit), Supertest (API), Playwright (E2E) |
| Log | pino (JSON) |

## 🗂️ Modul Backend (Fase Bertahap)

| Fase | Modul |
|------|-------|
| 0 | Fondasi: workspace, config, health check, Prisma schema awal |
| 1 | Identity, Catalog, Inventory (stok barang jadi), Payment adapter |
| 2 | Order (QR, checkout), POS (offline-first), Shipping, Notifikasi |
| 3 | Booking (DP, state machine), Production (BOM, Work Order) |
| 4 | Accounting (CoA, jurnal double-entry, laporan keuangan) |
| 5 | Hardening lokal, load test, audit, backup/restore, UAT |

## 🔐 Environment Variables

Salin `.env.example` ke `.env` dan sesuaikan:

```env
# Database (Laragon PostgreSQL)
DATABASE_URL="postgresql://postgres@localhost:5432/cutbray_dev?schema=public"

# Redis (Laragon)
REDIS_URL="redis://localhost:6379"

# Auth
JWT_SECRET="your-super-secret-min-32-chars"
JWT_ACCESS_TTL="15m"
JWT_REFRESH_TTL="7d"

# Adapters (mock = default localhost)
STORAGE_ADAPTER=mock
EMAIL_ADAPTER=mock
PAYMENT_ADAPTER=mock
SHIPPING_ADAPTER=mock
WHATSAPP_ADAPTER=mock
```

## 🧪 Testing

```bash
# Unit tests
pnpm test

# API tests (Supertest)
cd apps/api && pnpm test

# E2E tests (Playwright) - Fase 2+
```

## 📝 Konvensi Kode

- **TypeScript strict** — no `any` tanpa alasan
- **Uang** — `Decimal` (decimal.js), simpan `NUMERIC(18,2)`, IDR only
- **ID** — UUID v7, soft delete (`deleted_at`)
- **Waktu** — simpan UTC, tampilkan Asia/Jakarta
- **Nama file** — `kebab-case.ts`, class `PascalCase`, tabel `snake_case`
- **API** — REST `/api/v1`, cursor pagination, `Idempotency-Key` header
- **Error response** — `{ code, message, details? }`
- **UI** — Indonesia, kode/komentar English, touch target ≥ 44px

## 📚 Dokumentasi

- `AGENTS.md` — Panduan AI agent (ini file utama)
- `docs/ASSUMPTIONS.md` — Asumsi & keputusan desain
- `docs/ADR/` — Architecture Decision Records
- Swagger UI: `/docs` di API

## 🤝 Contributing

1. Baca `AGENTS.md` sepenuhnya
2. Kerjakan **satu task kecil** per sesi (maks ~300 baris)
3. Rencana dulu → kode → `pnpm verify` → commit Conventional
4. Jangan tambah dependency di luar stack tanpa persetujuan

## 📄 License

Proprietary - Cutbray Internal Use Only