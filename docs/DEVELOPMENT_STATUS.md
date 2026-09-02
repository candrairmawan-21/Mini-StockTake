# DEVELOPMENT_STATUS.md

# Mini Stock Take --- Development Status

Version: 1.0
Tanggal review: berdasarkan kode di branch `main` per commit terakhir
yang di-review.

## Status Dokumen

Dokumen ini membandingkan kode yang **sudah ada** (`index.html`,
`js/app.js`, `css/style.css`) dengan yang **diwajibkan** oleh
`BUSINESS_RULES.md` dan `DATABASE_SCHEMA.md`. Tujuannya supaya siapa
pun (manusia atau AI assistant) yang melanjutkan project tahu persis
apa yang sudah benar, apa yang masih prototype, dan apa yang harus
diperbaiki sebelum dianggap production-ready.

**Kesimpulan singkat: kode saat ini adalah prototype UI/UX frontend-only
(localStorage + Google Apps Script), belum mengikuti sebagian besar
BUSINESS_RULES.md yang non-negotiable.** Jangan menganggap kode saat
ini sebagai baseline yang benar; gunakan `BUSINESS_RULES.md` dan
`DATABASE_SCHEMA.md` sebagai acuan, bukan kode existing.

------------------------------------------------------------------------

## 1. Bug Kritis yang Ditemukan di Kode Saat Ini

### Bug #1 --- Kolom Description salah geser (System Database)

`js/app.js` membaca `row[8]` untuk Description:

``` js
db[String(row[0]).trim()] = { qtySystem: parseInt(row[3]) || 0, description: String(row[8]).trim() };
```

Menurut `DATA_FORMAT.md` §1, Kolom 8 (bisnis, 1-based) = index **7**
(array), bukan index 8. Index 8 sebenarnya adalah Kolom 9. Perlu
diverifikasi ulang terhadap contoh file sumber asli sebelum
diperbaiki, karena kemungkinan (a) kode salah, atau (b) dokumentasi
kolom perlu disesuaikan dengan sumber data riil MR DIY. **Jangan
menebak --- konfirmasi dengan sample file asli.**

### Bug #2 --- Price tidak pernah di-parse

`js/app.js` tidak membaca Price sama sekali dari System Database.
Akibatnya `Variance Value` (BUSINESS_RULES §16) tidak bisa dihitung
sama sekali di kode saat ini --- fitur ini belum ada, bukan cuma buggy.

### Bug #3 --- Kolom Scan Result salah geser & Scan Qty tidak pernah dibaca

``` js
if (row.length >= 3 && row[1]) {
    const sku = String(row[1]).trim();
    const rack = String(row[2]).trim();
```

Kode membaca SKU dari index 1 dan Rack dari index 2 --- padahal menurut
`DATA_FORMAT.md` §3, SKU = index 0, Rack = index 1, Scan Qty = index 2.
**Scan Qty dari file tidak pernah diambil sama sekali** --- field
`qtyFisik` di kode selalu diinisialisasi kosong (`qtyFisik: ""`) dan
hanya diisi manual oleh user lewat input di tabel. Ini artinya fitur
"upload hasil scan" pada kode saat ini secara fungsional hanya
memakai file scan untuk **menentukan SKU per rack**, bukan untuk
mengimpor Scan Qty --- berbeda dari yang dimaksud `BUSINESS_RULES.md`
§6.

Juga tidak ada penanganan header row untuk Scan Result (loop mulai
dari `i = 0`), berbeda dengan Master DB yang mulai dari `i = 1`.

### Bug #4 --- Login bukan mekanisme yang divalidasi backend

