# Mini Stock Take — Backend

Implementasi berdasarkan `docs/BUSINESS_RULES.md` v2.2,
`docs/DATABASE_SCHEMA.md` v2.4, `docs/DATA_FORMAT.md` v2.2,
`docs/PROCESSING_ENGINE_SPEC.md` v1.2. Model saat ini: **Itemize
adalah checklist, Physical Qty selalu input manual** (bukan lagi
derivasi otomatis dari duplikasi baris — lihat `DEVELOPMENT_STATUS.md`
untuk riwayat perubahan ini).

## Struktur

```
migrations/
  001_init_schema.sql               -- schema awal
  002_physical_count_workflow.sql   -- pivot ke Itemize checklist + stock_take_items
  003_finalize_physical_workflow.sql -- rename kolom summary + trigger kunci finalize
src/
  parsers/
    systemDb.ts    -- parser System DB (9 kolom, non-RFC4180 CSV -- lihat komentar di file)
    itemize.ts     -- parser Itemize (dedup checklist, BUKAN derivasi qty)
  api/
    session.ts           -- resolve/resume session, working view, snapshot assignment
    systemDbSnapshot.ts  -- import System DB (bulk insert, snapshot dikunci per session)
    formGeneration.ts    -- seed stock_take_items dari System DB per rack
    uploadItemize.ts     -- proses upload Itemize -> update status checklist
    physicalCount.ts     -- input manual Physical Qty + history
    workingView.ts        -- working view per-rack (duplikat sebagian dengan session.ts, lihat catatan)
    finalize.ts           -- validasi & kunci session
legacy/
  scanResult.ts          -- TIDAK dipakai. Model lama (qty dari COUNT baris duplikat)
  uploadScanResult.ts    -- TIDAK dipakai. Masih tulis ke scan_results yang deprecated
scripts/
  manual-test.js         -- test manual parser terhadap file asli
```

## Diketahui perlu dibersihkan (lihat DEVELOPMENT_STATUS.md section 3)

1. `legacy/` -- genuinely dead code, aman dihapus kapan saja setelah
   dikonfirmasi tidak ada yang perlu di-rollback ke model lama.
2. Duplikasi di `session.ts` -- fungsi `getRackWorkingView`,
   `assignSystemSnapshot` tumpang tindih dengan `workingView.ts` dan
   `systemDbSnapshot.ts`. Keduanya sudah benar (pakai
   `stock_take_items`, bukan tabel deprecated), tapi sebaiknya pilih
   satu sebelum HTTP layer dibangun di atasnya.

## Menjalankan

```bash
npm install
npm run typecheck
npx tsc
node scripts/manual-test.js   # sesuaikan path file test di dalamnya
```

```bash
psql "$DATABASE_URL" -f migrations/001_init_schema.sql
psql "$DATABASE_URL" -f migrations/002_physical_count_workflow.sql
psql "$DATABASE_URL" -f migrations/003_finalize_physical_workflow.sql
```

## Belum dikerjakan (lihat DEVELOPMENT_STATUS.md section 4)

- HTTP layer -- semua fungsi di `src/api/*.ts` masih function biasa
  (terima `Pool` + argumen), belum dibungkus jadi route/endpoint.
- Auth middleware -- belum ada Supabase Auth/role check/store
  isolation enforcement.
- Frontend baru -- belum ada UI yang memanggil backend ini.
- Keepstock integration -- belum ada client Google Sheets API.
- PDF -- export PDF di prototype lama belum terhubung ke backend ini.
