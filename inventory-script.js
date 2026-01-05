
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
    });
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
        searchInput.addEventListener('keyup', renderInventoryTable);
    }

    // Date/Today Button
    document.getElementById('todayBtn')?.addEventListener('click', () => {
        const today = new Date();
        const d = String(today.getDate()).padStart(2, '0');
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const y = today.getFullYear();
        document.getElementById('importDate').value = `${d}/${m}/${y}`;
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
        supplierName: document.getElementById('supplierName').value,
        stockKeeper: stockKeeper,
        importDate: document.getElementById('importDate').value,

        // Stock Logic:
        totalIn: qty,     // Initial Stock In is the quantity
        stockOut: 0,      // Initial Stock Out is 0

        unitCost: parseFloat(document.getElementById('unitCost').value) || 0,
        sellingPrice: parseFloat(document.getElementById('sellingPrice').value) || 0,
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

function restockItem(id) {
    const item = inventoryData[id];
    if (!item) return;

    const qtyAdded = prompt(`បញ្ចូលចំនួនស្តុកបន្ថែមសម្រាប់ "${item.itemName}":`, "0");
    if (qtyAdded === null) return;

    const qty = parseInt(qtyAdded);
    if (isNaN(qty) || qty <= 0) {
        alert("ចំនួនមិនត្រឹមត្រូវ!");
        return;
    }

    const currentTotalIn = parseInt(item.totalIn) !== undefined ? parseInt(item.totalIn) : (parseInt(item.quantity) || 0);
    const newTotalIn = currentTotalIn + qty;

    inventoryRef.child(id).update({
        totalIn: newTotalIn
    }).then(() => {
        alert("បន្ថែមស្តុកជោគជ័យ!");
    });
}

function openSellModal(id) {
    itemToSellId = id;
    const item = inventoryData[id];
    if (!item) return;

    const sellQty = prompt(`លក់ "${item.itemName}"។ សូមបញ្ចូលចំនួន:`, "1");
    if (sellQty === null) return;

    const qty = parseInt(sellQty);

    // Calculate current stock
    const totalIn = parseInt(item.totalIn) !== undefined ? parseInt(item.totalIn) : (parseInt(item.quantity) || 0);
    const stockOut = parseInt(item.stockOut) || 0;
    const currentStock = totalIn - stockOut;

    if (isNaN(qty) || qty <= 0) {
        alert("ចំនួនមិនត្រឹមត្រូវ!");
        return;
    }

    // Logic: Stock Out removes from Total Stock (balance reduces)
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
        soldDate: new Date().toLocaleDateString('en-CA'), // YYYY-MM-DD
        totalPrice: qty * item.sellingPrice,
        pricePerUnit: item.sellingPrice,
        stockKeeper: item.stockKeeper || 'Unknown',
        currency: 'USD'
    };

    // Atomic update
    inventoryRef.child(id).update({ stockOut: newStockOut });
    salesRef.push(saleRecord).then(() => {
        alert("លក់ចេញជោគជ័យ!");
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
                <button class="btn btn-action btn-add-stock" onclick="restockItem('${id}')" title="បន្ថែមស្តុក (+)">
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
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const category = document.getElementById('reportCategory').value;
    const period = document.getElementById('exportType').value;

    // Determine Report Title
    let title = "របាយការណ៍ស្តុក (Inventory Report)";
    if (category === 'stockIn') title = "របាយការណ៍ស្តុកចូល (Stock In Report)";
    else if (category === 'stockOut') title = "របាយការណ៍ស្តុកចេញ (Stock Out Report)";

    // Load Khmer Font
    try {
        if (typeof khmerFontBase64 === 'undefined') {
            throw new Error("Khmer font base64 string not found. Please ensure khmer-font.js is loaded.");
        }

        // Add Font to jsPDF (khmerFontBase64 is already the base64 string from the .js file)
        doc.addFileToVFS('KhmerOSBattambang.ttf', khmerFontBase64);
        doc.addFont('KhmerOSBattambang.ttf', 'KhmerOSBattambang', 'normal');
        doc.setFont('KhmerOSBattambang');
        doc.setFontSize(14);

        doc.text(title, 14, 15);

        doc.setFontSize(10);
        const dateStr = new Date().toLocaleDateString('km-KH');
        let periodText = period === 'daily' ? "ប្រចាំថ្ងៃ" : (period === 'monthly' ? "ប្រចាំខែ" : "ទាំងអស់");
        doc.text(`ប្រភេទ: ${periodText} - កាលបរិច្ឆេទបង្កើត: ${dateStr}`, 14, 22);

        let headers = [];
        let bodyData = [];
        const filteredData = getFilteredData(category, period);

        if (category === 'stockOut') {
            headers = [["ល.រ", "អ្នកកាន់ស្តុក", "ឈ្មោះទំនិញ", "កាលបរិច្ឆេទ", "ចំនួនលក់", "តម្លៃសរុប"]];
            bodyData = filteredData.map((item, index) => [
                (index + 1).toString(),
                item.stockKeeper || 'Unknown',
                item.itemName,
                item.soldDate || formatDate(item.soldAt),
                item.quantity.toString(),
                formatMoney(item.totalPrice)
            ]);
        } else {
            // headers for Inventory or Stock In match current structure mostly
            headers = [["ល.រ", "អ្នកកាន់ស្តុក", "ឈ្មោះទំនិញ", "កាលបរិច្ឆេទ", "ស្តុកចូល", "ស្តុកចេញ", "ស្តុកនៅសល់", "ចំណាំ"]];
            bodyData = filteredData.map((item, index) => {
                const totalIn = parseInt(item.totalIn) !== undefined ? parseInt(item.totalIn) : (parseInt(item.quantity) || 0);
                const stockOut = parseInt(item.stockOut) || 0;
                const remaining = totalIn - stockOut;
                return [
                    (index + 1).toString(),
                    item.stockKeeper || '-',
                    item.itemName,
                    item.importDate || '-',
                    totalIn.toString(),
                    stockOut.toString(),
                    remaining.toString(),
                    item.notes || ''
                ];
            });
        }

        doc.autoTable({
            head: headers,
            body: bodyData,
            startY: 30,
            styles: { font: 'KhmerOSBattambang', fontStyle: 'normal' },
            headStyles: { fillColor: [255, 105, 180] }
        });

        doc.save(`${category}_report_${period}.pdf`);

    } catch (error) {
        console.error("Error loading font:", error);
        alert("មិនអាចទាញយកពុម្ពអក្សរ។ (Error loading font)");
    }
}

function exportToExcel() {
    const category = document.getElementById('reportCategory').value;
    const period = document.getElementById('exportType').value;
    const filteredData = getFilteredData(category, period);

    let exportData = [];

    if (category === 'stockOut') {
        exportData = filteredData.map((item, index) => ({
            "No": index + 1,
            "Stock Keeper": item.stockKeeper || 'Unknown',
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
window.restockItem = restockItem;
window.openSellModal = openSellModal;
window.deleteItem = deleteItem;
window.exportToPDF = exportToPDF;
window.exportToExcel = exportToExcel;