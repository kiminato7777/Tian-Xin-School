/**
 * data-tracking-script.js
 * Script for managing student data display from Firebase Realtime Database
 * Features: View details, Edit (real-time update), Delete, Mark as Paid, Search (DataTables), Reports
 */

// Global Variables
let studentDataTable;
let allStudentsData = {};
const studentsRef = firebase.database().ref('students');
let studentDetailsModal = null;

// Statistics
let statistics = {
    total: 0,
    paid: 0,
    pending: 0,
    installment: 0,
    warning: 0,
    overdue: 0
};

// Alert notifications
let notifications = {
    overdue: [],
    warning: []
};

// Current filters state
let currentFilters = {
    searchName: '',
    status: 'all',
    filterTime: 'all',
    filterLevel: 'all',
    gender: 'all',
    startDate: '',
    endDate: ''
};

// ----------------------------------------------------
// Utility Functions
// ----------------------------------------------------

const getDateObject = (dateStr) => {
    if (!dateStr || ['មិនមាន', 'N/A', ''].includes(dateStr)) return null;
    const engDate = convertToEnglishDate(dateStr);
    if (!engDate) return null;
    const parts = engDate.split('/');
    if (parts.length === 3) {
        return new Date(parts[2], parts[0] - 1, parts[1]);
    }
    return null;
};

const filterStudents = (studentsArray) => {
    return studentsArray.filter(s => {
        // 1. Name Search
        if (currentFilters.searchName) {
            const term = currentFilters.searchName.toLowerCase().trim();
            if (term) {
                const khmerName = `${s.lastName || ''} ${s.firstName || ''}`.toLowerCase();
                const khmerNameNoSpace = `${s.lastName || ''}${s.firstName || ''}`.toLowerCase(); // Handle typing without spaces
                const chineseName = `${s.chineseLastName || ''} ${s.chineseFirstName || ''}`.toLowerCase();
                const englishName = `${s.englishLastName || ''} ${s.englishFirstName || ''}`.toLowerCase();
                const displayId = (s.displayId || '').toLowerCase();

                // Search in all relevant fields
                if (!khmerName.includes(term) &&
                    !khmerNameNoSpace.includes(term) &&
                    !chineseName.includes(term) &&
                    !englishName.includes(term) &&
                    !displayId.includes(term)) {
                    return false;
                }
            }
        }

        // 2. Status Filter
        if (currentFilters.status !== 'all') {
            const statusObj = getPaymentStatus(s);
            if (statusObj.status !== currentFilters.status) return false;
        }

        // 3. Time Filter
        if (currentFilters.filterTime !== 'all') {
            const sTime = (s.studyTime || '').trim();
            if (sTime !== currentFilters.filterTime) return false;
        }

        // 4. Level Filter
        if (currentFilters.filterLevel !== 'all') {
            const sLevel = (s.studyLevel || '').trim();
            if (sLevel !== currentFilters.filterLevel) return false;
        }

        // 5. Gender Filter
        if (currentFilters.gender !== 'all') {
            if (s.gender !== currentFilters.gender) return false;
        }

        // 6. Date Range Filter
        if (currentFilters.startDate || currentFilters.endDate) {
            const studentDate = getDateObject(s.startDate);
            if (!studentDate) return false;

            // Reset hours to compare only dates
            studentDate.setHours(0, 0, 0, 0);

            if (currentFilters.startDate) {
                const [y, m, d] = currentFilters.startDate.split('-').map(Number);
                const start = new Date(y, m - 1, d); // Local Midnight
                start.setHours(0, 0, 0, 0);
                if (studentDate < start) return false;
            }

            if (currentFilters.endDate) {
                const [y, m, d] = currentFilters.endDate.split('-').map(Number);
                const end = new Date(y, m - 1, d); // Local Midnight
                end.setHours(23, 59, 59, 999);
                if (studentDate > end) return false;
            }
        }

        return true;
    });
};

const showAlert = (message, type = 'success', duration = 5000) => {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) return;

    const wrapper = document.createElement('div');
    const iconMap = {
        'success': 'check-circle',
        'danger': 'exclamation-circle',
        'warning': 'exclamation-triangle',
        'info': 'info-circle'
    };

    wrapper.innerHTML = [
        `<div class="alert alert-${type} alert-dismissible fade show" role="alert" style="min-width: 300px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border-radius: 12px; border: none; margin-bottom: 10px;">`,
        ` <div class="d-flex align-items-center"><i class="fi fi-rr-${iconMap[type] || 'info-circle'} me-3 fa-lg"></i><div>${message}</div></div>`,
        ' <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>',
        '</div>'
    ].join('');

    const existingAlerts = alertContainer.querySelectorAll('.alert');
    existingAlerts.forEach(alert => alert.remove());

    alertContainer.append(wrapper);

    setTimeout(() => {
        if (wrapper.parentNode) {
            $(wrapper).fadeOut(500, function () { $(this).remove(); });
        }
    }, duration);
};

const showLoading = (isLoading) => {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;
    overlay.style.display = isLoading ? 'flex' : 'none';
};

const calculateTotalAmount = (student) => {
    if (!student) return 0;
    const tuitionFee = parseFloat(student.tuitionFee) || 0;
    const materialFee = parseFloat(student.materialFee) || 0;
    const adminFee = parseFloat(student.adminFee) || 0;
    const discount = parseFloat(student.discount) || 0;
    const totalAmount = tuitionFee + materialFee + adminFee - discount;
    return totalAmount > 0 ? totalAmount : 0;
};

const calculateTotalPaid = (student) => {
    if (!student) return 0;
    let totalPaid = parseFloat(student.initialPayment) || 0;

    if (student.installments) {
        // គាំទ្រទាំង Array និង Object (Firebase អាចនឹងផ្ញើមកជា Object ប្រសិនបើ Index មិនមែនជាលេខរៀង)
        const installments = Array.isArray(student.installments) ? student.installments : Object.values(student.installments);
        installments.forEach(inst => {
            if (inst.paid || inst.status === 'paid') {
                totalPaid += (parseFloat(inst.paidAmount || inst.amount) || 0);
            }
        });
    }
    return totalPaid;
};

const calculateRemainingAmount = (student) => {
    if (!student) return 0;
    // Special case: If 48 months, consider it fully paid (Paid 100%)
    if ((parseInt(student.paymentMonths) || 0) === 48) return 0;

    return Math.max(0, calculateTotalAmount(student) - calculateTotalPaid(student));
};

const getPaymentStatus = (student) => {
    if (!student) return { text: 'N/A', badge: 'status-pending', status: 'pending', daysRemaining: 0 };

    // Check for 48 months duration - Special case requested by user
    // ប្រសិនបើរយៈពេលបង់ 48 ខែ បង្ហាញថា "បង់ដាច់ 100%"
    const pm = parseInt(student.paymentMonths) || 0;
    if (pm === 48) {
        return { text: '✅ បង់ដាច់ 100%', badge: 'status-paid', status: 'paid', daysRemaining: 0 };
    }

    // 1. Check Date Proximity FIRST (Alert triggers regardless of debt)
    let daysDiff = 0;
    const nextPaymentDateStr = student.nextPaymentDate;
    if (nextPaymentDateStr && !['មិនមាន', 'N/A', ''].includes(nextPaymentDateStr)) {
        const engDate = convertToEnglishDate(nextPaymentDateStr);
        if (engDate) {
            const parts = engDate.split('/');
            if (parts.length === 3) {
                const [month, day, year] = parts.map(Number);
                const nextDueDate = new Date(year, month - 1, day);
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                if (!isNaN(nextDueDate.getTime())) {
                    daysDiff = Math.ceil((nextDueDate - today) / (1000 * 60 * 60 * 24));

                    // Overdue (Date passed)
                    if (daysDiff < 0) {
                        // If overdue, we check if they actually owe money? 
                        // User said "even if paid... alert". 
                        // Only if "Near 10 days".
                        // If Overdue AND Paid... technically they are "Safe" until we generate new invoice?
                        // But usually Overdue means they haven't paid for the NEXT slot.
                        // But if remaining <= 0, it means we haven't billed them yet?
                        // Let's stick to user request: "Before 10 days, Alert".
                    }

                    // Warning (Within 10 days)
                    if (daysDiff >= 0 && daysDiff <= 10) {
                        return { text: `⏳ ជិតដល់កំណត់ (${daysDiff} ថ្ងៃ)`, badge: 'status-warning', status: 'warning', daysRemaining: daysDiff };
                    }
                }
            }
        }
    }

    // 2. Check Financial Status
    const remainingAmount = calculateRemainingAmount(student);
    if (remainingAmount <= 0) return { text: '✅ បង់រួច', badge: 'status-paid', status: 'paid', daysRemaining: daysDiff };

    // 3. Fallback for Overdue if debt exists (or just generic unpaid)
    if (daysDiff < 0) {
        return { text: `❌ ហួសកំណត់ (${Math.abs(daysDiff)} ថ្ងៃ)`, badge: 'status-pending', status: 'overdue', daysRemaining: daysDiff };
    }

    const dbStatus = student.paymentStatus || 'Pending';
    if (['Paid', 'បង់រួច'].includes(dbStatus)) return { text: '✅ បង់រួច', badge: 'status-paid', status: 'paid', daysRemaining: daysDiff };
    if (['Installment', 'Partial', 'នៅជំណាក់'].includes(dbStatus)) return { text: '⏳ នៅជំណាក់', badge: 'status-installment', status: 'installment', daysRemaining: daysDiff };

    return { text: '❌ មិនទាន់បង់', badge: 'status-pending', status: 'pending', daysRemaining: daysDiff };
};

// ----------------------------------------------------
// Date Conversion Functions
// ----------------------------------------------------

