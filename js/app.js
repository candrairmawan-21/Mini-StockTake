/**
 * Konfigurasi API
 */
const Config = {
    GOOGLE_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbwBnHSNiuboFv2KujFfqHBfxWvk3xJpkuAqqNnu4zSLDiEMu-YDSBSG5ERakchme9Tr/exec", 
    UserMapping: {
        "XGSS": "JC2017", "XBDS": "JC8001", "XWGN": "JC2021", "XPRC": "JC1029",
        "XRES": "JC1020", "XWDR": "JC3001", "SLGD": "JC2001", "EPPKA": "JC2008",
        "XLWU": "JC5005", "XJLB": "JC6003", "XBLO": "JC2012", "XLUN": "JC1014",
        "XSRS": "JC2018", "XSRA": "JC4006", "XSRG": "JC8005", "XRMO": "JC3003",
        "XKTR": "JC1005", "XPMH": "JC5002", "XOYO": "JC1012", "SLSQ": "JC2002",
        "XKTS": "JC5003", "XDLU": "JC8006", "XPKL": "JC2016", "XKLA": "JC1027",
        "XKLN": "JC8004"
    }
};

/**
 * State Management
 */
const State = {
    currentUser: null, currentStore: null, mainDatabase: {}, scanData: [], currentRack: "-",
    saveLocal: function() {
        localStorage.setItem('qubeStockTakeState', JSON.stringify({
            currentUser: this.currentUser, currentStore: this.currentStore,
            mainDatabase: this.mainDatabase, scanData: this.scanData, currentRack: this.currentRack
        }));
    },
    loadLocal: function() {
        const saved = localStorage.getItem('qubeStockTakeState');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.currentUser = data.currentUser || null; this.currentStore = data.currentStore || null;
                this.mainDatabase = data.mainDatabase || {}; this.scanData = data.scanData || [];
                this.currentRack = data.currentRack || "-"; return true;
            } catch(e) { return false; }
        }
        return false;
    },
    clearLocal: function() {
        localStorage.removeItem('qubeStockTakeState');
        this.currentUser = null; this.currentStore = null; this.mainDatabase = {}; this.scanData = []; this.currentRack = "-";
    }
};

/**
 * Parser Engine (TXT, CSV, XLS, XLSX)
 */
const FileProcessor = {
    processFile: function(file, isMainDb, callback) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet, {header: 1, defval: ""}); 
            
            if (isMainDb) {
                const db = {};
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (row.length >= 9 && row[0]) {
                        db[String(row[0]).trim()] = {
                            qtySystem: parseInt(row[3]) || 0,
                            description: String(row[8]).trim()
                        };
                    }
                }
                State.mainDatabase = db;
            } else {
                const scanResult = [];
                let detectedRack = "-";
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    if (row.length >= 3 && row[1]) {
                        if (detectedRack === "-") detectedRack = String(row[2]).trim();
                        scanResult.push({
                            sku: String(row[1]).trim(),
                            rack: String(row[2]).trim(),
                            qtyFisik: ""
                        });
                    }
                }
                State.scanData = scanResult;
                State.currentRack = detectedRack;
            }
            State.saveLocal();
            callback();
        };
        reader.readAsArrayBuffer(file);
    }
};

/**
 * UI Controller
 */
