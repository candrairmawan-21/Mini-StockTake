const SYSTEM_DB = Object.freeze({
  COL_SKU:0, COL_RACK:1, COL_PRICE:2, COL_SYSTEM_QTY:3,
  COL_DATE:5, COL_KEEPSTOCK:6, COL_BARCODE:7, COL_DESCRIPTION:8,
  DATA_FIELDS:9
});

function splitSystemDbLine_(line) {
  const parts=[]; let rest=String(line||'');
  for(let i=0;i<8;i++){
    const idx=rest.indexOf(',');
    if(idx<0){parts.push(rest);rest='';}
    else {parts.push(rest.slice(0,idx));rest=rest.slice(idx+1);}
  }
  parts.push(rest);
  return parts;
}

function normalizeRack_(raw) {
  raw=norm_(raw);
  if(raw==='-') return 'NO RACK';
  if(raw==='') return 'NO ADDRESS';
  return raw;
}

function parseDate_(v) {
  const s=norm_(v); if(!s) return '';
  const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(!m) return '';
  const d=Number(m[1]),mo=Number(m[2]),y=Number(m[3]);
  const dt=new Date(y,mo-1,d);
  if(dt.getFullYear()!==y||dt.getMonth()!==mo-1||dt.getDate()!==d)return '';
  return Utilities.formatDate(dt,'Asia/Jakarta','yyyy-MM-dd');
}

function isNumeric_(v) {
  const s=norm_(v);
  return s!=='' && Number.isFinite(Number(s));
}

function looksLikeDate_(v) {
  return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(norm_(v));
}

function looksLikeRack_(v) {
  const s=norm_(v);
  return s==='-' || /^[A-Za-z]{1,5}\d{2}(?:-\d{2})?$/.test(s);
}

function isSystemHeader_(line) {
  const s=String(line||'').toLowerCase();
  return s.indexOf('sku')>=0 && s.indexOf('rack')>=0 && s.indexOf('price')>=0;
}

/**
 * Smart parser for the daily System DB.
 * IMPORTANT: System DB is a LOOKUP SOURCE only. It is not a historical
 * business dataset. The parsed result is held only for the current upload
 * operation and then written to the store's temporary SYSTEM_DB_LOOKUP sheet.
 */
function parseSystemDbText_(content) {
  const lines=String(content||'').split(/\r\n|\r|\n/);
  const valid=[], invalid=[];
  let dataLines=0, headerSkipped=false;
  const seen={};

  lines.forEach((line,idx)=>{
    if(!line.trim()) return;
    if(!headerSkipped && isSystemHeader_(line)){headerSkipped=true;return;}

    let row=splitSystemDbLine_(line);
    dataLines++;

    // Known export anomaly: an extra rack-like field can appear before
    // the real rack. Re-align the stable columns before validation.
    if (looksLikeRack_(row[2]) && isNumeric_(row[3]) && isNumeric_(row[4]) && looksLikeDate_(row[6])) {
      const tail=String(row[8]||'');
      const comma=tail.indexOf(',');
      const barcode=comma<0?tail:tail.slice(0,comma);
      const description=comma<0?'':tail.slice(comma+1);
      row=[row[0],row[2],row[3],row[4],row[5],row[6],row[7],barcode,description];
    }

    const sku=norm_(row[SYSTEM_DB.COL_SKU]), rack=norm_(row[SYSTEM_DB.COL_RACK]);
    const price=Number(norm_(row[SYSTEM_DB.COL_PRICE])), qty=Number(norm_(row[SYSTEM_DB.COL_SYSTEM_QTY]));
    const reason=[];

    if(!sku) reason.push('SKU_BLANK');
    if(norm_(row[SYSTEM_DB.COL_PRICE])==='' || !Number.isFinite(price) || price<0) reason.push('INVALID_PRICE');
    if(norm_(row[SYSTEM_DB.COL_SYSTEM_QTY])==='' || !Number.isFinite(qty) || qty<0) reason.push('INVALID_SYSTEM_QTY');

    // Empty Rack is meaningful only when System Qty > 0.
    if(rack==='' && qty===0) reason.push('BLANK_RACK_ZERO_QTY');

    const normRack=normalizeRack_(rack);
    const k=key_(sku,normRack);
    if(!reason.length && seen[k]!=null) reason.push('DUPLICATE_SKU_RACK_FIRST_LINE_'+seen[k]);

    if(reason.length){
      invalid.push({
        rowNumber:idx+1,
        rawLine:line,
        reason:reason.join('; '),
        sku,
        rackNumber:rack,
        price:Number.isFinite(price)?price:null,
        systemQty:Number.isFinite(qty)?qty:null,
        barcode:norm_(row[SYSTEM_DB.COL_BARCODE]),
        description:row.slice(8).join(',').trim()
      });
      return;
    }

    seen[k]=idx+1;
    valid.push({
      sku,
      rackNumberRaw:rack,
      rackNumberNormalized:normRack,
      price,
      systemQty:qty,
      sourceDate:parseDate_(row[SYSTEM_DB.COL_DATE]),
      keepstockBoxNumber:norm_(row[SYSTEM_DB.COL_KEEPSTOCK]),
      barcode:norm_(row[SYSTEM_DB.COL_BARCODE]),
      description:row.slice(8).join(',').trim()
    });
  });

  return {validRows:valid,invalidRows:invalid,totalRowsParsed:dataLines};
}