const convertToKhmerDate = (dateStr) => {
    if (!dateStr || ['N/A', '', 'មិនមាន', 'null', 'undefined'].includes(dateStr)) return 'មិនមាន';
    if (dateStr.toString().includes('ថ្ងៃទី')) return dateStr;

    try {
        // ប្រសិនបើជាកាលបរិច្ឆេទក្នុងទម្រង់ DD/MM/YYYY
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                // ឧបមាថាវាជា Day/Month/Year
                const day = parseInt(parts[0]);
                const month = parseInt(parts[1]);
                const year = parts[2];
                if (!isNaN(day) && !isNaN(month)) {
                    return `ថ្ងៃទី ${day}/${month}/${year}`;
                }
            }
        }

        let d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
            return `ថ្ងៃទី ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
        }
        return dateStr;
    } catch (e) { return dateStr; }
};

const convertToEnglishDate = (khmerDateStr) => {
    if (!khmerDateStr || ['មិនមាន', '', 'N/A'].includes(khmerDateStr)) return null;
    try {
        const match = khmerDateStr.match(/ថ្ងៃទី\s*(\d+)\/(\d+)\/(\d+)/);
        if (match) return `${parseInt(match[2])}/${parseInt(match[1])}/${match[3]}`;

        if (khmerDateStr.includes('/') && !khmerDateStr.includes('ថ្ងៃទី')) {
            const p = khmerDateStr.split('/');
            if (p.length === 3) return `${parseInt(p[1])}/${parseInt(p[0])}/${p[2]}`;
        }

        // Support standard YYYY-MM-DD
        if (khmerDateStr.includes('-')) {
            const p = khmerDateStr.split('-');
            if (p.length === 3) return `${parseInt(p[1])}/${parseInt(p[2])}/${p[0]}`;
        }

        return null;
    } catch (e) { return null; }
};

const formatDueDateWithColor = (student) => {
    if (!student) return '<span class="text-muted">មិនមាន</span>';
    const dateStr = student.nextPaymentDate || 'មិនមាន';
    if (['មិនមាន', 'N/A', ''].includes(dateStr)) return '<span class="text-muted">មិនមាន</span>';

    const khDate = convertToKhmerDate(dateStr);
    const status = getPaymentStatus(student);
    if (status.status === 'overdue') return `<span class="overdue text-danger fw-bold">${khDate} (ហួស ${Math.abs(status.daysRemaining)} ថ្ងៃ)</span>`;
    if (status.status === 'warning') return `<span class="due-soon text-warning fw-bold">${khDate} (${status.daysRemaining} ថ្ងៃ)</span>`;
    return `<span class="normal-due">${khDate}</span>`;
};

const formatStudyType = (student) => {
    if (!student) return 'មិនមាន';
    const types = { 'cFullTime': 'ចិនពេញម៉ោង', 'cPartTime': 'ចិនក្រៅម៉ោង', 'eFullTime': 'អង់គ្លេសពេញម៉ោង', 'ePartTime': 'អង់គ្លេសក្រៅម៉ោង' };
    return types[student.studyType] || student.studyType || 'មិនមាន';
};

const populateDynamicFilters = (students) => {
    // Helper to populate a select element
    const populateSelect = (elementId, attribute, defaultText, customSort) => {
        const select = document.getElementById(elementId);
        if (!select) return;

        // Get unique values
        const values = new Set();
        students.forEach(s => {
            if (s[attribute]) {
                const val = s[attribute].trim();
                // Avoid empty or N/A values if desired, or keep them
                if (val && !['N/A', 'មិនមាន', ''].includes(val)) {
                    values.add(val);
                }
            }
        });

        const sortedValues = Array.from(values).sort(customSort || ((a, b) => a.localeCompare(b)));
        const currentValue = select.value; // Store current selection

        // Rebuild options but keep the first 'All' option or any option with value="all"
        let allOption = select.querySelector('option[value="all"]');
        if (!allOption) allOption = new Option(defaultText, "all");

        select.innerHTML = '';
        select.appendChild(allOption);

        sortedValues.forEach(val => {
            const option = document.createElement('option');
            option.value = val;
            option.textContent = val;
            select.appendChild(option);
        });

        // Restore selection if it still exists, otherwise default to all
        if (sortedValues.includes(currentValue)) {
            select.value = currentValue;
        } else {
            select.value = 'all';
            // Update filter state if the selected option disappeared (optional, but safer)
            if (attribute === 'studyTime') currentFilters.filterTime = 'all';
            if (attribute === 'studyLevel') currentFilters.filterLevel = 'all';
        }
    };

    // Custom sort for times (simple string sort might be enough, but time sort is better)
    const timeSort = (a, b) => {
        // Simple heuristic: compare start hour
        const getStartHour = (t) => parseInt(t.split(':')[0]) || 0;
        return getStartHour(a) - getStartHour(b);
    };

    // Custom sort for levels (try to sort by level number)
    const levelSort = (a, b) => {
        const getLevelNum = (l) => {
            if (l.includes('មូលដ្ឋាន')) return 0;
            const match = l.match(/(\d+)/);
            return match ? parseInt(match[1]) : 99;
        };
        return getLevelNum(a) - getLevelNum(b);
    };

    populateSelect('filterTime', 'studyTime', '🔍 ទាំងអស់ (ម៉ោង)', timeSort);
    populateSelect('filterLevel', 'studyLevel', '🎓 ទាំងអស់ (កម្រិត)', levelSort);
};

// ----------------------------------------------------
// Core Functions: Loading & Rendering
// ----------------------------------------------------

let rawStudentsArray = [];

const renderFilteredTable = () => {
    const filteredArray = filterStudents(rawStudentsArray);
    renderTableData(filteredArray);
    updateStatistics(rawStudentsArray); // Stats usually show based on all data
};

const loadStudentData = () => {
    showLoading(true);
    studentsRef.on('value', (snapshot) => {
        const data = snapshot.val();
        allStudentsData = {};
        rawStudentsArray = [];

        if (data) {
            Object.keys(data).forEach(key => {
                const s = data[key];
                if (s && (s.displayId || s.lastName)) {
                    s.key = key;
                    allStudentsData[key] = s;
                    rawStudentsArray.push(s);
                }
            });

            rawStudentsArray.sort((a, b) => (parseInt(a.displayId) || 0) - (parseInt(b.displayId) || 0));
        }

        populateDynamicFilters(rawStudentsArray);
        renderFilteredTable();
        checkPaymentAlerts(allStudentsData);

        if (typeof isFirstLoad === 'undefined') window.isFirstLoad = true;
        if (window.isFirstLoad) {
            checkAllPayments();
            window.isFirstLoad = false;
        }

        showLoading(false);
    }, (error) => {
        console.error("Firebase Error:", error);
        showAlert(`Error: ${error.message}`, 'danger');
        showLoading(false);
    });
};

function updateStatistics(students) {
    const stats = { total: 0, paid: 0, pending: 0, installment: 0, warning: 0, overdue: 0 };
    let totalIncome = 0;
    let totalOutstanding = 0;

    students.forEach(s => {
        stats.total++;
        const status = getPaymentStatus(s).status;
        if (stats.hasOwnProperty(status)) stats[status]++;
        else if (status === 'warning') stats.warning++;
        else if (status === 'overdue') stats.overdue++;

        // Financials
        totalIncome += calculateTotalPaid(s);
        totalOutstanding += calculateRemainingAmount(s);
    });

    statistics = stats;

    // Update UI Cards
    const statTotalStudents = document.getElementById('statTotalStudents');
    const statTotalIncome = document.getElementById('statTotalIncome');
    const statTotalOutstanding = document.getElementById('statTotalOutstanding');

    if (statTotalStudents) statTotalStudents.innerText = `${stats.total} នាក់`;
    if (statTotalIncome) statTotalIncome.innerText = `$${totalIncome.toFixed(2)}`;
    if (statTotalOutstanding) statTotalOutstanding.innerText = `$${totalOutstanding.toFixed(2)}`;
}

function renderTableData(studentsArray) {
    const tableId = '#studentTable';
    const tbody = document.querySelector(tableId + ' tbody');
    if (!tbody) return;

    // Helper to build row HTML content
    const buildRowContent = (s, i) => {
        const total = calculateTotalAmount(s);
        const remaining = calculateRemainingAmount(s);
        const status = getPaymentStatus(s);

        // Hidden search terms
        const searchTerms = `${s.lastName || ''}${s.firstName || ''} ${s.chineseLastName || ''} ${s.chineseFirstName || ''} ${s.displayId || ''}`.toLowerCase();

        return `
            <td class="text-center fw-bold text-secondary">${i + 1}</td>
            <td class="text-center"><span class="badge bg-light text-dark border shadow-sm">${s.displayId}</span></td>
            <td class="student-name-cell" onclick="viewStudentDetails('${s.key}')">
                <div class="fw-bold">${s.lastName || ''} ${s.firstName || ''}</div>
                <div class="text-muted small">${s.chineseLastName || ''}${s.chineseFirstName || ''}</div>
                <span class="d-none">${searchTerms}</span>
            </td>
            <td class="text-center">${s.gender === 'Male' ? 'ប្រុស' : 'ស្រី'}</td>
            <td class="text-center">${s.personalPhone || 'N/A'}</td>
            <td class="text-center">${s.studyTime || 'N/A'}</td>
            <td class="text-center">${s.studyLevel || 'N/A'}</td>
            <td class="text-center">${convertToKhmerDate(s.startDate)}</td>
            <td class="text-center">${formatDueDateWithColor(s)}</td>
            <td class="text-center"><i class="fi fi-rr-calendar-check me-1 text-secondary small"></i>${s.paymentMonths || 1} ខែ</td>
            <td class="text-center fw-bold text-primary"><i class="fi fi-rr-dollar me-1"></i>${total.toFixed(2)}</td>
            <td class="text-center fw-bold ${remaining > 0 ? 'text-danger' : 'text-success'}">
                <i class="fi fi-rr-hand-holding-usd me-1 ${remaining > 0 ? 'text-danger' : 'text-success'}"></i>${remaining.toFixed(2)}
            </td>
            <td class="text-center">
                <span class="payment-status-badge ${status.badge} shadow-sm">
                    <i class="fas ${status.status === 'paid' ? 'fa-check' : 'fa-hourglass-half'} me-1"></i>${status.text}
                </span>
            </td>
            <td class="text-center">
                <div class="action-buttons-table">
                    <button class="btn btn-sm btn-warning edit-btn shadow-sm" data-key="${s.key}" title="កែប្រែ"><i class="fi fi-rr-edit"></i></button>
                    ${remaining > 0 ? `<button class="btn btn-sm btn-success mark-paid-btn shadow-sm" data-key="${s.key}" title="បង់ប្រាក់"><i class="fi fi-rr-receipt"></i></button>` : ''}
                    <button class="btn btn-sm btn-danger delete-btn shadow-sm" data-key="${s.key}" data-display-id="${s.displayId}" title="លុប"><i class="fi fi-rr-user-delete"></i></button>
                </div>
            </td>`;
    };

    // Case 1: DataTable NOT initialized yet (First Load)
    if (!$.fn.DataTable.isDataTable(tableId)) {
        let html = '';
        if (studentsArray.length === 0) {
            html = '<tr><td colspan="14" class="text-center text-muted py-5"><i class="fi fi-rr-database fa-3x mb-3 d-block animate__animated animate__pulse animate__infinite"></i>គ្មានទិន្នន័យសិស្សទេ</td></tr>';
        } else {
            studentsArray.forEach((s, i) => {
                html += `<tr class="align-middle animate__animated animate__fadeIn" style="animation-delay: ${Math.min(i * 0.05, 1)}s;">${buildRowContent(s, i)}</tr>`;
            });
        }
        tbody.innerHTML = html;
        initializeDataTable(studentsArray);
        return;
    }

    // Case 2: DataTable ALREADY initialized (Updates) -> Use API to avoid flash
    const table = $(tableId).DataTable();
    const currentPage = table.page(); // Save page

    // De-couple from DOM for speed
    // Clear old data
    table.clear();

    if (studentsArray.length > 0) {
        const newRows = [];
        studentsArray.forEach((s, i) => {
            const tr = document.createElement('tr');
            tr.className = "align-middle animate__animated animate__fadeIn";
            // Reduce animation delay for updates to feel snappier or remove it
            // tr.style.animationDelay = (i * 0.02) + 's'; 
            tr.innerHTML = buildRowContent(s, i);
            newRows.push(tr);
        });
        // Batch add
        table.rows.add(newRows);
    }

    // Draw and restore page
    table.draw(false);

    // Only restore page if we have enough data (handled by draw false usually, but explicit safety check)
    if (currentPage > 0 && currentPage < table.page.info().pages) {
        table.page(currentPage).draw(false);
    }
}

function initializeDataTable(studentsArray) {
    if (!$.fn.DataTable.isDataTable('#studentTable')) {
        studentDataTable = $('#studentTable').DataTable({
            pagingType: 'full_numbers', // Show First, Prev, Numbers, Next, Last
            dom: '<"row mb-3"<"col-md-12"l>>rt<"row mt-3 align-items-center"<"col-md-6"i><"col-md-6 d-flex justify-content-end"p>><"clear">',
            columnDefs: [{ orderable: false, targets: [13] }],
            order: [[1, 'asc']], // Order by Student ID
            language: {
                url: 'https://cdn.datatables.net/plug-ins/1.13.4/i18n/km.json',
                paginate: {
                    first: '<i class="fi fi-rr-angle-double-left"></i>',
                    last: '<i class="fi fi-rr-angle-double-right"></i>',
                    previous: '<i class="fi fi-rr-angle-left"></i>',
                    next: '<i class="fi fi-rr-angle-right"></i>'
                }
            }
        });
    }

    // Update Display Counts
    const count = studentsArray.length;
    if (document.getElementById('displayCount')) document.getElementById('displayCount').textContent = count;
    if (document.getElementById('totalDisplayCount')) document.getElementById('totalDisplayCount').textContent = count;

    // Calculate Gender Counts
    const maleCount = studentsArray.filter(s => s.gender === 'ប្រុស').length;
    const femaleCount = studentsArray.filter(s => s.gender === 'ស្រី').length;

    // Update Gender Display Elements
    const totalStudentCountEl = document.getElementById('totalStudentCount');
    const maleStudentCountEl = document.getElementById('maleStudentCount');
    const femaleStudentCountEl = document.getElementById('femaleStudentCount');

    if (totalStudentCountEl) totalStudentCountEl.textContent = count;
    if (maleStudentCountEl) maleStudentCountEl.textContent = maleCount;
    if (femaleStudentCountEl) femaleStudentCountEl.textContent = femaleCount;
}

// ----------------------------------------------------
// Details Modal
// ----------------------------------------------------

function viewStudentDetails(studentKey) {
    const s = allStudentsData[studentKey];
    if (!s) return showAlert('រកមិនឃើញទិន្នន័យ!', 'danger');

    showLoading(true);
    const total = calculateTotalAmount(s);
    const paid = calculateTotalPaid(s);
    const remaining = calculateRemainingAmount(s);
    const status = getPaymentStatus(s);

    const bodyContent = `
        <div class="student-details-view animate__animated animate__fadeIn">
            <!-- Header section with photo if available -->
            <div class="row mb-4 align-items-center bg-white p-3 rounded shadow-sm border-start border-4 border-primary mx-0">
                <div class="col-md-auto text-center">
                    <div class="detail-photo-container mb-2">
                        ${s.imageUrl ?
            `<img src="${s.imageUrl}" class="rounded shadow-sm border" style="width: 120px; height: 140px; object-fit: cover; border: 3px solid #f8f9fa !important;">` :
            `<div class="rounded shadow-sm border bg-light d-flex align-items-center justify-content-center" style="width: 120px; height: 140px; border: 3px dashed #dee2e6 !important;">
                                <i class="fi fi-rr-graduation-cap fa-4x text-muted"></i>
                            </div>`
        }
                    </div>
                </div>
                <div class="col-md ms-md-3">
                    <h2 class="text-primary mb-1 fw-bold">${s.lastName || ''} ${s.firstName || ''}</h2>
                    <h5 class="text-secondary mb-3">${s.chineseLastName || ''}${s.chineseFirstName || ''}</h5>
                    <div class="d-flex flex-wrap gap-2">
                        <span class="badge bg-dark p-2 px-3 rounded-pill shadow-sm"><i class="fi fi-rr-id-badge me-1"></i> ID: ${s.displayId}</span>
                        <span class="badge bg-primary p-2 px-3 rounded-pill shadow-sm"><i class="fi fi-rr-graduation-cap me-1"></i> ${formatStudyType(s)}</span>
                        <span class="badge ${status.badge} p-2 px-3 rounded-pill shadow-sm border border-white border-opacity-25">${status.text}</span>
                    </div>
                </div>
                <div class="col-md-auto text-end mt-3 mt-md-0">
                    <div class="btn-group shadow-sm">
                        <button class="btn btn-info text-white fw-bold px-3" onclick="printPOSReceipt('${s.key}')" title="បោះពុម្ពវិក្កយបត្រ POS"><i class="fi fi-rr-receipt me-1"></i> វិក្កយបត្រ</button>
                        <button class="btn btn-primary fw-bold px-3" onclick="showRenewModal('${s.key}')" style="background-color: #6f42c1; border-color: #6f42c1;"><i class="fi fi-rr-refresh me-1"></i> បន្ត/ប្តូរថ្នាក់</button>
                        <button class="btn btn-warning fw-bold px-3" onclick="showEditModal('${s.key}')"><i class="fi fi-rr-edit me-1"></i> កែប្រែ</button>
                        ${remaining > 0 ? `<button class="btn btn-success fw-bold px-3" onclick="markAsPaid('${s.key}')"><i class="fi fi-rr-cash-register me-1"></i> បង់ប្រាក់</button>` : ''}
                        <button class="btn btn-danger fw-bold px-3" onclick="deleteStudent('${s.key}', '${s.displayId}')"><i class="fi fi-rr-user-delete me-1"></i> លុប</button>
                    </div>
                </div>
            </div>

            <div class="row g-4">
                <!-- Section 1: Personal Info -->
                <div class="col-md-6 col-lg-4">
                    <div class="card h-100 border-0 shadow-sm overflow-hidden" style="border-radius: 15px;">
                        <div class="card-header bg-primary text-white py-3 border-0">
                            <h6 class="mb-0 fw-bold"><i class="fi fi-rr-address-card me-2"></i>ព័ត៌មានផ្ទាល់ខ្លួន</h6>
                        </div>
                        <div class="card-body bg-white">
                            <ul class="list-group list-group-flush text-start">
                                <li class="list-group-item d-flex justify-content-between align-items-center border-0 px-0 py-2">
                                    <span class="text-muted small"><i class="fi fi-rr-intersex me-2"></i>ភេទ:</span>
                                    <span class="fw-bold">${s.gender === 'Male' ? '<span class="text-primary">ប្រុស (Male)</span>' : '<span class="text-pink">ស្រី (Female)</span>'}</span>
                                </li>
                                <li class="list-group-item d-flex justify-content-between align-items-center border-0 px-0 py-2">
                                    <span class="text-muted small"><i class="fi fi-rr-calendar me-2"></i>ថ្ងៃកំណើត:</span>
                                    <span class="fw-bold">${convertToKhmerDate(s.dob)}</span>
                                </li>
                                <li class="list-group-item d-flex justify-content-between align-items-center border-0 px-0 py-2">
                                    <span class="text-muted small"><i class="fi fi-rr-flag me-2"></i>សញ្ជាតិ:</span>
                                    <span class="fw-bold">${s.nationality || 'ខ្មែរ'}</span>
                                </li>
                                <li class="list-group-item d-flex justify-content-between align-items-center border-0 px-0 py-2">
                                    <span class="text-muted small"><i class="fi fi-rr-phone-call me-2"></i>លេខទូរស័ព្ទ:</span>
                                    <span class="fw-bold text-primary">${s.personalPhone || 'N/A'}</span>
                                </li>
                                <li class="list-group-item border-0 px-0 py-2">
                                    <span class="text-muted small d-block mb-1"><i class="fi fi-rr-marker me-2"></i>អាសយដ្ឋាន:</span>
                                    <span class="fw-bold small d-block p-2 bg-light rounded text-break">${s.village || ''} ${s.commune || ''} ${s.district || ''} ${s.province || ''} ${s.studentAddress || ''}</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>

                <!-- Section 2: Guardian Info -->
                <div class="col-md-6 col-lg-4">
                    <div class="card h-100 border-0 shadow-sm overflow-hidden" style="border-radius: 15px;">
                        <div class="card-header bg-info text-white py-3 border-0">
                            <h6 class="mb-0 fw-bold"><i class="fi fi-rr-users me-2"></i>ព័ត៌មានអាណាព្យាបាល</h6>
                        </div>
                        <div class="card-body bg-white p-0">
                            <div class="accordion accordion-flush" id="guardianAccordion">
                                <div class="accordion-item border-0">
                                    <h2 class="accordion-header">
                                        <button class="accordion-button py-2 bg-light fw-bold text-primary" type="button" data-bs-toggle="collapse" data-bs-target="#fatherInfo">
                                            <i class="fi fi-rr-user me-2"></i>ព័ត៌មានឪពុក
                                        </button>
                                    </h2>
                                    <div id="fatherInfo" class="accordion-collapse collapse show">
                                        <div class="accordion-body py-2">
                                            <div class="d-flex justify-content-between small mb-1"><span>ឈ្មោះ:</span> <span class="fw-bold">${s.fatherName || 'N/A'}</span></div>
                                            <div class="d-flex justify-content-between small mb-1"><span>អាយុ:</span> <span class="fw-bold">${s.fatherAge || '-'}</span></div>
                                            <div class="d-flex justify-content-between small mb-1"><span>មុខរបរ:</span> <span class="fw-bold">${s.fatherJob || '-'}</span></div>
                                            <div class="d-flex justify-content-between small mb-1"><span>ទូរស័ព្ទ:</span> <span class="fw-bold text-primary">${s.fatherPhone || 'N/A'}</span></div>
                                            <div class="small mt-1 p-1 bg-light rounded text-muted">អាសយដ្ឋាន: ${s.fatherAddress || 'N/A'}</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="accordion-item border-0">
                                    <h2 class="accordion-header">
                                        <button class="accordion-button collapsed py-2 bg-light fw-bold text-danger" type="button" data-bs-toggle="collapse" data-bs-target="#motherInfo">
                                            <i class="fi fi-rr-user me-2"></i>ព័ត៌មានម្តាយ
                                        </button>
                                    </h2>
                                    <div id="motherInfo" class="accordion-collapse collapse">
                                        <div class="accordion-body py-2">
                                            <div class="d-flex justify-content-between small mb-1"><span>ឈ្មោះ:</span> <span class="fw-bold">${s.motherName || 'N/A'}</span></div>
                                            <div class="d-flex justify-content-between small mb-1"><span>អាយុ:</span> <span class="fw-bold">${s.motherAge || '-'}</span></div>
                                            <div class="d-flex justify-content-between small mb-1"><span>មុខរបរ:</span> <span class="fw-bold">${s.motherJob || '-'}</span></div>
                                            <div class="d-flex justify-content-between small mb-1"><span>ទូរស័ព្ទ:</span> <span class="fw-bold text-primary">${s.motherPhone || 'N/A'}</span></div>
                                            <div class="small mt-1 p-1 bg-light rounded text-muted">អាសយដ្ឋាន: ${s.motherAddress || 'N/A'}</div>
                                        </div>
                                    </div>
                                </div>
                                ${s.guardianName ? `
                                <div class="accordion-item border-0">
                                    <h2 class="accordion-header">
                                        <button class="accordion-button collapsed py-2 bg-light fw-bold text-warning" type="button" data-bs-toggle="collapse" data-bs-target="#guardianInfoOther">
                                            <i class="fi fi-rr-shield-check me-2"></i>អ្នកអាណាព្យាបាល
                                        </button>
                                    </h2>
                                    <div id="guardianInfoOther" class="accordion-collapse collapse">
                                        <div class="accordion-body py-2">
                                            <div class="d-flex justify-content-between small mb-1"><span>ឈ្មោះ:</span> <span class="fw-bold">${s.guardianName}</span></div>
                                            <div class="d-flex justify-content-between small mb-1"><span>ត្រូវជា:</span> <span class="fw-bold">${s.guardianRelation || 'N/A'}</span></div>
                                            <div class="d-flex justify-content-between small"><span>ទូរស័ព្ទ:</span> <span class="fw-bold text-primary">${s.guardianPhone || 'N/A'}</span></div>
                                        </div>
                                    </div>
                                </div>` : ''}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Section 3: Academic Info -->
                <div class="col-md-12 col-lg-4">
                    <div class="card h-100 border-0 shadow-sm overflow-hidden" style="border-radius: 15px;">
                        <div class="card-header bg-success text-white py-3 border-0">
                            <h6 class="mb-0 fw-bold"><i class="fi fi-rr-book-alt me-2"></i>ព័ត៌មានការសិក្សា</h6>
                        </div>
                        <div class="card-body bg-white">
                            <div class="p-2 mb-3 bg-light rounded shadow-inner border-start border-3 border-success">
                                <div class="small text-muted mb-1 fw-bold">កម្រិតសិក្សា & ម៉ោងសិក្សា</div>
                                <div class="fw-bold text-dark"><i class="fi fi-rr-layers text-success me-2"></i>${s.studyLevel || 'N/A'}</div>
                                <div class="fw-bold text-dark"><i class="fi fi-rr-clock text-success me-2"></i>${s.studyTime || 'N/A'}</div>
                            </div>
                            <div class="p-2 mb-3 bg-light rounded shadow-inner border-start border-3 border-info">
                                <div class="small text-muted mb-1 fw-bold">គ្រូបង្រៀន & បន្ទប់រៀន</div>
                                <div class="fw-bold text-dark"><i class="fi fi-rr-chalkboard-user text-info me-2" style="width:20px"></i>${s.teacherName || 'មិនទាន់បញ្ជាក់'}</div>
                                <div class="fw-bold text-dark"><i class="fi fi-rr-door-open text-info me-2" style="width:20px"></i>បន្ទប់៖ ${s.classroom || 'N/A'}</div>
                            </div>
                            <div class="p-2 bg-light rounded shadow-inner border-start border-3 border-warning">
                                <div class="small text-muted mb-1 fw-bold">កាលបរិច្ឆេទសំខាន់ៗ</div>
                                <div class="fw-bold text-dark d-flex justify-content-between align-items-center mb-1">
                                    <span><i class="fi fi-rr-calendar-check text-warning me-2"></i>ចូលរៀន៖</span>
                                    <span class="badge bg-white text-dark border">${convertToKhmerDate(s.startDate)}</span>
                                </div>
                                    <span><i class="fi fi-rr-calendar-xmark text-danger me-2"></i>ផុតកំណត់៖</span>
                                    <span class="badge bg-white text-danger border border-danger-subtle">${s.nextPaymentDate ? convertToKhmerDate(s.nextPaymentDate) : 'មិនកំណត់'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Section 4: Financial & Installments -->
                <div class="col-md-12">
                    <div class="card border-0 shadow-sm overflow-hidden" style="border-radius: 20px;">
                        <div class="card-header bg-warning text-dark py-3 border-0">
                            <h6 class="mb-0 fw-bold"><i class="fi fi-rr-receipt me-2"></i>ព័ត៌មានហិរញ្ញវត្ថុ និងប្រវត្តិបង់ប្រាក់</h6>
                        </div>
                        <div class="card-body bg-white py-4">
                            <div class="row g-4">
                                <div class="col-md-5">
                                    <div class="financial-summary-box p-4 rounded-4 bg-light shadow-inner border">
                                        <h5 class="fw-bold mb-4 text-center border-bottom pb-2">សេចក្តីសង្ខេបការបង់ប្រាក់</h5>
                                        <div class="d-flex justify-content-between mb-3 align-items-center">
                                            <span class="text-muted">ថ្លៃសិក្សា (Tuition):</span>
                                            <span class="fw-bold text-primary fs-5">$${(parseFloat(s.tuitionFee) || 0).toFixed(2)}</span>
                                        </div>
                                        <div class="d-flex justify-content-between mb-3 align-items-center">
                                            <span class="text-muted">ថ្លៃសម្ភារៈ (Materials):</span>
                                            <span class="fw-bold text-info fs-6">$${(parseFloat(s.materialFee) || 0).toFixed(2)}</span>
                                        </div>
                                        <div class="d-flex justify-content-between mb-3 align-items-center">
                                            <span class="text-muted">ថ្លៃរដ្ឋបាល (Admin):</span>
                                            <span class="fw-bold text-secondary fs-6">$${(parseFloat(s.adminFee) || 0).toFixed(2)}</span>
                                        </div>
                                        <div class="d-flex justify-content-between mb-3 align-items-center pb-3 border-bottom border-secondary-subtle">
                                            <span class="text-muted">ការបញ្ចុះតម្លៃ (Discount):</span>
                                            <span class="fw-bold text-danger fs-6">-$${(parseFloat(s.discount) || 0).toFixed(2)}</span>
                                        </div>
                                        <div class="d-flex justify-content-between mb-3 mt-3 align-items-center">
                                            <span class="fw-bold h6 mb-0">សរុបដែលត្រូវបង់:</span>
                                            <span class="fw-bold text-dark h5 mb-0">$${total.toFixed(2)}</span>
                                        </div>
                                        <div class="d-flex justify-content-between mb-4 align-items-center">
                                            <span class="fw-bold h6 mb-0 text-success">ទឹកប្រាក់បានបង់រួច:</span>
                                            <span class="fw-bold text-success h5 mb-0">$${paid.toFixed(2)}</span>
                                        </div>
                                        <div class="total-remaining-card p-3 rounded-3 bg-white border border-danger border-2 text-center shadow-sm">
                                            <div class="small fw-bold text-muted mb-1">ទឹកប្រាក់ដែលនៅខ្វះ (Balance Due)</div>
                                            <div class="fw-bold ${remaining > 0 ? 'text-danger' : 'text-success'} h2 mb-0">$${remaining.toFixed(2)}</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-7">
                                    <div class="d-flex justify-content-between align-items-center mb-3">
                                        <h6 class="fw-bold text-muted mb-0"><i class="fi fi-rr-time-past me-2"></i>ប្រវត្តិបង់រំលស់ (Installment History)</h6>
                                    </div>
                                    <div class="table-responsive rounded shadow-sm border bg-white">
                                        <table class="table table-hover mb-0">
                                            <thead class="table-light border-bottom">
                                                <tr class="small text-uppercase">
                                                    <th class="py-3 px-3">លើកទី</th>
                                                    <th class="py-3">ថ្ងៃត្រូវបង់</th>
                                                    <th class="py-3">ទឹកប្រាក់</th>
                                                    <th class="py-3">អ្នកទទួល</th>
                                                    <th class="py-3">ចំណាំ</th>
                                                    <th class="py-3 text-center">ស្ថានភាព</th>
                                                </tr>
                                            </thead>
                                            <tbody class="small" id="installmentRowsContainer">
                                                ${renderInstallmentRows(s)}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div class="mt-4 p-3 bg-white rounded border border-info border-start-4 shadow-sm">
                                        <h6 class="fw-bold text-info"><i class="fi fi-rr-info me-2"></i>ចំណាំ / Notes</h6>
                                        <p class="mb-0 text-muted small italic">${s.motivation || 'មិនមានព័ត៌មានបន្ថែមទេ'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    function renderInstallmentRows(student) {
        if (!student.installments) {
            const initial = parseFloat(student.initialPayment) || 0;
            if (initial > 0) {
                return `
                    <tr>
                        <td class="text-center py-3 px-3">1</td>
                        <td class="py-3">${convertToKhmerDate(student.startDate)}</td>
                        <td class="py-3 fw-bold text-success">$${initial.toFixed(2)}</td>
                        <td class="py-3 text-muted italic">បង់ពេលចុះឈ្មោះ</td>
                        <td class="py-3 text-center">
                            <span class="badge bg-success-subtle text-success border border-success-subtle px-2">បង់រួច</span>
                        </td>
                    </tr>
                `;
            }
            return `<tr><td colspan="5" class="text-center py-4 text-muted">មិនមានព័ត៌មានការបង់រំលស់ទេ</td></tr>`;
        }

        let installments = [];
        if (student.installments) {
            if (Array.isArray(student.installments)) {
                installments = student.installments;
            } else if (typeof student.installments === 'object') {
                installments = Object.values(student.installments);
            }
        }

        if (installments.length === 0) {
            return `<tr><td colspan="5" class="text-center py-4 text-muted">មិនមានព័ត៌មានការបង់រំលស់ទេ</td></tr>`;
        }

        return installments.map(inst => `
            <tr>
                <td class="text-center py-3 px-3 fw-bold">${inst.stage || '-'}</td>
                <td class="py-3">${convertToKhmerDate(inst.date)}</td>
                <td class="py-3 fw-bold text-dark">$${(parseFloat(inst.amount) || 0).toFixed(2)}</td>
                <td class="py-3 text-muted">${inst.receiver || '-'}</td>
                <td class="py-3 text-muted italic">${inst.note || '-'}</td>
                <td class="py-3 text-center">
                    ${inst.paid ?
                `<span class="badge bg-success-subtle text-success border border-success-subtle px-2"><i class="fi fi-rr-check-circle me-1"></i>បង់រួច</span>` :
                `<span class="badge bg-warning-subtle text-warning border border-warning-subtle px-2"><i class="fi fi-rr-hourglass me-1"></i>នៅខ្វះ</span>`
            }
                </td>
            </tr>
        `).join('');
    }

    const modalContent = document.getElementById('modalBodyContent');
    if (modalContent) {
        modalContent.innerHTML = bodyContent;
        if (!studentDetailsModal) {
            studentDetailsModal = new bootstrap.Modal(document.getElementById('studentDetailsModal'));
        }
        studentDetailsModal.show();
    }

    showLoading(false);
}

// ----------------------------------------------------
// Edit Logic
// ----------------------------------------------------

function showEditModal(key) {
    const student = allStudentsData[key];
    if (student) createEditModal(student);
}

function createEditModal(student) {
    const existing = document.getElementById('editStudentModal');
    if (existing) existing.remove();

    const html = `
        <div class="modal fade" id="editStudentModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
                <div class="modal-content border-0 shadow-lg" style="border-radius: 20px;">
                    <div class="modal-header bg-warning text-dark p-4 border-0 shadow-sm">
                        <h5 class="modal-title fw-bold">
                            <i class="fi fi-rr-edit me-2 animate__animated animate__pulse animate__infinite"></i>កែប្រែព័ត៌មានលម្អិតសិស្ស (ID: <span class="badge bg-dark">${student.displayId}</span>)
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body p-4 bg-light shadow-inner">
                        <form id="editStudentForm">
                            <input type="hidden" name="key" value="${student.key}">
                            
                            <!-- Personal Information -->
                            <div class="card mb-4 border-0 shadow-sm" style="border-radius: 15px;">
                                <div class="card-header bg-white fw-bold text-primary border-0 pt-3"><i class="fi fi-rr-user-circle me-2"></i>ព័ត៌មានផ្ទាល់ខ្លួន / Personal Info</div>
                                <div class="card-body">
                                    <div class="row g-3">
                                        <div class="col-md-3">
                                            <label class="form-label small fw-bold">នាមត្រកូល (ចិន)</label>
                                            <input type="text" class="form-control" name="chineseLastName" value="${student.chineseLastName || ''}">
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label small fw-bold">ឈ្មោះ (ចិន)</label>
                                            <input type="text" class="form-control" name="chineseFirstName" value="${student.chineseFirstName || ''}">
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label small fw-bold">នាមត្រកូល (ខ្មែរ/ឡាតាំង)</label>
                                            <input type="text" class="form-control" name="lastName" value="${student.lastName || ''}">
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label small fw-bold">នាមខ្លួន (ខ្មែរ/ឡាតាំង)</label>
                                            <input type="text" class="form-control" name="firstName" value="${student.firstName || ''}">
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label small fw-bold">ភេទ</label>
                                            <select class="form-select" name="gender">
                                                <option value="Male" ${student.gender === 'Male' ? 'selected' : ''}>ប្រុស (Male)</option>
                                                <option value="Female" ${student.gender === 'Female' ? 'selected' : ''}>ស្រី (Female)</option>
                                            </select>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label small fw-bold">ថ្ងៃខែឆ្នាំកំណើត</label>
                                            <input type="text" class="form-control" name="dob" value="${student.dob || ''}" placeholder="DD/MM/YYYY">
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label small fw-bold">លេខទូរស័ព្ទ</label>
                                            <input type="text" class="form-control" name="personalPhone" value="${student.personalPhone || ''}">
                                        </div>
                                        <div class="col-md-12">
                                            <div class="card bg-white border-0 shadow-sm">
                                                <div class="card-body p-3">
                                                    <label class="form-label small fw-bold text-primary mb-2"><i class="fi fi-rr-marker me-1"></i>អាសយដ្ឋាន (Address)</label>
                                                    <div class="row g-2">
                                                        <div class="col-md-3">
                                                            <label class="small text-muted">ភូមិ</label>
                                                            <input type="text" class="form-control form-control-sm" name="village" value="${student.village || ''}" placeholder="Village">
                                                        </div>
                                                        <div class="col-md-3">
                                                            <label class="small text-muted">ឃុំ/សង្កាត់</label>
                                                            <input type="text" class="form-control form-control-sm" name="commune" value="${student.commune || ''}" placeholder="Commune">
                                                        </div>
                                                        <div class="col-md-3">
                                                            <label class="small text-muted">ស្រុក/ខណ្ឌ</label>
                                                            <input type="text" class="form-control form-control-sm" name="district" value="${student.district || ''}" placeholder="District">
                                                        </div>
                                                        <div class="col-md-3">
                                                            <label class="small text-muted">ខេត្ត/ក្រុង</label>
                                                            <input type="text" class="form-control form-control-sm" name="province" value="${student.province || ''}" placeholder="Province">
                                                        </div> 
                                                        <div class="col-md-12">
                                                            <label class="small text-muted">លម្អិតផ្សេងៗ (ផ្ទះ/ផ្លូវ)</label>
                                                            <input type="text" class="form-control form-control-sm" name="studentAddress" value="${student.studentAddress || ''}" placeholder="House No, Street, etc.">
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Course & Payment -->
                            <div class="card mb-4 border-0 shadow-sm" style="border-radius: 15px;">
                                <div class="card-header bg-white fw-bold text-success border-0 pt-3"><i class="fi fi-rr-graduation-cap me-2"></i>វគ្គសិក្សា និងការបង់ប្រាក់ / Course & Fee</div>
                                <div class="card-body">
                                    <div class="row g-3">
                                        <div class="col-md-4">
                                            <label class="form-label small fw-bold">ប្រភេទវគ្គសិក្សា</label>
                                            <select class="form-select" name="studyType">
                                                <option value="cFullTime" ${student.studyType === 'cFullTime' ? 'selected' : ''}>ចិនពេញម៉ោង</option>
                                                <option value="cPartTime" ${student.studyType === 'cPartTime' ? 'selected' : ''}>ចិនក្រៅម៉ោង</option>
                                                <option value="eFullTime" ${student.studyType === 'eFullTime' ? 'selected' : ''}>អង់គ្លេសពេញម៉ោង</option>
                                                <option value="ePartTime" ${student.studyType === 'ePartTime' ? 'selected' : ''}>អង់គ្លេសក្រៅម៉ោង</option>
                                            </select>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label small fw-bold">ម៉ោងសិក្សា</label>
                                            <input type="text" class="form-control" name="studyTime" value="${student.studyTime || ''}">
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label small fw-bold">កម្រិតសិក្សា</label>
                                            <input type="text" class="form-control" name="studyLevel" value="${student.studyLevel || ''}">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label small fw-bold">គ្រូបន្ទុកថ្នាក់ (Homeroom Teacher)</label>
                                            <input type="text" class="form-control" name="teacherName" value="${student.teacherName || ''}" placeholder="ឈ្មោះគ្រូ...">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label small fw-bold">បន្ទប់រៀន (Classroom)</label>
                                            <input type="text" class="form-control" name="classroom" value="${student.classroom || ''}" placeholder="លេខបន្ទប់...">
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label small fw-bold">ថ្ងៃចូលរៀន</label>
                                            <input type="text" class="form-control" name="startDate" value="${student.startDate || ''}">
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label small fw-bold">ថ្ងៃផុតកំណត់</label>
                                            <input type="text" class="form-control" name="nextPaymentDate" value="${student.nextPaymentDate || ''}">
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label small fw-bold">ចំនួនខែបង់</label>
                                            <input type="number" class="form-control" name="paymentMonths" value="${student.paymentMonths || 1}">
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label small fw-bold">ស្ថានភាពបង់ប្រាក់</label>
                                            <select class="form-select" name="paymentStatus">
                                                <option value="Paid" ${student.paymentStatus === 'Paid' ? 'selected' : ''}>បង់រួច (Paid)</option>
                                                <option value="Pending" ${student.paymentStatus === 'Pending' ? 'selected' : ''}>មិនទាន់បង់ (Pending)</option>
                                                <option value="Installment" ${student.paymentStatus === 'Installment' ? 'selected' : ''}>នៅជំណាក់ (Installment)</option>
                                            </select>
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label small fw-bold">ថ្លៃសិក្សា ($)</label>
                                            <input type="number" step="0.01" class="form-control" name="tuitionFee" value="${student.tuitionFee || 0}">
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label small fw-bold">ថ្លៃសម្ភារៈ ($)</label>
                                            <input type="number" step="0.01" class="form-control" name="materialFee" value="${student.materialFee || 0}">
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label small fw-bold">ថ្លៃរដ្ឋបាល ($)</label>
                                            <input type="number" step="0.01" class="form-control" name="adminFee" value="${student.adminFee || 0}">
                                        </div>
                                         <div class="col-md-3">
                                             <label class="form-label small fw-bold">បញ្ចុះតម្លៃ ($)</label>
                                             <input type="number" step="0.01" class="form-control" name="discount" value="${student.discount || 0}">
                                         </div>
                                         <div class="col-md-3">
                                             <label class="form-label small fw-bold">បង់ដំបូង ($)</label>
                                             <input type="number" step="0.01" class="form-control" name="initialPayment" value="${student.initialPayment || 0}">
                                         </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Parents/Guardian Information -->
                            <div class="card border-0 shadow-sm" style="border-radius: 15px;">
                                <div class="card-header bg-white fw-bold text-info border-0 pt-3"><i class="fi fi-rr-users me-2"></i>ព័ត៌មានអាណាព្យាបាល / Family Info</div>
                                <div class="card-body">
                                    <div class="row g-3">
                                        <div class="col-md-6 border-end">
                                            <h6 class="fw-bold mb-3 text-muted">ព័ត៌មានឪពុក</h6>
                                            <div class="mb-2">
                                                <label class="small">ឈ្មោះឪពុក</label>
                                                <input type="text" class="form-control form-control-sm" name="fatherName" value="${student.fatherName || ''}">
                                            </div>
                                            <div class="mb-2">
                                                <label class="small">លេខទូរស័ព្ទឪពុក</label>
                                                <input type="text" class="form-control form-control-sm" name="fatherPhone" value="${student.fatherPhone || ''}">
                                            </div>
                                            <div class="mb-2">
                                                <label class="small">អាសយដ្ឋានឪពុក</label>
                                                <input type="text" class="form-control form-control-sm" name="fatherAddress" value="${student.fatherAddress || ''}">
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <h6 class="fw-bold mb-3 text-muted">ព័ត៌មានម្តាយ</h6>
                                            <div class="mb-2">
                                                <label class="small">ឈ្មោះម្តាយ</label>
                                                <input type="text" class="form-control form-control-sm" name="motherName" value="${student.motherName || ''}">
                                            </div>
                                            <div class="mb-2">
                                                <label class="small">លេខទូរស័ព្ទម្តាយ</label>
                                                <input type="text" class="form-control form-control-sm" name="motherPhone" value="${student.motherPhone || ''}">
                                            </div>
                                            <div class="mb-2">
                                                <label class="small">អាសយដ្ឋានម្តាយ</label>
                                                <input type="text" class="form-control form-control-sm" name="motherAddress" value="${student.motherAddress || ''}">
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Installment Information (Dynamic) -->
                            <div class="card mt-4 border-0 shadow-sm" style="border-radius: 15px;">
                                <div class="card-header bg-white fw-bold text-warning border-0 pt-3 d-flex justify-content-between align-items-center">
                                    <span><i class="fi fi-rr-hand-holding-usd me-2"></i>ព័ត៌មានបង់រំលស់ / Debt Info</span>
                                    <button type="button" class="btn btn-sm btn-outline-warning" onclick="addInstallmentRow()">
                                        <i class="fi fi-rr-plus-circle me-1"></i> បន្ថែមដំណាក់កាល
                                    </button>
                                </div>
                                <div class="card-body">
                                    <div class="table-responsive">
                                        <table class="table table-sm table-bordered align-middle" id="editInstallmentTable">
                                            <thead class="bg-light">
                                                <tr class="small text-center">
                                                    <th width="10%">ដំណាក់កាល</th>
                                                    <th width="20%">ថ្ងៃទីខែឆ្នាំ</th>
                                                    <th width="20%">ចំនួនទឹកប្រាក់ ($)</th>
                                                    <th width="20%">អ្នកទទួល</th>
                                                    <th width="20%">ចំណាំ</th>
                                                    <th width="10%">លុប</th>
                                                </tr>
                                            </thead>
                                            <tbody id="editInstallmentBody">
                                                <!-- Row will be inserted here -->
                                            </tbody>
                                        </table>
                                    </div>
                                    <div class="row mt-3">
                                        <div class="col-md-6 offset-md-6">
                                            <div class="p-3 bg-light rounded text-end">
                                                <div class="mb-1"><strong>សរុបដែលត្រូវបង់:</strong> <span id="editTotalFeeDisplay">$0.00</span></div>
                                                <div class="mb-1"><strong>បានបង់ (Initial):</strong> <span id="editPaidDisplay">$0.00</span></div>
                                                <div class="h5 mb-0 text-danger"><strong>នៅខ្វះសរុប:</strong> <span id="editBalanceDisplay">$0.00</span></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer p-4 bg-white border-0 shadow-sm">
                        <button type="button" class="btn btn-light px-4" data-bs-dismiss="modal" style="border-radius: 10px;">បិទ</button>
                        <button type="button" class="btn btn-warning px-5 fw-bold shadow-sm" onclick="saveStudentChanges('${student.key}')" style="border-radius: 10px;">
                            <i class="fi fi-rr-disk me-2"></i>រក្សាទុកទិន្នន័យថ្មី
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    // Populate installments
    const instBody = document.getElementById('editInstallmentBody');
    let installments = [];
    if (student.installments) {
        if (Array.isArray(student.installments)) {
            installments = student.installments;
        } else if (typeof student.installments === 'object') {
            installments = Object.values(student.installments);
        }
    }

    if (installments.length > 0) {
        installments.forEach(inst => addInstallmentRow(inst));
    } else {
        // Add 3 default rows if none exist
        for (let i = 1; i <= 3; i++) addInstallmentRow({ stage: i });
    }

    // Add calculation listeners
    const form = document.getElementById('editStudentForm');
    form.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', calculateEditFormTotals);
    });

    calculateEditFormTotals();

    new bootstrap.Modal(document.getElementById('editStudentModal')).show();
}

/**
 * Add a dynamic row to the installment table in edit modal
 */
function addInstallmentRow(data = {}) {
    const tbody = document.getElementById('editInstallmentBody');
    if (!tbody) return;

    const rowCount = tbody.rows.length;
    const stage = data.stage || (rowCount + 1);
    const date = data.date || '';
    const amount = data.amount || 0;
    const receiver = data.receiver || '';
    const note = data.note || '';
    const paid = data.paid || false;

    const tr = document.createElement('tr');
    tr.className = 'installment-row animate__animated animate__fadeIn';
    tr.innerHTML = `
        <td class="text-center"><input type="number" class="form-control form-control-sm text-center fw-bold inst-stage" value="${stage}"></td>
        <td><input type="text" class="form-control form-control-sm inst-date" value="${date}" placeholder="DD/MM/YYYY"></td>
        <td><input type="number" step="0.01" class="form-control form-control-sm text-center inst-amount" value="${amount}" oninput="calculateEditFormTotals()"></td>
        <td><input type="text" class="form-control form-control-sm inst-receiver" value="${receiver}"></td>
        <td><input type="text" class="form-control form-control-sm inst-note" value="${note}"></td>
        <td class="text-center">
            <button type="button" class="btn btn-sm btn-outline-danger border-0" onclick="this.closest('tr').remove(); calculateEditFormTotals();">
                <i class="fi fi-rr-trash"></i>
            </button>
        </td>
    `;
    tbody.appendChild(tr);
    calculateEditFormTotals();
}

/**
 * Auto-calculate totals in the edit form
 */
function calculateEditFormTotals() {
    const form = document.getElementById('editStudentForm');
    if (!form) return;

    const tuition = parseFloat(form.tuitionFee.value) || 0;
    const material = parseFloat(form.materialFee.value) || 0;
    const admin = parseFloat(form.adminFee.value) || 0;
    const discount = parseFloat(form.discount.value) || 0;
    const initialPaid = parseFloat(form.initialPayment?.value || 0);

    const totalFee = tuition + material + admin - discount;

    // Sum installment amounts
    let installmentTotal = 0;
    document.querySelectorAll('.inst-amount').forEach(input => {
        installmentTotal += parseFloat(input.value) || 0;
    });

    const balance = totalFee - initialPaid - installmentTotal;

    // Update displays
    const totalDisplay = document.getElementById('editTotalFeeDisplay');
    const paidDisplay = document.getElementById('editPaidDisplay');
    const balanceDisplay = document.getElementById('editBalanceDisplay');

    if (totalDisplay) totalDisplay.textContent = `$${totalFee.toFixed(2)}`;
    if (paidDisplay) paidDisplay.textContent = `$${initialPaid.toFixed(2)}`;
    if (balanceDisplay) {
        balanceDisplay.textContent = `$${balance.toFixed(2)}`;
        balanceDisplay.className = balance > 0 ? 'text-danger' : (balance < 0 ? 'text-warning' : 'text-success');
    }
}

function saveStudentChanges(key) {
    const form = document.getElementById('editStudentForm');
    const data = {};
    new FormData(form).forEach((v, k) => data[k] = v);

    // Basic Validation
    if (!data.lastName || !data.firstName) {
        return showAlert('សូមបំពេញឈ្មោះត្រកូល និងនាមខ្លួន', 'danger');
    }

    // Collect dynamic installments
    const installments = [];
    document.querySelectorAll('.installment-row').forEach(row => {
        installments.push({
            stage: row.querySelector('.inst-stage').value,
            date: row.querySelector('.inst-date').value,
            amount: parseFloat(row.querySelector('.inst-amount').value) || 0,
            receiver: row.querySelector('.inst-receiver').value,
            note: row.querySelector('.inst-note').value,
            paid: false // By default in edit modaldebt info, we assume these are to be paid or status maintained
        });
    });

    showLoading(true);
    studentsRef.child(key).update({
        ...data,
        installments: installments,
        updatedAt: new Date().toISOString()
    })
        .then(() => {
            showAlert('កែប្រែបានជោគជ័យ', 'success');
            const modalEl = document.getElementById('editStudentModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            // Firebase list listener will trigger re-render
        })
        .catch(error => {
            console.error("Update error:", error);
            showAlert('កំហុសក្នុងការរក្សាទុក: ' + error.message, 'danger');
        })
        .finally(() => showLoading(false));
}



// ----------------------------------------------------
// Actions: Delete & Mark as Paid
// ----------------------------------------------------

function deleteStudent(key, displayId) {
    if (!confirm(`តើអ្នកចង់លុបសិស្ស ID: ${displayId} មែនទេ?`)) return;
    studentsRef.child(key).remove()
        .then(() => showAlert(`លុប ID: ${displayId} ជោគជ័យ`, 'success'))
        .catch(e => showAlert(e.message, 'danger'));
}

function markAsPaid(key) {
    const s = allStudentsData[key];
    if (!s) return;
    if (!confirm('បង់ប្រាក់សរុបសម្រាប់ខែនេះ?')) return;

    const months = parseInt(s.paymentMonths || 1);
    let nextDate = 'មិនមាន';
    const engDate = convertToEnglishDate(s.nextPaymentDate);
    if (engDate) {
        const d = new Date(engDate);
        d.setMonth(d.getMonth() + months);
        nextDate = `ថ្ងៃទី ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    }

    studentsRef.child(key).update({
        paymentStatus: 'Paid',
        nextPaymentDate: nextDate,
        updatedAt: new Date().toISOString()
    }).then(() => {
        showAlert('បង់ប្រាក់រួចរាល់', 'success');
        if (studentDetailsModal) studentDetailsModal.hide();
    });
}

