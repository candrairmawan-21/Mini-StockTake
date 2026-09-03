# DEVELOPMENT_STATUS.md

# Mini Stock Take — Development Status

**Version:** 2.1  
**Review date:** 2026-09-03

## Changelog

- **2.1** — Blockers #1–2 (real System DB / Scan Result samples)
  resolved via direct file verification. Parser gap section rewritten
  with concrete findings instead of general statements.
- **2.0** — Full rewrite (English, gap analysis).

## 1. Current Reality

The repository is still a frontend prototype:

```text
index.html + css/style.css + js/app.js
        ↓
localStorage
        ↓
Google Apps Script
```

This is **not production-ready**.

Target:

```text
Next.js/React/TypeScript
        ↓
Backend API
        ↓
PostgreSQL/Supabase
   ↙             ↘
Auth          Google Sheets API
```

## 2. Known Critical Gaps

### Parser

Verified against real files (`DATA_FORMAT.md` §3–4):

- System DB: current `js/app.js` reads `row[0]` (SKU) and `row[3]`
  (System Qty) correctly, and `row[8]` for Description is **also
  correct** (Column 9 = index 8 — confirmed, not a bug). However
  Price (index 2), Date (index 5), Box Number (index 6), and Barcode
  (index 7) are **never read at all**.
- Scan Result: current code assumes `row.length >= 3` and reads
  `row[1]`/`row[2]` — both wrong. The real file has exactly 2 columns
  (`row[0]`=SKU, `row[1]`=Rack) and **no Scan Qty column exists at
  all**. The code performs no counting/aggregation of duplicate
  SKU+Rack rows, so Scan Qty is never actually imported from the
  file — `qtyFisik` stays empty until the user types it in manually.
- Neither parser skips/detects headers consistently with the verified
  reality (System DB has one, Scan Result does not).

### Persistence

- localStorage is the primary state store.
- New uploads can replace previous in-memory data.
- No durable multi-day session model.
- No System DB snapshot model.
- No recount history.

### Business Logic

Not implemented reliably:

- Keepstock lookup;
- multiple Keepstock boxes;
- NOT SCANNED;
- NO RACK normalization;
- variance value;
- accuracy;
- finalization;
- final result summary.

### Security

- No real backend authorization.
- Store mapping is client-side.
- Store isolation is not enforced.

### Audit

- No durable upload audit.
- No recount history.
- No reliable finalize snapshot.

## 3. Feature Matrix

| Feature | Current | Target |
|---|---|---|
| Dynamic store master | ❌ | ✅ |
| Backend auth | ❌ | ✅ |
| Store isolation | ❌ | ✅ |
| Session | ❌ | ✅ |
| System snapshots | ❌ | ✅ |
| Incremental Scan Result | ❌ | ✅ |
| Recount history | ❌ | ✅ |
| Keepstock | ❌ | ✅ |
| NOT SCANNED | ❌ | ✅ |
| NO RACK | ⚠️ | ✅ |
| Variance Qty | ⚠️ local | ✅ engine |
| Variance Value | ❌ | ✅ |
| Accuracy | ❌ | ✅ |
| Finalize | ❌ | ✅ |
| Final Summary | ❌ | ✅ |
| Rack PDF | ✅ prototype | ✅ shared engine |
| Final PDF | ❌ | ✅ |
| Audit | ❌ | ✅ |

## 4. Do Not Extend Prototype With Critical Logic

Until the backend/database foundation exists:

- do not use localStorage as business persistence;
- do not add critical authorization to frontend only;
- do not replace scan data on upload;
- do not sum recounts automatically;
- do not guess Keepstock columns;
- do not duplicate variance/accuracy formulas.

## 5. Recommended Build Order

### Phase 0 — Verify real data ✅ DONE (System DB + Scan Result)

System DB and Scan Result samples verified for store XWGN
(`DATA_FORMAT.md` §11). Keepstock worksheet still pending (see
Current Blockers below) — do not block Phase 1–3 on it, since
Keepstock is supporting info, not the primary merge key.

### Phase 1 — Database

Create:

```text
stores
users
stock_take_sessions
upload_batches
system_inventory_snapshots
system_inventory_rows
scan_results
scan_result_history
keepstock_sheet_mapping
session_result_summary
```

### Phase 2 — Auth/RLS

Implement authentication, roles and store isolation.

### Phase 3 — Parser

Implement TXT/CSV/XLS/XLSX parsing, validation and raw retention.

### Phase 4 — Processing Engine

Implement snapshot, incremental scan, recount, merge, Keepstock, NOT SCANNED, NO RACK, variance and finalization.

### Phase 5 — API

Expose session, upload, rack result, save scan, finalize, summary and PDF data services.

### Phase 6 — UI

Migrate the existing Qube-like UI to the API.

### Phase 7 — Testing/PDF

Test end-to-end and make PDF consume the same processing service.

## 6. Current Blockers

1. ~~Real System DB sample needed to verify columns.~~ **Resolved.**
2. ~~Real Scan Result sample needed to verify actual export behavior.~~ **Resolved** — no header, no Scan Qty column, derive by counting rows.
3. Keepstock worksheet structure not yet verified.
4. ~~Nomor Keepstock source column not verified.~~ **Resolved** — Column 7.
5. Official Accuracy formula not confirmed.
6. Final NOT SCANNED policy not confirmed.
7. Verification above covers one store (XWGN) only — broader sample set recommended before fully closing the parser verification gate.

## 7. Production Definition

Production-ready only when source formats, database, auth/isolation, multi-day behavior, recount history, Keepstock, NOT SCANNED, variance value, accuracy, finalization, audit and PDF consistency are tested and verified.
