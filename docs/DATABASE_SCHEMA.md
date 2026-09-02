# DATABASE_SCHEMA.md

# Mini Stock Take --- Database Schema

Version: 1.1

## Changelog

-   **1.1** --- Disinkronkan dengan `BUSINESS_RULES.md` v1.0. Perubahan:
    ditambahkan §12a Session Result Summary (memenuhi BUSINESS_RULES §19),
    kolom `variance_value` pada Working Result View, referensi silang
    audit trail (§22), dan catatan hierarki dokumen.
-   **1.0** --- Versi awal.

## Status Dokumen & Hierarki

Dokumen ini adalah **turunan teknis** dari `BUSINESS_RULES.md`. Jika
ditemukan konflik antara dokumen ini dan `BUSINESS_RULES.md`, maka
`BUSINESS_RULES.md` yang berlaku (lihat `BUSINESS_RULES.md` §24).

Urutan dokumen yang mengikat:

``` text
BUSINESS_RULES.md   (aturan bisnis, sumber kebenaran)
        │
        ▼
DATABASE_SCHEMA.md   (dokumen ini --- struktur data)
        │
        ▼
DATA_FORMAT.md       (spesifikasi format file sumber)
        │
        ▼
DEVELOPMENT_STATUS.md (status implementasi vs rencana)
        │
        ▼
AI_HANDOFF.md        (ringkasan handoff untuk lanjutan development)
        │
        ▼
Kode Aplikasi
```

## 1. Tujuan

Dokumen ini mendefinisikan struktur database untuk aplikasi Mini Stock
Take.

Database harus mendukung: - 25 toko aktif saat ini dan jumlah toko dapat
bertambah/berkurang. - Login berdasarkan toko/user. - Upload System
Database harian. - Upload Scan Result secara bertahap/multi-hari. -
Lookup Keepstock dari satu Google Spreadsheet master yang memiliki
banyak worksheet; satu worksheet mewakili satu toko. - Merge data
berdasarkan SKU + Rack Number. - Menampilkan SKU yang ada di System
Database tetapi tidak ada di Scan Result sebagai `NOT SCANNED`. - Save &
Update hasil scan. - Riwayat upload dan audit. - Finalize Stock Take. -
Perhitungan variance dan accuracy setelah finalisasi.

## 2. Prinsip Data Utama

### 2.1 Store isolation

Setiap user hanya boleh mengakses data toko yang menjadi tanggung
jawabnya. Enforcement wajib dilakukan di backend/database, bukan hanya
dengan filter di frontend.

### 2.2 Store Code vs Store Name

-   `store_code` adalah identifier bisnis, contoh `JC2021`.
-   `store_name` adalah nama toko/worksheet Keepstock, contoh `XWGN`.
-   Jangan menggunakan GID sebagai identifier bisnis.
-   GID/sheetId Google Sheets hanya identifier teknis dan boleh disimpan
    untuk mempercepat/menjaga mapping worksheet.

### 2.3 Keepstock adalah external master

Keepstock tetap berada di Google Spreadsheet master dan dapat berubah
terus-menerus.

Spreadsheet ID: `14J84e5XQ9Jddhr0HiEvOe68RgMQwWPt9Ik7ED0VvqFE`

Aplikasi tidak mengharuskan Keepstock di-upload oleh toko.

### 2.4 Merge key

Untuk data Stock Take, kombinasi utama: `SKU + Rack Number`

SKU yang sama di rack berbeda harus dianggap sebagai baris berbeda.

------------------------------------------------------------------------

## 3. Entity Relationship Overview

``` text
stores
  │
  ├── users
  │
  ├── keepstock_sheet_mapping
  │
  └── stock_take_sessions
          │
          ├── upload_batches
          │       └── raw uploaded files
          │
          ├── system_inventory
          │
          └── scan_results

Google Sheets Keepstock
  │
  └── keepstock_sheet_mapping
          │
          └── Keepstock lookup
```

