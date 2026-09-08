function uploadItemize(storeCode,sessionId,fileName,base64,mimeType) {
  const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try {
    requireSession_(storeCode,sessionId);
    const bytes=Utilities.base64Decode(String(base64).replace(/^data:.*?;base64,/,''));
    let rows;
    const lower=String(fileName||'').toLowerCase();
    if(lower.endsWith('.xlsx')) {
      rows=parseItemizeXlsx_(Utilities.newBlob(bytes,fileName));
    } else {
      rows=parseItemizeDelimited_(Utilities.newBlob(bytes).getDataAsString('UTF-8'));
    }
    if(!rows.length) throw new Error('NO_VALID_ITEMIZE_ROWS');

    const ss=SpreadsheetApp.openById(getStoreContext_(storeCode).spreadsheetId);
    const lookupCheck=readSystemLookupRows_(ss);
    if(!Object.keys(lookupCheck.byKey).length) throw new Error('SYSTEM_DB_REQUIRED');
    const history=ss.getSheetByName(CONFIG.STORE_SHEETS.ITEMIZE_HISTORY);
    const uploadId=id_('UPL'), at=now_();

    // Itemize is additive within the active session. It is the source of
    // which SKU+Rack combinations are displayed in Stock Take Entry.
    const existingKeys={};
    if(history.getLastRow()>1){
      const vals=history.getRange(2,3,history.getLastRow()-1,3).getValues();
      vals.forEach(r=>{
        if(norm_(r[0])===sessionId) existingKeys[key_(r[1],normalizeRack_(r[2]))]=true;
      });
    }

    const out=[],seen={};
    rows.forEach(r=>{
      const k=key_(r.sku,r.rack);
      if(seen[k]||existingKeys[k]) return;
      seen[k]=true;
      out.push([uploadId,at,sessionId,r.sku,r.rack]);
    });
    writeChunks_(history,out,5000);

    // IMPORTANT: merge only Itemize rows into STOCK_TAKE_ITEMS.
    // System DB is lookup-only. System-only rows are never created/displayed.
    const result=mergeItemizeIntoStockTake_(ss,sessionId,rows,at);
    return {
      ok:true,uploadId,
      inserted:out.length,
      duplicateRowsDiscarded:rows.length-out.length,
      ...result
    };
  } finally { lock.releaseLock(); }
}

function parseItemizeDelimited_(content) {
  const lines=String(content||'').split(/\r\n|\r|\n/), out=[];
  lines.forEach(line=>{
    if(!line.trim())return;
    const p=line.split(',');
    if(!norm_(p[0])||!norm_(p[1]))return;
    if(norm_(p[0]).toLowerCase()==='sku' && norm_(p[1]).toLowerCase().indexOf('rack')>=0)return;
    out.push({sku:norm_(p[0]),rack:normalizeRack_(norm_(p[1]))});
  });
  return dedupeItemize_(out);
}

function dedupeItemize_(rows) {
  const seen={},out=[];
  rows.forEach(r=>{
    const k=key_(r.sku,r.rack);
    if(!seen[k]){seen[k]=true;out.push(r);}
  });
  return out;
}

function parseItemizeXlsx_(blob) {
  const files=Utilities.unzip(blob), map={};
  files.forEach(f=>map[f.getName()]=f);
  const shared=[];
  if(map['xl/sharedStrings.xml']){
    const doc=XmlService.parse(map['xl/sharedStrings.xml'].getDataAsString());
    const root=doc.getRootElement(), ns=root.getNamespace();
    root.getChildren('si',ns).forEach(si=>{
      let s='';
      si.getDescendants().forEach(n=>{
        if(n.getType()===XmlService.ContentTypes.TEXT)s+=n.asText().getText();
      });
      shared.push(s);
    });
  }
  const sheetFile=map['xl/worksheets/sheet1.xml'];
  if(!sheetFile) return [];
  const doc=XmlService.parse(sheetFile.getDataAsString());
  const root=doc.getRootElement(), ns=root.getNamespace();
  const rows=[];
  const rowEls=root.getDescendants().filter(n=>n.getType()===XmlService.ContentTypes.ELEMENT && n.asElement().getName()==='row');
  rowEls.forEach(node=>{
    const cells={};
    node.asElement().getChildren('c',ns).forEach(c=>{
      const ref=c.getAttribute('r'); if(!ref)return;
      const col=ref.getValue().replace(/\d/g,'');
      const t=c.getAttribute('t'),v=c.getChild('v',ns);
      let val='';
      if(t&&t.getValue()==='s'&&v) val=shared[Number(v.getText())]||'';
      else if(t&&t.getValue()==='inlineStr'){
        const is=c.getChild('is',ns); val=is?is.getText():'';
      } else if(v) val=v.getText();
      cells[col]=val;
    });
    const sku=norm_(cells.A),rack=norm_(cells.B);
    if(sku&&rack&&!/^sku$/i.test(sku)) rows.push({sku,rack:normalizeRack_(rack)});
  });
  return dedupeItemize_(rows);
}

