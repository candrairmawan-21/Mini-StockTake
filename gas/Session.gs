function getActiveStores() {
  const master=SpreadsheetApp.openById(CONFIG.MASTER_SPREADSHEET_ID);
  const sh=master.getSheetByName(CONFIG.SHEETS.STORES);
  if(!sh||sh.getLastRow()<2) return [];
  return sh.getRange(2,1,sh.getLastRow()-1,4).getValues()
    .filter(r=>norm_(r[0])&&norm_(r[1])&&norm_(r[2])&&String(r[3]).toUpperCase()!=='FALSE')
    .map(r=>({storeCode:norm_(r[0]),storeName:norm_(r[1])}));
}

function getStoreProfile(storeCode) {
  const store=getStoreContext_(storeCode);
  const master=SpreadsheetApp.openById(CONFIG.MASTER_SPREADSHEET_ID);
  const ush=master.getSheetByName(CONFIG.SHEETS.USERS);
  let userName='';
  if(ush&&ush.getLastRow()>1) {
    const rows=ush.getRange(2,1,ush.getLastRow()-1,3).getValues();
    const match=rows.find(r=>norm_(r[0]).toUpperCase()===store.storeCode.toUpperCase() && String(r[2]).toUpperCase()!=='FALSE');
    if(match) userName=norm_(match[1]);
  }
  return {storeCode:store.storeCode,storeName:store.storeName,userName:userName};
}

function createSession(storeCode) {
  const store=getStoreContext_(storeCode);
  const ss=SpreadsheetApp.openById(store.spreadsheetId);
  const sh=ss.getSheetByName(CONFIG.STORE_SHEETS.SESSIONS);
  const m=getHeaderMap_(sh);
  const values=sh.getDataRange().getValues();
  for(let i=1;i<values.length;i++) {
    if(norm_(values[i][m.store_code-1]).toUpperCase()===store.storeCode.toUpperCase() &&
       norm_(values[i][m.status-1])===CONFIG.SESSION_STATUS.IN_PROGRESS) {
      return rowToSession_(values[i],m);
    }
  }
  const id=id_('SES'), now=now_();
  const row=new Array(sh.getLastColumn()).fill('');
  row[m.session_id-1]=id; row[m.store_code-1]=store.storeCode;
  row[m.status-1]=CONFIG.SESSION_STATUS.IN_PROGRESS;
  row[m.created_at-1]=now; row[m.updated_at-1]=now;
  sh.appendRow(row);
  return {sessionId:id,storeCode:store.storeCode,status:CONFIG.SESSION_STATUS.IN_PROGRESS,createdAt:now.toISOString(),updatedAt:now.toISOString(),lastActiveRack:'',systemSnapshotId:''};
}

function rowToSession_(r,m) {
  const iso=v=>v instanceof Date?v.toISOString():norm_(v);
  return {sessionId:norm_(r[m.session_id-1]),storeCode:norm_(r[m.store_code-1]),status:norm_(r[m.status-1]),createdAt:iso(r[m.created_at-1]),updatedAt:iso(r[m.updated_at-1]),finalizedAt:iso(r[m.finalized_at-1]),lastActiveRack:norm_(r[m.last_active_rack-1]),systemSnapshotId:norm_(r[m.system_snapshot_id-1])};
}

function getSession(storeCode,sessionId) {
  const store=getStoreContext_(storeCode), ss=SpreadsheetApp.openById(store.spreadsheetId);
  const sh=ss.getSheetByName(CONFIG.STORE_SHEETS.SESSIONS),m=getHeaderMap_(sh);
  if(sh.getLastRow()<2) return null;
  const values=sh.getDataRange().getValues();
  for(let i=1;i<values.length;i++) {
    if(norm_(values[i][m.session_id-1])===norm_(sessionId)) {
      const s=rowToSession_(values[i],m);
      if(s.storeCode.toUpperCase()!==store.storeCode.toUpperCase()) return null;
      return s;
    }
  }
  return null;
}

function requireSession_(storeCode,sessionId) {
  const s=getSession(storeCode,sessionId);
  if(!s) throw new Error('SESSION_NOT_FOUND');
  if(s.status!==CONFIG.SESSION_STATUS.IN_PROGRESS) throw new Error('SESSION_NOT_IN_PROGRESS');
  return s;
}

function touchSession(storeCode,sessionId,lastActiveRack) {
  const store=getStoreContext_(storeCode), ss=SpreadsheetApp.openById(store.spreadsheetId);
  const sh=ss.getSheetByName(CONFIG.STORE_SHEETS.SESSIONS),m=getHeaderMap_(sh);
  const values=sh.getDataRange().getValues();
  for(let i=1;i<values.length;i++) {
    if(norm_(values[i][m.session_id-1])===norm_(sessionId)) {
      if(norm_(values[i][m.store_code-1]).toUpperCase()!==store.storeCode.toUpperCase()) throw new Error('SESSION_NOT_FOUND');
      if(norm_(values[i][m.status-1])!==CONFIG.SESSION_STATUS.IN_PROGRESS) throw new Error('SESSION_NOT_IN_PROGRESS');
      sh.getRange(i+1,m.updated_at).setValue(now_());
      sh.getRange(i+1,m.last_active_rack).setValue(norm_(lastActiveRack));
      return getSession(storeCode,sessionId);
    }
  }
  throw new Error('SESSION_NOT_FOUND');
}

function lockSessionSnapshot_(sh,rowNumber,snapshotId) {
  const m=getHeaderMap_(sh);
  const cell=sh.getRange(rowNumber,m.system_snapshot_id);
  const current=norm_(cell.getValue());
  if(current && current!==snapshotId) throw new Error('SYSTEM_SNAPSHOT_ALREADY_LOCKED');
  if(!current) cell.setValue(snapshotId);
}




/** Regression test: a finalized session must reject activity updates. */
function testTouchFinalizedSession() {
  const stores=getActiveStores();
  if(!stores.length) throw new Error('NO_ACTIVE_STORES');
  const storeCode=stores[0].storeCode;
  const session=createSession(storeCode);
  const store=getStoreContext_(storeCode);
  const ss=SpreadsheetApp.openById(store.spreadsheetId);
  const sh=ss.getSheetByName(CONFIG.STORE_SHEETS.SESSIONS);
  const m=getHeaderMap_(sh);
  const row=findRowByValue_(sh,m.session_id,session.sessionId);
  sh.getRange(row,m.status).setValue(CONFIG.SESSION_STATUS.FINALIZED);
  try {
    touchSession(storeCode,session.sessionId,'TEST-RACK');
    throw new Error('EXPECTED_SESSION_NOT_IN_PROGRESS');
  } catch(e) {
    if(String(e.message||e)!=='SESSION_NOT_IN_PROGRESS') throw e;
    return {ok:true,storeCode,sessionId:session.sessionId,error:e.message};
  }
}
