# AI_HANDOFF.md

# Mini Stock Take — AI Handoff

**Version:** 2.0  
**Last updated:** 2026-09-02

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
17. Do not guess Nomor Keepstock or Keepstock columns.
18. Accuracy is provisional until confirmed.
19. UI/PDF/finalize use the same processing engine.

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

- exact Nomor Keepstock source column;
- Keepstock worksheet schema;
- official accuracy formula;
- final NOT SCANNED treatment;
- blank Scan Qty finalization;
- Rack `-` with System Qty 0;
- accumulation vs recount semantics if barcode workflow differs;
- reopen permissions.

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
