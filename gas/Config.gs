const CONFIG = Object.freeze({
  MASTER_SPREADSHEET_ID: '1sGSkv-Re6E2Ta9ka05sTGeZ6d5WiF2r6ZKI4UUhuykA',
  SHEETS: { STORES: 'STORES', USERS: 'USERS' },
  STORE_SHEETS: {
    SYSTEM_DB_LOOKUP: 'SYSTEM_DB_LOOKUP',
    SYSTEM_DB_AUDIT: 'SYSTEM_DB_UPLOAD_AUDIT',
    ITEMIZE_HISTORY: 'ITEMIZE_HISTORY',
    STOCK_TAKE_ITEMS: 'STOCK_TAKE_ITEMS',
    SESSIONS: 'SESSIONS',
    PHYSICAL_HISTORY: 'PHYSICAL_COUNT_HISTORY',
    RESULT_SUMMARY: 'RESULT_SUMMARY'
  },
  SESSION_STATUS: { IN_PROGRESS: 'IN_PROGRESS', FINALIZED: 'FINALIZED' }
});

function now_() { return new Date(); }
function id_(prefix) { return prefix + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase(); }
function norm_(v) { return String(v == null ? '' : v).trim(); }
function key_(sku, rack) { return norm_(sku) + '|' + norm_(rack); }
function toNumber_(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}
function json_(v) { return JSON.parse(JSON.stringify(v)); }
