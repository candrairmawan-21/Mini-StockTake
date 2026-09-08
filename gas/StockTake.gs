function getRackList(storeCode,sessionId) {
  const s=requireSession_(storeCode,sessionId);
  const ss=SpreadsheetApp.openById(getStoreContext_(storeCode).spreadsheetId);
  const snapshot=s.systemSnapshotId;
  const system=readSnapshotRows_(ss,snapshot);
  const racks={};
  Object.keys(system.byKey).forEach(k=>{const x=system.byKey[k]; racks[x.rack]=true;});
  const itemSh=ss.getSheetByName(CONFIG.STORE_SHEETS.STOCK_TAKE_ITEMS);
  if(itemSh.getLastRow()>1){
    itemSh.getRange(2,1,itemSh.getLastRow()-1,itemSh.getLastColumn()).getValues().forEach(r=>{if(norm_(r[0])===sessionId&&norm_(r[2]))racks[normalizeRack_(r[2])]=true;});
  }
  return Object.keys(racks).sort();
}

function openRack(storeCode,sessionId,rack) {
  const session=requireSession_(storeCode,sessionId);
  rack=normalizeRack_(rack);
  if(!rack) throw new Error('RACK_REQUIRED');
  const store=getStoreContext_(storeCode),ss=SpreadsheetApp.openById(store.spreadsheetId);
  const sh=ss.getSheetByName(CONFIG.STORE_SHEETS.STOCK_TAKE_ITEMS);
  const m=getHeaderMap_(sh), now=now_();
  const existing={};
  if(sh.getLastRow()>1){
    sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues().forEach((r,i)=>{
      if(norm_(r[m.session_id-1])===sessionId && normalizeRack_(r[m.rack_number-1])===rack) existing[key_(r[m.sku-1],rack)]={row:i+2,data:r};
    });
  }
  const system=readSnapshotRows_(ss,session.systemSnapshotId);
  let inserted=0;
  Object.keys(system.byKey).forEach(k=>{
    const x=system.byKey[k];
    if(x.rack!==rack)return;
    if(existing[k])return;
    sh.appendRow([sessionId,x.sku,x.rackRaw,x.price,x.systemQty,'','','','NOT_SCANNED',x.keepstock,x.barcode,x.description,now,now]);
    inserted++;
  });
  // Itemize-only lines on this rack are already in STOCK_TAKE_ITEMS.
  const values=sh.getDataRange().getValues();
  const items=[];
  for(let i=1;i<values.length;i++){
    const r=values[i];
    if(norm_(r[m.session_id-1])!==sessionId || normalizeRack_(r[m.rack_number-1])!==rack)continue;
    const physical=r[m.physical_qty-1];
    const systemQty=r[m.system_qty-1];
    items.push({
      id:i+1,sku:norm_(r[m.sku-1]),rack:normalizeRack_(r[m.rack_number-1]),
      description:norm_(r[m.description-1]),price:r[m.price-1],
      systemQty:systemQty===''?null:Number(systemQty),
      physicalQty:physical===''||physical==null?null:Number(physical),
      varianceQty:physical===''||physical==null||systemQty===''||systemQty==null?null:Number(physical)-Number(systemQty),
      status:physical===''||physical==null?'NOT SCANNED':norm_(r[m.status-1])==='UNKNOWN_SKU'?'UNKNOWN SKU':norm_(r[m.status-1])==='WRONG_RACK'?'WRONG RACK':'COUNTED'
    });
  }
  items.sort((a,b)=>a.physicalQty==null?1:b.physicalQty==null?-1:a.sku.localeCompare(b.sku));
  touchSession(storeCode,sessionId,rack);
  return {ok:true,rackNumber:rack,items,total:items.length,inserted};
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
  const old=r[m.physical_qty-1]===''?null:Number(r[m.physical_qty-1]);
  if(old!==n){
    sh.getParent().getSheetByName(CONFIG.STORE_SHEETS.PHYSICAL_HISTORY).appendRow([
      id_('HIS'),sessionId,norm_(r[m.sku-1]),normalizeRack_(r[m.rack_number-1]),old,n,now_(),getStoreProfile(storeCode).userName
    ]);
  }
  sh.getRange(itemRow,m.physical_qty).setValue(n===null?'':n);
  sh.getRange(itemRow,m.variance_qty).setValue(n===null||r[m.system_qty-1]===''?'':n-Number(r[m.system_qty-1]));
  sh.getRange(itemRow,m.variance_value).setValue(n===null||r[m.price-1]===''?'':(n-Number(r[m.system_qty-1]))*Number(r[m.price-1]));
  sh.getRange(itemRow,m.updated_at).setValue(now_());
  return {ok:true,physicalQty:n,varianceQty:n===null||r[m.system_qty-1]===''?null:n-Number(r[m.system_qty-1])};
}

function getSessionResumeState_(storeCode,sessionId) {
  const s=requireSession_(storeCode,sessionId);
  const ss=SpreadsheetApp.openById(getStoreContext_(storeCode).spreadsheetId);
  const sh=ss.getSheetByName(CONFIG.STORE_SHEETS.STOCK_TAKE_ITEMS);
  let total=0,counted=0;
  if(sh.getLastRow()>1){
    sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues().forEach(r=>{
      if(norm_(r[0])===sessionId){total++;if(r[5]!==''&&r[5]!=null)counted++;}
    });
  }
  return {sessionId:s.sessionId,sessionCode:s.sessionId,startDate:s.createdAt,lastActiveRack:s.lastActiveRack,systemSnapshotId:s.systemSnapshotId,totalLines:total,countedLines:counted,progress:total?Math.round(counted/total*100):0};
}

function finalizeSession(storeCode,sessionId) {
  const session=requireSession_(storeCode,sessionId);
  const store=getStoreContext_(storeCode),ss=SpreadsheetApp.openById(store.spreadsheetId);
  const sh=ss.getSheetByName(CONFIG.STORE_SHEETS.STOCK_TAKE_ITEMS);
  const rows=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues():[];
  const mine=rows.filter(r=>norm_(r[0])===sessionId);
  if(!mine.length)throw new Error('NO_STOCK_TAKE_LINES');
  const pending=mine.filter(r=>r[5]===''||r[5]==null);
  if(pending.length)throw new Error('PHYSICAL_COUNT_INCOMPLETE');
  let sys=0,phy=0,absVar=0,varValue=0;
  mine.forEach(r=>{const s=Number(r[4]||0),p=Number(r[5]||0),v=p-s;sys+=s;phy+=p;absVar+=Math.abs(v);varValue+=v*Number(r[3]||0);});
  const accuracy=sys===0?100:Math.max(0,((sys-absVar)/sys)*100);
  ss.getSheetByName(CONFIG.STORE_SHEETS.RESULT_SUMMARY).appendRow([sessionId,now_(),sys,phy,absVar,varValue,accuracy]);
  const sessions=ss.getSheetByName(CONFIG.STORE_SHEETS.SESSIONS),m=getHeaderMap_(sessions),row=findRowByValue_(sessions,m.session_id,sessionId);
  sessions.getRange(row,m.status).setValue(CONFIG.SESSION_STATUS.FINALIZED);
  sessions.getRange(row,m.finalized_at).setValue(now_());
  sessions.getRange(row,m.updated_at).setValue(now_());
  return {ok:true,status:CONFIG.SESSION_STATUS.FINALIZED,totalSystemQty:sys,totalPhysicalQty:phy,totalAbsoluteVarianceQty:absVar,totalVarianceValue:varValue,accuracy:accuracy};
}
