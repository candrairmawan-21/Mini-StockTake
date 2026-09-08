# MIGRATION_FROM_SUPABASE.md

## Decision
Supabase/PostgreSQL is no longer used by the active application.

The old implementation is retained under `legacy-supabase/` only as a reference for business logic.

## Replacement
- Express API -> Google Apps Script callable functions
- PostgreSQL tables -> MASTER + per-store Google Sheets
- Supabase authentication -> store selection/session access in Apps Script
- System DB snapshot storage -> temporary `SYSTEM_DB_LOOKUP`
- SQL working view -> Apps Script working view
- SQL physical count -> `STOCK_TAKE_ITEMS` + `PHYSICAL_COUNT_HISTORY`

## Important model change
The System Database is now a daily lookup source, not a historical snapshot.

The user uploads two files every day:
- System DB
- Itemize/Scan Result

Itemize is the source of rows displayed in Stock Take Entry.

System-only rows are not displayed.

## Legacy code
Do not reactivate SQL migrations, Supabase routes, PostgreSQL pool code, or Express server code.
