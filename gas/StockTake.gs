/**
 * Stock Take working view.
 *
 * IMPORTANT BUSINESS MODEL:
 * - Itemize / Scan Result is the DISPLAY SOURCE.
 * - System DB is lookup-only and is never used to seed extra rows.
 * - Therefore a System DB SKU+Rack missing from Itemize is NOT displayed.
 *   It is only part of the comparison/audit information.
 * - An Itemize SKU+Rack that matches today's System DB gets system metadata.
 * - Itemize SKU found in System DB at another rack => WRONG_RACK.
 * - Itemize SKU absent from System DB => UNKNOWN_SKU.
 * - Physical Qty is always manual and starts blank.
 */

function getRackList(storeCode,sessionId) {
  requireSession_(storeCode,sessionId);
  const ss=SpreadsheetApp.openById(getStoreContext_(storeCode).spreadsheetId);
  const sh=ss.getSheetByName(CONFIG.STORE_SHEETS.STOCK_TAKE_ITEMS);
  const racks={};
  if(sh.getLastRow()>1){
    const m=getHeaderMap_(sh);
    sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues().forEach(r=>{
      if(norm_(r[m.session_id-1])===sessionId && norm_(r[m.rack_number-1])) {
        racks[normalizeRack_(r[m.rack_number-1])]=true;
      }
    });
  }
  return Object.keys(racks).sort();
}

function openRack(storeCode,sessionId,rack) {
  const session=requireSession_(storeCode,sessionId);
  rack=normalizeRack_(rack);
  if(!rack) throw new Error('RACK_REQUIRED');

  const store=getStoreContext_(storeCode),ss=SpreadsheetApp.openById(store.spreadsheetId);
  const sh=ss.getSheetByName(CONFIG.STORE_SHEETS.STOCK_TAKE_ITEMS);
  const m=getHeaderMap_(sh);
  const values=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues():[];
  const items=[];

  values.forEach((r,i)=>{
    if(norm_(r[m.session_id-1])!==sessionId) return;
    if(normalizeRack_(r[m.rack_number-1])!==rack) return;

    const physical=r[m.physical_qty-1];
    const systemQty=r[m.system_qty-1];
    const hasPhysical=physical!==''&&physical!=null;
    const hasSystem=systemQty!==''&&systemQty!=null&&Number.isFinite(Number(systemQty));
    const statusRaw=norm_(r[m.status-1]);

    items.push({
      id:i+2,
      sku:norm_(r[m.sku-1]),
      rack,
      description:norm_(r[m.description-1]),
      price:r[m.price-1],
      systemQty:hasSystem?Number(systemQty):null,
      physicalQty:hasPhysical?Number(physical):null,
      varianceQty:hasPhysical&&hasSystem?Number(physical)-Number(systemQty):null,
      status:statusRaw==='UNKNOWN_SKU'?'UNKNOWN SKU':
             statusRaw==='WRONG_RACK'?'WRONG RACK':
             hasPhysical?'COUNTED':'NOT SCANNED'
    });
  });

  items.sort((a,b)=>{
    const statusRank=s=>s==='COUNTED'?0:(s==='WRONG RACK'||s==='UNKNOWN SKU'?1:2);
    const sr=statusRank(a.status)-statusRank(b.status);
    return sr||a.sku.localeCompare(b.sku);
  });

  touchSession(storeCode,sessionId,rack);

  return {
    ok:true,
    rackNumber:rack,
    items,
    total:items.length,
    counted:items.filter(x=>x.physicalQty!==null).length
  };
}

function getOperatorIdentity_(storeCode) {
  // Prefer the actual Google account when Apps Script exposes it. Some web-app
  // deployment modes intentionally return an empty email; in that case fall
  // back to the configured store operator so the audit field is never blank.
  let email='';
  try { email=norm_(Session.getActiveUser().getEmail()); } catch(e) {}
  return email || getStoreProfile(storeCode).userName || 'UNKNOWN_OPERATOR';
}

