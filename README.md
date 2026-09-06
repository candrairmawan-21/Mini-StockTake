# Mini Stock Take

Backend dan web UI saat ini mengikuti `docs/BUSINESS_RULES.md` v2.2,
`docs/DATABASE_SCHEMA.md` v2.4, `docs/DATA_FORMAT.md` v2.2,
`docs/PROCESSING_ENGINE_SPEC.md` v1.2. Model: Itemize adalah
checklist, Physical Qty selalu input manual.

**Status:** HTTP layer + auth middleware sudah ada dan sudah
di-test (lihat bagian Testing) -- tapi **integrasi Supabase sungguhan
belum pernah dicoba** (lingkungan testing tidak punya akses jaringan
ke Supabase). Jangan expose ke publik sebelum itu diverifikasi.

## Struktur

Dokumentasi teknis utama ada di `docs/` (`AI_HANDOFF.md`, `DEVELOPMENT_STATUS.md`, `BUSINESS_RULES.md`, `DATABASE_SCHEMA.md`, `DATA_FORMAT.md`, `PROCESSING_ENGINE_SPEC.md`).

```
migrations/    -- 001 (schema awal), 002 (pivot Itemize), 003 (finalize lock),
                  004 (index idempotency + auth lookup)
src/
  parsers/       -- systemDb.ts, itemize.ts (sudah dites ke file asli)
  api/           -- logic inti: session, systemDbSnapshot, formGeneration,
                    uploadItemize, physicalCount, workingView, finalize
  http/          -- HTTP layer (Express)
    auth.ts        -- Supabase Auth verify + role/store/session isolation
    server.ts       -- entrypoint: node dist/http/server.js
    *Routes.ts      -- satu file per resource, semua pakai req.authUser
legacy/        -- TIDAK dipakai, model lama, rollback reference saja
scripts/manual-test.js
.env.example   -- daftar env var yang wajib di-set
```

## ⚠️ Yang sudah aman vs yang belum

**Sudah:**
- Semua route wajib bearer token Supabase yang valid (401 kalau tidak ada/salah)
- Store isolation: user toko A tidak bisa akses data toko B (403 `STORE_ACCESS_DENIED`)
- ADMIN/SUPERVISOR bisa lintas toko, STORE_USER tidak
- Upload idempotent: file yang sama (hash SHA-256) tidak diproses ulang

**Belum:**
- Belum pernah dites dengan token Supabase SUNGGUHAN (cuma dites logic-nya langsung + jalur reject)
- Belum ada flow provisioning: kalau user baru signup di Supabase, tidak ada yang otomatis bikin row di tabel `users` -- harus dibuatkan manual/endpoint terpisah, kalau tidak user akan selalu dapat 403 `USER_NOT_PROVISIONED`
- Belum ada rate limiting/CORS

## Menjalankan

```bash
cp .env.example .env   # isi DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY
npm install
npm run typecheck
npx tsc
psql "$DATABASE_URL" -f migrations/001_init_schema.sql
psql "$DATABASE_URL" -f migrations/002_physical_count_workflow.sql
psql "$DATABASE_URL" -f migrations/003_finalize_physical_workflow.sql
psql "$DATABASE_URL" -f migrations/004_security_and_idempotency.sql
node dist/http/server.js
```

Semua request ke endpoint selain `/health` wajib header:
```
Authorization: Bearer <token dari Supabase Auth>
```

## Endpoint

| Method | Path | Fungsi |
|---|---|---|
| GET | `/health` | cek server hidup (tidak perlu auth) |
| POST | `/sessions/resolve` | resolve/buat session aktif untuk toko user yang login |
| GET | `/sessions/resume/:storeId` | info resume |
| POST | `/sessions/:sessionId/system-db` | upload System DB (multipart `file`) |
| POST | `/sessions/:sessionId/racks/:rack/open` | buka rack |
| GET | `/sessions/:sessionId/racks/:rack` | working view rack |
| POST | `/sessions/:sessionId/itemize` | upload Itemize (multipart `file`) |
| PUT | `/items/:itemId/physical-qty` | isi/ubah Physical Qty |
| POST | `/sessions/:sessionId/finalize` | finalize session |

## Testing yang sudah dilakukan (jujur, termasuk batasannya)

**Dengan PostgreSQL sungguhan (bukan mock):**
- Full flow: resolve session -> upload System DB -> buka rack -> upload
  Itemize -> isi Physical Qty -> finalize -> berhasil dengan angka
  variance/accuracy yang benar
- Finalize ditolak (409) saat masih ada baris qty kosong
- Upload System DB kedua ke session yang sama ditolak (409, snapshot terkunci)
- Item yang diisi manual tanpa pernah di-itemize tetap muncul `COUNTED` (bug
  ditemukan & diperbaiki saat testing, versi sebelumnya salah bilang `NOT SCANNED`)
- Request tanpa header Authorization -> 401
- Request dengan token asal-asalan -> 401 (tidak crash meski Supabase
  tidak bisa dihubungi -- fail closed)
- Authorization logic diuji langsung (bypass HTTP): user toko A akses
  toko A -> lolos; user toko A akses toko B -> ditolak; ADMIN lintas
  toko -> lolos; session tidak ada -> error yang benar

**TIDAK bisa dites di sandbox ini** (tidak ada akses jaringan ke Supabase):
- Token Supabase yang benar-benar valid berhasil login dan meneruskan
  `req.authUser` dengan benar end-to-end

## Diketahui perlu dibersihkan

1. `legacy/` -- aman dihapus kapan saja.
2. Belum ada integrasi Keepstock Google Sheets (prioritas berikutnya).
3. Belum ada frontend yang memanggil API ini.
4. Rate limiting/CORS belum dikonfigurasi.
5. Flow provisioning user baru belum ada.

## Quick web run

The repository now includes a minimal browser UI under `frontend/`. The Express
server serves it from `/`, so the first milestone can run as one service:

```bash
npm install
npx tsc
node dist/http/server.js
```

Then open `http://localhost:3001`. The browser uses Supabase Auth and calls the
same-origin API. `GET /config` only returns the public Supabase URL + anon key;
never put a service-role key in the frontend.

The UI intentionally covers the critical path only: login → resolve/resume
session → upload System DB → upload Itemize → open rack → enter Physical Qty
→ finalize. Keepstock, PDF, admin provisioning and production deployment remain
next milestones.

## Frontend UI
The browser UI follows the legacy ERP-style Midnorth Backend System reference: Login -> Home -> Stock Take Preparation -> Stock Take Entry. Upload feedback shows loading/success/error states, and store users see their assigned store name in Prepare By and User Posting.