------------------------------------------------------------------------

# 4. Tables

## 4.1 `stores`

Master seluruh toko.

  ------------------------------------------------------------------------------
  Column        Type                        Null Key           Description
  ------------- -------------- ----------------- ------------- -----------------
  id            uuid                          NO PK            Internal store ID

  store_code    varchar(20)                   NO UNIQUE        Kode toko, contoh
                                                               JC2021

  store_name    varchar(100)                  NO               Nama
                                                               toko/worksheet,
                                                               contoh XWGN

  username      varchar(100)                 YES UNIQUE        Username login
                                                               jika model login
                                                               sederhana
                                                               digunakan

  is_active     boolean                       NO               Status toko aktif

  created_at    timestamptz                   NO               Waktu dibuat

  updated_at    timestamptz                   NO               Waktu terakhir
                                                               diubah
  ------------------------------------------------------------------------------

### Constraints

-   `store_code` unique.
-   `store_name` unique untuk mapping worksheet.
-   Toko inactive tidak boleh membuat sesi baru.

------------------------------------------------------------------------

## 4.2 Initial Store Master

Data awal:

  Store Code   Store Name
  ------------ ------------
  JC2017       XGSS
  JC8001       XBDS
  JC2021       XWGN
  JC1029       XPRC
  JC1020       XRES
  JC3001       XWDR
  JC2001       SLGD
  JC2008       EPPKA
  JC5005       XLWU
  JC6003       XJLB
  JC2012       XBLO
  JC1014       XLUN
  JC2018       XSRS
  JC4006       XSRA
  JC8005       XSRG
  JC3003       XRMO
  JC1005       XKTR
  JC5002       XPMH
  JC1012       XOYO
  JC2002       SLSQ
  JC5003       XKTS
  JC8006       XDLU
  JC2016       XPKL
  JC1027       XKLA
  JC8004       XKLN

------------------------------------------------------------------------

## 4.3 `users`

User/login aplikasi.

  Column       Type             Null Key      Description
  ------------ -------------- ------ -------- -------------------------
  id           uuid               NO PK       User ID
  store_id     uuid              YES FK       Toko yang dimiliki user
  username     varchar(100)       NO UNIQUE   Username
  role         varchar(30)        NO          Role user
  is_active    boolean            NO          Status user
  created_at   timestamptz        NO          Waktu dibuat
  updated_at   timestamptz        NO          Waktu diubah

### Recommended roles

-   `STORE_USER`
-   `ADMIN`
-   `SUPERVISOR`

Role dapat diperluas tanpa mengubah struktur utama.

Password tidak disimpan plaintext. Jika menggunakan Supabase
Auth/identity provider, credential diserahkan kepada authentication
provider.

------------------------------------------------------------------------

# 5. `stock_take_sessions`

Satu sesi Stock Take untuk satu toko.

  Column         Type            Null Key      Description
  -------------- ------------- ------ -------- -------------------------
  id             uuid              NO PK       Session ID
  store_id       uuid              NO FK       Toko
  session_code   varchar(50)       NO UNIQUE   Kode sesi
  start_date     date              NO          Tanggal mulai
  status         varchar(20)       NO          IN_PROGRESS / FINALIZED
  finalized_at   timestamptz      YES          Waktu finalisasi
  finalized_by   uuid             YES FK       User yang finalisasi
  created_at     timestamptz       NO          Waktu dibuat
  updated_at     timestamptz       NO          Waktu diubah

### Rules

-   Satu session hanya milik satu toko.
-   Session dapat berlangsung beberapa hari.
-   Selama `IN_PROGRESS`, scan masih dapat diperbarui.
-   `FINALIZED` mengunci perubahan normal.
-   Reopen/unfinalize hanya melalui permission khusus.

------------------------------------------------------------------------

# 6. `upload_batches`

