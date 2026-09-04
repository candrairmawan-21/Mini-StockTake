const fs = require('fs');
const { parseSystemDb } = require('../dist/parsers/systemDb');
const { parseItemize } = require('../dist/parsers/itemize');

console.log('=== TEST: parseSystemDb ===');
const sysContent = fs.readFileSync('/mnt/user-data/uploads/XWGN_-_Tarikan_data_2.txt', 'utf-8');
const sysResult = parseSystemDb(sysContent);
console.log('Valid rows:', sysResult.validRows.length);
console.log('Invalid rows:', sysResult.invalidRows.length);
console.log('Sample valid row[0]:', sysResult.validRows[0]);
console.log('Sample row with keepstock box filled:', sysResult.validRows.find(r => r.keepstockBoxNumber));
console.log('Sample row with rack "-":', sysResult.validRows.find(r => r.rackNumberRaw === '-'));
console.log('Sample row with NO ADDRESS (empty rack, qty>0):', sysResult.validRows.find(r => r.rackNumberNormalized === 'NO ADDRESS'));

console.log('\n=== TEST: parseItemize (current, checklist-only model) ===');
const itemizeBuffer = fs.readFileSync('/mnt/user-data/uploads/Itemize_XWGN_dummy.xlsx');
const itemizeResult = parseItemize(itemizeBuffer);
console.log('Total raw rows parsed:', itemizeResult.totalRawRowsParsed);
console.log('Unique checklist rows (deduped):', itemizeResult.rows.length);
console.log('Duplicate raw rows (discarded, NOT counted as qty):', itemizeResult.duplicateRawRowCount);
console.log('Invalid raw rows:', itemizeResult.invalidRawRowCount);
console.log('Sample checklist row:', itemizeResult.rows[0]);
