# Mini Stock Take — Backend (starter)

Kode ini adalah implementasi awal berdasarkan `BUSINESS_RULES.md`,
`DATABASE_SCHEMA.md`, `DATA_FORMAT.md`, dan `PROCESSING_ENGINE_SPEC.md`
(lihat folder `docs/` di repo utama). **Parser sudah diuji terhadap
file asli** (`XWGN_-_Tarikan_data_2.txt`, `Itemize_XWGN_dummy.xlsx`),
bukan cuma teori — lihat `scripts/manual-test.js`.

## Struktur

```
migrations/001_init_schema.sql   -- schema lengkap (PostgreSQL)
src/parsers/systemDb.ts          -- parser System DB (lihat catatan CSV di bawah)
src/parsers/scanResult.ts        -- parser Scan Result (derivasi Scan Qty via COUNT)
src/api/session.ts               -- resolve/resume session, rack-scoped fetch
src/api/uploadScanResult.ts      -- upsert scan_results dengan recount semantics
scripts/manual-test.js           -- test manual terhadap file asli
```

## Menjalankan

```bash
npm install
npm run typecheck          # tsc --noEmit
npx tsc                    # compile ke dist/
node scripts/manual-test.js   # test parser terhadap file asli (sesuaikan path)
```

Migration belum dijalankan otomatis — jalankan manual ke instance
Postgres/Supabase Anda:

```bash
psql "$DATABASE_URL" -f migrations/001_init_schema.sql
```

## ⚠️ Temuan baru dari testing yang BELUM dikonfirmasi bisnis

Saat parser diuji ke file asli, ditemukan **9.436 baris (~10% dari
83.131 baris)** di System DB yang punya Rack Number **kosong (`''`)**
— beda dari kasus `-` yang sudah dikonfirmasi (§`BUSINESS_RULES.md`
§11). Saat ini baris-baris ini **ditolak sebagai invalid** oleh
parser (tidak diimport sama sekali). Ini artinya ~10% data toko XWGN
saat ini tidak masuk ke sistem sampai ada keputusan bisnis.

**Perlu dikonfirmasi ke pemilik proses:** apakah Rack Number kosong
(`''`) punya arti yang sama dengan `-` (→ dikelompokkan ke `NO RACK`),
atau punya arti berbeda, atau memang barang yang sudah tidak aktif
dan boleh diabaikan? Lihat `src/parsers/systemDb.ts` fungsi
`normalizeRack` — saat ini hanya menangani `-`.

## Catatan implementasi penting

- **File System DB bukan RFC4180 CSV murni** — kolom Description
  kadang berisi koma mentah (desimal ala Indonesia, mis. `12,5 GR`)
  dan tanda kutip mentah (mis. `1/2"`) tanpa quoting. Parser CSV
  standar (dicoba: Papaparse, Python `csv`) salah membaca ini dan
  kehilangan baris secara diam-diam. Parser di sini sengaja **tidak**
  memakai library CSV quote-aware — lihat komentar di
  `src/parsers/systemDb.ts`.
- `uploadScanResult.ts` melakukan SELECT-lalu-INSERT/UPDATE per baris
  di dalam loop (bukan bulk statement) demi kejelasan logic recount +
  history. Ini cukup untuk skala ~10rb baris per file scan
  (`DATABASE_SCHEMA.md` §5.4), tapi kalau nanti butuh lebih cepat,
  bisa dioptimasi jadi satu bulk `UPSERT ... RETURNING` dengan
  `UNNEST`.

## Belum dikerjakan (lihat DEVELOPMENT_STATUS.md)

- Endpoint HTTP (Next.js API routes) yang memanggil fungsi-fungsi ini
- Auth middleware (Supabase Auth + role check)
- Parser & endpoint untuk System DB upload (insert ke
  `system_inventory_snapshots` + `system_inventory_rows`, bulk insert)
- Finalize endpoint + `session_result_summary` calculation
- Keepstock Google Sheets sync
