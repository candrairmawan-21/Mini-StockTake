function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Midnorth Backend System')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function setupMasterSpreadsheet() {
  const ss = SpreadsheetApp.openById(CONFIG.MASTER_SPREADSHEET_ID);
  ensureSheet_(ss, CONFIG.SHEETS.STORES, ['store_code','store_name','spreadsheet_id','active']);
  ensureSheet_(ss, CONFIG.SHEETS.USERS, ['store_code','user_name','active']);
  return { ok:true, spreadsheetId:ss.getId(), sheets:[CONFIG.SHEETS.STORES,CONFIG.SHEETS.USERS] };
}

function ensureStoreSpreadsheet(storeCode) {
  const master = SpreadsheetApp.openById(CONFIG.MASTER_SPREADSHEET_ID);
  const row = findStore_(master, storeCode);
  if (!row) throw new Error('STORE_NOT_FOUND');

  let id = row.spreadsheetId;
  if (!id) {
    const created = SpreadsheetApp.create('Mini Stock Take - ' + row.storeCode);
    id = created.getId();
    master.getSheetByName(CONFIG.SHEETS.STORES).getRange(row.rowNumber,3).setValue(id);
  }

  const ss = SpreadsheetApp.openById(id);
  ensureSheet_(ss, CONFIG.STORE_SHEETS.SYSTEM_DB_HISTORY,
    ['snapshot_id','uploaded_at','sku','rack_number','price','system_qty','date','keepstock_box','barcode','description']);
  ensureSheet_(ss, CONFIG.STORE_SHEETS.SYSTEM_DB_AUDIT,
    ['upload_id','snapshot_id','uploaded_at','source_line','raw_line','reason','parsed_sku','parsed_rack','parsed_price','parsed_qty','parsed_barcode','parsed_description']);
  ensureSheet_(ss, CONFIG.STORE_SHEETS.ITEMIZE_HISTORY,
    ['upload_id','uploaded_at','session_id','sku','rack_number']);
  ensureSheet_(ss, CONFIG.STORE_SHEETS.STOCK_TAKE_ITEMS,
    ['session_id','sku','rack_number','price','system_qty','physical_qty','variance_qty','variance_value','status','keepstock_box','barcode','description','created_at','updated_at']);
  ensureSheet_(ss, CONFIG.STORE_SHEETS.SESSIONS,
    ['session_id','store_code','status','created_at','updated_at','finalized_at','last_active_rack','system_snapshot_id']);
  ensureSheet_(ss, CONFIG.STORE_SHEETS.PHYSICAL_HISTORY,
    ['history_id','session_id','sku','rack_number','old_qty','new_qty','changed_at','changed_by']);
  ensureSheet_(ss, CONFIG.STORE_SHEETS.RESULT_SUMMARY,
    ['session_id','finalized_at','total_system_qty','total_physical_qty','total_absolute_variance_qty','total_variance_value','accuracy']);
  removeEmptyDefaultSheet_(ss);
  return {ok:true,storeCode:row.storeCode,storeName:row.storeName,spreadsheetId:id};
}

function ensureSheet_(ss,name,headers) {
  let sh=ss.getSheetByName(name);
  if(!sh) sh=ss.insertSheet(name);
  const current=sh.getLastColumn();
  if(sh.getLastRow()===0) {
    sh.getRange(1,1,1,headers.length).setValues([headers]);
  } else {
    const existing=sh.getRange(1,1,1,Math.max(current,1)).getValues()[0].map(norm_);
    const missing=headers.filter(h=>!existing.includes(h));
    if(missing.length) sh.getRange(1,current+1,1,missing.length).setValues([missing]);
  }
  return sh;
}

function getHeaderMap_(sh) {
  const headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(norm_);
  const map={}; headers.forEach((h,i)=>{if(h)map[h]=i+1;}); return map;
}

