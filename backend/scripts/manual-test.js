const fs = require('fs');
const { parseSystemDb } = require('../dist/parsers/systemDb');
const { parseScanResult } = require('../dist/parsers/scanResult');

console.log('=== TEST: parseSystemDb ===');
const sysContent = fs.readFileSync('/mnt/user-data/uploads/XWGN_-_Tarikan_data_2.txt', 'utf-8');
const sysResult = parseSystemDb(sysContent);
console.log('Valid rows:', sysResult.validRows.length);
console.log('Invalid rows:', sysResult.invalidRows.length);
console.log('Sample valid row[0]:', sysResult.validRows[0]);
console.log('Sample row with keepstock box filled:', sysResult.validRows.find(r => r.keepstockBoxNumber));
console.log('Sample row with rack "-":', sysResult.validRows.find(r => r.rackNumberRaw === '-'));

console.log('\n=== TEST: parseScanResult ===');
const scanBuffer = fs.readFileSync('/mnt/user-data/uploads/Itemize_XWGN_dummy.xlsx');
const scanResult = parseScanResult(scanBuffer);
console.log('Derived unique SKU+Rack rows:', scanResult.derivedRows.length);
console.log('Total raw rows parsed:', scanResult.totalRawRowsParsed);
console.log('Invalid raw rows:', scanResult.invalidRawRowCount);
console.log('Rows with scanQty > 1:', scanResult.derivedRows.filter(r => r.scanQty > 1).length);
console.log('Sample derived row with qty=2:', scanResult.derivedRows.find(r => r.scanQty === 2));
