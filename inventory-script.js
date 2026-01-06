
// ==========================================
// INVENTORY MANAGEMENT SCRIPT
// ==========================================

let inventoryData = {};
let salesData = {};
let currentCurrency = 'USD';
let exchangeRate = 4100;
let itemToSellId = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log("Inventory Script Loaded");

    // Initialize Data Listeners
    setupInventoryListener();
    setupSalesListener();

    // Event Listeners
    setupEventListeners();
});

function setupInventoryListener() {
    inventoryRef.on('value', (snapshot) => {
        inventoryData = snapshot.val() || {};
        renderInventoryTable();
        updateSummaryCards();
    });
}

function setupSalesListener() {
    salesRef.on('value', (snapshot) => {
        salesData = snapshot.val() || {};
        renderSalesTable();
    });
}

function renderSalesTable() {
    const tbody = document.getElementById('soldStockTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const searchInput = document.getElementById('inventorySearchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    let index = 1;
    // Sort by date desc (optional) or just entry
    const items = Object.entries(salesData).reverse(); // Show latest first

    items.forEach(([id, item]) => {
        if (searchTerm && !item.itemName.toLowerCase().includes(searchTerm)) return;

        const date = item.soldDate || formatDate(item.soldAt);
        const keeper = item.stockKeeper || '-';
        const note = item.note || '-';
        const totalPrice = item.totalPrice || 0;
        const unitPrice = item.pricePerUnit || 0;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="ps-4 text-muted">${index++}</td>
            <td class="text-secondary small">${date}</td>
            <td class="text-secondary fw-bold">${keeper}</td>
            <td class="fw-bold text-dark">${item.itemName}</td>
            <td class="text-center"><span class="badge bg-danger">${item.quantity}</span></td>
            <td class="text-end text-muted">$${parseFloat(unitPrice).toFixed(2)}</td>
            <td class="text-end fw-bold text-success">$${parseFloat(totalPrice).toFixed(2)}</td>
            <td class="small text-muted text-truncate" style="max-width: 150px;">${note}</td>
            <td class="text-center">
                <button class="btn btn-action btn-delete" onclick="deleteSaleRecord('${id}')" title="លុប">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function deleteSaleRecord(saleId) {
    if (!confirm("តើអ្នកពិតជាចង់លុបកំណត់ត្រាលក់នេះមែនទេ? ស្តុកនឹងត្រូវបានបង្វិលសងវិញ។")) return;

    const sale = salesData[saleId];
    if (!sale) return;

    const itemId = sale.itemId;
    const qty = parseInt(sale.quantity) || 0;

    // Restore Stock Logic
    if (itemId && inventoryData[itemId]) {
        const item = inventoryData[itemId];
        const currentStockOut = parseInt(item.stockOut) || 0;
        const newStockOut = Math.max(0, currentStockOut - qty); // Prevent negative

        inventoryRef.child(itemId).update({ stockOut: newStockOut });
    }

    // Remove Sale Record
    salesRef.child(saleId).remove()
        .then(() => alert("លុបកំណត់ត្រាលក់ជោគជ័យ!"))
        .catch(err => alert("កំហុស: " + err.message));
}

function deleteAllSales() {
    if (Object.keys(salesData).length === 0) return alert("គ្មានទិន្នន័យសម្រាប់លុបទេ!");

    const confirmInput = prompt("តើអ្នកពិតជាចង់លុបប្រវត្តិលក់ *ទាំងអស់* មែនទេ? ស្តុកទាំងអស់នឹងត្រូវបានបង្វិលសងវិញ។\n\nវាយពាក្យ 'DELETE' ដើម្បីបញ្ជាក់:");
    if (confirmInput !== 'DELETE') return;

    // Process all sales to restore stock
    const updates = {};
    const stockRestorations = {}; // Map itemId -> qty to restore

    Object.entries(salesData).forEach(([saleId, sale]) => {
        // Mark sale for deletion
        updates[`sales/${saleId}`] = null;

        // Aggregate stock restoration
        const itemId = sale.itemId;
        const qty = parseInt(sale.quantity) || 0;

        if (itemId) {
            stockRestorations[itemId] = (stockRestorations[itemId] || 0) + qty;
        }
    });

    // Apply stock restorations
    Object.entries(stockRestorations).forEach(([itemId, qtyToRestore]) => {
        if (inventoryData[itemId]) {
            const currentStockOut = parseInt(inventoryData[itemId].stockOut) || 0;
            const newStockOut = Math.max(0, currentStockOut - qtyToRestore);

            // We can't put this in the same multi-path update easily because paths are different refs usually
            // but here we have refs. Let's just update directly.
            inventoryRef.child(itemId).update({ stockOut: newStockOut });
        }
    });

    // Delete all sales
    salesRef.remove()
        .then(() => alert("លុបប្រវត្តិទាំងអស់ជោគជ័យ!"))
        .catch(err => alert("កំហុស: " + err.message));
}

function setupEventListeners() {
    // Currency Toggle
    const currencySelector = document.getElementById('currencySelector');
    if (currencySelector) {
        currencySelector.addEventListener('change', (e) => {
            currentCurrency = e.target.value;
            renderInventoryTable();
            updateSummaryCards();
        });
    }

    const exchangeInput = document.getElementById('exchangeRate');
    if (exchangeInput) {
        exchangeInput.addEventListener('change', (e) => {
            exchangeRate = parseInt(e.target.value) || 4100;
            renderInventoryTable();
            updateSummaryCards();
        });
    }

    // Add Inventory Form
    const addForm = document.getElementById('addInventoryForm');
    if (addForm) {
        addForm.addEventListener('submit', handleAddInventory);
    }

    // Handle "Other" selection
    const nameSelect = document.getElementById('itemNameSelect');
    if (nameSelect) {
        nameSelect.addEventListener('change', function () {
            const otherContainer = document.getElementById('otherItemNameContainer');
            if (this.value === 'ផ្សេងៗ') {
                otherContainer.style.display = 'block';
                document.getElementById('otherItemNameInput').required = true;
            } else {
                otherContainer.style.display = 'none';
                document.getElementById('otherItemNameInput').required = false;
            }
        });
    }

    // Search
    const searchInput = document.getElementById('inventorySearchInput');
    if (searchInput) {
        searchInput.addEventListener('keyup', () => {
            renderInventoryTable();
            renderSalesTable();
        });
    }

    // Date/Today Button (Import)
    document.getElementById('todayBtn')?.addEventListener('click', () => {
        const today = new Date();
        const d = String(today.getDate()).padStart(2, '0');
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const y = today.getFullYear();
        document.getElementById('importDate').value = `${d}/${m}/${y}`;
    });

    // Sell Stock Form
    const sellForm = document.getElementById('sellStockForm');
    if (sellForm) {
        sellForm.addEventListener('submit', handleSellStock);
    }

    // Sell Date/Today Button
    document.getElementById('todaySellBtn')?.addEventListener('click', () => {
        const today = new Date();
        const d = String(today.getDate()).padStart(2, '0');
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const y = today.getFullYear();
        document.getElementById('sellDate').value = `${d}/${m}/${y}`;
    });

    // Calculate Sell Totals on Quantity Change
    // Calculate Sell Totals
    const sellQtyInput = document.getElementById('sellQuantity');
    const sellUnitPriceInput = document.getElementById('sellUnitPrice');
    const sellTotalUSDInput = document.getElementById('sellTotalPriceUSD');
    const sellTotalKHRInput = document.getElementById('sellTotalPriceKHR');

    const updateSellCalc = () => {
        const qty = parseInt(sellQtyInput.value) || 0;
        const unitPrice = parseFloat(sellUnitPriceInput.value) || 0;
        const totalUSD = qty * unitPrice;
        const totalKHR = totalUSD * exchangeRate;

        // Update Totals
        sellTotalUSDInput.value = totalUSD.toFixed(2);
        sellTotalKHRInput.value = totalKHR.toLocaleString('en-US');
    };

    if (sellQtyInput) sellQtyInput.addEventListener('input', updateSellCalc);
    if (sellUnitPriceInput) sellUnitPriceInput.addEventListener('input', updateSellCalc);

    // Optional: Update KHR if Total USD is manually edited
    if (sellTotalUSDInput) {
        sellTotalUSDInput.addEventListener('input', function () {
            const total = parseFloat(this.value) || 0;
            sellTotalKHRInput.value = (total * exchangeRate).toLocaleString('en-US');
        });
    }

    // Restock Modal Form
    const restockForm = document.getElementById('restockForm');
    if (restockForm) {
        restockForm.addEventListener('submit', handleRestock);
    }

    // Restock Date/Today Button
    document.getElementById('todayRestockBtn')?.addEventListener('click', () => {
        const today = new Date();
        const d = String(today.getDate()).padStart(2, '0');
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const y = today.getFullYear();
        document.getElementById('restockDate').value = `${d}/${m}/${y}`;
    });
}

// ==========================================
// CRUD OPERATIONS
// ==========================================

function handleAddInventory(e) {
    e.preventDefault();

    const nameSelect = document.getElementById('itemNameSelect');
    let name = nameSelect.value;
    if (name === 'ផ្សេងៗ') {
        name = document.getElementById('otherItemNameInput').value;
    }

    const qty = parseInt(document.getElementById('quantity').value) || 0;
    const stockKeeper = document.getElementById('stockKeeperName').value;

    const item = {
        itemName: name,
        supplierName: "",
        stockKeeper: stockKeeper,
        importDate: document.getElementById('importDate').value,

        // Stock Logic:
        totalIn: qty,     // Initial Stock In is the quantity
        stockOut: 0,      // Initial Stock Out is 0

        unitCost: 0,
        sellingPrice: 0,
        notes: document.getElementById('itemNotes').value,
        createdAt: new Date().toISOString()
    };

    inventoryRef.push(item)
        .then(() => {
            alert("បញ្ចូលស្តុកជោគជ័យ!");
            e.target.reset();
            const modalEl = document.getElementById('addInventoryModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();
        })
        .catch(err => alert("កំហុស: " + err.message));
}

// Open Restock Modal
function openRestockModal(id) {
    const item = inventoryData[id];
    if (!item) return;

    // Populate Modal
    document.getElementById('restockItemId').value = id;
    document.getElementById('restockItemNameDisplay').innerText = item.itemName;

    const currentStock = (parseInt(item.totalIn) || 0) - (parseInt(item.stockOut) || 0);
    document.getElementById('restockCurrentStockDisplay').value = currentStock;

    document.getElementById('restockQuantity').value = '';
    document.getElementById('restockSupplier').value = item.supplierName || '';
    document.getElementById('restockUnitCost').value = item.unitCost || '';
    document.getElementById('restockNote').value = '';

    // Set Date Default
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    document.getElementById('restockDate').value = `${d}/${m}/${y}`;

    // Show Modal
    const modalEl = document.getElementById('restockModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

function handleRestock(e) {
    e.preventDefault();
    const id = document.getElementById('restockItemId').value;
    const item = inventoryData[id];
    if (!item) return;

    const qty = parseInt(document.getElementById('restockQuantity').value);

    if (isNaN(qty) || qty <= 0) {
        alert("ចំនួនមិនត្រឹមត្រូវ!");
        return;
    }

    const currentTotalIn = parseInt(item.totalIn) !== undefined ? parseInt(item.totalIn) : (parseInt(item.quantity) || 0);
    const newTotalIn = currentTotalIn + qty;

    // Optional updates
    const updates = {
        totalIn: newTotalIn
    };

    const supplier = document.getElementById('restockSupplier').value;
    const unitCost = parseFloat(document.getElementById('restockUnitCost').value);
    const note = document.getElementById('restockNote').value;
    const dateStr = document.getElementById('restockDate').value;

    if (supplier) updates.supplierName = supplier;
    if (!isNaN(unitCost)) updates.unitCost = unitCost;
    if (note) updates.notes = (item.notes ? item.notes + '\n' : '') + `[Restock ${dateStr}: +${qty}] ${note}`;

    inventoryRef.child(id).update(updates).then(() => {
        alert("បន្ថែមស្តុកជោគជ័យ!");
        const modalEl = document.getElementById('restockModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();
    });
}

// Open Sell Modal
function openSellModal(id) {
    itemToSellId = id;
    const item = inventoryData[id];
    if (!item) return;

    // Populate Modal
    document.getElementById('sellItemId').value = id;
    document.getElementById('sellItemNameDisplay').innerText = item.itemName;
    document.getElementById('currentStockDisplay').value = (parseInt(item.totalIn) || 0) - (parseInt(item.stockOut) || 0);
    document.getElementById('sellQuantity').value = '';
    document.getElementById('sellUnitPrice').value = parseFloat(item.sellingPrice || 0).toFixed(2);
    document.getElementById('sellTotalPriceUSD').value = '0.00';
    document.getElementById('sellTotalPriceKHR').value = '0';
    document.getElementById('sellStockKeeper').value = item.stockKeeper || ''; // Default to item's keeper
    document.getElementById('sellNote').value = '';

    // Set Date Default
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    document.getElementById('sellDate').value = `${d}/${m}/${y}`;

    // Show Modal
    const modalEl = document.getElementById('sellStockModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

function handleSellStock(e) {
    e.preventDefault();
    const id = document.getElementById('sellItemId').value;
    const item = inventoryData[id];
    if (!item) return;

    const qty = parseInt(document.getElementById('sellQuantity').value);
    const keeper = document.getElementById('sellStockKeeper').value;
    const note = document.getElementById('sellNote').value;
    const dateStr = document.getElementById('sellDate').value;

    // Calculate current stock
    const totalIn = parseInt(item.totalIn) !== undefined ? parseInt(item.totalIn) : (parseInt(item.quantity) || 0);
    const stockOut = parseInt(item.stockOut) || 0;
    const currentStock = totalIn - stockOut;

    if (isNaN(qty) || qty <= 0) {
        alert("ចំនួនមិនត្រឹមត្រូវ!");
        return;
    }

    if (qty > currentStock) {
        alert(`ស្តុកមិនគ្រប់គ្រាន់! នៅសល់តែ ${currentStock} ប៉ុណ្ណោះ។`);
        return;
    }

    // Process Sale
    const newStockOut = stockOut + qty;

    // Log Sale
    const saleRecord = {
        itemId: id,
        itemName: item.itemName,
        quantity: qty,
        soldAt: new Date().toISOString(),
        soldDate: dateStr, // User input date
        totalPrice: qty * item.sellingPrice,
        pricePerUnit: item.sellingPrice,
        stockKeeper: keeper,
        note: note,
        currency: 'USD'
    };

    // Atomic update
    inventoryRef.child(id).update({ stockOut: newStockOut });
    salesRef.push(saleRecord).then(() => {
        alert("លក់ចេញជោគជ័យ!");
        // Hide Modal
        const modalEl = document.getElementById('sellStockModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();
    });
}

function deleteItem(id) {
    if (confirm("តើអ្នកពិតជាចង់លុបទិន្នន័យនេះមែនទេ?")) {
        inventoryRef.child(id).remove();
    }
}

// ==========================================
// RENDER FUNCTIONS
// ==========================================

function renderInventoryTable() {
    const tbody = document.getElementById('currentStockTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const searchInput = document.getElementById('inventorySearchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    let index = 1;
    const items = Object.entries(inventoryData);

    // Render columns: #, Stock Keeper, Item Name, Date, Total Stock, Stock Out, Remaining, Note, Actions
    items.forEach(([id, item]) => {
        if (searchTerm && !item.itemName.toLowerCase().includes(searchTerm)) return;

        // Logic for Fields
        const totalIn = parseInt(item.totalIn) !== undefined ? parseInt(item.totalIn) : (parseInt(item.quantity) || 0);
        const stockOut = parseInt(item.stockOut) || 0;
        const remaining = totalIn - stockOut;

        const date = item.importDate || formatDate(item.createdAt);
        const stockKeeper = item.stockKeeper || '-';
        const note = item.notes || '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="ps-4 text-muted">${index++}</td>
            <td class="text-secondary fw-bold">${stockKeeper}</td>
            <td class="fw-bold text-dark">${item.itemName}</td>
            <td class="text-secondary small">${date}</td>
            <td class="text-center"><span class="badge badge-in">${totalIn}</span></td>
            <td class="text-center"><span class="badge badge-out">${stockOut}</span></td>
            <td class="text-center"><span class="badge badge-remain" style="font-size:1.1rem">${remaining}</span></td>
            <td class="small text-muted text-truncate" style="max-width: 150px;">${note}</td>
            <td class="text-center pe-4">
                <button class="btn btn-action btn-add-stock" onclick="openRestockModal('${id}')" title="បន្ថែមស្តុក (+)">
                    <i class="fas fa-plus"></i>
                </button>
                <button class="btn btn-action btn-sell-stock" onclick="openSellModal('${id}')" title="លក់ចេញ (-)">
                    <i class="fas fa-minus"></i>
                </button>
                <button class="btn btn-action btn-delete" onclick="deleteItem('${id}')" title="លុប">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateSummaryCards() {
    let statTotalIn = 0;
    let statTotalOut = 0;
    let totalItems = 0; // Remaining
    let totalVal = 0;

    Object.values(inventoryData).forEach(item => {
        const totalIn = parseInt(item.totalIn) !== undefined ? parseInt(item.totalIn) : (parseInt(item.quantity) || 0);
        const stockOut = parseInt(item.stockOut) || 0;
        const remaining = totalIn - stockOut;

        statTotalIn += totalIn;
        statTotalOut += stockOut;
        totalItems += remaining;
        totalVal += (remaining * (parseFloat(item.unitCost) || 0));
    });

    if (document.getElementById('totalItems')) document.getElementById('totalItems').innerText = totalItems;
    if (document.getElementById('statTotalIn')) document.getElementById('statTotalIn').innerText = statTotalIn;
    if (document.getElementById('statTotalOut')) document.getElementById('statTotalOut').innerText = statTotalOut;
    if (document.getElementById('totalCost')) document.getElementById('totalCost').innerText = formatMoney(totalVal);
}

// ==========================================
// EXPORT FUNCTIONS
// ==========================================

// ==========================================
// EXPORT FUNCTIONS
// ==========================================

function getFilteredData(category, period) {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const currentDay = today.getDate();

    let data = [];
    let dateField = '';

    if (category === 'stockOut') {
        data = Object.values(salesData);
        dateField = 'soldAt'; // ISO format
    } else {
        // inventory or stockIn
        data = Object.values(inventoryData);
        dateField = 'importDate'; // DD/MM/YYYY text format
    }

    if (period === 'all') return data;

    return data.filter(item => {
        let itemDate;
        const val = item[dateField];
        if (!val) return false;

        if (category === 'stockOut') {
            itemDate = new Date(val); // ISO
        } else {
            // Assume DD/MM/YYYY for inventory
            const parts = val.split('/');
            if (parts.length === 3) {
                itemDate = new Date(parts[2], parts[1] - 1, parts[0]);
            } else {
                itemDate = new Date(item.createdAt); // Fallback
            }
        }

        if (isNaN(itemDate.getTime())) return false;

        if (period === 'daily') {
            return itemDate.getDate() === currentDay &&
                itemDate.getMonth() === currentMonth &&
                itemDate.getFullYear() === currentYear;
        } else if (period === 'monthly') {
            return itemDate.getMonth() === currentMonth &&
                itemDate.getFullYear() === currentYear;
        }
        return true;
    });
}

async function exportToPDF() {
    const category = document.getElementById('reportCategory').value;
    const period = document.getElementById('exportType').value;

    let title = "របាយការណ៍ស្តុក (Inventory Report)";
    if (category === 'stockIn') title = "របាយការណ៍ស្តុកចូល (Stock In Report)";
    else if (category === 'stockOut') title = "របាយការណ៍ស្តុកចេញ (Stock Out Report)";

    const filteredData = getFilteredData(category, period);

    if (filteredData.length === 0) {
        alert("គ្មានទិន្នន័យសម្រាប់បោះពុម្ព (No data to export)");
        return;
    }

    let win = window.open('', '_blank');
    let html = `<html><head><title>${title}</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
        <style>
             @font-face {
                font-family: 'Khmer OS Battambang';
                src: url('fonts/KhmerOSBattambang.woff2') format('woff2'),
                     url('fonts/KhmerOSBattambang.ttf') format('truetype');
                font-weight: normal;
                font-style: normal;
            }
            body { font-family: 'Khmer OS Battambang', sans-serif; padding: 20px; }
            .header-container { text-align: center; margin-bottom: 20px; }
            .logo { width: 100px; height: 100px; object-fit: cover; margin-bottom: 10px; }
            h1, h2, h3 { margin: 5px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
            th, td { border: 1px solid #333; padding: 8px; text-align: center; vertical-align: middle; }
            th { background-color: #f0f0f0; font-weight: bold; }
            .text-left { text-align: left; }
            .text-right { text-align: right; }
            .footer { margin-top: 50px; display: flex; justify-content: space-between; font-size: 0.9rem; }
            .signature-box { text-align: center; width: 200px; }
            .signature-line { margin-top: 60px; border-top: 1px solid #333; width: 80%; margin-left: auto; margin-right: auto; }
            
            /* Action Bar Styles */
            .action-bar { margin-bottom: 20px; display: flex; gap: 10px; justify-content: flex-end; }
            .btn { padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer; font-family: inherit; font-weight: bold; display: flex; align-items: center; gap: 8px; text-decoration: none; font-size: 0.9rem; }
            .btn-print { background: #0d6efd; color: white; }
            .btn-close { background: #6c757d; color: white; }
            .btn-close:hover { background: #5a6268; }

            @media print {
                .no-print { display: none; }
            }
        </style>
    </head><body>
    
    <div class="action-bar no-print">
        <a href="#" class="btn btn-close" onclick="window.close(); return false;">
            <i class="fas fa-arrow-left"></i> ត្រឡប់ទៅផ្ទាំងដើម (Back)
        </a>
        <button class="btn btn-print" onclick="window.print()">
            <i class="fas fa-print"></i> បោះពុម្ពឯកសារ (Print)
        </button>
    </div>

    <div class="header-container">
        <img src="img/logo.jpg" class="logo" onerror="this.src='img/1.jpg'">
        <h1>សាលាអន្តរជាតិ ធាន ស៊ីន</h1>
        <h2>Tian Xin International School</h2>
        <h3 style="text-decoration: underline; margin-top: 15px;">${title}</h3>
        <p><strong>ប្រភេទ:</strong> ${period === 'daily' ? "ប្រចាំថ្ងៃ" : (period === 'monthly' ? "ប្រចាំខែ" : "ទាំងអស់")} | <strong>កាលបរិច្ឆេទ:</strong> ${new Date().toLocaleDateString('km-KH')}</p>
    </div>

    <table>
        <thead>
            <tr>
               ${category === 'stockOut' ?
            `<th>ល.រ</th>
                  <th>ឈ្មោះអ្នកលក់</th>
                  <th>ឈ្មោះទំនិញ</th>
                  <th>កាលបរិច្ឆេទ</th>
                  <th>ចំនួនលក់</th>
                  <th>តម្លៃសរុប</th>`
            :
            `<th>ល.រ</th>
                  <th>អ្នកកាន់ស្តុក</th>
                  <th>ឈ្មោះទំនិញ</th>
                  <th>កាលបរិច្ឆេទ</th>
                  <th>ស្តុកចូល</th>
                  <th>ស្តុកចេញ</th>
                  <th>ស្តុកនៅសល់</th>
                  <th>ចំណាំ</th>`
        }
            </tr>
        </thead>
        <tbody>
           ${filteredData.map((item, index) => {
            if (category === 'stockOut') {
                return `<tr>
                       <td>${index + 1}</td>
                       <td>${item.stockKeeper || 'Unknown'}</td>
                       <td class="text-left">${item.itemName}</td>
                       <td>${item.soldDate || formatDate(item.soldAt)}</td>
                       <td>${item.quantity}</td>
                       <td class="text-right">${formatMoney(item.totalPrice)}</td>
                   </tr>`;
            } else {
                const totalIn = parseInt(item.totalIn) !== undefined ? parseInt(item.totalIn) : (parseInt(item.quantity) || 0);
                const stockOut = parseInt(item.stockOut) || 0;
                const remaining = totalIn - stockOut;
                return `<tr>
                       <td>${index + 1}</td>
                       <td>${item.stockKeeper || '-'}</td>
                       <td class="text-left">${item.itemName}</td>
                       <td>${item.importDate || '-'}</td>
                       <td>${totalIn}</td>
                       <td>${stockOut}</td>
                       <td>${remaining}</td>
                       <td class="text-left">${item.notes || ''}</td>
                   </tr>`;
            }
        }).join('')}
        </tbody>
    </table>

    ${(() => {
            if (category === 'stockOut') {
                const summary = {};
                let totalQtyAll = 0;
                let totalMoneyAll = 0;

                filteredData.forEach(item => {
                    const name = item.itemName;
                    if (!summary[name]) summary[name] = { qty: 0, total: 0 };

                    const q = parseInt(item.quantity) || 0;
                    const t = parseFloat(item.totalPrice) || 0;

                    summary[name].qty += q;
                    summary[name].total += t;

                    totalQtyAll += q;
                    totalMoneyAll += t;
                });

                return `
                <h3 style="margin-top: 30px;">សង្ខេបតាមទំនិញ (Summary by Item)</h3>
                <table>
                    <thead>
                        <tr>
                            <th>ឈ្មោះទំនិញ</th>
                            <th>ចំនួនលក់សរុប (Total Qty)</th>
                            <th>តម្លៃសរុប (Total Amount)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.entries(summary).map(([name, stats]) => `
                            <tr>
                                <td class="text-left">${name}</td>
                                <td>${stats.qty}</td>
                                <td class="text-right">${formatMoney(stats.total)}</td>
                            </tr>
                        `).join('')}
                        <tr style="background:#f0f0f0; font-weight:bold;">
                            <td class="text-right">សរុបរួម (Grand Total):</td>
                            <td>${totalQtyAll}</td>
                            <td class="text-right">${formatMoney(totalMoneyAll)}</td>
                        </tr>
                    </tbody>
                </table>
            `;
            }
            return '';
        })()}

    <div class="footer">
        <div class="signature-box">
            <p>រៀបចំដោយ</p>
            <div class="signature-line"></div>
            <p>អ្នកកាន់ស្តុក</p>
        </div>
        ${category === 'stockOut' ? `
        <div class="signature-box">
            <p>លក់ដោយ</p>
            <div class="signature-line"></div>
            <p>អ្នកលក់</p>
        </div>` : ''}
        <div class="signature-box">
            <p>ត្រួតពិនិត្យដោយ</p>
            <div class="signature-line"></div>
            <p>ប្រធានផ្នែក</p>
        </div>
        <div class="signature-box">
            <p>អនុម័តដោយ</p>
            <div class="signature-line"></div>
            <p>នាយកសាលា</p>
        </div>
    </div>

    <script>
        setTimeout(() => {
            window.print();
        }, 500);
    </script>
    </body></html>`;

    win.document.write(html);
    win.document.close();
}

function exportToExcel() {
    const category = document.getElementById('reportCategory').value;
    const period = document.getElementById('exportType').value;
    const filteredData = getFilteredData(category, period);

    let exportData = [];

    if (category === 'stockOut') {
        exportData = filteredData.map((item, index) => ({
            "No": index + 1,
            "Seller Name": item.stockKeeper || 'Unknown',
            "Item Name": item.itemName,
            "Date": item.soldDate || formatDate(item.soldAt),
            "Quantity Sold": item.quantity,
            "Total Price": formatMoney(item.totalPrice)
        }));
    } else {
        exportData = filteredData.map((item, index) => {
            const totalIn = parseInt(item.totalIn) !== undefined ? parseInt(item.totalIn) : (parseInt(item.quantity) || 0);
            const stockOut = parseInt(item.stockOut) || 0;
            const remaining = totalIn - stockOut;
            return {
                "No": index + 1,
                "Stock Keeper": item.stockKeeper || '-',
                "Item Name": item.itemName,
                "Date": item.importDate || '-',
                "Total In": totalIn,
                "Stock Out": stockOut,
                "Remaining": remaining,
                "Note": item.notes || ''
            };
        });
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
    XLSX.writeFile(workbook, `${category}_report_${period}.xlsx`);
}

function formatMoney(amount) {
    if (currentCurrency === 'KHR') {
        const val = amount * exchangeRate;
        return val.toLocaleString('en-US') + ' ៛';
    }
    return '$' + parseFloat(amount).toFixed(2);
}

function formatDate(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

// Global exposure
window.openRestockModal = openRestockModal;
window.openSellModal = openSellModal;
window.deleteItem = deleteItem;
window.exportToPDF = exportToPDF;
window.exportToExcel = exportToExcel;
window.deleteSaleRecord = deleteSaleRecord;
window.deleteAllSales = deleteAllSales;
