function callServer_(fn,args) {
  return new Promise((resolve,reject)=>{
    const runner=google.script.run.withSuccessHandler(resolve).withFailureHandler(err=>{
      reject(new Error(err && err.message ? err.message : String(err)));
    });
    runner[fn].apply(runner,args||[]);
  });
}

function loginStore(storeCode) {
  const profile=getStoreProfile(storeCode);
  const session=createSession(storeCode);
  return {ok:true,...profile,session};
}

function resolveSession(storeCode) {
  const profile=getStoreProfile(storeCode);
  const session=createSession(storeCode);
  return {ok:true,...profile,session};
}

function getResume(storeCode,sessionId) {
  return getSessionResumeState_(storeCode,sessionId);
}

function getRacks(storeCode,sessionId) {
  return getRackList(storeCode,sessionId);
}

function apiOpenRack(storeCode,sessionId,rack) {
  return openRack(storeCode,sessionId,rack);
}

function apiSavePhysicalQty(storeCode,sessionId,itemRow,physicalQty) {
  return savePhysicalQty(storeCode,sessionId,itemRow,physicalQty);
}

function apiFinalize(storeCode,sessionId) {
  return finalizeSession(storeCode,sessionId);
}

function apiUploadSystemDB(storeCode,sessionId,fileName,base64) {
  return uploadSystemDB(storeCode,sessionId,fileName,base64);
}

function apiUploadItemize(storeCode,sessionId,fileName,base64,mimeType) {
  return uploadItemize(storeCode,sessionId,fileName,base64,mimeType);
}