function savePhysicalQty(storeCode,sessionId,itemRow,physicalQty) {
  requireSession_(storeCode,sessionId);
  const n=physicalQty===''||physicalQty==null?null:Number(physicalQty);
  if(n!==null && (!Number.isFinite(n)||n<0)) throw new Error('INVALID_PHYSICAL_QTY');

  const store=getStoreContext_(storeCode),ss=SpreadsheetApp.openById(store.spreadsheetId);
  const sh=ss.getSheetByName(CONFIG.STORE_SHEETS.STOCK_TAKE_ITEMS),m=getHeaderMap_(sh);
  if(itemRow<2||itemRow>sh.getLastRow())throw new Error('ITEM_NOT_FOUND');

  const r=sh.getRange(itemRow,1,1,sh.getLastColumn()).getValues()[0];
  if(norm_(r[m.session_id-1])!==sessionId)throw new Error('ITEM_STORE_OR_SESSION_MISMATCH');

  // An unresolved System DB match cannot be counted as a normal variance.
  if(n!==null && (norm_(r[m.status-1])==='UNKNOWN_SKU'||norm_(r[m.status-1])==='WRONG_RACK')) {
    throw new Error('SYSTEM_LOOKUP_UNRESOLVED');
  }

  const old=r[m.physical_qty-1]===''?null:Number(r[m.physical_qty-1]);
  const checkedAtCell=m.checked_at?r[m.checked_at-1]:'';
  const isFirstSuccessfulCheck=(n!==null && (old===null || !checkedAtCell));
  const changedAt=now_();

  if(old!==n){
    ss.getSheetByName(CONFIG.STORE_SHEETS.PHYSICAL_HISTORY).appendRow([
      id_('HIS'),sessionId,norm_(r[m.sku-1]),normalizeRack_(r[m.rack_number-1]),
      old,n,changedAt,getOperatorIdentity_(storeCode)
    ]);
  }

  sh.getRange(itemRow,m.physical_qty).setValue(n===null?'':n);
  const systemQty=r[m.system_qty-1];
  const hasSystem=systemQty!==''&&systemQty!=null&&Number.isFinite(Number(systemQty));
  sh.getRange(itemRow,m.variance_qty).setValue(n===null||!hasSystem?'':n-Number(systemQty));
  sh.getRange(itemRow,m.variance_value).setValue(n===null||!hasSystem||r[m.price-1]===''?'':(n-Number(systemQty))*Number(r[m.price-1]));
  sh.getRange(itemRow,m.updated_at).setValue(changedAt);

  // checked_at records the first successful physical count for this SKU
  // in this stock-take session. It is deliberately NOT the System DB
  // upload date and it is NOT overwritten when the quantity is edited later.
  if(m.checked_at && isFirstSuccessfulCheck){
    sh.getRange(itemRow,m.checked_at).setValue(changedAt);
  }

  return {
    ok:true,
    physicalQty:n,
    varianceQty:n===null||!hasSystem?null:n-Number(systemQty)
  };
}

/**
 * Returns how many unique SKU+Rack lines were first checked on each day
 * in the specified stock-take session. checked_at is the source of truth.
 */
function getDailyCheckingSummary(storeCode,sessionId,dateYmd) {
  requireSession_(storeCode,sessionId);
  const ss=SpreadsheetApp.openById(getStoreContext_(storeCode).spreadsheetId);
  const sh=ss.getSheetByName(CONFIG.STORE_SHEETS.STOCK_TAKE_ITEMS);
  const counts={};
  let totalChecked=0;

  if(sh.getLastRow()>1){
    const m=getHeaderMap_(sh);
    if(!m.checked_at) throw new Error('CHECKED_AT_COLUMN_MISSING');
    sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues().forEach(r=>{
      if(norm_(r[m.session_id-1])!==sessionId) return;
      const dt=r[m.checked_at-1];
      if(!(dt instanceof Date) || isNaN(dt.getTime())) return;
      const ymd=Utilities.formatDate(dt,'Asia/Jakarta','yyyy-MM-dd');
      counts[ymd]=(counts[ymd]||0)+1;
      totalChecked++;
    });
  }

  if(dateYmd){
    return {
      ok:true,sessionId, date:dateYmd, checkedSkuCount:counts[dateYmd]||0
    };
  }

  const daily=Object.keys(counts).sort().map(date=>({date,checkedSkuCount:counts[date]}));
  return {ok:true,sessionId,totalChecked,daily};
}