// ----------------------------------------------------
// Alerts & Notifications
// ----------------------------------------------------

function checkPaymentAlerts(data) {
    notifications = { overdue: [], warning: [] };
    if (!data) return updateNotificationCount(0);

    Object.keys(data).forEach(key => {
        const s = data[key];
        const status = getPaymentStatus(s);
        // Alert based on status returned by getPaymentStatus (which now prioritizes Date <= 10)
        // We do NOT check remaining > 0 anymore for warnings, as requested.
        if (status.status === 'overdue' && calculateRemainingAmount(s) > 0) {
            // Only alert overdue if they actually owe money? Or strictly date?
            // "alert must alert... even if paid money" applied to "near 10 days".
            // For overdue, usually we care about debt. Let's keep logic for overdue as is (debt based or date based if debt exists).
            // But for WARNING (near date), we alert regardless.
            notifications.overdue.push({ id: key, name: `${s.lastName} ${s.firstName}`, days: Math.abs(status.daysRemaining) });
        } else if (status.status === 'warning') {
            // Warning is now triggered by Date <= 10 regardless of debt
            notifications.warning.push({ id: key, name: `${s.lastName} ${s.firstName}`, days: status.daysRemaining });
        }
    });

    updateNotificationCount(notifications.overdue.length + notifications.warning.length);
    renderAlertPanel();

    if (notifications.warning.length > 0) {
        showAlert(`⚠️ មានសិស្ស ${notifications.warning.length} នាក់ជិតដល់ថ្ងៃបង់ប្រាក់ (10 ថ្ងៃ)`, 'warning');
    }
}