Mencatat setiap file yang di-upload.

  ------------------------------------------------------------------------------------
  Column              Type                        Null Key           Description
  ------------------- -------------- ----------------- ------------- -----------------
  id                  uuid                          NO PK            Upload ID

  session_id          uuid                          NO FK            Session

  upload_type         varchar(30)                   NO               SYSTEM_DATABASE /
                                                                     SCAN_RESULT

  file_name           varchar(255)                  NO               Nama file

  storage_path        text                         YES               Lokasi raw file

  upload_date         date                          NO               Tanggal upload

  uploaded_by         uuid                          NO FK            User uploader

  processing_status   varchar(20)                   NO               PENDING /
                                                                     PROCESSING /
                                                                     SUCCESS / FAILED

  error_message       text                         YES               Detail error

  created_at          timestamptz                   NO               Waktu upload
  ------------------------------------------------------------------------------------

### Audit rule

Raw file sebaiknya disimpan di object storage untuk audit dan
troubleshooting.

------------------------------------------------------------------------

# 7. `system_inventory`

Data System Database yang menjadi sumber expected inventory.

Kolom sumber yang wajib diproses:

-   Column 1 = SKU
-   Column 2 = Rack Number
-   Column 3 = Price
-   Column 4 = System Qty
-   Column 8 = Description

  Column            Type              Null Key   Description
  ----------------- --------------- ------ ----- ------------------
  id                uuid                NO PK    Record ID
  session_id        uuid                NO FK    Session
  upload_batch_id   uuid               YES FK    Batch sumber
  sku               varchar(50)         NO       SKU
  rack_number       varchar(50)         NO       Rack
  price             numeric(18,2)       NO       Harga
  system_qty        numeric(18,3)       NO       Qty sistem
  description       text               YES       Deskripsi barang
  created_at        timestamptz         NO       Waktu import
  updated_at        timestamptz         NO       Waktu update

### Unique rule

Untuk satu snapshot/batch, kombinasi `session_id + sku + rack_number`
harus ditangani secara deterministic.

Jika source mengandung duplicate SKU + rack: - jangan diam-diam memilih
salah satu; - tandai sebagai validation error atau gunakan aturan
agregasi yang disepakati sebelum production.

------------------------------------------------------------------------

# 8. `scan_results`

Data hasil scan toko.

Kolom sumber yang wajib diproses:

-   Column 1 = SKU
-   Column 2 = Rack Number
-   Column 3 = Scan Qty

Scan Qty dapat kosong pada file awal.

  Column                 Type              Null Key   Description
  ---------------------- --------------- ------ ----- ----------------------
  id                     uuid                NO PK    Record ID
  session_id             uuid                NO FK    Session
  sku                    varchar(50)         NO       SKU
  rack_number            varchar(50)         NO       Rack
  scan_qty               numeric(18,3)      YES       Hasil scan
  last_upload_batch_id   uuid               YES FK    Batch terakhir
  updated_by             uuid               YES FK    User terakhir update
  updated_at             timestamptz         NO       Waktu update
  created_at             timestamptz         NO       Waktu dibuat

### Multi-day rule

Scan Result bersifat incremental.

Contoh:

``` text
Hari 1
AG01-01 → SKU A, SKU B

Hari 2
AG01-02 → SKU C, SKU D
```

Upload hari 2 **tidak boleh menghapus** hasil hari 1.

Data harus tetap:

``` text
AG01-01 → A, B
AG01-02 → C, D
```

Jika SKU/rack yang sama di-upload ulang, aplikasi harus menggunakan
aturan upsert/update yang deterministic.

------------------------------------------------------------------------

# 9. `keepstock_sheet_mapping`

Mapping antara toko dan worksheet Keepstock.

  Column           Type             Null Key   Description
  ---------------- -------------- ------ ----- ---------------------------
  id               uuid               NO PK    Mapping ID
  store_id         uuid               NO FK    Toko
  sheet_title      varchar(200)       NO       Nama worksheet
  sheet_gid        varchar(50)       YES       Google sheetId/GID teknis
  spreadsheet_id   varchar(100)       NO       Google Spreadsheet ID
  last_sync_at     timestamptz       YES       Sinkronisasi terakhir
  is_active        boolean            NO       Mapping aktif
  created_at       timestamptz        NO       Waktu dibuat
  updated_at       timestamptz        NO       Waktu diubah