const UI = {
    updateDate: function() {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yyyy = today.getFullYear();
        document.getElementById('dispDate').value = `${dd}/${mm}/${yyyy}`;
    },
    initLoginState: function() {
        if (State.currentUser) {
            document.getElementById('loginSection').classList.add('hidden');
            document.getElementById('workspaceSection').classList.remove('hidden');
            
            document.getElementById('dispUser').value = State.currentUser;
            document.getElementById('dispUserFull').value = "ID-BM-" + State.currentUser;
            document.getElementById('dispStore').value = State.currentStore;
            document.getElementById('sysTitleName').innerText = "PT. NIAGA INDOGUNA YASA - " + State.currentStore + "-" + State.currentUser;
            
            document.getElementById('dispRefNo').innerText = Math.floor(100000000 + Math.random() * 900000000);
            this.updateDate();
            this.renderTable();
        } else {
            document.getElementById('loginSection').classList.remove('hidden');
            document.getElementById('workspaceSection').classList.add('hidden');
        }
    },
    renderTable: function() {
        const tbody = document.getElementById('tableBody');
        tbody.innerHTML = '';
        
        document.getElementById('dispRack').value = State.currentRack;
        document.getElementById('dispTotalItem').value = State.scanData.length;

        if (State.scanData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#555; padding: 15px;">No records. Please upload Main DB and Scan Data.</td></tr>';
            document.getElementById('dispTotalQty').value = 0;
            return;
        }

        let totalFisik = 0;
        State.scanData.forEach((item, index) => {
            const dbInfo = State.mainDatabase[item.sku] || { qtySystem: 0, description: "UNKNOWN SKU" };
            let varianceTxt = "";
            let varClass = "";
            let fisikVal = item.qtyFisik;
            
            if (fisikVal !== "") {
                totalFisik += parseInt(fisikVal);
                const variance = parseInt(fisikVal) - dbInfo.qtySystem;
                varianceTxt = variance;
                if(variance < 0) varClass = "var-neg";
                if(variance > 0) varClass = "var-pos";
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align:right;">▶ ${index + 1}</td>
                <td>${item.sku}</td>
                <td>${dbInfo.description}</td>
                <td style="text-align:center;">${dbInfo.qtySystem}</td>
                <td style="text-align:center;"><input type="number" class="qty-input" data-index="${index}" value="${fisikVal}" min="0"></td>
                <td style="text-align:center;" class="${varClass}">${varianceTxt}</td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('dispTotalQty').value = totalFisik;
        document.querySelectorAll('.qty-input').forEach(input => {
            input.addEventListener('input', UI.handleQtyChange);
        });
    },
    handleQtyChange: function(e) {
        const index = e.target.getAttribute('data-index');
        let val = e.target.value;
        if(val !== "" && val < 0) { e.target.value = 0; val = 0; }
        
        State.scanData[index].qtyFisik = val;
        State.saveLocal();
        UI.renderTable(); 
        
        const inputs = document.querySelectorAll('.qty-input');
        if(inputs[index]) inputs[index].focus();
    }
};

/**
 * App Initialization
 */
const App = {
    init: function() {
        State.loadLocal();
        UI.initLoginState();

        document.getElementById('btnLogin').addEventListener('click', App.handleLogin);
        document.getElementById('userIdInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') App.handleLogin(); });
        
        document.getElementById('btnLogout').addEventListener('click', () => {
            if(confirm("Exit Application? Unsaved data will be lost.")) { State.clearLocal(); UI.initLoginState(); }
        });

        document.getElementById('mainDbFile').addEventListener('change', (e) => {
            const file = e.target.files[0]; if (!file) return;
            FileProcessor.processFile(file, true, () => {
                alert("Master Database Loaded Successfully.");
                UI.renderTable();
                e.target.value = "";
            });
        });

        document.getElementById('scanFile').addEventListener('change', (e) => {
            if (Object.keys(State.mainDatabase).length === 0) {
                alert("Error: Please load Master DB first."); e.target.value = ""; return;
            }
            const file = e.target.files[0]; if (!file) return;
            FileProcessor.processFile(file, false, () => {
                UI.renderTable();
                e.target.value = "";
            });
        });

        document.getElementById('btnDownloadPDF').addEventListener('click', () => {
            if(State.scanData.length === 0) { alert("No data to export."); return; }
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            doc.setFontSize(14);
            doc.text(`Stock Take Report - Rack: ${State.currentRack}`, 14, 15);
            doc.setFontSize(10);
            doc.text(`Store: ${State.currentStore} | User: ${State.currentUser} | Date: ${document.getElementById('dispDate').value}`, 14, 22);
            
            doc.autoTable({
                html: '#mainTable',
                startY: 28,
                theme: 'grid',
                headStyles: { fillColor: [0, 0, 170] }
            });
            
            doc.save(`StockTake_${State.currentStore}_${State.currentRack}.pdf`);
        });

        document.getElementById('btnSaveToCloud').addEventListener('click', async () => {
            if(State.scanData.length === 0) return;
            if(State.scanData.some(item => item.qtyFisik === "") && !confirm("Empty Physical Quantities exist. Proceed saving?")) return;
            
            const btn = document.getElementById('btnSaveToCloud');
            btn.innerText = "Processing..."; btn.disabled = true;

            const payload = {
                userId: State.currentUser, storeCode: State.currentStore, rackNumber: State.currentRack,
                data: State.scanData.map(item => {
                    const dbInfo = State.mainDatabase[item.sku] || { qtySystem: 0, description: "" };
                    const fisik = item.qtyFisik === "" ? 0 : parseInt(item.qtyFisik);
                    return { sku: item.sku, description: dbInfo.description, qtySystem: dbInfo.qtySystem, qtyFisik: fisik, variance: fisik - dbInfo.qtySystem }
                })
            };

            try {
                await fetch(Config.GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                alert(`Data for Rack ${State.currentRack} has been saved.`);
                State.scanData = []; State.currentRack = "-"; State.saveLocal(); UI.renderTable();
            } catch (error) { alert("Connection Error."); } 
            finally { btn.innerText = "💾 Update & Save Data"; btn.disabled = false; }
        });
    },
    
    handleLogin: function() {
        const id = document.getElementById('userIdInput').value.trim().toUpperCase();
        if (!id) return;
        if (Config.UserMapping[id]) {
            State.currentUser = id; State.currentStore = Config.UserMapping[id]; State.saveLocal();
            UI.initLoginState(); document.getElementById('loginError').style.display = 'none';
        } else {
            document.getElementById('loginError').style.display = 'block';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