function updateNotificationCount(count) {
    const badge = document.getElementById('notificationCount');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

function renderAlertPanel() {
    const list = document.getElementById('alertList');
    if (!list) return;

    let html = '';
    if (notifications.overdue.length === 0 && notifications.warning.length === 0) {
        html = '<div class="p-4 text-center text-muted"><i class="fi fi-rr-check-circle fa-2x mb-2 d-block text-success"></i>គ្មានការជូនដំណឹង</div>';
    } else {
        notifications.overdue.forEach(n => {
            html += `<div class="alert-item overdue p-3 border-bottom d-flex align-items-center" onclick="viewStudentDetails('${n.id}')" style="cursor:pointer">
                <div class="me-3 p-2 bg-white rounded-circle"><i class="fi fi-rr-flag text-danger"></i></div>
                <div>
                    <div class="fw-bold text-danger">ហួសកំណត់: ${n.name}</div>
                    <small class="text-muted"><i class="fi fi-rr-calendar-xmark me-1"></i>ហួស ${n.days} ថ្ងៃ</small>
                </div>
            </div>`;
        });
        notifications.warning.forEach(n => {
            html += `<div class="alert-item warning p-3 border-bottom d-flex align-items-center" onclick="viewStudentDetails('${n.id}')" style="cursor:pointer">
                <div class="me-3 p-2 bg-white rounded-circle"><i class="fi fi-rr-hourglass text-warning"></i></div>
                <div>
                    <div class="fw-bold text-warning">ជិតដល់ថ្ងៃបង់: ${n.name}</div>
                    <small class="text-muted"><i class="fi fi-rr-clock me-1"></i>នៅសល់ ${n.days} ថ្ងៃ</small>
                </div>
            </div>`;
        });
    }
    list.innerHTML = html;
}

// ----------------------------------------------------
// Reports
// ----------------------------------------------------

// ----------------------------------------------------
// Renew & Transfer Logic
// ----------------------------------------------------

function showRenewModal(key) {
    const s = allStudentsData[key];
    if (!s) return;

    const existing = document.getElementById('renewStudentModal');
    if (existing) existing.remove();

    const html = `
        <div class="modal fade" id="renewStudentModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content border-0 shadow-lg" style="border-radius: 20px;">
                    <div class="modal-header bg-purple text-white p-4 border-0 shadow-sm" style="background-color: #6f42c1;">
                        <h5 class="modal-title fw-bold">
                            <i class="fi fi-rr-refresh me-2"></i>បន្តការសិក្សា / ប្តូរថ្នាក់ (Renew/Transfer) - ID: ${s.displayId}
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body p-4 bg-light">
                        <form id="renewStudentForm">
                            <input type="hidden" name="key" value="${s.key}">
                            
                            <!-- Academic Updates -->
                            <div class="card mb-4 border-0 shadow-sm">
                                <div class="card-header bg-white fw-bold text-primary border-0 pt-3">
                                    <i class="fi fi-rr-graduation-cap me-2"></i>បច្ចុប្បន្នភាពការសិក្សា (Academic Upgrade)
                                </div>
                                <div class="card-body">
                                    <div class="row g-3">
                                        <div class="col-md-6">
                                            <label class="form-label small fw-bold">កម្រិតសិក្សា (Level)</label>
                                            <input type="text" class="form-control" name="newLevel" value="${s.studyLevel || ''}">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label small fw-bold">ម៉ោងសិក្សា (Time)</label>
                                            <input type="text" class="form-control" name="newTime" value="${s.studyTime || ''}">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label small fw-bold">គ្រូបន្ទុកថ្នាក់ (Teacher)</label>
                                            <input type="text" class="form-control" name="newTeacher" value="${s.teacherName || ''}">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label small fw-bold">បន្ទប់រៀន (Classroom)</label>
                                            <input type="text" class="form-control" name="newClassroom" value="${s.classroom || ''}">
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Financial Renewal -->
                            <div class="card border-0 shadow-sm">
                                <div class="card-header bg-white fw-bold text-success border-0 pt-3">
                                    <i class="fi fi-rr-hand-holding-usd me-2"></i>បង់ប្រាក់បន្ថែម (Additional Payment)
                                </div>
                                <div class="card-body">
                                    <div class="alert alert-info border-0 shadow-inner mb-3">
                                        <div class="d-flex justify-content-between">
                                            <span>ថ្លៃសិក្សាបច្ចុប្បន្ន (Current Fee):</span>
                                            <span class="fw-bold">$${(parseFloat(s.tuitionFee) || 0).toFixed(2)}</span>
                                        </div>
                                        <div class="d-flex justify-content-between">
                                            <span>បានបង់រួច (Paid):</span>
                                            <span class="fw-bold text-success">$${calculateTotalPaid(s).toFixed(2)}</span>
                                        </div>
                                         <div class="d-flex justify-content-between border-top border-secondary pt-2 mt-2">
                                            <span class="text-danger fw-bold">ប្រាក់ចាស់ដែលនៅខ្វះ (Outstanding Balance):</span>
                                            <span class="fw-bold text-danger">$${calculateRemainingAmount(s).toFixed(2)}</span>
                                        </div>
                                    </div>

                                    <div class="row g-3">
                                        <div class="col-12">
                                            <div class="form-check form-switch">
                                                <input class="form-check-input" type="checkbox" id="includeOutstanding" checked>
                                                <label class="form-check-label fw-bold small" for="includeOutstanding">រាប់បញ្ចូលប្រាក់ដែលនៅខ្វះទៅក្នុងតារាងថ្មី (Carry forward outstanding balance)</label>
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label small fw-bold text-danger">ថ្លៃសិក្សាបន្ថែម (Additional Fee) $</label>
                                            <input type="number" step="0.01" class="form-control border-danger" name="addFee" value="0.00" onfocus="this.select()">
                                            <small class="text-muted">ទឹកប្រាក់ដែលត្រូវបង់បន្ថែមសម្រាប់វគ្គថ្មី</small>
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label small fw-bold text-success">បង់ប្រាក់ឥឡូវនេះ (Pay Now) $</label>
                                            <input type="number" step="0.01" class="form-control border-success" name="payNow" value="0.00" onfocus="this.select()">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label small fw-bold">កាលបរិច្ឆេទផុតកំណត់ថ្មី (Next Due Date)</label>
                                            <input type="text" class="form-control" name="newDueDate" value="${s.nextPaymentDate || ''}" placeholder="DD/MM/YYYY">
                                        </div>
                                         <div class="col-md-6">
                                            <label class="form-label small fw-bold">បង្កើតវិក្កយបត្រថ្មី? (Create Invoice)</label>
                                            <select class="form-select" name="createInvoice">
                                                <option value="yes">បាទ/ចាស (Yes)</option>
                                                <option value="no">ទេ (No)</option>
                                            </select>
                                        </div>
                                        <div class="col-12">
                                            <label class="form-label small fw-bold">កំណត់សម្គាល់ (Note)</label>
                                            <input type="text" class="form-control" name="note" placeholder="សម្គាល់ការបង់ប្រាក់...">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer p-4 bg-white border-0 shadow-sm">
                        <button type="button" class="btn btn-light px-4" data-bs-dismiss="modal">បិទ</button>
                        <button type="button" class="btn btn-primary px-5 fw-bold shadow-sm" style="background-color: #6f42c1; border-color: #6f42c1;" onclick="processRenew('${s.key}')">
                            <i class="fi fi-rr-check-circle me-2"></i>រក្សាទុក (Save)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    new bootstrap.Modal(document.getElementById('renewStudentModal')).show();
}

function processRenew(key) {
    const s = allStudentsData[key];
    const form = document.getElementById('renewStudentForm');
    if (!s || !form) return;

    const newLevel = form.newLevel.value.trim();
    const newTime = form.newTime.value.trim();
    const newTeacher = form.newTeacher.value.trim();
    const newClassroom = form.newClassroom.value.trim();

    const addFee = parseFloat(form.addFee.value) || 0;
    const payNow = parseFloat(form.payNow.value) || 0;
    const newDueDate = form.newDueDate.value.trim();
    const note = form.note.value.trim();
    const includeOutstanding = document.getElementById('includeOutstanding').checked;

    // 1. Update Academic Info
    const updateData = {
        studyLevel: newLevel,
        studyTime: newTime,
        teacherName: newTeacher,
        classroom: newClassroom,
        nextPaymentDate: newDueDate,
        updatedAt: new Date().toISOString()
    };

    // 2. Update Financials logic
    // If includeOutstanding is TRUE: New Total Fee = (Old Fee - Old Paid) + Add Fee = Remaining + Add Fee
    // BUT we need to be careful. The system tracks "Total Fee" and "Installments Paid".
    // Remaining = TotalFee - Sum(Installments).
    // If we just add "addFee" to "tuitionFee", the remaining balance is naturally preserved:
    // New Remaining = (Old Tuition + Add Fee) - Old Paid = Old Remaining + Add Fee.
    // So simply ADDING to the fee automatically carries forward the debt.

    // If includeOutstanding is FALSE (User wants to wipe old debt?):
    // Then we act as if the old fee was fully paid or we reset the fee base.
    // Easier way: Set Tuition Fee = Old Paid + Add Fee. 
    // Then Remaining = (Old Paid + Add Fee) - Old Paid = Add Fee. (Old debt gone).

    if (includeOutstanding) {
        updateData.tuitionFee = (parseFloat(s.tuitionFee) || 0) + addFee;
    } else {
        updateData.tuitionFee = calculateTotalPaid(s) + addFee;
    }

    let installments = [];
    if (s.installments) {
        installments = Array.isArray(s.installments) ? [...s.installments] : Object.values(s.installments);
    }

    if (payNow > 0) {
        installments.push({
            stage: installments.length + 1,
            date: new Date().toISOString(), // Use ISO for sorting, or convert to Khmer format if preferred standard
            amount: payNow,
            receiver: firebase.auth().currentUser ? firebase.auth().currentUser.email : 'System',
            note: note || 'Renew/Transfer Payment',
            paid: true
        });
        updateData.installments = installments;
    }

    // 3. Check Payment Status
    // Calculate new total and paid to see if fully paid
    // Ideally we should calculate this, but 'getPaymentStatus' does it dynamically based on fields.
    // However, we might want to update the 'paymentStatus' string field explicitly if user wants.
    // For now, let's leave paymentStatus dynamic based on remaining amount logic in getPaymentStatus, 
    // BUT we might need to set it to 'Installment' or something if not fully paid.
    // Using simple logic:
    const newTotal = (parseFloat(s.tuitionFee) || 0) + addFee;
    const currentPaid = calculateTotalPaid(s);
    const newPaid = currentPaid + payNow;

    if (newPaid >= newTotal) {
        updateData.paymentStatus = 'Paid';
    } else {
        updateData.paymentStatus = 'Installment';
    }

    showLoading(true);
    studentsRef.child(key).update(updateData)
        .then(() => {
            showAlert('បច្ចុប្បន្នភាពជោគជ័យ!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('renewStudentModal')).hide();
            // Refresh details view if open (it will be closed by default logic or remain open? 
            // The modal is separate. The details view is another modal.
            // We should reload details view or close it.
            if (studentDetailsModal) {
                studentDetailsModal.hide();
                setTimeout(() => viewStudentDetails(key), 500); // Re-open to show changes
            }
        })
        .catch(e => showAlert(e.message, 'danger'))
        .finally(() => showLoading(false));
}

// ----------------------------------------------------
// Reports & Exports
// ----------------------------------------------------

function getFilteredStudents() {
    return Object.values(allStudentsData).filter(s => {
        // Name Search
        // Name Search
        const nameMatch = !currentFilters.searchName ||
            ((s.lastName || '') + ' ' + (s.firstName || '')).toLowerCase().includes(currentFilters.searchName.toLowerCase()) ||
            ((s.chineseLastName || '') + (s.chineseFirstName || '')).toLowerCase().includes(currentFilters.searchName.toLowerCase()) ||
            ((s.englishLastName || '') + ' ' + (s.englishFirstName || '')).toLowerCase().includes(currentFilters.searchName.toLowerCase()) ||
            (s.displayId && s.displayId.toString().includes(currentFilters.searchName));

        // Status Filter
        const statusObj = getPaymentStatus(s);
        const statusMatch = currentFilters.status === 'all' || statusObj.status === currentFilters.status;

        // Time Filter (Study Time)
        const timeMatch = currentFilters.filterTime === 'all' || s.studyTime === currentFilters.filterTime;

        // Level Filter
        const levelMatch = currentFilters.filterLevel === 'all' || s.studyLevel === currentFilters.filterLevel;

        // Gender Filter
        const genderMatch = currentFilters.gender === 'all' || s.gender === currentFilters.gender;

        // Date Range
        let dateMatch = true;
        if (currentFilters.startDate && currentFilters.endDate) {
            const regDate = new Date(s.startDate);
            const start = new Date(currentFilters.startDate);
            const end = new Date(currentFilters.endDate);
            // Ignore time
            regDate.setHours(0, 0, 0, 0); start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999);
            dateMatch = regDate >= start && regDate <= end;
        }

        return nameMatch && statusMatch && timeMatch && levelMatch && genderMatch && dateMatch;
    });
}

function exportToExcel(data = null, filename = 'Student_Data') {
    const students = data || getFilteredStudents();

    if (students.length === 0) return showAlert('គ្មានទិន្នន័យសម្រាប់នាំចេញ', 'warning');

    let csv = '\uFEFFល.រ,អត្តលេខ,ឈ្មោះ,ភេទ,លេខទូរស័ព្ទ,កម្រិត,ម៉ោង,ថ្ងៃចុះឈ្មោះ,ថ្ងៃផុតកំណត់,ចំនួនខែ,គ្រូបន្ទុកថ្នាក់,តម្លៃ,ខ្វះ,ស្ថានភាព\n';
    students.forEach((s, i) => {
        const status = getPaymentStatus(s);
        csv += `${i + 1},${s.displayId},"${s.lastName} ${s.firstName}",${s.gender === 'Male' ? 'ប្រុស' : 'ស្រី'},${s.personalPhone || ''},${s.studyLevel || ''},${s.studyTime || ''},${s.startDate || ''},${s.nextPaymentDate || ''},${s.paymentMonths || ''},"${s.teacherName || ''}",$${calculateTotalAmount(s)},$${calculateRemainingAmount(s)},${status.text}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

// ----------------------------------------------------
// Reports
// ----------------------------------------------------

function exportOverdueReport() {
    const students = Object.values(allStudentsData).filter(s => {
        // Strict logic: Alert status OVERDUE or Valid Warning 
        // User asked for "Overdue Students" report.
        const status = getPaymentStatus(s);
        // Include BOTH 'overdue' and 'warning' (near due date) or just OVERDUE?
        // User text: "សិស្សហួសកំណត់" (Overdue Students).
        // Let's include anyone with status 'overdue' OR 'warning' to be safe, or just 'overdue' if strict.
        // Usually Overdue Report includes people who missed payment.
        // Warning is "Upcoming".
        // Let's assume strict "Overdue" + "Warning" (Near Due) effectively means "Attention Needed".
        // IF I stick to text "Overdue", maybe just 'overdue'.
        // BUT user said "edit place near 10 days... must alert".
        // Let's filter for: Days Remaining <= 10.
        // This covers both Overdue (Days < 0) and Warning (0 <= Days <= 10).
        if (!s.nextPaymentDate) return false;

        let daysDiff = 999;
        const engDate = convertToEnglishDate(s.nextPaymentDate);
        if (engDate) {
            const parts = engDate.split('/');
            if (parts.length === 3) {
                const [month, day, year] = parts.map(Number);
                const nextDueDate = new Date(year, month - 1, day);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (!isNaN(nextDueDate.getTime())) {
                    daysDiff = Math.ceil((nextDueDate - today) / (1000 * 60 * 60 * 24));
                }
            }
        }

        // Filter: Days <= 10
        return daysDiff <= 10 && calculateRemainingAmount(s) >= 0; // Include even if 0 debt? User said "even if paid".
    });

    if (students.length === 0) return showAlert('គ្មានសិស្សហួសកំណត់ ឬជិតដល់កំណត់ទេ', 'info');

    students.sort((a, b) => (a.studyLevel || '').localeCompare(b.studyLevel || ''));

    let win = window.open('', '_blank');
    let html = `<html><head><title>របាយការណ៍សិស្សហួសកំណត់</title>
        <base href="${window.location.href}">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
        <style>
            @font-face { font-family: 'Khmer OS Battambang'; src: url('fonts/KhmerOSBattambang.ttf') format('truetype'); }
            body { font-family: 'Khmer OS Battambang', sans-serif !important; padding: 20px; background: #fff; }
            .header-container { text-align: center; margin-bottom: 20px; }
            .logo { width: 100px; height: 100px; object-fit: cover; }
            .school-text h1 { margin: 10px 0 5px; font-size: 1.8rem; color: #2c3e50; }
            .report-title h2 { color: #dc3545; text-decoration: underline; margin-top: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 0.95rem; }
            th, td { border: 1px solid #333; padding: 10px; text-align: center; vertical-align: middle; }
            th { background-color: #f1f1f1; font-weight: bold; }
            .text-danger { color: #dc3545 !important; font-weight: bold; }
            .footer { margin-top: 50px; display: flex; justify-content: space-between; page-break-inside: avoid; }
            .signature-box { text-align: center; width: 200px; }
            .signature-line { margin-top: 60px; border-top: 1px solid #333; width: 80%; margin: auto; }
            @media print { .no-print { display: none !important; } }
        </style></head><body>
        
        <div class="no-print" style="margin-bottom: 20px; text-align: right;">
            <button onclick="window.print()" style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
                <i class="fa fa-print"></i> បោះពុម្ព
            </button>
        </div>

        <div class="header-container">
            <img src="img/logo.jpg" class="logo" onerror="this.src='img/1.jpg'">
            <div class="school-text">
                <h1>សាលាអន្តរជាតិ ធានស៊ីន</h1>
                <h2>TIAN XIN INTERNATIONAL SCHOOL</h2>
            </div>
            <div class="report-title">
                <h2>របាយការណ៍សិស្សហួសកំណត់បង់ប្រាក់</h2>
            </div>
            <div style="text-align: right; font-style: italic;">កាលបរិច្ឆេទ: ${new Date().toLocaleDateString('en-GB')}</div>
        </div>

        <table>
            <thead>
                <tr>
                    <th width="5%">ល.រ</th>
                    <th width="10%">អត្តលេខ</th>
                    <th width="15%">ឈ្មោះសិស្ស</th>
                    <th width="5%">ភេទ</th>
                    <th width="10%">លេខទូរស័ព្ទ</th>
                    <th width="10%">កំរិតសិក្សា</th>
                    <th width="10%">ថ្ងៃកំណត់</th>
                    <th width="15%">ស្ថានភាព/ចំនួនថ្ងៃ</th>
                    <th width="10%">ប្រាក់ត្រូវបង់</th>
                </tr>
            </thead>
            <tbody>`;

    let totalPending = 0;
    students.forEach((s, index) => {
        const statusObj = getPaymentStatus(s); // This now returns warning if <= 10 days
        const days = statusObj.daysRemaining; // can be negative (overdue) or positive (warning)

        // Calculate amount to pay: If they owe > 0, show remaining. 
        // If remaining <= 0, but they are "Near Due", show "Tuition Fee" (Assumption: they need to renew).
        // Let's show calculateRemainingAmount first.
        let amountToShow = calculateRemainingAmount(s);
        if (amountToShow <= 0) {
            // Assume full tuition fee needed for renewal? 
            // Or just show 0 and they know to check?
            // User request usually implies they want to see what is due.
            // If outstanding > 0, shows debt.
            // If outstanding == 0 but near due, usually implies next month fee.
            // Let's just show Outstanding Balance for now to be safe, labeled as "Outstanding".
            // Or if user wants "Revenue Forecast", that's different.
            // "Overdue Students" usually implies collecting DEBT.
        }

        if (amountToShow > 0) totalPending += amountToShow;

        const dateStr = s.nextPaymentDate || '-';

        // Determine Status Text and Color
        let statusText = '';
        let rowClass = '';
        if (days < 0) {
            statusText = `ហួស ${Math.abs(days)} ថ្ងៃ`;
            rowClass = 'color: #dc3545; font-weight: bold;'; // Red
        } else {
            statusText = `សល់ ${days} ថ្ងៃ`;
            rowClass = 'color: #fd7e14; font-weight: bold;'; // Orange
        }

        html += `<tr>
            <td>${index + 1}</td>
            <td style="font-weight: bold;">${s.displayId}</td>
            <td style="text-align: left;">${s.lastName} ${s.firstName}</td>
            <td>${s.gender === 'Male' ? 'ប្រុស' : 'ស្រី'}</td>
            <td>${s.personalPhone || '-'}</td>
            <td>${s.studyLevel || '-'}</td>
            <td>${dateStr}</td>
            <td style="${rowClass}">${statusText}</td>
            <td style="${amountToShow > 0 ? 'color: red; font-weight: bold;' : ''}">$${amountToShow.toFixed(2)}</td>
        </tr>`;
    });

    html += `
            <tr style="background-color: #ffe6e6;">
                <td colspan="8" style="text-align: right; font-weight: bold;">សរុបទឹកប្រាក់ដែលនៅខ្វះ (Total Outstanding):</td>
                <td style="color: #dc3545; font-weight: bold;">$${totalPending.toFixed(2)}</td>
            </tr>
            </tbody>
        </table>

        <div class="footer">
            <div class="signature-box"><p>រៀបចំដោយ</p><div class="signature-line"></div><p>បេឡាករ</p></div>
            <div class="signature-box"><p>ត្រួតពិនិត្យដោយ</p><div class="signature-line"></div><p>ប្រធានគណនេយ្យ</p></div>
            <div class="signature-box"><p>អនុម័តដោយ</p><div class="signature-line"></div><p>នាយកសាលា</p></div>
        </div>
    </body></html>`;

    win.document.write(html);
    win.document.close();
}

function generateStandardPDF(students, title, subtitle = '') {
    if (!students || students.length === 0) return showAlert('គ្មានទិន្នន័យសម្រាប់បង្កើតរបាយការណ៍', 'warning');

    // Sort by ID or relevant field
    students.sort((a, b) => (parseInt(a.displayId) || 0) - (parseInt(b.displayId) || 0));

    let totalDueAmount = 0;
    students.forEach(s => totalDueAmount += calculateRemainingAmount(s));

    let win = window.open('', '_blank');
    let html = `<html><head><title>${title}</title>
        <base href="${window.location.href}">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
        <style>
            @font-face {
                font-family: 'Khmer OS Battambang';
                src: url('fonts/KhmerOSBattambang.woff2') format('woff2'),
                     url('fonts/KhmerOSBattambang.ttf') format('truetype');
                font-weight: normal;
                font-style: normal;
            }
            @font-face {
                font-family: 'Khmer OS Battambang';
                src: url('fonts/KhmerOSBattambang.ttf') format('truetype');
                font-weight: bold;
                font-style: normal;
            }
            body { 
                font-family: 'Khmer OS Battambang', sans-serif !important; 
                padding: 20px; 
                color: #333; 
                background: #fff; 
            }
            .header-container { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .logo { width: 90px; height: 90px; object-fit: cover; margin-bottom: 10px; }
            .school-text h1 { margin: 0; font-size: 1.6rem; color: #2c3e50; font-weight: bold; }
            .school-text h2 { margin: 5px 0 0; font-size: 1.1rem; color: #c71585; font-weight: bold; }
            .report-title { text-align: center; margin: 20px 0; }
            .report-title h2 { margin: 0; color: #d63384; text-transform: uppercase; font-size: 1.3rem; text-decoration: underline; }
            .report-subtitle { margin-top: 5px; font-weight: bold; color: #555; }
            .date-info { text-align: right; margin-top: 10px; font-size: 0.9rem; font-style: italic; }
            
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.85rem; }
            th, td { border: 1px solid #444; padding: 8px 4px; text-align: center; vertical-align: middle; }
            th { background-color: #f1f1f1; color: #333; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            
            .text-left { text-align: left !important; padding-left: 8px; }
            .text-right { text-align: right !important; padding-right: 8px; }
            .text-danger { color: #dc3545; }
            
            .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 0.9rem; page-break-inside: avoid; }
            .signature-box { text-align: center; width: 200px; }
            .signature-line { margin-top: 50px; border-top: 1px solid #333; width: 80%; margin-left: auto; margin-right: auto; }

            /* Buttons */
            .action-bar { margin-bottom: 20px; display: flex; gap: 10px; justify-content: flex-end; }
            .btn { padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer; font-family: inherit; font-weight: bold; display: flex; align-items: center; gap: 8px; text-decoration: none; font-size: 0.9rem; }
            .btn-print { background: #0d6efd; color: white; }
            .btn-close { background: #6c757d; color: white; }
            .btn-close:hover { background: #5a6268; }

            @media print { 
                .no-print { display: none !important; } 
                body { padding: 0; }
                table { page-break-inside: auto; }
                tr { page-break-inside: avoid; page-break-after: auto; }
            }
        </style></head><body>
        
        <div class="action-bar no-print">
            <a href="data-tracking.html" class="btn btn-close" onclick="window.close(); return false;">
                <i class="fi fi-rr-arrow-left"></i> ត្រឡប់ទៅផ្ទាំងដើម
            </a>
            <button class="btn btn-print" onclick="window.print()">
                <i class="fi fi-rr-print"></i> បោះពុម្ពឯកសារ
            </button>
        </div>

        <div class="header-container">
            <img src="img/logo.jpg" class="logo" onerror="this.src='img/1.jpg'">
            <div class="school-text">
                <h1>សាលាអន្តរជាតិ ធានស៊ីន</h1>
                <h2>TIAN XIN INTERNATIONAL SCHOOL</h2>
            </div>
            <div class="report-title">
                <h2>${title}</h2>
                ${subtitle ? `<div class="report-subtitle">${subtitle}</div>` : ''}
            </div>
            <div class="date-info">
                កាលបរិច្ឆេទបញ្ចេញ: ${new Date().toLocaleDateString('en-GB')}
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th width="4%">ល.រ</th>
                    <th width="8%">អត្តលេខ</th>
                    <th width="15%">ឈ្មោះសិស្ស</th>
                    <th width="5%">ភេទ</th>
                    <th width="10%">លេខទូរស័ព្ទ</th>
                    <th width="8%">កំរិតសិក្សា</th>
                    <th width="8%">ម៉ោងសិក្សា</th>
                    <th width="8%">ថ្ងៃចុះឈ្មោះ</th>
                    <th width="8%">ថ្ងៃកំណត់</th>
                    <th width="12%">គ្រូបន្ទុកថ្នាក់</th>
                    <th width="8%">ស្ថានភាព</th>
                     <th width="8%">ទឹកប្រាក់ខ្វះ</th>
                </tr>
            </thead>
            <tbody>`;

    students.forEach((s, index) => {
        const statusObj = getPaymentStatus(s);

        // Date Formatting
        const formatDate = (dateStr) => {
            if (!dateStr) return '-';
            if (dateStr.includes('-')) {
                const d = new Date(dateStr);
                return isNaN(d) ? dateStr : d.toLocaleDateString('en-GB');
            }
            if (dateStr.includes('/')) return dateStr;
            return dateStr;
        };

        html += `<tr>
            <td>${index + 1}</td>
            <td style="font-weight: bold;">${s.displayId}</td>
            <td class="text-left">${s.lastName} ${s.firstName}</td>
            <td>${s.gender === 'Male' ? 'ប្រុស' : 'ស្រី'}</td>
            <td>${s.personalPhone || '-'}</td>
            <td>${s.studyLevel || '-'}</td>
            <td>${s.studyTime || '-'}</td>
            <td>${formatDate(s.startDate)}</td>
            <td>${formatDate(s.nextPaymentDate)}</td>
            <td>${s.teacherName || 'មិនបញ្ជាក់'}</td>
            <td>${statusObj.text}</td>
            <td class="text-right ${calculateRemainingAmount(s) > 0 ? 'text-danger fw-bold' : ''}">$${calculateRemainingAmount(s).toFixed(2)}</td>
        </tr>`;
    });

    html += `
            <tr style="background-color: #f0f0f0; font-weight: bold;">
                <td colspan="11" class="text-right">សរុបទឹកប្រាក់ដែលនៅខ្វះ (Total Outstanding):</td>
                <td class="text-danger text-right">$${totalDueAmount.toFixed(2)}</td>
            </tr>
            </tbody>
        </table>

        <div class="footer">
            <div class="signature-box">
                <p>រៀបចំដោយ</p>
                <div class="signature-line"></div>
                <p>បេឡាករ</p>
            </div>
            <div class="signature-box">
                <p>ត្រួតពិនិត្យដោយ</p>
                <div class="signature-line"></div>
                <p>ប្រធានគណនេយ្យ</p>
            </div>
            <div class="signature-box">
                <p>អនុម័តដោយ</p>
                <div class="signature-line"></div>
                <p>នាយកសាលា</p>
            </div>
        </div>
    </body></html>`;

    win.document.write(html);
    win.document.close();
}

function downloadMonthlyReport(type) {
    const currentYear = new Date().getFullYear();
    const promptMonth = prompt("សូមបញ្ចូលខែ (1-12):", new Date().getMonth() + 1);
    if (!promptMonth) return;

    const promptYear = prompt("សូមបញ្ចូលឆ្នាំ:", currentYear);
    if (!promptYear) return;

    const month = parseInt(promptMonth);
    const year = parseInt(promptYear);

    if (isNaN(month) || isNaN(year) || month < 1 || month > 12) {
        return showAlert('ទិន្នន័យមិនត្រឹមត្រូវ', 'danger');
    }

    const students = Object.values(allStudentsData).filter(s => {
        if (!s.startDate) return false;
        try {
            // Handle YYYY-MM-DD or DD/MM/YYYY
            let d;
            if (s.startDate.includes('/')) {
                const parts = s.startDate.split('/');
                d = new Date(parts[2], parts[1] - 1, parts[0]); // DD/MM/YYYY
            } else {
                d = new Date(s.startDate);
            }
            return d.getMonth() + 1 === month && d.getFullYear() === year;
        } catch (e) { return false; }
    });

    if (students.length === 0) return showAlert(`គ្មានសិស្សចុះឈ្មោះក្នុងខែ ${month}/${year}`, 'info');

    const title = `របាយការណ៍ប្រចាំខែ ${month} ឆ្នាំ ${year}`;
    const subtitle = `សិស្សចុះឈ្មោះថ្មី (New Registrations)`;

    if (type === 'pdf') {
        generateStandardPDF(students, title, subtitle);
    } else {
        exportToExcel(students, `Monthly_Report_${month}_${year}`);
    }
}

function downloadYearlyReport(type) {
    const currentYear = new Date().getFullYear();
    const promptYear = prompt("សូមបញ្ចូលឆ្នាំ:", currentYear);
    if (!promptYear) return;

    const year = parseInt(promptYear);
    if (isNaN(year)) return showAlert('ឆ្នាំមិនត្រឹមត្រូវ', 'danger');

    const students = Object.values(allStudentsData).filter(s => {
        if (!s.startDate) return false;
        try {
            let d;
            if (s.startDate.includes('/')) {
                const parts = s.startDate.split('/');
                d = new Date(parts[2], parts[1] - 1, parts[0]);
            } else {
                d = new Date(s.startDate);
            }
            return d.getFullYear() === year;
        } catch (e) { return false; }
    });

    if (students.length === 0) return showAlert(`គ្មានសិស្សចុះឈ្មោះក្នុងឆ្នាំ ${year}`, 'info');

    const title = `របាយការណ៍ប្រចាំឆ្នាំ ${year}`;
    const subtitle = `សិស្សចុះឈ្មោះថ្មី (New Registrations)`;

    if (type === 'pdf') {
        generateStandardPDF(students, title, subtitle);
    } else {
        exportToExcel(students, `Yearly_Report_${year}`);
    }
}

function generateDetailedAlertReport() {
    const students = Object.values(allStudentsData).filter(s => ['overdue', 'warning'].includes(getPaymentStatus(s).status) && calculateRemainingAmount(s) > 0);
    if (students.length === 0) return showAlert('គ្មានសិស្សត្រូវជូនដំណឹង', 'info');

    // Sort by class or level if possible, otherwise DB order
    students.sort((a, b) => (a.studyLevel || '').localeCompare(b.studyLevel || ''));

    let totalDueAmount = 0;
    students.forEach(s => totalDueAmount += calculateRemainingAmount(s));

    let win = window.open('', '_blank');
    let html = `<html><head><title>របាយការណ៍សិស្សហួសកំណត់</title>
        <base href="${window.location.href}">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
        <style>
            @font-face {
                font-family: 'Khmer OS Battambang';
                src: url('fonts/KhmerOSBattambang.woff2') format('woff2'),
                    url('fonts/KhmerOSBattambang.ttf') format('truetype');
                font-weight: normal;
                font-style: normal;
            }
            @font-face {
                font-family: 'Khmer OS Battambang';
                src: url('fonts/KhmerOSBattambang.ttf') format('truetype');
                font-weight: bold;
                font-style: normal;
            }
            body { 
                font-family: 'Khmer OS Battambang', sans-serif !important; 
                padding: 20px; 
                color: #333; 
                background: #fff; 
            }
            .header-container { text-align: center; margin-bottom: 20px; }
            .logo { width: 100px; height: 100px; object-fit: cover; margin-bottom: 15px; }
            .school-text h1 { margin: 0; font-size: 1.8rem; color: #2c3e50; font-weight: bold; font-family: 'Khmer OS Battambang', sans-serif; }
            .school-text h2 { margin: 5px 0 0; font-size: 1.2rem; color: #c71585; font-weight: bold; }
            .report-title { text-align: center; margin: 20px 0; }
            .report-title h2 { margin: 0; color: #d63384; text-transform: uppercase; font-size: 1.4rem; text-decoration: underline; }
            .date-info { text-align: center; margin-top: 10px; font-weight: bold; font-size: 1rem; }
            
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 0.95rem; }
            th, td { border: 1px solid #333; padding: 10px 8px; text-align: center; vertical-align: middle; }
            th { background-color: #f1f1f1; color: #333; font-weight: bold; }
            tr:nth-child(even) { background-color: #fafafa; }
            
            .text-danger { color: #dc3545; font-weight: bold; }
            .text-left { text-align: left !important; padding-left: 15px; }
            .text-right { text-align: right !important; padding-right: 15px; }
            
            .footer { margin-top: 50px; display: flex; justify-content: space-between; font-size: 0.9rem; page-break-inside: avoid; }
            .signature-box { text-align: center; width: 200px; }
            .signature-line { margin-top: 60px; border-top: 1px solid #333; width: 80%; margin-left: auto; margin-right: auto; }
            
            /* Buttons */
            .action-bar { margin-bottom: 20px; display: flex; gap: 10px; justify-content: flex-end; }
            .btn { padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer; font-family: inherit; font-weight: bold; display: flex; align-items: center; gap: 8px; text-decoration: none; font-size: 0.9rem; }
            .btn-print { background: #0d6efd; color: white; }
            .btn-close { background: #6c757d; color: white; }
            .btn-close:hover { background: #5a6268; }
            
            @media print { 
                .no-print { display: none !important; } 
                body { padding: 0; }
                table { box-shadow: none; }
            }
        </style></head><body>
        
        <div class="action-bar no-print">
            <a href="data-tracking.html" class="btn btn-close" onclick="window.close(); return false;">
                <i class="fi fi-rr-arrow-left"></i> ត្រឡប់ទៅផ្ទាំងដើម
            </a>
            <button class="btn btn-print" onclick="window.print()">
                <i class="fi fi-rr-print"></i> បោះពុម្ពឯកសារ
            </button>
        </div>

        <div class="header-container">
            <img src="img/logo.jpg" class="logo" onerror="this.src='img/1.jpg'">
            <div class="school-text">
                <h1>សាលាអន្តរជាតិ ធានស៊ីន</h1>
                <h2>TIAN XIN INTERNATIONAL SCHOOL</h2>
            </div>
            <div class="report-title">
                <h2>របាយការណ៍សិស្សហួសកំណត់បង់ប្រាក់</h2>
            </div>
            <div class="date-info">
                កាលបរិច្ឆេទ: ${new Date().toLocaleDateString('en-GB')}
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th width="4%">ល.រ</th>
                    <th width="7%">អត្តលេខ</th>
                    <th width="12%">ឈ្មោះសិស្ស</th>
                    <th width="4%">ភេទ</th>
                    <th width="8%">លេខទូរស័ព្ទ</th>
                    <th width="7%">កំរិតសិក្សា</th>
                    <th width="7%">ម៉ោងសិក្សា</th>
                    <th width="7%">ថ្ងៃចុះឈ្មោះ</th>
                    <th width="7%">ថ្ងៃកំណត់</th>
                    <th width="6%">ចំនួនខែ</th>
                    <th width="10%">គ្រូបន្ទុកថ្នាក់</th>
                    <th width="10%">ចំនួនថ្ងៃ</th>
                    <th width="9%">ទឹកប្រាក់ខ្វះ</th>
                </tr>
            </thead>
            <tbody>`;

    students.forEach((s, index) => {
        const statusObj = getPaymentStatus(s);
        const daysOverdue = statusObj.daysRemaining ? Math.abs(statusObj.daysRemaining) + ' ថ្ងៃ' : '-';
        // Helper to format date string DD/MM/YYYY to proper Text
        const formatDate = (dateStr) => {
            if (!dateStr) return '-';
            // If already ISO like YYYY-MM-DD
            if (dateStr.includes('-')) {
                const d = new Date(dateStr);
                return isNaN(d) ? dateStr : d.toLocaleDateString('en-GB');
            }
            // If DD/MM/YYYY
            if (dateStr.includes('/')) {
                // Assuming it is stored as DD/MM/YYYY
                return dateStr;
            }
            return dateStr;
        };

        const regDate = formatDate(s.startDate);
        const dueDate = formatDate(s.nextPaymentDate);

        html += `<tr>
            <td>${index + 1}</td>
            <td style="font-weight: bold;">${s.displayId}</td>
            <td class="text-left">${s.lastName} ${s.firstName}</td>
            <td>${s.gender === 'Male' ? 'ប្រុស' : 'ស្រី'}</td>
            <td>${s.personalPhone || '-'}</td>
            <td>${s.studyLevel || '-'}</td>
            <td>${s.studyTime || '-'}</td>
            <td>${regDate}</td>
            <td>${dueDate}</td>
            <td>${s.paymentMonths || '-'} ខែ</td>
            <td>${s.teacherName || 'មិនបញ្ជាក់'}</td>
            <td class="text-danger">${daysOverdue}</td>
            <td class="text-danger text-right">$${calculateRemainingAmount(s).toFixed(2)}</td>
        </tr>`;
    });

    html += `
            <tr style="background-color: #ffe6e6;">
                <td colspan="8" class="text-right" style="font-weight: bold; font-size: 1.1rem; padding-right: 20px;">សរុបទឹកប្រាក់ដែលនៅខ្វះ (Grand Total):</td>
                <td class="text-danger text-right" style="font-weight: bold; font-size: 1.1rem;">$${totalDueAmount.toFixed(2)}</td>
            </tr>
            </tbody>
        </table>

        <div class="footer">
            <div class="signature-box">
                <p>រៀបចំដោយ</p>
                <div class="signature-line"></div>
                <p>បេឡាករ</p>
            </div>
            <div class="signature-box">
                <p>ត្រួតពិនិត្យដោយ</p>
                <div class="signature-line"></div>
                <p>ប្រធានគណនេយ្យ</p>
            </div>
            <div class="signature-box">
                <p>អនុម័តដោយ</p>
                <div class="signature-line"></div>
                <p>នាយកសាលា</p>
            </div>
        </div>
    </body></html>`;

    win.document.write(html);
    win.document.close();
}

function generateMonthlyReport() {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    const monthlyStudents = Object.values(allStudentsData).filter(student => {
        if (!student.startDate || student.startDate === 'មិនមាន') return false;
        try {
            const engStartDate = convertToEnglishDate(student.startDate);
            if (!engStartDate) return false;
            const dateParts = engStartDate.split('/');
            return parseInt(dateParts[0]) === currentMonth && parseInt(dateParts[2]) === currentYear;
        } catch (e) { return false; }
    });

    if (monthlyStudents.length === 0) {
        return showAlert('គ្មានទិន្នន័យសិស្សចុះឈ្មោះក្នុងខែនេះទេ', 'info');
    }

    monthlyStudents.sort((a, b) => (parseInt(a.displayId) || 0) - (parseInt(b.displayId) || 0));

    let win = window.open('', '_blank');
    let html = `<html><head><title>របាយការណ៍ប្រចាំខែ</title>
        <base href="${window.location.href}">
        <style>
            @font-face {
                font-family: 'Khmer OS Battambang';
                src: url('fonts/KhmerOSBattambang.ttf') format('truetype');
            }
            body { font-family: 'Khmer OS Battambang', sans-serif; padding: 40px; color: #333; }
            .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 30px; border-bottom: 3px solid #3498db; padding-bottom: 20px; }
            .school-info { display: flex; align-items: center; gap: 20px; }
            .logo { width: 80px; height: 80px; object-fit: cover; border-radius: 10px; border: 2px solid #3498db; }
            .school-name h2 { margin: 0; color: #2980b9; }
            .school-name p { margin: 5px 0 0; font-size: 0.9rem; color: #666; }
            .report-title { text-align: center; margin: 30px 0; }
            .report-title h1 { color: #2980b9; font-size: 1.8rem; text-decoration: underline; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
            th, td { border: 1px solid #dee2e6; padding: 12px; text-align: center; }
            th { background: linear-gradient(135deg, #3498db, #2980b9); color: white; }
            tr:nth-child(even) { background-color: #fcfcfc; }
            .footer { margin-top: 50px; text-align: right; font-style: italic; font-size: 0.9rem; }
            @media print { .no-print { display: none; } }
        </style></head><body>`;

    html += `
        <div class="header">
            <div class="school-info">
                <img src="img/1.jpg" class="logo">
                <div class="school-name">
                    <h2>សាលាអន្តរជាតិ (International School)</h2>
                    <p>របាយការណ៍សិស្សចុះឈ្មោះថ្មីប្រចាំខែ</p>
                </div>
            </div>
            <div class="date-info">
                <p>ខែ: ${currentMonth}/${currentYear}</p>
                <button class="no-print" onclick="window.print()" style="padding: 8px 20px; background: #2980b9; color: white; border: none; border-radius: 5px; cursor: pointer;">បោះពុម្ព</button>
            </div>
        </div>
        <div class="report-title">
            <h1>របាយការណ៍សិស្សចុះឈ្មោះថ្មីប្រចាំខែ ${currentMonth} ឆ្នាំ ${currentYear}</h1>
        </div>
        <table>
            <thead>
                <tr>
                    <th>អត្តលេខ</th>
                    <th>ឈ្មោះសិស្ស</th>
                    <th>ថ្ងៃចុះឈ្មោះ</th>
                    <th>តម្លៃសិក្សាសរុប ($)</th>
                </tr>
            </thead>
            <tbody>`;

    monthlyStudents.forEach(s => {
        html += `<tr>
            <td style="font-weight: bold; color: #2980b9;">${s.displayId}</td>
            <td>${s.lastName} ${s.firstName}</td>
            <td>${s.startDate}</td>
            <td style="font-weight: bold;">$${calculateTotalAmount(s).toFixed(2)}</td>
        </tr>`;
    });

    html += `</tbody></table>
        <div class="footer">
            <p>បោះពុម្ពដោយប្រព័ន្ធគ្រប់គ្រងសាលា នៅថ្ងៃទី ${new Date().toLocaleString('km-KH')}</p>
        </div>
    </body></html>`;

    win.document.write(html);
    win.document.close();
}

function checkAllPayments() {
    if (!allStudentsData || Object.keys(allStudentsData).length === 0) {
        showAlert('គ្មានទិន្នន័យសិស្សទេ', 'info');
        return;
    }

    let warningCount = 0;
    let overdueCount = 0;
    let totalDue = 0;

    Object.values(allStudentsData).forEach(student => {
        const paymentStatus = getPaymentStatus(student);
        if (paymentStatus.status === 'warning') {
            warningCount++;
            totalDue += calculateRemainingAmount(student);
        } else if (paymentStatus.status === 'overdue') {
            overdueCount++;
            totalDue += calculateRemainingAmount(student);
        }
    });

    const totalAlerts = warningCount + overdueCount;

    if (totalAlerts > 0) {
        showAlert(`ការពិនិត្យ៖ ${overdueCount} នាក់ហួសកំណត់, ${warningCount} នាក់ជិតដល់កំណត់ | សរុបទឹកប្រាក់ខ្វះ: $${totalDue.toFixed(2)}`, 'warning', 8000);
    } else {
        showAlert('គ្មានសិស្សហួសកំណត់ ឬជិតដល់កំណត់ទេ', 'success');
    }
}

// ----------------------------------------------------
// Init
// ----------------------------------------------------

$(document).ready(function () {
    loadStudentData();

    // Notification Panel Toggle
    $('#notificationsBtn').on('click', (e) => {
        e.stopPropagation();
        $('#alertPanel').toggleClass('show');
    });
    $(document).on('click', () => $('#alertPanel').removeClass('show'));

    // Button Actions
    $(document).on('click', '.edit-btn', function (e) { e.stopPropagation(); showEditModal($(this).data('key')); });
    $(document).on('click', '.delete-btn', function (e) { e.stopPropagation(); deleteStudent($(this).data('key'), $(this).data('display-id')); });
    $(document).on('click', '.mark-paid-btn', function (e) { e.stopPropagation(); markAsPaid($(this).data('key')); });

    // Report/Export Buttons
    $('#exportExcelBtn').on('click', exportToExcel);
    $('#exportPDFBtn').on('click', generateDetailedAlertReport);

    // Filter Listeners
    $('#searchName').on('input', function () { currentFilters.searchName = $(this).val(); renderFilteredTable(); });
    $('#filterStatus').on('change', function () { currentFilters.status = $(this).val(); renderFilteredTable(); });
    $('#filterTime').on('change', function () { currentFilters.filterTime = $(this).val(); renderFilteredTable(); });
    $('#filterLevel').on('change', function () { currentFilters.filterLevel = $(this).val(); renderFilteredTable(); });
    $('#filterGender').on('change', function () { currentFilters.gender = $(this).val(); renderFilteredTable(); });
    $('#startDateFilter').on('change', function () { currentFilters.startDate = $(this).val(); renderFilteredTable(); });
    $('#endDateFilter').on('change', function () { currentFilters.endDate = $(this).val(); renderFilteredTable(); });

    $('#clearFiltersBtn').on('click', function () {
        currentFilters = {
            searchName: '',
            status: 'all',
            filterTime: 'all',
            filterLevel: 'all',
            gender: 'all',
            startDate: '',
            endDate: ''
        };
        $('#searchName').val('');
        $('#filterStatus').val('all');
        $('#filterTime').val('all');
        $('#filterLevel').val('all');
        $('#filterGender').val('all');
        $('#startDateFilter').val('');
        $('#endDateFilter').val('');
        renderFilteredTable();
        showAlert('បានសម្អាតការស្វែងរក', 'info');
    });

    // Quick search focus (Ctrl+F)
    $(document).on('keydown', (e) => {
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            $('#searchName').focus();
        }
    });

    console.log('✅ Data Tracking System Successfully Loaded');


    /**
 * POS Receipt Preview Function
 * Shows the receipt in a modal for user to review before printing (A5 Size)
 */
    function printPOSReceipt(studentKey) {
        const s = allStudentsData[studentKey];
        if (!s) return;

        const exchangeRate = 4100;
        const totalUSD = calculateTotalAmount(s);
        const totalKHR = totalUSD * exchangeRate;
        const paidUSD = calculateTotalPaid(s);
        const remainingUSD = calculateRemainingAmount(s);

        const receiptDate = new Date().toLocaleString("km-KH", {
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit"
        });

        const googleMapsUrl = "https://maps.app.goo.gl/PfPwVquPbs7k4sHb6";
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(googleMapsUrl)}`;

        const receiptContent = `
        <div class="pos-receipt-paper">
            <!-- Header Section -->
            <div style="display: flex; align-items: start; border-bottom: 2px solid #d63384; padding-bottom: 10px; margin-bottom: 10px;">
                <div style="flex: 0.8;">
                    <img src="img/1.jpg" class="receipt-logo-small" onerror="this.src='img/logo.jpg'" style="width: 32mm; height: auto;">
                </div>
                <div style="flex: 3; text-align: center;">
                    <div class="school-name-kh" style="font-size: 24px; font-weight: bold; color: #d63384; line-height: 1.2;">សាលាអន្តរជាតិ ធាន ស៊ីន</div>
                    <div class="school-name-en" style="font-size: 16px; font-weight: bold; color: #0d6efd; letter-spacing: 1px;">TIAN XIN INTERNATIONAL SCHOOL</div>
                    <div class="contact-info" style="font-size: 11px; margin-top: 5px; color: #333;">
                        សាខាទី២ ភូមិក្រាំង សង្កាត់ក្រាំងអំពិល ក្រុងកំពត ខេត្តកំពត<br>
                        ទូរស័ព្ទ៖ 093 83 56 78
                    </div>
                </div>
                <div style="flex: 1; text-align: right;">
                    <div style="background-color: #d63384; color: white; padding: 5px 15px; border-radius: 5px; display: inline-block;">
                        <div style="font-size: 18px; font-weight: bold;">វិក្កយបត្រ</div>
                        <div style="font-size: 12px;">RECEIPT</div>
                    </div>
                    <div style="font-size: 11px; margin-top: 5px; font-weight: bold;">លេខ / No: ${s.displayId}</div>
                </div>
            </div>

            <!-- Content Grid -->
            <div style="display: flex; gap: 20px;">
                <!-- Left Column: Student Details -->
                <div style="flex: 1; border-right: 1px solid #eee; padding-right: 15px;">
                    <div style="font-weight: bold; font-size: 14px; border-bottom: 1px solid #d63384; margin-bottom: 8px; color: #d63384;">ព័ត៌មានសិស្ស / Student Info</div>
                    <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                        <tr><td style="padding: 4px 0;">ឈ្មោះ / Name:</td><td class="fw-bold text-end">${s.lastName} ${s.firstName} ${s.chineseLastName || ''}${s.chineseFirstName || '' ? ' (' + s.chineseLastName + s.chineseFirstName + ')' : ''}</td></tr>
                        <tr><td style="padding: 4px 0;">អត្តលេខ / ID:</td><td class="fw-bold text-end">${s.displayId}</td></tr>
                        <tr><td style="padding: 4px 0;">កម្រិត / Level:</td><td class="text-end">${s.studyLevel || 'N/A'}</td></tr>
                        <tr><td style="padding: 4px 0;">ម៉ោងសិក្សា / Time:</td><td class="text-end">${s.studyTime || 'N/A'}</td></tr>
                        <tr><td style="padding: 4px 0;">ថ្ងៃចូលរៀន / Start:</td><td class="fw-bold text-end text-primary">${s.startDate || '-'}</td></tr>
                        <tr><td style="padding: 4px 0; color: #d63384; font-weight: bold;">ថ្ងៃកំណត់បង់ / Due Date:</td><td class="fw-bold text-end text-danger" style="font-size: 13px;">${s.paymentDueDate || '-'}</td></tr>
                    </table>
                </div>

                <!-- Right Column: Payment Details -->
                <div style="flex: 1.5;">
                    <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 2px solid #333; background-color: #f8f9fa;">
                                <th style="padding: 8px; text-align: left;">បរិយាយ / Description</th>
                                <th style="padding: 8px; text-align: right;">តម្លៃ / Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td style="padding: 5px 8px;">ថ្លៃសិក្សា / Tuition Fee</td><td style="text-align: right; padding: 5px 8px;">$${(parseFloat(s.tuitionFee) || 0).toFixed(2)}</td></tr>
                            ${s.registrationFee > 0 ? `<tr><td style="padding: 5px 8px;">ថ្លៃចុះឈ្មោះ / Registration</td><td style="text-align: right; padding: 5px 8px;">$${s.registrationFee.toFixed(2)}</td></tr>` : ''}
                            ${s.bookFee > 0 ? `<tr><td style="padding: 5px 8px;">ថ្លៃសៀវភៅ / Book Fee</td><td style="text-align: right; padding: 5px 8px;">$${s.bookFee.toFixed(2)}</td></tr>` : ''}
                            ${s.fulltimeBookFee > 0 ? `<tr><td style="padding: 5px 8px;">ថ្លៃសៀវភៅពេញម៉ោង / FT Book</td><td style="text-align: right; padding: 5px 8px;">$${s.fulltimeBookFee.toFixed(2)}</td></tr>` : ''}
                            ${s.uniformFee > 0 ? `<tr><td style="padding: 5px 8px;">ថ្លៃឯកសណ្ឋាន / Uniform</td><td style="text-align: right; padding: 5px 8px;">$${s.uniformFee.toFixed(2)}</td></tr>` : ''}
                            ${s.idCardFee > 0 ? `<tr><td style="padding: 5px 8px;">ថ្លៃកាតសិស្ស / ID Card</td><td style="text-align: right; padding: 5px 8px;">$${s.idCardFee.toFixed(2)}</td></tr>` : ''}
                            ${s.adminFee > 0 ? `<tr><td style="padding: 5px 8px;">ថ្លៃរដ្ឋបាល / Admin Fee</td><td style="text-align: right; padding: 5px 8px;">$${s.adminFee.toFixed(2)}</td></tr>` : ''}
                            ${s.adminServicesFee > 0 ? `<tr><td style="padding: 5px 8px;">សេវារដ្ឋបាល / Admin Service</td><td style="text-align: right; padding: 5px 8px;">$${s.adminServicesFee.toFixed(2)}</td></tr>` : ''}
                            
                            ${s.discountPercent > 0 ? `<tr style="color: #dc3545; font-style: italic;"><td style="padding: 5px 8px;">បញ្ចុះតម្លៃ (${s.discountPercent}%) / Scholarship</td><td style="text-align: right; padding: 5px 8px;">-$${(s.tuitionFee * s.discountPercent / 100).toFixed(2)}</td></tr>` : ''}
                            ${s.discount > 0 ? `<tr style="color: #dc3545; font-style: italic;"><td style="padding: 5px 8px;">បញ្ចុះតម្លៃបន្ថែម / Other Discount</td><td style="text-align: right; padding: 5px 8px;">-$${parseFloat(s.discount).toFixed(2)}</td></tr>` : ''}
                        </tbody>
                        <tfoot>
                            <tr style="border-top: 1.5px solid #333; font-weight: bold; background-color: #f8f9fa;">
                                <td style="padding: 8px;">សរុបរួម / TOTAL:</td>
                                <td style="text-align: right; padding: 8px; font-size: 14px;">$${totalUSD.toFixed(2)}</td>
                            </tr>
                            <tr style="font-weight: bold; color: #198754;">
                                <td style="padding: 5px 8px;">បានបង់ / PAID:</td>
                                <td style="text-align: right; padding: 5px 8px;">$${paidUSD.toFixed(2)}</td>
                            </tr>
                            <tr style="font-weight: bold; color: #dc3545; border-top: 1px solid #eee;">
                                <td style="padding: 5px 8px; font-size: 15px;">នៅខ្វះ / BALANCE:</td>
                                <td style="text-align: right; padding: 5px 8px; font-size: 16px;">$${remainingUSD.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <!-- Footer Section -->
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 15px;">
                <div style="text-align: center; width: 100px;">
                    <img src="${qrCodeUrl}" style="width: 70px; height: 70px; border: 1px solid #ddd; padding: 3px; background: white; display: block !important; visibility: visible !important; margin: 0 auto;">
                    <div style="font-size: 9px; margin-top: 5px; font-weight: bold;">ស្កេនទីតាំងសាលា</div>
                </div>
                
                <div style="text-align: center; flex: 1;">
                    <div style="font-size: 14px; font-weight: bold; color: #333;">សូមអរគុណ! / THANK YOU!</div>
                    <div style="font-size: 10px; color: #666; margin-bottom: 5px;">ទំនិញ/សេវាកម្មដែលបានទិញរួចមិនអាចប្តូរវិញបានទេ</div>
                    <div style="font-size: 9px; color: #999; font-style: italic; border-top: 1px dashed #ccc; padding-top: 3px; display: inline-block;">
                        បោះពុម្ពនៅ៖ ${receiptDate}
                    </div>
                </div>

                <div style="text-align: center; width: 200px;">
                    <table style="width: 100%; font-size: 11px;">
                        <tr>
                            <td style="text-align: center; padding-bottom: 40px; font-weight: bold;">អ្នកបង់ប្រាក់ / Payer</td>
                            <td style="text-align: center; padding-bottom: 40px; font-weight: bold;">អ្នកទទួល / Receiver</td>
                        </tr>
                        <tr>
                            <td style="text-align: center;"><div style="border-top: 1px solid #333; width: 80px; margin: 0 auto;"></div></td>
                            <td style="text-align: center;"><div style="border-top: 1px solid #333; width: 80px; margin: 0 auto;"></div></td>
                        </tr>
                    </table>
                </div>
            </div>
            
            <div style="position: absolute; bottom: 5mm; left: 0; right: 0; text-align: center; font-size: 9px; color: #aaa;">
                System Powered by: Tian Xin International School
            </div>
        </div>
        `;

        const modalContent = document.getElementById('posReceiptModalContent');
        if (modalContent) {
            modalContent.innerHTML = receiptContent;
            const posModal = new bootstrap.Modal(document.getElementById('posReceiptModal'));
            posModal.show();
        }
    }

    /**
     * Triggers browser print for the receipt modal
     */
    function printModalReceipt() {
        window.print();
    }

    // Make functions globally accessible for HTML onclick attributes
    window.viewStudentDetails = viewStudentDetails;
    window.showEditModal = showEditModal;
    window.saveStudentChanges = saveStudentChanges;
    window.deleteStudent = deleteStudent;
    window.markAsPaid = markAsPaid;
    window.printPOSReceipt = printPOSReceipt;
    window.printModalReceipt = printModalReceipt;
    window.generateMonthlyReport = generateMonthlyReport;
    window.generateDetailedAlertReport = generateDetailedAlertReport;
    window.checkAllPayments = checkAllPayments;
    window.exportToExcel = exportToExcel;
    window.downloadMonthlyReport = downloadMonthlyReport;
    window.downloadYearlyReport = downloadYearlyReport;
    window.exportOverdueReport = exportOverdueReport;
});