### Rules

-   `sheet_title` harus cocok dengan `stores.store_name`.
-   `sheet_gid` bukan identifier bisnis.
-   GID tidak perlu dimasukkan manual oleh user.
-   Sistem dapat membaca metadata workbook untuk menemukan worksheet dan
    sheetId.
-   Spreadsheet ID master saat ini:

`14J84e5XQ9Jddhr0HiEvOe68RgMQwWPt9Ik7ED0VvqFE`

------------------------------------------------------------------------

# 10. Keepstock Data

Keepstock berasal dari worksheet toko masing-masing.

Struktur kolom Keepstock belum dikunci dalam schema karena isi worksheet
aktual perlu diverifikasi melalui Google Sheets API.

Namun data yang dibutuhkan oleh Stock Take minimal harus dapat
menghasilkan:

  Field        Description
  ------------ ----------------
  SKU          SKU barang
  Box Number   Nomor/kode box
  Qty          Qty Keepstock

Jika satu SKU mempunyai beberapa box:

``` text
SKU 1234567
BOX A → 3
BOX B → 5
BOX C → 2
```

Semua box harus dapat ditampilkan pada hasil lookup.

**Jangan membuat asumsi posisi kolom Keepstock sebelum struktur sheet
aktual diverifikasi.**

------------------------------------------------------------------------

# 11. Optional `keepstock_cache`

Jika performa Google Sheets API menjadi masalah, gunakan cache lokal.

  Column         Type            Description
  -------------- --------------- -------------
  id             uuid            PK
  store_id       uuid            FK
  sku            varchar(50)     SKU
  box_number     varchar(100)    Box
  qty            numeric(18,3)   Qty
  source_sheet   varchar(200)    Worksheet
  synced_at      timestamptz     Waktu sync

Cache bukan source of truth. Google Spreadsheet tetap master.

------------------------------------------------------------------------

# 12. Working Result / Merge View

Hasil Stock Take sebaiknya **tidak dijadikan tabel source utama** yang
menyimpan duplikasi seluruh data.

Gunakan query/view/service untuk menghasilkan working table dari:

``` text
system_inventory
+
scan_results
+
Keepstock lookup
```

Logical output:

  Field          Source
  -------------- ---------------
  SKU            System / Scan
  Rack           System / Scan
  Description    System
  Price          System
  System Qty     System
  Scan Qty       Scan
  Variance Qty   Calculated (`scan_qty - system_qty`)
  Variance Value Calculated (`variance_qty × price`)
  Keepstock      Google Sheets
  Box            Google Sheets
  KS Qty         Google Sheets
  Status         Calculated (`SCANNED` / `NOT SCANNED`)

Catatan: kolom `No` pada Main Working Table (lihat BUSINESS_RULES.md
§12) adalah nomor urut tampilan, bukan kolom yang disimpan di
database.

------------------------------------------------------------------------

# 13. NOT SCANNED Rule

System Database adalah sumber daftar SKU yang **diharapkan ada** pada
rack.

Contoh:

``` text
System Database

AG01-01
SKU 1234567
System Qty = 5
```

Tetapi Scan Result tidak memiliki:

``` text
AG01-01 + 1234567
```

Maka working result **tetap harus membuat baris tersebut**:

``` text
SKU        Rack      System Qty    Scan Qty    Status
1234567    AG01-01       5             0       NOT SCANNED
```

Visual requirement: - Baris `NOT SCANNED` ditampilkan merah. -
Diletakkan di bagian bawah daftar SKU pada rack tersebut. -
`NOT SCANNED` adalah status review dan **bukan otomatis keputusan final
variance/missing**.

