# AI_HANDOFF.md

# Mini Stock Take --- Handoff Document

Version: 1.0

## Tujuan Dokumen

Dokumen ini untuk siapa pun (developer manusia atau AI assistant)
yang melanjutkan project ini di sesi/waktu berbeda, supaya tidak perlu
membaca ulang seluruh histori chat/commit untuk memahami konteks.

**Baca dokumen ini pertama kali sebelum menyentuh kode.**

------------------------------------------------------------------------

## 1. Apa Project Ini

Mini Stock Take: aplikasi internal untuk membantu proses stock take
(hitung fisik stok) di ± 25 toko MR DIY area Midnorth Java. User
scan/upload data System Database (qty sistem) dan Scan Result (qty
hasil hitung fisik), aplikasi menggabungkan keduanya per rack, menghitung
variance, dan pada akhirnya di-finalize dengan ringkasan accuracy.

## 2. Hierarki Dokumen (Urutan Membaca & Prioritas Konflik)

``` text
1. BUSINESS_RULES.md      ← SUMBER KEBENARAN. Jika bingung, cek ini dulu.
2. DATABASE_SCHEMA.md     ← struktur data turunan dari BUSINESS_RULES.md
3. DATA_FORMAT.md         ← spesifikasi kolom file upload (0-based vs 1-based!)
4. DEVELOPMENT_STATUS.md  ← apa yang sudah/belum/salah di kode saat ini
5. AI_HANDOFF.md          ← dokumen ini
```

Jika ada konflik antar dokumen, yang lebih atas menang
(`BUSINESS_RULES.md` §24). Jika mengubah satu dokumen sehingga
memengaruhi dokumen lain, update semua dokumen terkait **sebelum**
mengubah kode (`BUSINESS_RULES.md` §24).

## 3. Non-Negotiable --- Jangan Dilanggar

Ringkasan dari `BUSINESS_RULES.md` §23 dan `DATABASE_SCHEMA.md` §25,
poin yang paling sering dilupakan:

-   Store isolation **wajib di backend**, bukan hanya filter di
    frontend.
-   Merge key selalu `SKU + Rack Number`, bukan SKU saja.
-   SKU yang ada di System DB tapi tidak ter-scan **tetap harus
    tampil** sebagai `NOT SCANNED` di bawah rack, bukan hilang.
-   Upload baru (System DB maupun Scan Result) **tidak boleh
    menghapus** data hari sebelumnya dalam session yang sama --- harus
    upsert/merge.
-   Session yang sudah `FINALIZED` terkunci dari edit normal.
-   Nomor kolom di semua dokumen adalah **1-based**; saat coding
    (array 0-based) wajib dikonversi eksplisit --- lihat
    `DATA_FORMAT.md` §1. Ini sumber bug paling sering terjadi
    (lihat `DEVELOPMENT_STATUS.md` Bug #1 dan #3).

## 4. Status Saat Ini (Ringkas)

Kode yang ada di repo (`index.html`, `js/app.js`) adalah **prototype
frontend-only**: localStorage sebagai "database", Google Apps Script
sebagai "backend" tanpa validasi. Prototype ini **belum** mengikuti
sebagian besar `BUSINESS_RULES.md` --- termasuk beberapa bug kolom
yang membuat Scan Qty dari file tidak pernah benar-benar terbaca.

Detail lengkap gap dan bug ada di `DEVELOPMENT_STATUS.md` --- jangan
mulai dari asumsi kode itu sudah benar.

## 5. Yang Belum Diverifikasi (Perlu Konfirmasi Manusia/Bisnis)

Item berikut **tidak boleh diputuskan sepihak oleh AI/developer** ---
harus dikonfirmasi ke pemilik bisnis proses (lihat
`BUSINESS_RULES.md` §17, §26 semangat yang sama):

-   Apakah pemetaan kolom di `DATA_FORMAT.md` §2--3 sudah 100% cocok
    dengan file ekspor riil dari sistem toko MR DIY, atau kode yang
    sekarang (kolom index 8, index 1/2) justru mencerminkan format
    file yang sebenarnya berbeda dari yang tertulis di
    `BUSINESS_RULES.md`.
-   Formula Accuracy % final (§17 BUSINESS_RULES.md sudah menandai ini
    sebagai "perlu dikonfirmasi").
-   Apakah duplicate SKU + Rack pada satu file Scan Result harus
    dijumlahkan atau di-reject sebagai error (lihat `DATA_FORMAT.md`
    §3.5).
-   Struktur kolom aktual worksheet Keepstock (belum diverifikasi via
    Google Sheets API --- lihat `DATABASE_SCHEMA.md` §10).

## 6. Langkah Selanjutnya yang Disarankan

Ikuti urutan di `DEVELOPMENT_STATUS.md` §4. Jangan menambah fitur baru
di atas prototype localStorage yang ada sebelum fondasi backend +
database sesuai `DATABASE_SCHEMA.md` berdiri, karena non-negotiable
seperti store isolation dan multi-day incremental scan **secara
struktural tidak bisa** dipenuhi oleh arsitektur localStorage-only.

## 7. Cara Menggunakan Dokumen Ini Bersama AI Assistant

Saat memulai sesi baru dengan AI assistant (termasuk Claude) untuk
melanjutkan project ini:

1.  Upload/link kelima dokumen di §2 di atas.
2.  Minta AI membaca `BUSINESS_RULES.md` dan `DEVELOPMENT_STATUS.md`
    terlebih dahulu sebelum menulis kode apa pun.
3.  Kapan pun AI membuat keputusan desain yang mengubah salah satu
    dokumen (skema, format, atau status), minta AI mengupdate dokumen
    terkait di repo yang sama --- jangan biarkan keputusan hanya ada
    di riwayat chat.
