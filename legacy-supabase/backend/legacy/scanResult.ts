/**
 * Scan Result parser — DATA_FORMAT.md §4, BUSINESS_RULES.md §6, §6a, §13.
 *
 * Verified real-file structure (Itemize_XWGN_dummy.xlsx):
 *   Excel, single sheet, NO header row, ONLY 2 columns (SKU, Rack).
 *   There is NO Scan Qty column — it does not exist in the source, ever.
 *
 * Scan Qty is DERIVED: one row = one physical unit scanned. Scan Qty
 * for a given SKU+Rack is the count of duplicate rows for that pair
 * within a single uploaded file. This replaces the (incorrect) prior
 * assumption of reading a "Scan Qty column" — see DEVELOPMENT_STATUS.md
 * Bug #3.
 */

import * as XLSX from "xlsx";

const COL_SKU = 0;
const COL_RACK = 1;

export interface DerivedScanRow {
  sku: string;
  rackNumberRaw: string;
  rackNumberNormalized: string; // "-" -> "NO RACK", same rule as System DB
  scanQty: number; // always >= 1 for any pair present in the file
}

export interface ScanResultParseResult {
  derivedRows: DerivedScanRow[];
  invalidRawRowCount: number;
  totalRawRowsParsed: number;
}

function normalizeRack(raw: string): string {
  return raw === "-" ? "NO RACK" : raw;
}

/**
 * Parses a raw Scan Result file (as an XLSX ArrayBuffer/Buffer) and
 * derives Scan Qty by counting duplicate SKU+Rack rows.
 *
 * No header skip — the real file starts data at row 1 (index 0).
 */
export function parseScanResult(fileBuffer: ArrayBuffer | Buffer): ScanResultParseResult {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: (string | number)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1, // raw array-of-arrays, no header inference
    blankrows: false,
  });

  // Group + count in a single pass — O(n), no per-row DB round-trip
  // (DATABASE_SCHEMA.md §5.4).
  const counts = new Map<string, { sku: string; rackRaw: string; rackNormalized: string; count: number }>();
  let invalidRawRowCount = 0;

  for (const row of rows) {
    const skuRaw = row[COL_SKU];
    const rackRaw = row[COL_RACK];

    const sku = skuRaw === undefined || skuRaw === null ? "" : String(skuRaw).trim();
    const rack = rackRaw === undefined || rackRaw === null ? "" : String(rackRaw).trim();

    if (!sku || !rack) {
      invalidRawRowCount++;
      continue;
    }

    const rackNormalized = normalizeRack(rack);
    const key = `${sku}|${rackNormalized}`;

    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { sku, rackRaw: rack, rackNormalized, count: 1 });
    }
  }

  const derivedRows: DerivedScanRow[] = Array.from(counts.values()).map((v) => ({
    sku: v.sku,
    rackNumberRaw: v.rackRaw,
    rackNumberNormalized: v.rackNormalized,
    scanQty: v.count,
  }));

  return {
    derivedRows,
    invalidRawRowCount,
    totalRawRowsParsed: rows.length,
  };
}
