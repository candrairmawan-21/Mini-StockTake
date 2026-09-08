# CODE_REVIEW.md

# Deep Compatibility Review — Supabase ZIP → Google Sheets / Apps Script

**Review date:** 2026-09-08

## Executive conclusion

The supplied ZIP contains a reasonably mature PostgreSQL/Supabase prototype with useful business logic and a Qube-style frontend, but it is not directly compatible with the Google Sheets architecture that is now active.

The migration should therefore be treated as:

```text
KEEP BUSINESS LOGIC
REPLACE PERSISTENCE + HTTP + AUTH ADAPTER
PRESERVE UI
```

The active GAS package in this directory performs that conversion.

## Compatibility score

| Area | Original ZIP | GAS target | Assessment |
|---|---:|---:|---|
| Qube-style UI | 9/10 | 9/10 | Keep |
| Stock Take business rules | 8/10 | 8/10 | Transfer |
| System DB parser | 8/10 | 9/10 | Improved against supplied file |
| Session lifecycle | 8/10 | 8/10 | Reimplemented |
| Physical Qty / variance | 9/10 | 9/10 | Reimplemented |
| Historical snapshots | 8/10 | 9/10 | Native append model |
| Store isolation | 8/10 | 7/10 | Backend checks retained; deployment restriction important |
| Supabase auth | 7/10 | N/A | Removed |
| PostgreSQL API | 9/10 | N/A | Removed |
| Google Sheets integration | 0/10 | 8/10 | New |
| Production readiness | 6/10 | 6/10 | Still requires live testing |

## 1. Frontend analysis

The supplied `frontend/index.html`, `app.css`, and `app.js` already had the correct visual direction:
- ERP top bar;
- toolbar;
- Inventory sidebar;
- right status panel;
- Stock Take Preparation;
- Stock Take Entry.

That structure is preserved rather than redesigned.

Original gaps:
- frontend called Express HTTP endpoints;
- table still exposed Barcode and Status;
- Rack had a separate modern bar instead of using the Qube header context;
- UOM/Barcode semantics were still present.

GAS version changes only the requested business fields:
- UOM → Qty System;
- Barcode → Variance;
- Quantity → Qty Physical;
- Rack Number → Remarks/current rack context;
- status/barcode columns removed from the main table.

## 2. Backend analysis

The original backend depends on:
- Express;
- Node.js;
- PostgreSQL (`pg`);
- Supabase;
- SQL migrations;
- bearer-token HTTP middleware.

Those components cannot be used by the new Google Sheets backend.

The useful logic was transferred:
- session resolution;
- snapshot locking;
- rack generation;
- Itemize deduplication;
- manual Physical Qty;
- Physical Count History;
- variance;
- finalization.

## 3. Original System DB parser

The original parser correctly recognized an important source property: Description is the free-text tail and may contain commas/quotes that should not be interpreted as CSV structure.

The new parser keeps that strategy and adds observed malformed-row realignment.

Against the supplied `EXSHELF 03-09.txt`, the new parser was tested locally:

```text
Physical lines     93,214
Blank lines            18
Nonblank rows       93,196
Valid rows          93,190
Invalid/audit rows       6
```

Two observed shifted rows were successfully realigned.

The six remaining records are retained as audit data instead of being guessed.

## 4. Critical architecture differences

### Original

```text
Browser
  ↓ HTTP
Express
  ↓
PostgreSQL / Supabase
```

### Active

```text
Browser
  ↓ google.script.run
Apps Script
  ↓
MASTER / Store Google Sheets
```

This means there is no REST endpoint layer in the active package.

## 5. Security difference

The original project had bearer-token/session authorization.

The new Apps Script implementation validates:
- active store;
- session existence;
- session store ownership;
- session status before mutation.

However, a store-selection login is not equivalent to password authentication.

For production:
- deploy the Web App to the intended organization;
- avoid anonymous public deployment;
- use Google Workspace identity where organizational identity is available;
- do not treat the store selector as a security boundary by itself.

## 6. Performance

The 93k-row System DB makes row-by-row `appendRow()` unacceptable for production upload.

The active System DB writer uses chunked `setValues()`.

Rack reads are rack-scoped.

The browser never receives the entire System DB snapshot.

## 7. Remaining production gaps

1. Live Apps Script deployment test.
2. Test against the actual 25 store spreadsheets.
3. Confirm exact Itemize XLSX variants used in production.
4. Verify Keepstock integration later.
5. Add PDF/print implementation later.
6. Confirm official Accuracy formula.
7. Decide whether ADMIN/SUPERVISOR reopen is needed.
8. Harden identity mapping if the deployment is not restricted to the organization.

## 8. Recommendation

Do not revive the SQL migrations.

Continue from:
- `gas/Config.gs`
- `gas/Setup.gs`
- `gas/Session.gs`
- `gas/SystemDB.gs`
- `gas/Itemize.gs`
- `gas/StockTake.gs`
- `gas/WebApp.gs`
- `Index.html`
- `App.css.html`
- `App.js.html`

The old Supabase project is retained only under `legacy-supabase/`.