`Config.UserMapping` (ID toko → kode toko) di-hardcode di
`js/app.js`, berjalan sepenuhnya di browser. Ini melanggar
`BUSINESS_RULES.md` §3 ("Validasi store wajib dilakukan di backend")
dan §21 ("Semua query backend harus dibatasi berdasarkan store/session
yang berwenang"). Saat ini tidak ada backend sama sekali yang
memvalidasi apa pun --- semua logic ada di client.

------------------------------------------------------------------------

## 2. Feature Matrix

  Fitur (BUSINESS_RULES.md)                     Status kode saat ini
  ----------------------------------------------- ------------------------------------------------
  Store Master 25 toko (§2)                       ✅ Ada (hardcoded di `Config.UserMapping`)
  Store isolation ditegakkan di backend (§2, §21)  ❌ Tidak ada backend; tidak ditegakkan
  Login berbasis username tervalidasi backend (§3) ❌ Login = pilih ID toko, tanpa password/backend
  Stock Take Session dengan status (§4)            ❌ Tidak ada konsep session/status sama sekali
  Upload System Database (§5)                      ⚠️ Ada, tapi kolom salah (Bug #1, #2)
  Upload tidak menghapus scan lama (§5, §15)       ❌ Upload Master DB baru mengganti `mainDatabase`
                                                    sepenuhnya di localStorage; tidak ada histori
                                                    per-hari
  Upload Scan Result incremental (§6)              ❌ Upload scan baru mengganti seluruh `racksData`
                                                    (`State.racksData = groupedRacks`), bukan
                                                    upsert. Data hari sebelumnya hilang.
  Merge key SKU + Rack Number (§7)                 ⚠️ Rack di-grouping benar, tapi SKU dari kolom
                                                    salah (Bug #3)
  NOT SCANNED rule (§8, §9)                        ❌ Tidak diimplementasikan. Tidak ada logic yang
                                                    menampilkan SKU System yang tidak ter-scan.
  Keepstock lookup (§10, §11)                      ❌ Tidak ada. Tidak ada integrasi Google Sheets
                                                    API untuk Keepstock sama sekali.
  Main Working Table lengkap (§12)                 ⚠️ Sebagian: No, SKU, Description, System Qty,
                                                    Qty Fisik, Variance ada. Rack ada di header,
                                                    bukan di kolom tabel. Price, Keepstock, Box,
                                                    KS Qty, Status **tidak ada**.
  Rack navigation (§13)                             ✅ Ada dan berfungsi (Prev/Next + counter)
  Save & Update ke backend (§14)                    ⚠️ "Save" mengirim ke Google Apps Script
                                                    (`fetch ... mode: 'no-cors'`), bukan database
                                                    ber-autorisasi. Response tidak bisa dibaca
                                                    (no-cors), jadi status sukses hanya asumsi.
  Multi-day stock take (§15)                        ❌ Tidak didukung; state tidak per-session/hari
  Variance qty (§16)                                ✅ Dihitung dengan benar (`fisik - qtySystem`)
  Variance value (§16)                              ❌ Tidak ada (bergantung pada Price yang belum
                                                    di-parse, lihat Bug #2)
  Accuracy % (§17)                                  ❌ Belum dihitung/ditampilkan di mana pun
  Finalize (§18)                                    ❌ Tidak ada konsep finalize sama sekali
  Final Result summary (§19)                        ❌ Tidak ada
  PDF export (§20)                                  ✅ Ada, per rack yang sedang tampil (via jsPDF)
  Security & data isolation (§21)                   ❌ Tidak ada backend untuk menegakkan ini
  Audit trail (§22)                                 ❌ Tidak ada pencatatan upload/user/waktu apa pun

Legenda: ✅ Sesuai • ⚠️ Sebagian/perlu perbaikan • ❌ Belum ada

------------------------------------------------------------------------

## 3. Arsitektur Saat Ini vs Target

**Saat ini:**

``` text
Browser (index.html + app.js)
   ├── localStorage (satu-satunya "database")
   └── fetch (no-cors) → Google Apps Script → Google Sheets
```

Tidak ada server/API/database sungguhan. Semua validasi, semua
"autentikasi", semua business logic berjalan di client dan bisa
dilihat/dimodifikasi lewat DevTools browser.

**Target (sesuai `DATABASE_SCHEMA.md` §24):**

``` text
Frontend (Next.js + React + TypeScript)
   │
   ▼
Backend API (Next.js server layer, menegakkan store isolation)
   │
   ▼
PostgreSQL / Supabase  ←→  Supabase Auth  ←→  Google Sheets API (Keepstock)
```

------------------------------------------------------------------------

## 4. Rekomendasi Urutan Perbaikan

Prioritas berdasarkan risiko bisnis (data hilang / salah hitung),
bukan urutan estetika:

1.  **Stop dulu pengembangan fitur baru di atas kode frontend saat
    ini.** Kode ini adalah prototype tampilan, bukan fondasi yang
    aman untuk dilanjutkan langsung ke production sesuai
    `BUSINESS_RULES.md`.
2.  Verifikasi ulang struktur kolom file sumber asli (System Database
    & Scan Result) dari toko MR DIY untuk memastikan `DATA_FORMAT.md`
    §2--3 benar-benar cocok dengan file riil --- ini menentukan apakah
    Bug #1 dan #3 adalah bug kode atau dokumentasi yang perlu
    disesuaikan.
3.  Bangun backend + database sesuai `DATABASE_SCHEMA.md` (migration,
    seed 25 toko, auth).
4.  Bangun parser sesuai `DATA_FORMAT.md` yang sudah diverifikasi,
    dengan constant kolom eksplisit (bukan angka ajaib).
5.  Implementasikan merge engine + `NOT SCANNED` rule.
6.  Implementasikan session, finalize, dan Session Result Summary
    (`DATABASE_SCHEMA.md` §15a).
7.  Baru migrasikan UI existing (yang tampilannya sudah cukup baik)
    agar terhubung ke backend baru, bukan localStorage.
