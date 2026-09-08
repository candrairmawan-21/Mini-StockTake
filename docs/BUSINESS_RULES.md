# BUSINESS_RULES.md

# Mini Stock Take — Business Rules

**Version:** 3.0-GS  
**Last updated:** 2026-09-08  
**Status:** Active Google Sheets / Apps Script baseline

## 1. Source of truth

The active storage architecture is Google Sheets.

The previous Supabase/PostgreSQL architecture is deprecated and must not be used for new production code.

## 2. Store model

MASTER contains:
- `store_code`
- `store_name`
- `spreadsheet_id`
- `active`

`store_code` is the business identifier.

Each active store has its own Google Spreadsheet.

Store data must never be read from or written to another store's spreadsheet.

## 3. Session

Each store has at most one active `IN_PROGRESS` session.

Session fields:
- session_id
- store_code
- status
- created_at
- updated_at
- finalized_at
- last_active_rack
- system_snapshot_id

A session can continue across multiple days.

## 4. System DB

System DB is the expected inventory source for a stock-take session.

A session uses exactly one System DB snapshot.

The snapshot is immutable after creation.

A later System DB upload creates a new snapshot, but it cannot replace the snapshot already locked to an active session.

## 5. System DB source columns

Expected logical positions:

1. SKU
2. Rack Number
3. Price
4. System Qty
5. reserved/unused
6. Date
7. Keepstock Box
8. Barcode
9+. Description

Barcode is a string and must preserve leading zeroes.

Description is free text and may contain commas or quote characters.

## 6. Smart parsing

The parser must tolerate the known export behavior.

It must:
- preserve Description commas;
- detect malformed rows;
- detect known shifted-field patterns;
- retain raw invalid rows in audit;
- never invent business values.

`Rack = "-"` is normalized to `NO RACK`.

A genuinely blank rack is normalized to `NO ADDRESS`; blank rack + zero System Qty is rejected.

## 7. Itemize

Itemize contains SKU + Rack only.

It is a checklist, not a quantity source.

Duplicate SKU + Rack rows mean the same checklist entry and are deduplicated.

## 8. Working form

Opening a rack creates/refreshes missing System DB lines for that rack.

Existing Physical Qty must never be overwritten by form generation or re-upload.

System-only lines remain visible so the expected inventory is not silently lost.

## 9. UI — Qube fidelity

The Qube Stock Take screen supplied by the business owner is the required UI reference.

The visual structure is preserved.

Required substitutions:

| Qube | MidNorth |
|---|---|
| #No. | No. |
| Sku Code | SKU |
| Description | Description |
| Quantity | Qty Physical |
| UOM | Qty System |
| Barcode | Variance |
| ShortDesc | removed |

`Rack Number` is shown in the header `Remarks` field.

## 10. Physical Qty

Physical Qty is manually entered one line at a time.

Initial value is blank.

Blank is not zero.

Allowed:
- zero;
- positive numeric values.

Negative or non-numeric values are rejected.

A recount replaces the previous value.

Every replacement is audited.

## 11. Variance

```text
Variance = Physical Qty - System Qty
```

If Physical Qty is blank, Variance is blank.

Variance is not independently entered.

## 12. Finalization

A session cannot be finalized if any line has blank Physical Qty.

After finalization:
- session status becomes `FINALIZED`;
- finalized timestamp is recorded;
- final summary is stored;
- normal Physical Qty editing is blocked.

## 13. Historical data

Do not overwrite:
- System DB snapshots;
- Physical Count history;
- finalized result summaries.

## 14. Audit

At minimum retain:
- upload ID;
- snapshot ID;
- upload timestamp;
- source line;
- raw invalid line;
- parser reason;
- previous Physical Qty;
- new Physical Qty;
- change timestamp;
- user name where available;
- final result.

## 15. Security

Frontend filtering is not sufficient.

Every Apps Script data operation must validate:
1. store exists and is active;
2. session exists;
3. session belongs to requested store;
4. session is editable before mutation.

For internal deployment, restrict Web App access to the intended organization. The store selector is an operational store selector, not a password-based authentication mechanism.

## 16. Accuracy

Current implementation:

```text
Total System Qty = 0 → Accuracy = 100%

otherwise:
Accuracy =
((Total System Qty - Total Absolute Variance) / Total System Qty) × 100
```

The formula should be confirmed by the business owner before production reporting is treated as official.