function mergeItemizeIntoStockTake_(ss,sessionId,rows,at) {
  const lookup=readSystemLookupRows_(ss);
  const itemSh=ss.getSheetByName(CONFIG.STORE_SHEETS.STOCK_TAKE_ITEMS);
  const m=getHeaderMap_(itemSh);
  const existing={};

  if(itemSh.getLastRow()>1){
    itemSh.getRange(2,1,itemSh.getLastRow()-1,itemSh.getLastColumn()).getValues().forEach((r,i)=>{
      if(norm_(r[m.session_id-1])!==sessionId)return;
      existing[key_(r[m.sku-1],normalizeRack_(r[m.rack_number-1]))]={row:i+2,data:r};
    });
  }

  let inserted=0,unknownSku=0,wrongRack=0,confirmed=0;
  const out=[];

  rows.forEach(r=>{
    const k=key_(r.sku,r.rack);
    const sys=lookup.byKey[k];
    let status='ITEMIZED';

    // The Itemize file controls what is displayed. If SKU is not found
    // in the daily System DB, retain the line as UNKNOWN_SKU.
    // If SKU exists but at another rack, retain the line as WRONG_RACK.
    const any=lookup.bySku[r.sku];
    if(!sys){
      status=any?'WRONG_RACK':'UNKNOWN_SKU';
      if(any) wrongRack++; else unknownSku++;
    }

    if(existing[k]){
      const rr=existing[k].row;
      const old=existing[k].data;

      // Re-enrichment from today's lookup may update system metadata,
      // but NEVER overwrite Physical Qty.
      const physical=old[m.physical_qty-1];
      const price=sys?sys.price:'';
      const systemQty=sys?sys.systemQty:'';
      const variance=(physical===''||physical==null||systemQty==='')?'':Number(physical)-Number(systemQty);
      const varianceValue=(physical===''||physical==null||price==='')?'':variance*Number(price);

      itemSh.getRange(rr,m.price,1,9).setValues([[
        price,systemQty,physical,variance,varianceValue,status,
        sys?sys.keepstock:'',sys?sys.barcode:'',sys?sys.description:''
      ]]);
      itemSh.getRange(rr,m.updated_at).setValue(at);
      confirmed++;
      return;
    }

    out.push([
      sessionId,r.sku,r.rack,
      sys?sys.price:'',
      sys?sys.systemQty:'',
      '', '', '',
      status,
      sys?sys.keepstock:'',
      sys?sys.barcode:'',
      sys?sys.description:'',
      at,at
    ]);
    inserted++;
  });

  writeChunks_(itemSh,out,5000);
  const itemizeKeys={};
  rows.forEach(r=>itemizeKeys[key_(r.sku,r.rack)]=true);
  let systemOnly=0, systemOnlyNoAddress=0;
  Object.keys(lookup.byKey).forEach(k=>{
    if(!itemizeKeys[k]){
      systemOnly++;
      if(lookup.byKey[k].rack==='NO ADDRESS') systemOnlyNoAddress++;
    }
  });

  return {inserted,confirmed,unknownSku,wrongRack,systemOnly,systemOnlyNoAddress};
}

function readSystemLookupRows_(ss) {
  const sh=ss.getSheetByName(CONFIG.STORE_SHEETS.SYSTEM_DB_LOOKUP);
  const out={byKey:{},bySku:{}};
  if(!sh||sh.getLastRow()<2)return out;

  const vals=sh.getRange(2,1,sh.getLastRow()-1,9).getValues();
  vals.forEach(r=>{
    const x={
      sku:norm_(r[0]),
      rackRaw:norm_(r[1]),
      rack:normalizeRack_(r[1]),
      price:r[3],
      systemQty:r[4],
      sourceDate:r[5],
      keepstock:norm_(r[6]),
      barcode:norm_(r[7]),
      description:norm_(r[8])
    };
    if(!x.sku)return;
    out.byKey[key_(x.sku,x.rack)]=x;
    (out.bySku[x.sku]||(out.bySku[x.sku]=[])).push(x);
  });
  return out;
}