function findStore_(master,storeCode) {
  const sh=master.getSheetByName(CONFIG.SHEETS.STORES);
  if(!sh || sh.getLastRow()<2) return null;
  const values=sh.getDataRange().getValues();
  for(let i=1;i<values.length;i++) {
    if(norm_(values[i][0]).toUpperCase()===norm_(storeCode).toUpperCase() &&
       String(values[i][3]).toUpperCase()!=='FALSE') {
      return {rowNumber:i+1,storeCode:norm_(values[i][0]),storeName:norm_(values[i][1]),spreadsheetId:norm_(values[i][2])};
    }
  }
  return null;
}

function getStoreContext_(storeCode) {
  const master=SpreadsheetApp.openById(CONFIG.MASTER_SPREADSHEET_ID);
  const row=findStore_(master,storeCode);
  if(!row) throw new Error('STORE_NOT_FOUND');
  if(!row.spreadsheetId) { ensureStoreSpreadsheet(row.storeCode); return findStore_(master,row.storeCode); }
  return row;
}

function removeEmptyDefaultSheet_(ss) {
  const required=Object.values(CONFIG.STORE_SHEETS);
  ss.getSheets().forEach(sh=>{
    if(required.includes(sh.getName())) return;
    if(sh.getLastRow()===0 && sh.getLastColumn()===0 && ss.getSheets().length>1) ss.deleteSheet(sh);
  });
}

function cleanupAllStoreDefaultSheets() {
  const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const master=SpreadsheetApp.openById(CONFIG.MASTER_SPREADSHEET_ID);
    const sh=master.getSheetByName(CONFIG.SHEETS.STORES);
    const out={ok:true,cleaned:[],skipped:[],errors:[]};
    if(!sh || sh.getLastRow()<2) throw new Error('STORES_IS_EMPTY');
    sh.getRange(2,1,sh.getLastRow()-1,4).getValues().forEach((r,i)=>{
      const code=norm_(r[0]), id=norm_(r[2]); if(!code||!id)return;
      try {
        const ss=SpreadsheetApp.openById(id); const before=ss.getSheets().map(s=>s.getName());
        removeEmptyDefaultSheet_(ss); const after=ss.getSheets().map(s=>s.getName());
        const deleted=before.filter(x=>!after.includes(x));
        (deleted.length?out.cleaned:out.skipped).push({row:i+2,storeCode:code,deletedSheets:deleted});
      } catch(e){out.errors.push({row:i+2,storeCode:code,error:String(e.message||e)});}
    });
    out.ok=out.errors.length===0; return out;
  } finally { lock.releaseLock(); }
}

function setupAllStores() {
  const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const master=SpreadsheetApp.openById(CONFIG.MASTER_SPREADSHEET_ID);
    const sh=master.getSheetByName(CONFIG.SHEETS.STORES);
    if(!sh) throw new Error('STORES_SHEET_NOT_FOUND');
    const values=sh.getRange(2,1,Math.max(0,sh.getLastRow()-1),4).getValues();
    const result={ok:false,created:[],reused:[],skipped:[],errors:[]};
    const seen={};
    values.forEach((r,i)=>{
      const row=i+2,code=norm_(r[0]),name=norm_(r[1]),id=norm_(r[2]);
      if(!code&&!name&&!id)return;
      if(!code||!name){result.skipped.push({row,reason:'STORE_CODE_OR_STORE_NAME_EMPTY'});return;}
      const key=code.toUpperCase();
      if(seen[key]) throw new Error('DUPLICATE_STORE_CODE: '+code+' at rows '+seen[key]+' and '+row);
      seen[key]=row;
      try {
        if(id){ ensureStoreSpreadsheet(code); sh.getRange(row,4).setValue(true); result.reused.push({row,storeCode:code,spreadsheetId:id}); }
        else {
          const created=SpreadsheetApp.create('Mini Stock Take - '+code);
          sh.getRange(row,3,1,2).setValues([[created.getId(),true]]);
          ensureStoreSpreadsheet(code); result.created.push({row,storeCode:code,spreadsheetId:created.getId()});
        }
      } catch(e){result.errors.push({row,storeCode:code,error:String(e.message||e)});}
    });
    result.ok=result.errors.length===0; return result;
  } finally { lock.releaseLock(); }
}