function getSessionResumeState_(storeCode,sessionId) {
  const s=requireSession_(storeCode,sessionId);
  const ss=SpreadsheetApp.openById(getStoreContext_(storeCode).spreadsheetId);
  const sh=ss.getSheetByName(CONFIG.STORE_SHEETS.STOCK_TAKE_ITEMS);
  let total=0,counted=0,unresolved=0;

  if(sh.getLastRow()>1){
    const m=getHeaderMap_(sh);
    sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues().forEach(r=>{
      if(norm_(r[m.session_id-1])!==sessionId)return;
      total++;
      if(r[m.physical_qty-1]!==''&&r[m.physical_qty-1]!=null)counted++;
      if(['UNKNOWN_SKU','WRONG_RACK'].includes(norm_(r[m.status-1])))unresolved++;
    });
  }

  return {
    sessionId:s.sessionId,
    sessionCode:s.sessionId,
    startDate:s.createdAt,
    lastActiveRack:s.lastActiveRack,
    systemSnapshotId:'',
    totalLines:total,
    countedLines:counted,
    unresolvedLines:unresolved,
    progress:total?Math.round(counted/total*100):0
  };
}

function finalizeSession(storeCode,sessionId) {
  const session=requireSession_(storeCode,sessionId);
  const store=getStoreContext_(storeCode),ss=SpreadsheetApp.openById(store.spreadsheetId);
  const sh=ss.getSheetByName(CONFIG.STORE_SHEETS.STOCK_TAKE_ITEMS);
  const rows=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues():[];
  const m=getHeaderMap_(sh);
  const mine=rows.filter(r=>norm_(r[m.session_id-1])===sessionId);

  if(!mine.length)throw new Error('NO_STOCK_TAKE_LINES');

  const pending=mine.filter(r=>r[m.physical_qty-1]===''||r[m.physical_qty-1]==null);
  if(pending.length)throw new Error('PHYSICAL_COUNT_INCOMPLETE');

  const unresolved=mine.filter(r=>['UNKNOWN_SKU','WRONG_RACK'].includes(norm_(r[m.status-1])));
  if(unresolved.length)throw new Error('SYSTEM_LOOKUP_UNRESOLVED');

  let sys=0,phy=0,absVar=0,varValue=0;
  mine.forEach(r=>{
    const s=Number(r[m.system_qty-1]||0),p=Number(r[m.physical_qty-1]||0),v=p-s;
    sys+=s; phy+=p; absVar+=Math.abs(v);
    varValue+=v*Number(r[m.price-1]||0);
  });

  const accuracy=sys===0?100:Math.max(0,((sys-absVar)/sys)*100);
  ss.getSheetByName(CONFIG.STORE_SHEETS.RESULT_SUMMARY).appendRow([
    sessionId,now_(),sys,phy,absVar,varValue,accuracy
  ]);

  const sessions=ss.getSheetByName(CONFIG.STORE_SHEETS.SESSIONS),sm=getHeaderMap_(sessions);
  const row=findRowByValue_(sessions,sm.session_id,sessionId);
  sessions.getRange(row,sm.status).setValue(CONFIG.SESSION_STATUS.FINALIZED);
  sessions.getRange(row,sm.finalized_at).setValue(now_());
  sessions.getRange(row,sm.updated_at).setValue(now_());

  // The System DB lookup is temporary. Remove it after finalization so
  // tomorrow's upload starts clean and no historical DB is retained.
  clearDataRows_(ss.getSheetByName(CONFIG.STORE_SHEETS.SYSTEM_DB_LOOKUP));
  clearDataRows_(ss.getSheetByName(CONFIG.STORE_SHEETS.SYSTEM_DB_AUDIT));

  return {
    ok:true,status:CONFIG.SESSION_STATUS.FINALIZED,
    totalSystemQty:sys,totalPhysicalQty:phy,
    totalAbsoluteVarianceQty:absVar,totalVarianceValue:varValue,
    accuracy:accuracy
  };
}
