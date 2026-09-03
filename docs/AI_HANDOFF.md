# AI_HANDOFF.md

# Mini Stock Take — AI Handoff

**Version:** 2.1  
**Last updated:** 2026-09-03

## Changelog

- **2.1** — Added §2a Verified Facts. §5 Open Decisions trimmed of
  items resolved by real-file verification and business confirmation.
- **2.0** — Full rewrite (English, handoff protocol).

## 1. Read Order

```text
1. BUSINESS_RULES.md
2. DATABASE_SCHEMA.md
3. DATA_FORMAT.md
4. PROCESSING_ENGINE_SPEC.md
5. DEVELOPMENT_STATUS.md
6. AI_HANDOFF.md
7. README.md
```

`BUSINESS_RULES.md` is the SSOT.

## 2. Non-Negotiable Rules

1. Never hard-code the number of stores.
2. Backend/database enforces store isolation.
3. Working identity = session + SKU + Rack.
4. Scan files are incremental across days.
5. New scan uploads do not replace old racks.
6. Same SKU+rack is a recount/update, not an automatic sum.
7. Preserve recount history.
8. Scan batch references the System DB snapshot used for it.
9. New System DB is a new snapshot, not a replacement of history.
10. System-only rows must appear as `NOT SCANNED`.
11. `NOT SCANNED` must not silently become final zero/missing.
12. `Rack = -` with positive System Qty becomes `NO RACK`.
13. Keepstock is supporting information, not automatically added to Scan Qty.
14. All Keepstock boxes for a SKU must be displayable.
15. Finalized sessions are locked.
16. localStorage is not production persistence.
17. Do not guess Keepstock worksheet columns (Nomor Keepstock's System DB position is already verified — Column 7).
18. Accuracy is provisional until confirmed.
19. UI/PDF/finalize use the same processing engine.

## 2a. Verified Facts (Do Not Re-Ask)

Confirmed against real files (store XWGN: `XWGN_-_Tarikan_data_2.txt`,
`Itemize_XWGN_dummy.xlsx`) plus direct business confirmation:

- System DB is 9 columns, CSV-in-`.txt`, UTF-8, header present. Full
  mapping in `DATA_FORMAT.md` §3.
- Scan Result is 2 columns (SKU, Rack) **only**, **no header**, **no
  Scan Qty column**. Scan Qty is derived by counting duplicate
  SKU+Rack rows per file (`DATA_FORMAT.md` §4).
- Nomor Keepstock (Box Number) = System DB Column 7.
- Multi-day scan files are independent per rack; recount semantics
  (replace, not sum) apply if a rack ever repeats.
- `Rack = "-"` → `NO RACK`, unconditionally (not conditioned on
  System Qty).

## 3. Current Repository Reality

The existing `index.html`, `css/style.css` and `js/app.js` are prototype code using localStorage and Google Apps Script.

Known gaps are documented in `DEVELOPMENT_STATUS.md`.

Do not treat the prototype as the production data architecture.

## 4. Next Mission

### A. Verify source data

Need actual:

- System DB;
- Scan Result;
- Keepstock worksheet/export.

Verify headers, columns, numeric format, Nomor Keepstock and Keepstock fields.

### B. Build database

Create migrations for the tables in `DATABASE_SCHEMA.md`.

### C. Build processing engine

Implement the deterministic rules in `PROCESSING_ENGINE_SPEC.md`.

### D. Migrate UI

Only after the backend/processing foundation is stable.

## 5. Open Decisions

Do not guess:

- Keepstock worksheet schema (Google Sheets side).
- official accuracy formula;
- final NOT SCANNED treatment;
- whether an entirely-unscanned rack blocks finalization;
- optional refinement: exclude `Rack = "-" AND System Qty = 0` (not adopted by default);
- accumulation vs recount semantics if barcode workflow differs;
- reopen permissions.

Resolved and no longer open: exact Nomor Keepstock source column
(Column 7); System DB / Scan Result column structure; blank Scan Qty
as an upload state (superseded by derived-count model); Rack `-`
grouping condition (unconditional, confirmed).

## 6. Handoff Protocol

Whenever a business/design decision changes:

```text
update BUSINESS_RULES
→ update affected schema/format/engine docs
→ update DEVELOPMENT_STATUS
→ update AI_HANDOFF
→ then change code
```

Every AI handoff should state:

```text
Changed:
Verified:
Not verified:
Open decisions:
Next step:
```

## 7. Verification

Once the target stack exists, run the actual scripts in `package.json`, at minimum:

```bash
git status
git log -5 --oneline
npm install
npm run lint
npm test
npm run build
```

## 8. Stop Conditions

Stop and ask for clarification if a real source file conflicts with the docs, Keepstock differs from assumptions, accuracy policy changes, NOT SCANNED treatment changes, recount semantics change, or store isolation cannot be guaranteed.
