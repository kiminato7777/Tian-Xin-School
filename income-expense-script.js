// Firebase References
const transactionsRef = database.ref('transactions');

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
    transactionsRef.on('value', (snapshot) => {
        transactionsData = [];
        const data = snapshot.val();

        if (data) {
            // Convert object to array and add ID
            Object.keys(data).forEach(key => {
                transactionsData.push({
                    id: key,
                    ...data[key]
                });
            });
        }

        // Sort by date descending (newest first)
        transactionsData.sort((a, b) => new Date(b.date) - new Date(a.date));

        renderTable();
        calculateTotals();
        showLoading(false);
    }, (error) => {
        console.error("Error fetching transactions:", error);
        showLoading(false);
        alert("បរាជ័យក្នុងការទាញយកទិន្នន័យ (Failed to load data)");
    });
}

function renderTable() {
    const tableBody = document.getElementById('transactionsTableBody');
    const filterType = document.getElementById('filterType').value;
    const startDate = document.getElementById('filterStartDate').value;
    const endDate = document.getElementById('filterEndDate').value;

    tableBody.innerHTML = '';

    // Apply Filters
    let filteredData = transactionsData.filter(item => {
        // Type Filter
        if (filterType !== 'all' && item.type !== filterType) return false;

        // Date Range Filter
        if (startDate) {
            if (new Date(item.date) < new Date(startDate)) return false;
        }
        if (endDate) {
            if (new Date(item.date) > new Date(endDate)) return false;
        }

        return true;
    });

    // Update Counts
    document.getElementById('displayCount').textContent = filteredData.length;
    document.getElementById('totalCount').textContent = transactionsData.length;

    if (filteredData.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-5 text-muted">
                    <i class="fas fa-inbox fa-3x mb-3 opacity-25"></i>
                    <p>មិនមានទិន្នន័យ (No Data Found)</p>
                </td>
            </tr>
        `;
        updateTableFooter(0, 0); // Reset totals
        return;
    }

    // Render Rows
    let tableIncome = 0;
    let tableExpense = 0;

    filteredData.forEach(item => {
        const amt = parseFloat(item.amount) || 0;
        if (item.type === 'income') tableIncome += amt;
        else tableExpense += amt;

        const row = document.createElement('tr');

        // Type Badge
        const typeBadge = item.type === 'income'
            ? '<span class="badge bg-success bg-opacity-10 text-success px-3 py-2 rounded-pill"><i class="fas fa-arrow-up me-1"></i>ចំណូល</span>'
            : '<span class="badge bg-danger bg-opacity-10 text-danger px-3 py-2 rounded-pill"><i class="fas fa-arrow-down me-1"></i>ចំណាយ</span>';

        // Amount Formatting
        const amountClass = item.type === 'income' ? 'text-success' : 'text-danger';
        const amountPrefix = item.type === 'income' ? '+' : '-';

        row.innerHTML = `
            <td class="ps-4 fw-bold text-muted">${formatDate(item.date)}</td>
            <td>${typeBadge}</td>
            <td><span class="fw-bold text-dark">${item.category}</span></td>
            <td><small class="text-muted text-wrap" style="max-width: 300px;">${item.description || '-'}</small></td>
            <td class="${amountClass} fw-bold fs-6">${amountPrefix}$${parseFloat(item.amount).toFixed(2)}</td>
            <td class="text-end pe-4">
                <button class="btn btn-sm btn-outline-primary me-1" onclick="editTransaction('${item.id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteTransaction('${item.id}')">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    // Update Footer Totals (Filtered View)
    updateTableFooter(tableIncome, tableExpense);
}

function updateTableFooter(income, expense) {
    const balance = income - expense;

    const incomeEl = document.getElementById('tableTotalIncome');
    const expenseEl = document.getElementById('tableTotalExpense');
    const balanceEl = document.getElementById('tableNetBalance');

    if (incomeEl) incomeEl.textContent = '$' + income.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (expenseEl) expenseEl.textContent = '$' + expense.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (balanceEl) {
        balanceEl.textContent = '$' + balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (balance >= 0) balanceEl.className = "text-primary py-3 fs-5";
        else balanceEl.className = "text-danger py-3 fs-5";
    }
}

function calculateTotals() {
    let income = 0;
    let expense = 0;

    transactionsData.forEach(item => {
        const amt = parseFloat(item.amount) || 0;
        if (item.type === 'income') {
            income += amt;
        } else {
            expense += amt;
        }
    });

    const balance = income - expense;

    animateValue("totalIncomeDisplay", income);
    animateValue("totalExpenseDisplay", expense);
    animateValue("netBalanceDisplay", balance);
}

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
    document.getElementById('btnFilter').addEventListener('click', renderTable);

    // Reset Modal on Open (if adding new)
    const modal = document.getElementById('transactionModal');
    modal.addEventListener('show.bs.modal', (event) => {
        // If relatedTarget is null/undefined, it might be an edit call triggered manually,
        // but usually the button triggers it.
        // We'll rely on a global or check if we are in 'edit mode'
        // Ideally we reset the form if the button clicked was the "Add New" button
        if (event.relatedTarget && event.relatedTarget.getAttribute('data-bs-target') === '#transactionModal') {
            // Reset Form
            document.getElementById('transactionForm').reset();
            document.getElementById('editTransactionId').value = '';
            document.getElementById('modalTitle').innerHTML = '<i class="fas fa-plus-circle me-2"></i>បញ្ចូលចំណូល/ចំណាយថ្មី';

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
    const category = document.getElementById('transCategory').value;
    const description = document.getElementById('transDescription').value;

    if (!category) {
        alert("សូមជ្រើសរើសចំណាត់ថ្នាក់ (Please select a category)");
        return;
    }

    const transactionData = {
        type,
        date,
        amount,
        category,
        description,
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

    // Set Type
    if (item.type === 'income') {
        document.getElementById('typeIncome').checked = true;
    } else {
        document.getElementById('typeExpense').checked = true;
    }
    toggleCategoryOptions(item.type);

    // Set Category (after toggling options)
    document.getElementById('transCategory').value = item.category;

    // Update Title
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit me-2"></i>កែប្រែទិន្នន័យ (Edit)';

    // Open Modal
    const modal = new bootstrap.Modal(document.getElementById('transactionModal'));
    modal.show();
}

function deleteTransaction(id) {
    if (confirm("តើអ្នកពិតជាចង់លុបទិន្នន័យនេះមែនទេ? (Are you sure?)")) {
        showLoading(true);
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
    const optGroupIncome = document.getElementById('optGroupIncome');
    const optGroupExpense = document.getElementById('optGroupExpense');
    const categorySelect = document.getElementById('transCategory');

    if (type === 'income') {
        optGroupIncome.style.display = '';
        optGroupExpense.style.display = 'none';
    } else {
        optGroupIncome.style.display = 'none';
        optGroupExpense.style.display = '';
    }
    // Reset selection if current selection is invalid for new type
    categorySelect.value = "";
}

function formatDate(dateString) {
    if (!dateString) return '';
    const d = new Date(dateString);
    // DD/MM/YYYY
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
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