function testSystemDBParser() {
  const sample=`sku,rack number,price,qty,,date,nomor keepstock,barcode,description
2000188,BG05-07,19000.00,10,,04/08/2026,,2000188,A5 NOTEBOOK_8025-1#
3106662,-,2500.00,0,,30/04/2026,,8998685011003,HEXOS MINT 12,5 GR`;
  return parseSystemDbText_(sample);
}

/**
 * Daily System DB upload.
 * The file is NOT archived and no snapshot history is created.
 * It replaces the temporary lookup table for the current store/session.
 */
function uploadSystemDB(storeCode,sessionId,fileName,base64) {
  const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const session=requireSession_(storeCode,sessionId);
    const store=getStoreContext_(storeCode), ss=SpreadsheetApp.openById(store.spreadsheetId);

    const bytes=Utilities.base64Decode(String(base64).replace(/^data:.*?;base64,/,''));
    const content=Utilities.newBlob(bytes,fileName||'systemdb.txt').getDataAsString('UTF-8');
    const parsed=parseSystemDbText_(content);
    if(parsed.validRows.length===0) throw new Error('NO_VALID_SYSTEM_DB_ROWS');

    const lookup=ss.getSheetByName(CONFIG.STORE_SHEETS.SYSTEM_DB_LOOKUP);
    clearDataRows_(lookup);

    const rows=parsed.validRows.map(r=>[
      r.sku,r.rackNumberRaw,r.rackNumberNormalized,r.price,r.systemQty,
      r.sourceDate,r.keepstockBoxNumber,r.barcode,r.description
    ]);
    writeChunks_(lookup,rows,5000);

    // Keep the audit for the current daily upload only.
    const audit=ss.getSheetByName(CONFIG.STORE_SHEETS.SYSTEM_DB_AUDIT);
    clearDataRows_(audit);
    const uploadId=id_('UPL');
    const uploadedAt=now_();
    if(parsed.invalidRows.length){
      const a=parsed.invalidRows.map(x=>[
        uploadId,uploadedAt,x.rowNumber,x.rawLine,x.reason,x.sku,x.rackNumber,
        x.price,x.systemQty,x.barcode,x.description
      ]);
      writeChunks_(audit,a,2000);
    }

    // If Itemize was already uploaded, re-enrich its existing stock-take
    // lines from the newly uploaded lookup without changing Physical Qty.
    const itemHistory=ss.getSheetByName(CONFIG.STORE_SHEETS.ITEMIZE_HISTORY);
    let refreshed=0;
    if(itemHistory && itemHistory.getLastRow()>1){
      const im=getHeaderMap_(itemHistory);
      const historyRows=itemHistory.getRange(2,1,itemHistory.getLastRow()-1,itemHistory.getLastColumn()).getValues();
      const sessionRows=historyRows.filter(r=>norm_(r[im.session_id-1])===sessionId)
        .map(r=>({sku:norm_(r[im.sku-1]),rack:normalizeRack_(r[im.rack_number-1])}));
      if(sessionRows.length){
        const result=mergeItemizeIntoStockTake_(ss,sessionId,sessionRows,uploadedAt);
        refreshed=result.inserted+result.confirmed;
      }
    }

    touchSession(storeCode,sessionId,session.lastActiveRack||'');
    return {
      ok:true,fileName,
      validRowCount:parsed.validRows.length,
      invalidRowCount:parsed.invalidRows.length,
      totalRowsParsed:parsed.totalRowsParsed,
      lookupMode:'DAILY_TEMPORARY',
      uploadId,
      uploadedAt:uploadedAt.toISOString(),
      refreshedItemizeRows:refreshed
    };
  } finally { lock.releaseLock(); }
}

function clearDataRows_(sh) {
  if(!sh)return;
  const lastRow=sh.getLastRow();
  if(lastRow>1) sh.getRange(2,1,lastRow-1,sh.getLastColumn()).clearContent();
}

function writeChunks_(sh,rows,size) {
  if(!rows.length)return;
  const cols=rows[0].length;
  for(let i=0;i<rows.length;i+=size) {
    const chunk=rows.slice(i,i+size);
    sh.getRange(sh.getLastRow()+1,1,chunk.length,cols).setValues(chunk);
  }
}

function findRowByValue_(sh,col,needle) {
  if(sh.getLastRow()<2)return 0;
  const vals=sh.getRange(2,col,sh.getLastRow()-1,1).getValues();
  for(let i=0;i<vals.length;i++) if(norm_(vals[i][0])===norm_(needle)) return i+2;
  return 0;
}
