/**
 * KONFIGURASI SISTEM & MAPPING USER
 */
const Config = {
    // URL Web App Google Apps Script Resmi Anda
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
 * STATE MANAGEMENT
 */
const State = {
    currentUser: null,
    currentStore: null,
    mainDatabase: {}, 
    scanData: [],     
    currentRack: "-",

    saveLocal: function() {
        const data = {
            currentUser: this.currentUser,
            currentStore: this.currentStore,
            mainDatabase: this.mainDatabase,
            scanData: this.scanData,
            currentRack: this.currentRack
        };
        localStorage.setItem('miniStockTakeState', JSON.stringify(data));
    },

    loadLocal: function() {
        const saved = localStorage.getItem('miniStockTakeState');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.currentUser = data.currentUser || null;
                this.currentStore = data.currentStore || null;
                this.mainDatabase = data.mainDatabase || {};
                this.scanData = data.scanData || [];
                this.currentRack = data.currentRack || "-";
                return true;
            } catch(e) {
                return false;
            }
        }
        return false;
    },

    clearLocal: function() {
        localStorage.removeItem('miniStockTakeState');
        this.currentUser = null;
        this.currentStore = null;
        this.mainDatabase = {};
        this.scanData = [];
        this.currentRack = "-";
    }
};

/**
 * FILE PARSER LOGIC
 */
const Parser = {
    parseMainDb: function(csvText) {
        const lines = csvText.split(/\r?\n/);
        const db = {};
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const cols = lines[i].split(',');
            if (cols.length >= 9) {
                const sku = cols[0].trim();
                const qtySystem = parseInt(cols[3].trim()) || 0;
                const description = cols[8].trim();

                db[sku] = {
                    qtySystem: qtySystem,
                    description: description
                };
            }
        }
        return db;
    },

    parseScanData: function(text) {
        const lines = text.split(/\r?\n/);
        const scanResult = [];
        let detectedRack = "-";

        for (let i = 0; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const delimiter = lines[i].includes('\t') ? '\t' : ',';
            const cols = lines[i].split(delimiter);
            
            if (cols.length >= 3) {
                const sku = cols[1].trim(); 
                const rack = cols[2].trim(); 
                
                if (detectedRack === "-") detectedRack = rack;

                scanResult.push({
                    sku: sku,
                    rack: rack,
                    qtyFisik: "" 
                });
            }
        }
        return { data: scanResult, rack: detectedRack };
    }
};

/**
 * UI CONTROLLER
 */
