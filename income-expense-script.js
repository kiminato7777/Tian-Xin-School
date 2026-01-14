// Firebase References
// Firebase References
const transactionsRef = database.ref('transactions');
const studentsRef = database.ref('students');
const salesRef = database.ref('sales'); // Inventory Sales

// State Variables
let transactionsData = [];
let currentFilter = 'all'; // all, income, expense

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {
    // Initial Setup
    setupEventListeners();
    fetchTransactions();

    // Set default date to today in Modal
    document.getElementById('transDate').valueAsDate = new Date();
});

// ==========================================
// CORE FUNCTIONS
// ==========================================

function fetchTransactions() {
    showLoading(true);

    Promise.all([
        transactionsRef.once('value'),
        studentsRef.once('value'),
        salesRef.once('value')
    ]).then(([transSnap, studentsSnap, salesSnap]) => {
        transactionsData = [];

        // 1. Process Manual Transactions
        const transData = transSnap.val();
        const overrideIds = new Set(); // Track IDs that exist in manual transactions

        if (transData) {
            Object.keys(transData).forEach(key => {
                const item = transData[key];
                overrideIds.add(key); // Add to overrides

                let defaultPayer = item.payer;
                let defaultReceiver = item.receiver;

                // Smart Defaults for Legacy Data
                if (!defaultPayer) {
                    if (item.type === 'income') defaultPayer = 'សិស្ស/អាណាព្យាបាល (General)';
                    else defaultPayer = 'សាលា (School)';
                }
                if (!defaultReceiver) {
                    if (item.type === 'income') defaultReceiver = 'សាលា (School)';
                    else defaultReceiver = 'អ្នកលក់/បុគ្គលិក (Vendor/Staff)';
                }

                transactionsData.push({
                    id: key,
                    sourceType: 'manual',
                    ...item,
                    date: item.date || (item.createdAt ? new Date(item.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
                    amount: parseFloat(item.amount) || 0,
                    payer: defaultPayer,
                    receiver: defaultReceiver
                });
            });
        }

        // 2. Process Student Income (Registration + Installments)
        const studentsData = studentsSnap.val();
        if (studentsData) {
            Object.values(studentsData).forEach(student => {
                const name = `${student.lastName || ''} ${student.firstName || ''}`;

                // A. Initial Payment (Registration)
                const regId = `reg_${student.key || student.id}`;
                const initialPay = parseFloat(student.initialPayment) || 0;

                if (initialPay > 0 && !overrideIds.has(regId)) {
                    transactionsData.push({
                        id: regId,
                        type: 'income',
                        category: `ចុះឈ្មោះសិស្ស - ${name}`,
                        description: `សិស្ស៖ ${name} (${student.displayId || 'N/A'}) - បង់ដំបូង`,
                        amount: initialPay,
                        date: student.startDate || new Date().toISOString().split('T')[0],
                        sourceType: 'system',
                        payer: 'អាណាព្យាបាល (Guardian)',
                        receiver: student.receiver || 'Admin',
                        recorder: 'System'
                    });
                }

                // B. Installments/Additional Payments
                if (student.installments) {
                    const instObj = isArray(student.installments) ? student.installments : Object.values(student.installments);
                    instObj.forEach((inst, idx) => {
                        const instId = `inst_${student.key}_${idx}`;
                        const amt = parseFloat(inst.amount) || 0;
                        if (amt > 0 && !overrideIds.has(instId)) {
                            transactionsData.push({
                                id: instId,
                                type: 'income',
                                category: `បង់ប្រាក់បន្ថែម (Payment) - ${name}`,
                                description: `សិស្ស៖ ${name} - ដំណាក់កាល/Stage ${inst.stage || (idx + 1)}`,
                                amount: amt,
                                date: inst.date || new Date().toISOString().split('T')[0],
                                sourceType: 'system',
                                payer: 'អាណាព្យាបាល (Guardian)',
                                receiver: inst.receiver || 'Admin',
                                recorder: 'System'
                            });
                        }
                    });
                }
            });
        }

        // 3. Process Inventory Sales (Check overrides too just in case)
        const salesData = salesSnap.val();
        if (salesData) {
            Object.entries(salesData).forEach(([key, sale]) => {
                const saleId = `sale_${key}`;
                const amt = parseFloat(sale.totalPrice) || 0;
                if (amt > 0 && !overrideIds.has(saleId)) {
                    transactionsData.push({
                        id: saleId,
                        type: 'income',
                        category: 'Inventory Sale (លក់សម្ភារៈ)',
                        description: `${sale.itemName} (Qty: ${sale.quantity})`,
                        amount: amt,
                        date: sale.soldDate || (sale.soldAt ? sale.soldAt.split('T')[0] : new Date().toISOString().split('T')[0]),
                        sourceType: 'system',
                        payer: 'General/Customer',
                        receiver: sale.stockKeeper || 'Admin',
                        recorder: 'System'
                    });
                }
            });
        }

        // Sort by date descending (newest first)
        transactionsData.sort((a, b) => new Date(b.date) - new Date(a.date));

        renderTable();
        // calculateTotals(); 
        showLoading(false);

    }).catch(error => {
        console.error("Error fetching data:", error);
        showLoading(false);
        alert("បរាជ័យក្នុងការទាញយកទិន្នន័យ (Failed to load data)");
    });
}
// Helper for Array check
function isArray(what) {
    return Object.prototype.toString.call(what) === '[object Array]';
}

function renderTable() {
    const tableBody = document.getElementById('transactionsTableBody');
    // Simplified Filter - Search Only
    const searchText = document.getElementById('searchDescription') ? document.getElementById('searchDescription').value.toLowerCase() : '';

    tableBody.innerHTML = '';

    // Apply Filters (Search Only)
    let filteredData = transactionsData.filter(item => {
        // Text Search (Category, Description, Payer, Receiver, Recorder)
        if (searchText) {
            const searchStr = `${item.category} ${item.description} ${item.payer} ${item.receiver} ${item.recorder}`.toLowerCase();
            if (!searchStr.includes(searchText)) return false;
        }
        return true;
    });

    // Update Counts
    document.getElementById('displayCount').textContent = filteredData.length;
    document.getElementById('totalCount').textContent = transactionsData.length;

    if (filteredData.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-5 text-muted">
                    <i class="fi fi-rr-inbox fa-3x mb-3 opacity-25"></i>
                    <p>មិនមានទិន្នន័យ (No Data Found)</p>
                </td>
            </tr>
        `;
        // updateTableFooter(0, 0); // Removed
        return;
    }

    // Render Rows
    let tableIncome = 0;
    let tableExpense = 0;

    filteredData.forEach((item, index) => {
        const amt = parseFloat(item.amount) || 0;
        if (item.type === 'income') tableIncome += amt;
        else tableExpense += amt;

        const row = document.createElement('tr');

        // Type Badge
        const typeBadge = item.type === 'income'
            ? '<span class="badge bg-success bg-opacity-10 text-success px-3 py-2 rounded-pill"><i class="fi fi-rr-arrow-up me-1"></i>ចំណូល</span>'
            : '<span class="badge bg-danger bg-opacity-10 text-danger px-3 py-2 rounded-pill"><i class="fi fi-rr-arrow-down me-1"></i>ចំណាយ</span>';

        // Amount Formatting
        const amountClass = item.type === 'income' ? 'text-success' : 'text-danger';
        const amountPrefix = item.type === 'income' ? '+' : '-';

        // Party (Payer/Receiver) Logic - Now separate
        const payerName = item.payer || '-';
        const receiverName = item.receiver || '-';

        // Always show buttons, even for system
        actionButtons = `
            <div class="d-flex justify-content-center">
                <button class="btn btn-light text-primary shadow-sm rounded-circle me-2" style="width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;" onclick="editTransaction('${item.id}')" title="កែប្រែ (Edit)">
                    <i class="fi fi-rr-edit" style="font-size: 14px;"></i>
                </button>
                <button class="btn btn-light text-danger shadow-sm rounded-circle" style="width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;" onclick="deleteTransaction('${item.id}')" title="លុប (Delete)">
                    <i class="fi fi-rr-trash" style="font-size: 14px;"></i>
                </button>
            </div>
        `;

        row.innerHTML = `
            <td class="ps-4 text-center text-muted small">${index + 1}</td>
            <td class="text-center fw-bold text-muted" style="font-family: 'Khmer OS Battambang', sans-serif;">${formatDate(item.date)}</td>
            <td class="text-center">${typeBadge}</td>
            <td class="text-start"><span class="fw-bold text-dark">${item.category}</span></td>
             <td class="text-start text-secondary fw-bold">${payerName}</td>
             <td class="text-start text-secondary fw-bold">${receiverName}</td>
            <td class="text-start"><small class="text-muted text-wrap" style="max-width: 250px;">${item.description || '-'}</small></td>
            <td class="text-end ${amountClass} fw-bold fs-6">${amountPrefix}$${parseFloat(item.amount).toFixed(2)}</td>
            <td class="text-center pe-4">
                ${actionButtons}
            </td>
        `;
        tableBody.appendChild(row);
    });

    // Update Footer Totals (Filtered View) - REMOVED
    // updateTableFooter(tableIncome, tableExpense);
}

// function updateTableFooter(income, expense) { ... } // REMOVED
// function calculateTotals() { ... } // REMOVED

// ==========================================
// EVENT HANDLERS
// ==========================================

function setupEventListeners() {
    // Modal Form Submit
    document.getElementById('transactionForm').addEventListener('submit', handleFormSubmit);

    // Type Toggle in Modal (Switch Categories)
    const typeRadios = document.getElementsByName('transType');
    typeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            toggleCategoryOptions(e.target.value);
        });
    });

    // Filter Button
    const btnFilter = document.getElementById('btnFilter');
    if (btnFilter) {
        btnFilter.addEventListener('click', renderTable);
    }

    // Search Input (Real-time filtering)
    const searchInput = document.getElementById('searchDescription');
    if (searchInput) {
        searchInput.addEventListener('keyup', renderTable);
    }

    // Export Buttons (if using dropdowns handled by inline onclicks, this is fine)

    // Reset Modal on Open (if adding new)
    const modal = document.getElementById('transactionModal');
    modal.addEventListener('show.bs.modal', (event) => {
        // If relatedTarget is null/undefined, it might be an edit call triggered manually,
        // but usually the button triggers it.
        if (event.relatedTarget && event.relatedTarget.getAttribute('data-bs-target') === '#transactionModal') {
            // Reset Form
            document.getElementById('transactionForm').reset();
            document.getElementById('editTransactionId').value = '';
            document.getElementById('modalTitle').innerHTML = '<i class="fi fi-rr-plus-circle me-2"></i>បញ្ចូលចំណូល/ចំណាយថ្មី';

            // Reset Type to Income
            document.getElementById('typeIncome').checked = true;
            toggleCategoryOptions('income');

            // Set Date to Today
            document.getElementById('transDate').valueAsDate = new Date();
        }
    });
}

function handleFormSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('editTransactionId').value;
    const type = document.querySelector('input[name="transType"]:checked').value;
    const date = document.getElementById('transDate').value;
    const amount = parseFloat(document.getElementById('transAmount').value);

    // New Fields
    const payer = document.getElementById('transPayer').value;
    const receiver = document.getElementById('transReceiver').value;

    // Category/Description Logic
    let category = '';
    if (type === 'income') {
        category = document.getElementById('transIncomeSource').value.trim();
        if (!category) {
            alert("សូមបញ្ចូលប្រភពចំណូល (Please enter income source)");
            return;
        }
    } else {
        category = document.getElementById('transExpenseCategory').value;
        if (!category) {
            alert("សូមជ្រើសរើសប្រភេទចំណាយ (Please select expense category)");
            return;
        }
    }

    const description = document.getElementById('transDescription').value;

    const transactionData = {
        type,
        date,
        amount,
        category,
        description,
        payer,
        receiver,
        recorder: firebase.auth().currentUser ? (firebase.auth().currentUser.displayName || firebase.auth().currentUser.email) : 'System/Admin',
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    showLoading(true);

    if (id) {
        // Update
        transactionsRef.child(id).update(transactionData)
            .then(() => {
                closeModal();
                showLoading(false);
                // alert("កែប្រែបានជោគជ័យ (Updated successfully)");
            })
            .catch(err => {
                console.error(err);
                showLoading(false);
                alert("កំហុសក្នុងការកែប្រែ (Error updating)");
            });
    } else {
        // Create
        transactionData.createdAt = firebase.database.ServerValue.TIMESTAMP;
        transactionsRef.push(transactionData)
            .then(() => {
                closeModal();
                showLoading(false);
                // alert("រក្សាទុកបានជោគជ័យ (Saved successfully)");
            })
            .catch(err => {
                console.error(err);
                showLoading(false);
                alert("កំហុសក្នុងការរក្សាទុក (Error saving)");
            });
    }
}

function editTransaction(id) {
    const item = transactionsData.find(t => t.id === id);
    if (!item) return;

    // Set Values
    document.getElementById('editTransactionId').value = id;
    document.getElementById('transDate').value = item.date;
    document.getElementById('transAmount').value = item.amount;
    document.getElementById('transDescription').value = item.description || '';

    // Set New Fields
    document.getElementById('transPayer').value = item.payer || '';
    document.getElementById('transReceiver').value = item.receiver || '';

    // Set Type
    if (item.type === 'income') {
        document.getElementById('typeIncome').checked = true;
    } else {
        document.getElementById('typeExpense').checked = true;
    }
    toggleCategoryOptions(item.type);

    // Set Category (after toggling options)
    if (item.type === 'income') {
        document.getElementById('transIncomeSource').value = item.category || '';
    } else {
        document.getElementById('transExpenseCategory').value = item.category || '';
    }

    // Update Title
    document.getElementById('modalTitle').innerHTML = '<i class="fi fi-rr-edit me-2"></i>កែប្រែទិន្នន័យ (Edit)';

    // Open Modal
    const modal = new bootstrap.Modal(document.getElementById('transactionModal'));
    modal.show();
}

function deleteTransaction(id) {
    if (!confirm("តើអ្នកពិតជាចង់លុបទិន្នន័យនេះមែនទេ? (Are you sure?)")) return;

    showLoading(true);

    // Check if it is a system-linked ID
    if (id.startsWith('reg_')) {
        // Registration Payment: reg_{key}
        const studentKey = id.replace('reg_', '');
        studentsRef.child(studentKey).update({ initialPayment: 0 })
            .then(() => {
                showLoading(false);
                alert("លុបការបង់ប្រាក់ចុះឈ្មោះជោគជ័យ (Registration payment cleared)");
            })
            .catch(err => {
                console.error(err);
                showLoading(false);
                alert("កំហុសក្នុងការលុប (Error deleting)");
            });

    } else if (id.startsWith('inst_')) {
        // Installment: inst_{key}_{index}
        // Parsing is tricky because key can contain underscores? 
        // Firebase keys usually push IDs: -M...
        // Format: inst_KEY_INDEX. 
        // Let's rely on splitting. Push IDs don't have underscores usually.
        const parts = id.split('_');
        // parts[0] = 'inst'
        // parts[last] = index
        // parts[1...last-1] = key

        const idx = parseInt(parts.pop());
        parts.shift(); // remove 'inst'
        const studentKey = parts.join('_');

        // We need to fetch current installments to splice it
        studentsRef.child(studentKey).child('installments').once('value')
            .then(snapshot => {
                let installs = snapshot.val();
                if (!installs) {
                    showLoading(false);
                    return;
                }

                // Convert to array if needed
                let instArray = isArray(installs) ? installs : Object.values(installs);

                if (idx >= 0 && idx < instArray.length) {
                    instArray.splice(idx, 1);
                    return studentsRef.child(studentKey).update({ installments: instArray });
                }
            })
            .then(() => {
                showLoading(false);
                alert("លុបប្រវត្តិបង់រំលស់ជោគជ័យ (Installment deleted)");
            })
            .catch(err => {
                console.error(err);
                showLoading(false);
                alert("កំហុសក្នុងការលុប (Error deleting)");
            });

    } else if (id.startsWith('sale_')) {
        alert("មិនអាចលុបការលក់ពីទីនេះបានទេ សូមទៅកាន់ស្តុក (Cannot delete sales from here, please use Inventory)");
        showLoading(false);
    } else {
        // Standard Manual Transaction (or Override)
        transactionsRef.child(id).remove()
            .then(() => {
                showLoading(false);
            })
            .catch(err => {
                console.error(err);
                showLoading(false);
                alert("កំហុសក្នុងការលុប (Error deleting)");
            });
    }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function toggleCategoryOptions(type) {
    const incomeContainer = document.getElementById('incomeInputContainer');
    const expenseContainer = document.getElementById('expenseSelectContainer');

    // Label updates for Payer/Receiver
    const labelPayer = document.getElementById('labelPayer');
    // const labelReceiver = document.getElementById('labelReceiver');

    // Clear previous values when switching type to avoid confusion? 
    // Maybe better not to clear if user accidentally switches.

    if (type === 'income') {
        incomeContainer.style.display = 'block';
        expenseContainer.style.display = 'none';

        // Make required inputs active/inactive for browser validation if using form submit
        document.getElementById('transIncomeSource').setAttribute('required', 'required');
        document.getElementById('transExpenseCategory').removeAttribute('required');
    } else {
        incomeContainer.style.display = 'none';
        expenseContainer.style.display = 'block';

        document.getElementById('transIncomeSource').removeAttribute('required');
        document.getElementById('transExpenseCategory').setAttribute('required', 'required');
    }
}

function formatDate(dateString) {
    if (!dateString) return '';

    let d;
    // Attempt to parse various formats
    // Check for DD-MM-YYYY or DD/MM/YYYY
    if (typeof dateString === 'string') {
        if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(dateString)) {
            const parts = dateString.split('-');
            d = new Date(parts[2], parts[1] - 1, parts[0]);
        } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateString)) {
            const parts = dateString.split('/');
            d = new Date(parts[2], parts[1] - 1, parts[0]);
        } else {
            d = new Date(dateString);
        }
    } else {
        d = new Date(dateString);
    }

    if (isNaN(d.getTime())) return dateString; // Return original if parsing still fails

    const day = d.getDate().toString().padStart(2, '0');
    const khmerMonths = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
    const month = khmerMonths[d.getMonth()];
    const year = d.getFullYear();
    return `${day} -${month} -${year} `;
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) overlay.style.display = 'flex';
    else overlay.style.display = 'none';
}

function closeModal() {
    const modalEl = document.getElementById('transactionModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
}

function animateValue(id, value) {
    const el = document.getElementById(id);
    // Format money
    el.textContent = '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Simple color logic based on value (positive/negative) for Balance
    if (id === 'netBalanceDisplay') {
        if (value >= 0) {
            el.className = 'fw-bold text-primary mb-0';
        } else {
            el.className = 'fw-bold text-danger mb-0';
        }
    }
}
// ==========================================
// REPORT GENERATION
// ==========================================

function exportReport(type) {
    let title = "";
    let filteredData = [];
    let periodText = "";

    if (type === 'daily') {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        title = "របាយការណ៍ចំណូលចំណាយប្រចាំថ្ងៃ (Daily Report)";
        periodText = `ប្រចាំថ្ងៃទី: ${formatDate(today)} `;

        filteredData = transactionsData.filter(item => item.date === today);
    } else if (type === 'monthly') {
        const currentYear = new Date().getFullYear();
        const promptMonth = prompt("សូមបញ្ចូលខែ (1-12) សម្រាប់របាយការណ៍:", new Date().getMonth() + 1);
        if (!promptMonth) return;

        const month = parseInt(promptMonth);
        if (isNaN(month) || month < 1 || month > 12) {
            alert("ខែមិនត្រឹមត្រូវ (Invalid Month)");
            return;
        }

        const promptYear = prompt("សូមបញ្ចូលឆ្នាំ:", currentYear);
        const year = parseInt(promptYear) || currentYear;

        title = `របាយការណ៍ចំណូលចំណាយប្រចាំខែ ${month}/${year} (Monthly Report)`;
        periodText = `ប្រចាំខែ: ${month}/${year}`;

        filteredData = transactionsData.filter(item => {
            const d = new Date(item.date);
            return (d.getMonth() + 1) === month && d.getFullYear() === year;
        });
    }

    if (filteredData.length === 0) {
        alert("គ្មានទិន្នន័យសម្រាប់ period នេះទេ (No data found)");
        return;
    }

    // Sort by date/time
    filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));

    let totalIncome = 0;
    let totalExpense = 0;

    const rows = filteredData.map(item => {
        const amt = parseFloat(item.amount);
        if (item.type === 'income') totalIncome += amt;
        else totalExpense += amt;

        const typeColor = item.type === 'income' ? 'text-success' : 'text-danger';
        const typeLabel = item.type === 'income' ? 'ចំណូល' : 'ចំណាយ';
        const amountPrefix = item.type === 'income' ? '+' : '-';

        const payerName = item.payer || '-';
        const receiverName = item.receiver || '-';

        return `
            <tr>
                <td>${formatDate(item.date)}</td>
                <td class="${typeColor} fw-bold">${typeLabel}</td>
                <td>${item.category}</td>
                <td class="text-start fw-bold text-secondary">${payerName}</td>
                 <td class="text-start fw-bold text-secondary">${receiverName}</td>
                <td class="text-start text-muted">${item.recorder || '-'}</td>
                <td>${item.description || '-'}</td>
                <td class="text-end fw-bold ${typeColor}">${amountPrefix}$${amt.toFixed(2)}</td>
            </tr>
        `;
    }).join('');

    const netBalance = totalIncome - totalExpense;
    const balanceClass = netBalance >= 0 ? 'text-primary' : 'text-danger';

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
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
            th, td { border: 1px solid #dee2e6; padding: 10px; text-align: left; vertical-align: middle; }
            th { background-color: #f8f9fa; font-weight: bold; text-align: center; }
            .text-end { text-align: right; }
            .text-start { text-align: left; }
            .text-center { text-align: center; }
            .text-success { color: #198754; }
            .text-danger { color: #dc3545; }
            .text-primary { color: #0d6efd; }
            .fw-bold { font-weight: bold; }
            
            .summary-box {
                margin-top: 30px;
                padding: 15px;
                border: 2px solid #eee;
                border-radius: 10px;
            }
            .action-bar { margin-bottom: 20px; display: flex; gap: 10px; justify-content: flex-end; }
            .btn { padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer; font-family: inherit; font-weight: bold; display: flex; align-items: center; gap: 8px; text-decoration: none; font-size: 0.9rem; }
            .btn-print { background: #0d6efd; color: white; }
            .btn-close { background: #6c757d; color: white; }
            .btn-close:hover { background: #5a6268; }

             @media print {
                @page { size: landscape; margin: 10mm; }
                .no-print { display: none; }
                .summary-box { break-inside: avoid; }
            }
        </style>
    </head><body>
    
    <div class="action-bar no-print">
        <a href="#" class="btn btn-close" onclick="window.close(); return false;">
            <i class="fi fi-rr-arrow-left"></i> ត្រឡប់ទៅផ្ទាំងដើម (Back)
        </a>
        <button class="btn btn-print" onclick="window.print()">
            <i class="fi fi-rr-print"></i> បោះពុម្ពឯកសារ (Print)
        </button>
    </div>

    <div class="header-container">
        <img src="img/logo.jpg" class="logo" onerror="this.src='img/1.jpg'">
        <h1>សាលាអន្តរជាតិ ធាន ស៊ីន</h1>
        <h2>Tian Xin International School</h2>
        <h3 style="text-decoration: underline; margin-top: 15px;">${title}</h3>
        <p><strong>${periodText}</strong> | <strong>កាលបរិច្ឆេទចេញ:</strong> ${new Date().toLocaleDateString('km-KH')}</p>
    </div>

    <table>
        <thead>
            <tr>
                <th width="10%">កាលបរិច្ឆេទ</th>
                <th width="8%">ប្រភេទ</th>
                <th width="12%">ចំណាត់ថ្នាក់</th>
                <th width="15%">អ្នកចំណាយ</th>
                <th width="15%">អ្នកទទួល</th>
                <th width="10%">អ្នកកត់ត្រា</th>
                <th>ការបរិយាយ</th>
                <th width="12%">ចំនួនទឹកប្រាក់</th>
            </tr>
        </thead>
        <tbody>
            ${rows}
        </tbody>
        <tfoot>
            <tr style="background-color: #f8f9fa;">
                <td colspan="6" class="text-end fw-bold">ចំណូលសរុប (Total Income):</td>
                <td class="text-end fw-bold text-success">$${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr style="background-color: #f8f9fa;">
                <td colspan="6" class="text-end fw-bold">ចំណាយសរុប (Total Expense):</td>
                <td class="text-end fw-bold text-danger">$${totalExpense.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr style="background-color: #e9ecef;">
                <td colspan="6" class="text-end fw-bold text-primary">សមតុល្យសរុប (Net Balance):</td>
                <td class="text-end fw-bold ${balanceClass}">$${netBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>
        </tfoot>
    </table>

    <div class="summary-box no-print">
        <p><strong>សង្ខេប (Summary):</strong></p>
        <p>ចំនួនប្រតិបត្តិការសរុប: ${filteredData.length}</p>
    </div>

    <!-- Signature Section -->
    <div style="margin-top: 50px; page-break-inside: avoid;">
        <div style="display: flex; justify-content: space-between; padding: 0 20px;">
            <div style="text-align: center;">
                <p style="margin-bottom: 10px;">ថ្ងៃទី...........ខែ...........ឆ្នាំ.............</p>
                <p style="font-weight: bold;">អ្នកធ្វើរបាយការណ៍ (Reporter)</p>
                <div style="margin-top: 60px; border-top: 1px solid #000; width: 200px; margin-left: auto; margin-right: auto;"></div>
            </div>
            <div style="text-align: center;">
                <p style="margin-bottom: 10px;">ថ្ងៃទី...........ខែ...........ឆ្នាំ.............</p>
                <p style="font-weight: bold;">អ្នកត្រួតពិនិត្យ (Reviewed By)</p>
                <div style="margin-top: 60px; border-top: 1px solid #000; width: 200px; margin-left: auto; margin-right: auto;"></div>
            </div>
        </div>
    </div>

    <script>
        setTimeout(() => {
            window.print();
        }, 800);
    </script>
    </body></html>`;

    win.document.write(html);
    win.document.close();
}

// Global Export
window.exportReport = exportReport;