------------------------------------------------------------------------

# 14. Variance

Variance quantity:

``` text
variance_qty = scan_qty - system_qty
```

Variance value:

``` text
variance_value = variance_qty × price
```

Contoh:

``` text
System Qty = 10
Scan Qty   = 8
Price      = 50,000

Variance Qty   = -2
Variance Value = -100,000
```

------------------------------------------------------------------------

# 15. Accuracy

Recommended initial formula:

``` text
Accuracy %
=
(Total System Qty - Total Absolute Variance Qty)
÷ Total System Qty
× 100
```

Formula ini harus dikonfirmasi kembali sebelum production karena
definisi accuracy dapat mengikuti standar bisnis perusahaan.

`NOT SCANNED` juga harus diperlakukan sesuai aturan finalisasi yang
disepakati, bukan otomatis dianggap sebagai final variance hanya karena
belum dipindai.

------------------------------------------------------------------------

# 15a. `session_result_summary` (memenuhi BUSINESS_RULES.md §19)

Business rules mewajibkan aplikasi menampilkan ringkasan hasil setelah
finalisasi: Total System Qty, Total Scan Qty, Total Variance Qty,
Total Variance Value, Accuracy %, daftar SKU bervariance, dan daftar
`NOT SCANNED`.

Nilai-nilai ini **dihitung dari `system_inventory` + `scan_results`**
dan tidak wajib disimpan sebagai tabel fisik selama data historis
tidak berubah setelah finalize. Namun untuk performa dan sebagai bukti
audit yang immutable, direkomendasikan menyimpan snapshot pada saat
finalize:

  Column                Type            Null Key   Description
  --------------------- --------------- ------ ---- ------------------------------
  id                    uuid                NO PK   Summary ID
  session_id            uuid                NO FK   Session (unique per session)
  total_system_qty      numeric(18,3)       NO      Total qty sistem
  total_scan_qty        numeric(18,3)       NO      Total qty hasil scan
  total_variance_qty    numeric(18,3)       NO      Total variance qty
  total_variance_value  numeric(18,2)       NO      Total variance value (Rp)
  accuracy_percent      numeric(5,2)        NO      Accuracy % (lihat §15)
  not_scanned_count     integer             NO      Jumlah SKU berstatus NOT SCANNED
  variance_sku_count    integer             NO      Jumlah SKU dengan variance ≠ 0
  calculated_at         timestamptz         NO      Waktu perhitungan (= waktu finalize)

### Rules

-   Baris ini **hanya dibuat sekali**, pada saat `stock_take_sessions`
    berubah status ke `FINALIZED` (lihat §18, Transaction Rules §21).
-   Tidak boleh di-generate ulang secara diam-diam setelah finalize;
    perubahan hanya lewat proses reopen/unfinalize khusus, dan jika
    terjadi harus dicatat ulang sebagai audit (lihat §22 Audit Trail
    Cross-Reference).
-   `UNIQUE(session_id)`.
-   Daftar detail SKU bervariance dan SKU `NOT SCANNED` **tidak perlu**
    diduplikasi di tabel ini --- keduanya tetap diturunkan on-demand dari
    `system_inventory` + `scan_results` menggunakan `session_id`, karena
    baris-baris tersebut tidak berubah lagi setelah session terkunci.

------------------------------------------------------------------------

# 16. Rack Navigation

Rack ditampilkan secara konsisten, contoh:

``` text
AG01-01
AG01-02
AG01-03
AG02-01
...
```

UI menyediakan:

``` text
[ Previous ]   AG01-01   [ Next ]
```

Data working table difilter berdasarkan rack yang sedang dipilih.

------------------------------------------------------------------------

# 17. Save & Update

Saat user mengubah `Scan Qty`:

1.  Validasi nilai.
2.  Update `scan_results`.
3.  Simpan `updated_by`.
4.  Simpan `updated_at`.
5.  Working result dihitung ulang.
6.  Data tetap tersedia untuk hari berikutnya.