const UI = {
    initLoginState: function() {
        const loginSec = document.getElementById('loginSection');
        const workSec = document.getElementById('workspaceSection');
        
        if (State.currentUser) {
            loginSec.classList.add('hidden');
            workSec.classList.remove('hidden');
            document.getElementById('displayUserId').innerText = State.currentUser;
            document.getElementById('displayStoreCode').innerText = State.currentStore;
            this.renderTable();
        } else {
            loginSec.classList.remove('hidden');
            workSec.classList.add('hidden');
        }
    },

    renderTable: function() {
        const tbody = document.getElementById('tableBody');
        const rackInfo = document.getElementById('rackInfo');
        const btnSave = document.getElementById('btnSaveToCloud');
        
        tbody.innerHTML = '';

        if (State.scanData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Belum ada data pemindaian</td></tr>';
            rackInfo.classList.add('hidden');
            btnSave.classList.add('hidden');
            return;
        }

        document.getElementById('displayRack').innerText = State.currentRack;
        rackInfo.classList.remove('hidden');
        btnSave.classList.remove('hidden');

        State.scanData.forEach((item, index) => {
            const dbInfo = State.mainDatabase[item.sku] || { qtySystem: 0, description: "SKU NOT FOUND IN DB" };
            const sysQty = dbInfo.qtySystem;
            const fisikQty = item.qtyFisik !== "" ? item.qtyFisik : "";
            
            let varianceTxt = "-";
            let varianceClass = "";
            if (fisikQty !== "") {
                const variance = parseInt(fisikQty) - sysQty;
                varianceTxt = variance;
                if (variance < 0) varianceClass = "variance-negative";
                if (variance > 0) varianceClass = "variance-positive";
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${index + 1}</td>
                <td>${item.sku}</td>
                <td>${dbInfo.description}</td>
                <td>${sysQty}</td>
                <td><input type="number" class="qty-input" data-index="${index}" value="${fisikQty}" min="0"></td>
                <td class="variance-cell ${varianceClass}">${varianceTxt}</td>
            `;
            tbody.appendChild(tr);
        });

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

        const dbInfo = State.mainDatabase[State.scanData[index].sku] || { qtySystem: 0 };
        const tr = e.target.closest('tr');
        const varianceCell = tr.querySelector('.variance-cell');

        if (val === "") {
            varianceCell.innerText = "-";
            varianceCell.className = "variance-cell";
        } else {
            const variance = parseInt(val) - dbInfo.qtySystem;
            varianceCell.innerText = variance;
            varianceCell.className = "variance-cell " + (variance < 0 ? "variance-negative" : (variance > 0 ? "variance-positive" : ""));
        }
    }
};

/**
 * APP INITIALIZATION & EVENT LISTENERS
 */
const App = {
    init: function() {
        State.loadLocal();
        UI.initLoginState();

        // 1. Event Login (Klik & Enter)
        document.getElementById('btnLogin').addEventListener('click', App.handleLogin);
        document.getElementById('userIdInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                App.handleLogin();
            }
        });

        // 2. Event Logout
        document.getElementById('btnLogout').addEventListener('click', () => {
            if(confirm("Apakah Anda yakin ingin logout? Data yang belum disave ke cloud akan dihapus dari memori.")) {
                State.clearLocal();
                UI.initLoginState();
            }
        });

        // 3. Event Upload Main DB
        document.getElementById('mainDbFile').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                const db = Parser.parseMainDb(event.target.result);
                State.mainDatabase = db;
                State.saveLocal();
                alert("Database Utama berhasil dimuat!");
                UI.renderTable();
            };
            reader.readAsText(file);
        });

        // 4. Event Upload Scan Data
        document.getElementById('scanFile').addEventListener('change', (e) => {
            if (Object.keys(State.mainDatabase).length === 0) {
                alert("Peringatan: Silakan upload Database Utama terlebih dahulu!");
                e.target.value = "";
                return;
            }
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = Parser.parseScanData(event.target.result);
                State.scanData = result.data;
                State.currentRack = result.rack;
                State.saveLocal();
                UI.renderTable();
            };
            reader.readAsText(file);
        });

        // 5. Submit ke Google Spreadsheet
        document.getElementById('btnSaveToCloud').addEventListener('click', async () => {
            const hasEmpty = State.scanData.some(item => item.qtyFisik === "");
            if(hasEmpty) {
                const proceed = confirm("Masih ada Qty Fisik yang kosong. Apakah Anda tetap ingin mengirim data ke sistem?");
                if(!proceed) return;
            }

            const btn = document.getElementById('btnSaveToCloud');
            btn.innerText = "Menyimpan...";
            btn.disabled = true;

            const payload = {
                userId: State.currentUser,
                storeCode: State.currentStore,
                rackNumber: State.currentRack,
                data: State.scanData.map(item => {
                    const dbInfo = State.mainDatabase[item.sku] || { qtySystem: 0, description: "" };
                    return {
                        sku: item.sku,
                        description: dbInfo.description,
                        qtySystem: dbInfo.qtySystem,
                        qtyFisik: item.qtyFisik === "" ? 0 : parseInt(item.qtyFisik),
                        variance: (item.qtyFisik === "" ? 0 : parseInt(item.qtyFisik)) - dbInfo.qtySystem
                    }
                })
            };

            try {
                await fetch(Config.GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                alert(`Data Rack ${State.currentRack} berhasil disave ke spreadsheet!`);
                State.scanData = [];
                State.currentRack = "-";
                State.saveLocal();
                UI.renderTable();
                document.getElementById('scanFile').value = "";
            } catch (error) {
                alert("Gagal menghubungi server. Pastikan koneksi internet stabil.");
            } finally {
                btn.innerText = "Simpan ke Spreadsheet";
                btn.disabled = false;
            }
        });
    },

    handleLogin: function() {
        const inputElem = document.getElementById('userIdInput');
        const errorElem = document.getElementById('loginError');
        const id = inputElem.value.trim().toUpperCase();
        
        if (!id) {
            alert("Silakan masukkan User ID terlebih dahulu!");
            return;
        }

        if (Config.UserMapping[id]) {
            State.currentUser = id;
            State.currentStore = Config.UserMapping[id];
            State.saveLocal();
            UI.initLoginState();
            errorElem.style.display = 'none';
        } else {
            errorElem.style.display = 'block';
            alert(`User ID "${id}" tidak terdaftar dalam sistem! Sila cek kembali.`);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
