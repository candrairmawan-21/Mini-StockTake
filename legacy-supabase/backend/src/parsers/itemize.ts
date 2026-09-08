/**
 * Itemize parser.
 * Itemize contains SKU + Rack only. It is a counting list, not a quantity source.
 * Duplicate SKU+Rack rows are deduplicated; they must NEVER become Physical Qty.
 */
import * as XLSX from "xlsx";

const COL_SKU = 0;
const COL_RACK = 1;

export interface ItemizeRow {
  sku: string;
  rackNumberRaw: string;
  rackNumberNormalized: string;
}

export interface ItemizeParseResult {
  rows: ItemizeRow[];
  duplicateRawRowCount: number;
  invalidRawRowCount: number;
  totalRawRowsParsed: number;
}

function normalizeRack(raw: string): string {
  return raw === "-" ? "NO RACK" : raw;
}

export function parseItemize(fileBuffer: ArrayBuffer | Buffer): ItemizeParseResult {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  if (!workbook.SheetNames.length) {
    return { rows: [], duplicateRawRowCount: 0, invalidRawRowCount: 1, totalRawRowsParsed: 0 };
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows: (string | number)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
  });

  const unique = new Map<string, ItemizeRow>();
  let invalidRawRowCount = 0;
  let duplicateRawRowCount = 0;

  for (const row of rawRows) {
    const sku = row[COL_SKU] == null ? "" : String(row[COL_SKU]).trim();
    const rack = row[COL_RACK] == null ? "" : String(row[COL_RACK]).trim();
    if (!sku || !rack) {
      invalidRawRowCount++;
      continue;
    }

    const rackNumberNormalized = normalizeRack(rack);
    const key = `${sku}|${rackNumberNormalized}`;
    if (unique.has(key)) {
      duplicateRawRowCount++;
      continue;
    }
    unique.set(key, { sku, rackNumberRaw: rack, rackNumberNormalized });
  }

  return {
    rows: [...unique.values()],
    duplicateRawRowCount,
    invalidRawRowCount,
    totalRawRowsParsed: rawRows.length,
  };
}