Save tidak boleh menghapus data rack lain.

------------------------------------------------------------------------

# 18. Finalization

Sebelum `FINALIZED`, sistem melakukan validation:

-   Tidak ada duplicate yang belum diselesaikan.
-   Format SKU valid.
-   Rack valid.
-   Quantity valid.
-   Tidak ada data corrupt.
-   Semua rack yang diwajibkan sudah diproses sesuai business rule.
-   Status `NOT SCANNED` ditinjau sesuai policy.
-   Data yang diperlukan untuk final accuracy tersedia.

Setelah final:

``` text
IN_PROGRESS → FINALIZED
```

Session normal tidak dapat diedit lagi.

------------------------------------------------------------------------

# 19. Indexes

Index minimum yang direkomendasikan:

``` text
stores:
  UNIQUE(store_code)
  UNIQUE(store_name)

stock_take_sessions:
  INDEX(store_id, status)
  UNIQUE(session_code)

system_inventory:
  INDEX(session_id, rack_number)
  INDEX(session_id, sku)
  INDEX(session_id, sku, rack_number)

scan_results:
  INDEX(session_id, rack_number)
  INDEX(session_id, sku)
  UNIQUE(session_id, sku, rack_number)

keepstock_sheet_mapping:
  UNIQUE(store_id)
  INDEX(sheet_title)

upload_batches:
  INDEX(session_id, upload_type)
  INDEX(session_id, created_at)
```

------------------------------------------------------------------------

# 20. Data Integrity

Semua foreign key harus menggunakan referential integrity.

Penghapusan data master tidak boleh menyebabkan historical Stock Take
kehilangan referensi.

Untuk data historical, prefer: - soft delete/inactive; - jangan hard
delete store yang sudah memiliki Stock Take history.

------------------------------------------------------------------------

# 21. Transaction Rules

Operasi penting harus transactional:

### Upload

``` text
create upload_batch
→ parse
→ validate
→ insert/upsert records
→ commit
```

Jika processing gagal:

``` text
processing_status = FAILED
```

dan data parsial tidak boleh dianggap sebagai upload sukses.

### Save scan

``` text
validate
→ upsert scan_results
→ commit
```

### Finalize

``` text
validate session
→ calculate final result
→ set FINALIZED
→ commit
```

------------------------------------------------------------------------

# 22. Security Rules

Backend wajib selalu mendapatkan `store_id` dari authenticated
user/session.

Jangan mempercayai:

``` text
store_id
```

yang dikirim begitu saja dari frontend.

Contoh:

``` text
User XWGN
    ↓
authenticated user
    ↓
server resolves store_id
    ↓
query hanya store_id tersebut
```

User toko A tidak boleh membaca atau mengubah Stock Take toko B.

## 22a. Audit Trail Cross-Reference (BUSINESS_RULES.md §22)

Kebutuhan audit di BUSINESS_RULES.md sudah tercakup, tersebar di
beberapa tabel berikut --- tidak dibutuhkan tabel `audit_log` terpisah
kecuali kebutuhan audit baru muncul di kemudian hari (mis. audit
login):

  Kebutuhan Audit (BUSINESS_RULES §22)   Disimpan di
  --------------------------------------- --------------------------------------------
  Nama file, waktu, user, jenis upload,
  status processing                       `upload_batches`
  Waktu update scan & user yang update    `scan_results.updated_at`, `.updated_by`
  Waktu finalize & user yang finalize     `stock_take_sessions.finalized_at`, `.finalized_by`
  Snapshot hasil akhir saat finalize      `session_result_summary.calculated_at` (§15a)

Jika ke depan dibutuhkan audit event granular di luar tabel di atas
(mis. percobaan login gagal, perubahan role), tambahkan tabel
`audit_log(id, actor_user_id, store_id, action, entity, entity_id,
metadata jsonb, created_at)` generik --- jangan memaksakan kebutuhan
baru ke tabel yang sudah ada.

