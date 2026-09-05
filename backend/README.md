# Mini Stock Take -- Backend

Implementasi berdasarkan `docs/BUSINESS_RULES.md` v2.2,
`docs/DATABASE_SCHEMA.md` v2.4, `docs/DATA_FORMAT.md` v2.2,
`docs/PROCESSING_ENGINE_SPEC.md` v1.2. Model: Itemize adalah
checklist, Physical Qty selalu input manual.

**Status: HTTP layer sudah ada dan sudah di-test end-to-end dengan
PostgreSQL sungguhan** (bukan cuma typecheck) -- lihat bagian Testing
di bawah. Masih ada 1 celah keamanan besar yang disengaja (lihat
Peringatan) sebelum ini boleh dipakai user sungguhan.

## Struktur

```
migrations/            -- 001 (schema awal), 002 (pivot Itemize), 003 (finalize lock trigger)
src/
  parsers/
    systemDb.ts         -- parser System DB (9 kolom, non-RFC4180 CSV)
    itemize.ts           -- parser Itemize (dedup checklist)
  api/                    -- logic inti (dipanggil oleh src/http/)
    session.ts, systemDbSnapshot.ts, formGeneration.ts,
    uploadItemize.ts, physicalCount.ts, workingView.ts, finalize.ts
  http/                   -- HTTP layer (Express) di atas src/api/
    server.ts             -- entrypoint, jalankan dengan: node dist/http/server.js
    sessionRoutes.ts, systemDbRoutes.ts, rackRoutes.ts,
    itemizeRoutes.ts, physicalCountRoutes.ts, finalizeRoutes.ts
    errors.ts             -- mapping Error("KODE") -> HTTP status
legacy/                   -- TIDAK dipakai, model lama (COUNT-based), rollback reference saja
scripts/manual-test.js    -- test parser terhadap file asli
```

## ⚠️ PERINGATAN -- belum aman untuk user sungguhan

Semua route di `src/http/*Routes.ts` saat ini **mempercayai
`storeId`/`userId` langsung dari body request**, karena auth
middleware belum dibangun. Ini melanggar `DATABASE_SCHEMA.md` §7
("Do not trust frontend store_id") **dengan sengaja, sementara**, supaya
HTTP layer bisa ditest dulu end-to-end. Setiap route punya komentar
peringatan yang sama. **Jangan expose ke internet/user sungguhan
sebelum auth middleware terpasang.**

## Endpoint yang tersedia

| Method | Path | Fungsi |
|---|---|---|
| GET | `/health` | cek server hidup |
| POST | `/sessions/resolve` | resolve/buat session aktif untuk toko |
| GET | `/sessions/resume/:storeId` | info resume (rack terakhir, progress) |
| POST | `/sessions/:sessionId/system-db` | upload System DB (multipart `file`) |
| POST | `/sessions/:sessionId/racks/:rack/open` | buka rack (generate form + working view) |
| GET | `/sessions/:sessionId/racks/:rack` | working view rack (tanpa generate ulang) |
| POST | `/sessions/:sessionId/itemize` | upload Itemize (multipart `file`) |
| PUT | `/items/:itemId/physical-qty` | isi/ubah Physical Qty satu baris |
| POST | `/sessions/:sessionId/finalize` | finalize session |

## Menjalankan

```bash
npm install
npm run typecheck
npx tsc
psql "$DATABASE_URL" -f migrations/001_init_schema.sql
psql "$DATABASE_URL" -f migrations/002_physical_count_workflow.sql
psql "$DATABASE_URL" -f migrations/003_finalize_physical_workflow.sql
DATABASE_URL="postgres://..." PORT=3001 node dist/http/server.js
```

## Testing -- sudah divalidasi, bukan cuma typecheck

Parser sudah dites terhadap file asli (`scripts/manual-test.js`).
HTTP layer sudah dites end-to-end dengan **PostgreSQL sungguhan**
(bukan mock): resolve session -> upload System DB -> buka rack ->
upload Itemize -> isi Physical Qty -> finalize -> verifikasi trigger
kunci finalize. Semua jalur berhasil sesuai `BUSINESS_RULES.md`,
termasuk:
- finalize **ditolak (409)** saat masih ada baris qty kosong
- item yang diisi manual TANPA pernah di-itemize tetap muncul sebagai
  `COUNTED` (bug ini ditemukan & diperbaiki di `workingView.ts` saat
  testing -- versi sebelumnya salah menampilkan `NOT SCANNED`)
- upload System DB kedua ke session yang sama ditolak (409, snapshot
  sudah terkunci)

## Diketahui perlu dibersihkan

1. `legacy/` -- aman dihapus kapan saja.
2. Belum ada auth middleware (lihat Peringatan di atas) -- prioritas berikutnya.
3. Belum ada integrasi Keepstock Google Sheets.
4. Belum ada frontend yang memanggil API ini.
