# DATA_FORMAT.md

# Mini Stock Take --- Source File Format Specification

Version: 1.0

## Status Dokumen

Dokumen ini adalah turunan dari `BUSINESS_RULES.md` §5, §6, §23 dan
`DATABASE_SCHEMA.md` §7, §8, §23. Jika ada konflik, `BUSINESS_RULES.md`
yang berlaku.

Tujuan dokumen ini: menghilangkan ambiguitas index kolom (1-based vs
0-based) yang sering menjadi sumber bug pada parser.

------------------------------------------------------------------------

## 1. Aturan Penomoran Kolom

**Semua nomor kolom di `BUSINESS_RULES.md` dan `DATABASE_SCHEMA.md`
adalah 1-based** (kolom pertama = Kolom 1), sesuai cara toko/user
membaca spreadsheet.

Saat implementasi menggunakan array/list di kode (0-based, seperti
`row[0]` di JavaScript), konversi wajib:

``` text
Kolom 1 (bisnis) = index 0 (array)
Kolom 2 (bisnis) = index 1 (array)
Kolom 3 (bisnis) = index 2 (array)
Kolom 4 (bisnis) = index 3 (array)
Kolom 8 (bisnis) = index 7 (array)
```

**Ini wajib ditulis eksplisit di kode parser** (mis. konstanta
`COL_SKU = 0`, bukan angka ajaib tersebar) supaya tidak salah geser
seperti yang ditemukan pada implementasi saat ini (lihat
`DEVELOPMENT_STATUS.md` --- Bug #1 dan Bug #2).

------------------------------------------------------------------------

## 2. System Database

### 2.1 Format file diterima

`.txt` (delimited), `.csv`, `.xls`, `.xlsx`.

### 2.2 Pemetaan kolom (1-based → 0-based)

  Kolom (bisnis) | Index array | Field         | Tipe          | Wajib?
  --------------- | ----------- | ------------- | ------------- | ------
  1               | 0           | SKU           | string        | Ya
  2               | 1           | Rack Number   | string        | Ya
  3               | 2           | Price         | numeric(18,2) | Ya
  4               | 3           | System Qty    | numeric(18,3) | Ya
  8               | 7           | Description   | string        | Tidak (boleh kosong, tapi kolom harus ada)

Kolom 5, 6, 7 tidak digunakan aplikasi saat ini, tetapi tetap boleh ada
di file sumber --- parser harus mengabaikannya, bukan menganggapnya
error.

### 2.3 Header row

Baris pertama diasumsikan **header** dan **selalu dilewati** (mulai
parsing dari baris ke-2). Parser wajib memvalidasi bahwa jumlah kolom
baris pertama masuk akal (≥ 8 kolom) sebelum melewatinya; jika file
hanya berisi 1 baris atau tidak memiliki cukup kolom, tandai sebagai
`FAILED` (lihat `DATABASE_SCHEMA.md` §21 Transaction Rules), jangan
diproses sebagai data.

### 2.4 Contoh baris valid

``` text
SKU        Rack       Price    SystemQty  Col5  Col6  Col7  Description
1234567    AG01-01    15000    5          -     -     -     Sendok Plastik 10pcs
7654321    AG01-01    22500    12         -     -     -     Gelas Kaca 250ml
```

### 2.5 Validasi wajib

-   SKU tidak boleh kosong/blank → baris ditolak, dicatat di
    `error_message` batch, bukan menghentikan seluruh file.
-   Rack Number tidak boleh kosong.
-   Price harus dapat di-parse sebagai angka ≥ 0. Nilai non-numeric
    (mis. "N/A", kosong) → baris invalid, jangan default diam-diam ke
    0 tanpa mencatatnya sebagai warning/error pada batch.
-   System Qty harus dapat di-parse sebagai angka. Boleh 0, tidak
    boleh negatif.
-   Duplicate `SKU + Rack Number` dalam satu file → tandai sebagai
    validation error pada batch (lihat `DATABASE_SCHEMA.md` §7 Unique
    rule). Jangan menjumlahkan otomatis tanpa aturan bisnis yang
    disepakati.

------------------------------------------------------------------------

## 3. Scan Result

### 3.1 Format file diterima

`.txt` (delimited), `.csv`, `.xls`, `.xlsx`.

### 3.2 Pemetaan kolom (1-based → 0-based)

  Kolom (bisnis) | Index array | Field       | Tipe          | Wajib?
  --------------- | ----------- | ----------- | ------------- | ------
  1               | 0           | SKU         | string        | Ya
  2               | 1           | Rack Number | string        | Ya
  3               | 2           | Scan Qty    | numeric(18,3) | Tidak (boleh kosong di sumber awal)

### 3.3 Header row

Sama seperti System Database: baris pertama adalah header dan harus
dilewati. **Catatan implementasi:** kode saat ini tidak melewati
header pada Scan Result (lihat `DEVELOPMENT_STATUS.md` --- Bug #3),
ini harus diperbaiki.

### 3.4 Contoh baris valid

``` text
SKU        Rack       ScanQty
1234567    AG01-01    5
7654321    AG01-01
```

Baris kedua (`ScanQty` kosong) valid --- akan menjadi kandidat
`NOT SCANNED` jika tidak diisi sebelum finalize, sesuai
`BUSINESS_RULES.md` §8.

### 3.5 Validasi wajib

-   SKU tidak boleh kosong.
-   Rack Number tidak boleh kosong.
-   Scan Qty jika terisi harus numeric ≥ 0. Jika bukan angka →
    perlakukan sebagai invalid, bukan silently `0`.
-   Duplicate `SKU + Rack Number` pada satu file upload → merge/upsert
    ke baris yang sama (bukan menjumlahkan), karena scan bersifat
    incremental (`BUSINESS_RULES.md` §6, §7). Jika sumber
    mengharuskan penjumlahan qty per scan (misal scan barcode
    berkali-kali per rack), ini **harus dikonfirmasi sebagai
    keputusan bisnis eksplisit** sebelum production --- jangan
    diasumsikan oleh developer/AI.

------------------------------------------------------------------------

## 4. Upload Incremental (Multi-Hari)

-   Upload System Database baru **tidak boleh menghapus** `scan_results`
    yang sudah ada untuk session yang sama (`BUSINESS_RULES.md` §5, §15).
-   Upload Scan Result baru **meng-upsert** berdasarkan
    `session_id + sku + rack_number` --- baris SKU/rack lain yang tidak
    ada di file baru **tetap dipertahankan**, tidak dihapus.
-   Setiap upload dicatat sebagai `upload_batches` baru untuk audit
    (`DATABASE_SCHEMA.md` §6).

------------------------------------------------------------------------

## 5. Encoding & Locale

-   Encoding file yang didukung: UTF-8. Jika file terdeteksi
    encoding lain (mis. Windows-1252 dari export Excel lama), parser
    harus melakukan konversi, bukan gagal diam-diam menghasilkan
    karakter rusak pada `Description`.
-   Pemisah desimal: titik (`.`). Jika sumber menggunakan koma sebagai
    desimal (umum di export Excel lokal ID), parser wajib normalisasi
    sebelum disimpan sebagai `numeric`.
-   Format Rack Number harus dipertahankan **apa adanya** dari sumber
    (string), jangan dilakukan trimming leading zero atau perubahan
    casing yang mengubah identitas rack (`BUSINESS_RULES.md` §5:
    "Rack Number harus dipertahankan sesuai sumber").

------------------------------------------------------------------------

## 6. Ringkasan Perbedaan dengan Implementasi Saat Ini

Lihat `DEVELOPMENT_STATUS.md` untuk daftar lengkap gap antara
spesifikasi ini dan kode `js/app.js` yang ada di repo saat ini.