------------------------------------------------------------------------

# 23. Source File Format

System Database: - TXT - XLS - XLSX

Required source columns:

``` text
Column 1 = SKU
Column 2 = Rack Number
Column 3 = Price
Column 4 = System Qty
Column 8 = Description
```

Scan Result: - TXT - XLS - XLSX

Required source columns:

``` text
Column 1 = SKU
Column 2 = Rack Number
Column 3 = Scan Qty
```

Parser harus melakukan validation terhadap: - missing column; - invalid
SKU; - invalid rack; - invalid numeric value; - duplicate SKU + rack; -
blank required fields.

------------------------------------------------------------------------

# 24. Recommended Technology

Initial recommendation:

``` text
Frontend
Next.js + React + TypeScript

Backend
Next.js server/API layer

Database
PostgreSQL / Supabase

Authentication
Supabase Auth atau authentication provider setara

File Storage
Supabase Storage / object storage

Keepstock
Google Sheets API

Source Control
GitHub
```

------------------------------------------------------------------------

# 25. Non-Negotiable Database Rules

1.  Store harus diidentifikasi menggunakan `store_code`.
2.  `store_name` digunakan untuk mapping worksheet Keepstock.
3.  GID bukan business identifier.
4.  Keepstock tetap berada di Google Spreadsheet master.
5.  System Database adalah sumber expected SKU per rack.
6.  Scan Result bersifat incremental dan multi-hari.
7.  Upload baru tidak boleh menghapus scan sebelumnya.
8.  Merge key utama adalah `SKU + Rack Number`.
9.  SKU yang ada di System Database tetapi belum di-scan tetap harus
    muncul.
10. SKU tersebut diberi status `NOT SCANNED` dan ditampilkan merah di
    bagian bawah rack.
11. `NOT SCANNED` bukan otomatis final missing/variance.
12. Keepstock lookup menggunakan Store + SKU.
13. Jika SKU mempunyai beberapa box, semua box harus dapat ditampilkan.
14. Save & Update tidak boleh menghapus data rack lain.
15. Finalized session harus terkunci dari edit normal.
16. Store isolation wajib enforced di backend/database.
17. Historical data harus tetap tersedia.
18. Raw upload file sebaiknya disimpan untuk audit.
19. Jangan mengunci struktur kolom Keepstock sebelum worksheet aktual
    diverifikasi.
20. Accuracy formula harus dikonfirmasi sebelum production.
21. Setelah finalize, aplikasi wajib dapat menampilkan Session Result
    Summary (§15a): total system qty, total scan qty, total variance
    qty & value, accuracy %, daftar SKU bervariance, dan daftar
    `NOT SCANNED` (BUSINESS_RULES.md §19).

------------------------------------------------------------------------

# 26. Next Implementation Step

Sesuai urutan di BUSINESS_RULES.md §25, setelah schema ini disetujui:

1.  Baca `DATA_FORMAT.md` --- spesifikasi kolom & validasi file sumber.
2.  Baca `DEVELOPMENT_STATUS.md` --- status implementasi saat ini vs
    rencana, termasuk gap/bug yang sudah teridentifikasi di kode
    frontend yang ada.
3.  Baca `AI_HANDOFF.md` --- ringkasan konteks untuk melanjutkan
    development (manusia maupun AI assistant).
4.  Buat migration PostgreSQL.
5.  Seed 25 toko (lihat §4.2).
6.  Buat authentication + store mapping.
7.  Buat parser System Database (ikuti `DATA_FORMAT.md`).
8.  Buat parser Scan Result (ikuti `DATA_FORMAT.md`).
9.  Buat Google Sheets Keepstock connector.
10. Buat merge engine + `NOT SCANNED` logic.
11. Buat Session Result Summary (§15a) pada proses finalize.
12. Baru implement UI Stock Take.

**Jangan membuat UI final sebelum schema dan business rules ini
stabil.**
