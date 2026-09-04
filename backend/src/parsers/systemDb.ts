/**
 * System DB parser — DATA_FORMAT.md §3, BUSINESS_RULES.md §5, §5a, §5b.
 *
 * Verified real-file structure (XWGN_-_Tarikan_data_2.txt):
 *   .txt extension, content is CSV, UTF-8, CRLF, header row present.
 *   sku,rack number,price,qty,,date,nomor keepstock,barcode,description
 *
 * IMPORTANT — this file is NOT RFC4180-quoted CSV. Verified against
 * the real export: the Description column (last column) sometimes
 * contains a raw, unescaped comma used as a decimal separator
 * (e.g. "HEXOS MINT 12,5 GR") and sometimes a raw double-quote used
 * as an inch mark (e.g. `WALL BIB TAP WM 1/2"`), with no CSV quoting
 * around either. A real CSV/quote-aware parser (Papaparse, Python's
 * csv module — both tried during verification) misreads the stray
 * quote as an opening quote and swallows subsequent lines, silently
 * losing ~3-5% of rows. This parser therefore does NOT use a
 * quote-aware CSV library — it splits each line on the first 8
 * commas only and treats everything after the 8th comma as the
 * literal Description value, which is safe because Description is
 * always the last column and the only free-text field.
 *
 * Column indices are explicit constants — do NOT inline magic numbers.
 */

// --- Column mapping (0-based array index; see DATA_FORMAT.md §1) ---
const COL_SKU = 0;
const COL_RACK = 1;
const COL_PRICE = 2;
const COL_SYSTEM_QTY = 3;
// index 4 is unused — always empty in the source
const COL_DATE = 5;
const COL_KEEPSTOCK_BOX = 6;
const COL_BARCODE = 7;
const COL_DESCRIPTION = 8;

const DATA_COLUMN_COUNT = 9;
const SPLIT_LIMIT = DATA_COLUMN_COUNT - 1; // 8 commas -> 9 fields, last one is raw remainder

export interface SystemDbRow {
  sku: string;
  rackNumberRaw: string;
  rackNumberNormalized: string; // "-" -> "NO RACK", BUSINESS_RULES.md §5b/§11
  price: number;
  systemQty: number;
  description: string | null;
  sourceDate: string | null; // ISO date or null; DD/MM/YYYY in source
  keepstockBoxNumber: string | null;
  barcode: string | null;
}

export interface SystemDbParseResult {
  validRows: SystemDbRow[];
  invalidRows: { rowNumber: number; raw: string[]; reason: string }[];
  totalRowsParsed: number;
}

/**
 * Two distinct "no location" cases, confirmed separately by the
 * business owner — do not merge them:
 *
 *  - Rack = "-"  -> "NO RACK", unconditional (BUSINESS_RULES.md §11).
 *  - Rack = ""   -> "NO ADDRESS", ONLY valid when System Qty > 0.
 *    An empty rack with System Qty = 0 has no meaningful location and
 *    no meaningful quantity, so it stays rejected (see isRowValid).
 */
function normalizeRack(raw: string): string {
  if (raw === "-") return "NO RACK";
  if (raw === "") return "NO ADDRESS";
  return raw;
}

/** DD/MM/YYYY (as observed in the source) -> ISO yyyy-mm-dd, or null if unparsable. */
function parseSourceDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parseNumeric(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Splits one data line into exactly DATA_COLUMN_COUNT fields: the
 * first 8 columns split on comma normally, the 9th (Description) is
 * everything remaining after the 8th comma, untouched. This correctly
 * handles commas/quotes embedded in free-text Description without a
 * quote-aware parser (see file header comment).
 */
function splitDataLine(line: string): string[] {
  const parts: string[] = [];
  let rest = line;
  for (let i = 0; i < SPLIT_LIMIT; i++) {
    const idx = rest.indexOf(",");
    if (idx === -1) {
      parts.push(rest);
      rest = "";
    } else {
      parts.push(rest.slice(0, idx));
      rest = rest.slice(idx + 1);
    }
  }
  parts.push(rest); // remainder = Description, verbatim
  return parts;
}

function splitLines(content: string): string[] {
  return content.split(/\r\n|\r|\n/).filter((line) => line.length > 0);
}

/**
 * Parses a raw System DB file (already read as a UTF-8 string).
 * Header row is always skipped (System DB has one — unlike Scan Result).
 */
export function parseSystemDb(fileContent: string): SystemDbParseResult {
  const lines = splitLines(fileContent);
  const validRows: SystemDbRow[] = [];
  const invalidRows: SystemDbParseResult["invalidRows"] = [];

  if (lines.length === 0) {
    return { validRows: [], invalidRows: [{ rowNumber: 0, raw: [], reason: "Empty file" }], totalRowsParsed: 0 };
  }

  const headerCols = lines[0].split(",");
  if (headerCols.length < DATA_COLUMN_COUNT) {
    return {
      validRows: [],
      invalidRows: [{ rowNumber: 0, raw: headerCols, reason: "Missing or malformed header row" }],
      totalRowsParsed: 0,
    };
  }

  for (let i = 1; i < lines.length; i++) {
    const row = splitDataLine(lines[i]);

    const sku = row[COL_SKU]?.trim();
    const rackRaw = row[COL_RACK]?.trim() ?? "";
    const price = parseNumeric(row[COL_PRICE] ?? "");
    const systemQty = parseNumeric(row[COL_SYSTEM_QTY] ?? "");

    if (!sku) {
      invalidRows.push({ rowNumber: i, raw: row, reason: "SKU is blank" });
      continue;
    }
    if (price === null || price < 0) {
      invalidRows.push({ rowNumber: i, raw: row, reason: `Invalid Price: "${row[COL_PRICE]}"` });
      continue;
    }
    if (systemQty === null || systemQty < 0) {
      invalidRows.push({ rowNumber: i, raw: row, reason: `Invalid System Qty: "${row[COL_SYSTEM_QTY]}"` });
      continue;
    }
    // Rack Number "" (truly empty, distinct from "-") is only valid
    // when there is a real quantity to track — confirmed business
    // decision, see normalizeRack().
    if (rackRaw === "" && systemQty === 0) {
      invalidRows.push({ rowNumber: i, raw: row, reason: "Rack Number is blank and System Qty is 0 — no location, nothing to track" });
      continue;
    }

    validRows.push({
      sku,
      rackNumberRaw: rackRaw,
      rackNumberNormalized: normalizeRack(rackRaw),
      price,
      systemQty,
      description: row[COL_DESCRIPTION]?.trim() || null,
      sourceDate: parseSourceDate(row[COL_DATE] ?? ""),
      keepstockBoxNumber: row[COL_KEEPSTOCK_BOX]?.trim() || null,
      barcode: row[COL_BARCODE]?.trim() || null,
    });
  }

  // Duplicate SKU+Rack within one file: keep the first valid row and reject
  // later duplicates so the DB UNIQUE constraint can never fail silently.
  const seen = new Map<string, number>();
  const dedupedRows: SystemDbRow[] = [];
  for (const r of validRows) {
    const key = `${r.sku}|${r.rackNumberNormalized}`;
    if (seen.has(key)) {
      invalidRows.push({
        rowNumber: seen.get(key)! + 1,
        raw: [],
        reason: `Duplicate SKU+Rack "${key}"`,
      });
      continue;
    }
    seen.set(key, dedupedRows.length);
    dedupedRows.push(r);
  }

  return { validRows: dedupedRows, invalidRows, totalRowsParsed: lines.length - 1 };
}
