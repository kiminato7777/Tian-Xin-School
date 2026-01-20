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
    endDate: '',
    filterClassTeacher: 'all'
};

// ----------------------------------------------------
// Utility Functions
// ----------------------------------------------------

window.SHOW_FINISHED_REPORT = false;

window.toggleFinishedReport = () => {
    window.SHOW_FINISHED_REPORT = !window.SHOW_FINISHED_REPORT;
    window.SHOW_OVERDUE_REPORT = false; // Disable others
    window.SHOW_DROPOUTS = false;

    // Update button state (optional visual feedback)
    const btn = document.querySelector('button[onclick="toggleFinishedReport()"]');
    if (btn) {
        if (window.SHOW_FINISHED_REPORT) btn.classList.add('active', 'border-white');
        else btn.classList.remove('active', 'border-white');
    }

    renderFilteredTable();
};


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
        // 1. Name Search (Moved to Top Priority)
        if (currentFilters.searchName) {
            const rawTerm = currentFilters.searchName.toLowerCase().trim();
            if (rawTerm) {
                // Tokenize search term
                // Tokenize search term
                const tokens = rawTerm.split(/\s+/);

                // Construct a comprehensive searchable string
                // We purposefully duplicate some fields in different formats (e.g. phones with/without spaces)
                const searchableText = [
                    // Identifiers
                    s.displayId || '',

                    // Khmer Names
                    s.lastName || '',
                    s.firstName || '',
                    `${s.lastName || ''}${s.firstName || ''}`, // Joined
                    `${s.lastName || ''} ${s.firstName || ''}`, // With Space

                    // Chinese Names
                    s.chineseLastName || '',
                    s.chineseFirstName || '',
                    `${s.chineseLastName || ''}${s.chineseFirstName || ''}`, // Joined

                    // English Names
                    s.englishLastName || '',
                    s.englishFirstName || '',
                    s.englishName || '',
                    `${s.englishLastName || ''}${s.englishFirstName || ''}`,
                    `${s.englishLastName || ''} ${s.englishFirstName || ''}`,

                    // Phones (Original and Stripped)
                    s.personalPhone || '',
                    (s.personalPhone || '').replace(/\D/g, ''), // Numbers only
                    s.parentsPhone || '',
                    (s.parentsPhone || '').replace(/\D/g, ''), // Numbers only

                    // Academic Info (Allows searching by "Level 1" or "Ms. Dara")
                    s.studyLevel || '',
                    s.studyTime || '',
                    s.teacherName || ''
                ].join(' ').toLowerCase();

                // Check if ALL tokens are present in the searchable text
                const matchesAll = tokens.every(token => searchableText.includes(token));

                if (!matchesAll) return false;
            }
        }

        // 0. Enrollment Status Filter (Global Flag)
        const isDropout = s.enrollmentStatus === 'dropout';
        if (window.SHOW_DROPOUTS) {
            if (!isDropout) return false;
        } else {
            if (isDropout) return false;
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

        // 5.1 Class Teacher Filter
        if (currentFilters.filterClassTeacher !== 'all') {
            const sTeacher = (s.teacherName || '').trim();
            if (sTeacher !== currentFilters.filterClassTeacher) return false;
        }

        // 6. Date Range Filter
        if (currentFilters.startDate || currentFilters.endDate) {
            let studentDate;

            if (window.SHOW_DROPOUTS) {
                // For Dropouts, filter by dropoutDate or lastUpdated
                const dStr = s.dropoutDate || s.lastUpdated;
                if (dStr) {
                    // Try standard Date parsing first as dropoutDate is usually ISO
                    const d = new Date(dStr);
                    if (!isNaN(d.getTime())) {
                        studentDate = d;
                    } else {
                        studentDate = getDateObject(dStr);
                    }
                }
            } else {
                studentDate = getDateObject(s.startDate);
            }

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

window.exportDropoutReport = (type) => {
    let studentsToExport = [];
    let title = "";
    let subtitle = "";

    if (type === 'range') {
        const startDate = document.getElementById('dropoutReportStartDate').value;
        const endDate = document.getElementById('dropoutReportEndDate').value;

        if (!startDate || !endDate) {
            return showAlert("សូមជ្រើសរើសកាលបរិច្ឆេទចាប់ផ្តើម និងបញ្ចប់ (Please select start and end date)", 'warning');
        }

        if (startDate > endDate) {
            return showAlert("កាលបរិច្ឆេទចាប់ផ្តើមមិនអាចធំជាងកាលបរិច្ឆេទបញ្ចប់ទេ", 'warning');
        }

        studentsToExport = rawStudentsArray.filter(s => {
            if (s.enrollmentStatus !== 'dropout') return false;
            const dStr = s.dropoutDate || s.lastUpdated;
            if (!dStr) return false;
            const d = new Date(dStr);
            if (isNaN(d.getTime())) return false;

            const itemDate = d.toISOString().split('T')[0];
            return itemDate >= startDate && itemDate <= endDate;
        });

        title = "របាយការណ៍សិស្សបោះបង់ការសិក្សា";
        subtitle = `ចន្លោះថ្ងៃទី ${formatDate(startDate)} ដល់ ${formatDate(endDate)}`;

    } else if (type === 'monthly') {
        const currentYear = new Date().getFullYear();
        const promptMonth = prompt("សូមបញ្ចូលខែ (1-12):", new Date().getMonth() + 1);
        if (!promptMonth) return;
        const month = parseInt(promptMonth);

        const promptYear = prompt("សូមបញ្ចូលឆ្នាំ:", currentYear);
        if (!promptYear) return;
        const year = parseInt(promptYear);

        studentsToExport = rawStudentsArray.filter(s => {
            if (s.enrollmentStatus !== 'dropout') return false;
            const dStr = s.dropoutDate || s.lastUpdated;
            if (!dStr) return false;
            const d = new Date(dStr);
            return !isNaN(d.getTime()) && (d.getMonth() + 1) === month && d.getFullYear() === year;
        });

        const khmerMonthsLocal = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];
        title = `របាយការណ៍សិស្សបោះបង់ការសិក្សាខែ ${khmerMonthsLocal[month - 1]} ឆ្នាំ ${year}`;

    } else if (type === 'yearly') {
        const currentYear = new Date().getFullYear();
        const promptYear = prompt("សូមបញ្ចូលឆ្នាំ:", currentYear);
        if (!promptYear) return;
        const year = parseInt(promptYear);

        studentsToExport = rawStudentsArray.filter(s => {
            if (s.enrollmentStatus !== 'dropout') return false;
            const dStr = s.dropoutDate || s.lastUpdated;
            if (!dStr) return false;
            const d = new Date(dStr);
            return !isNaN(d.getTime()) && d.getFullYear() === year;
        });

        title = `របាយការណ៍សិស្សបោះបង់ការសិក្សាប្រចាំឆ្នាំ ${year}`;
    }

    if (studentsToExport.length === 0) {
        return showAlert("មិនមានទិន្នន័យសិស្សបោះបង់ការសិក្សាក្នុងចន្លោះនេះទេ", 'info');
    }

    generateStudentListPDF(studentsToExport, title, subtitle);
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
    if (isLoading) {
        if (window.showUniversalLoader) window.showUniversalLoader();
    } else {
        if (window.hideUniversalLoader) window.hideUniversalLoader();
    }
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

                    // Check for Level 4 + Due Date Reached (Today or Overdue)
                    const levelStr = student.studyLevel || '';
                    const isLevel4 = levelStr.includes('4') || levelStr.includes('៤');

                    if (daysDiff <= 0 && isLevel4) {
                        return { text: '🎓 បញ្ចប់ការសិក្សា', badge: 'status-finished', status: 'finished', daysRemaining: daysDiff };
                    }

                    // Overdue (Date passed)
                    if (daysDiff < 0) {
                        return { text: `❌ ហួសកំណត់ (${Math.abs(daysDiff)} ថ្ងៃ)`, badge: 'status-overdue', status: 'overdue', daysRemaining: daysDiff };
                    }

                    // TODAY (Strictly 0 days)
                    if (daysDiff === 0) {
                        return { text: '📅 ត្រូវបង់ថ្ងៃនេះ', badge: 'status-today', status: 'today', daysRemaining: 0 };
                    }

                    // Warning (Tomorrow - 10 days)
                    if (daysDiff > 0 && daysDiff <= 10) {
                        return { text: `⏳ ជិតដល់ថ្ងៃ (${daysDiff} ថ្ងៃ)`, badge: 'status-warning', status: 'warning', daysRemaining: daysDiff };
                    }
                }
            }
        }
    }

    // 2. Check Financial Status
    const remainingAmount = calculateRemainingAmount(student);
    if (remainingAmount <= 0) return { text: '✅ បង់រួច', badge: 'status-paid', status: 'paid', daysRemaining: daysDiff };

    // 3. Fallback for Overdue if debt exists (or just generic unpaid)
    // This fallback is less likely to be hit given the change above, but good for safety
    if (daysDiff < 0) {
        return { text: `❌ ហួសកំណត់ (${Math.abs(daysDiff)} ថ្ងៃ)`, badge: 'status-overdue', status: 'overdue', daysRemaining: daysDiff };
    }

    const dbStatus = student.paymentStatus || 'Pending';
    if (['Paid', 'បង់រួច'].includes(dbStatus)) return { text: '✅ បង់រួច', badge: 'status-paid', status: 'paid', daysRemaining: daysDiff };
    if (['Installment', 'Partial', 'នៅជំណាក់'].includes(dbStatus)) return { text: '⏳ នៅជំណាក់', badge: 'status-installment', status: 'installment', daysRemaining: daysDiff };

    return { text: '❌ មិនទាន់បង់', badge: 'status-pending', status: 'pending', daysRemaining: daysDiff };
};

// ----------------------------------------------------
// Date Conversion Functions
// ----------------------------------------------------

const KHMER_MONTHS = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];

const formatKhmerMonthDate = (dateStr) => {
    if (!dateStr || ['N/A', '', 'មិនមាន'].includes(dateStr)) return '';
    try {
        let d = new Date(dateStr);
        if (isNaN(d.getTime())) {
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                d = new Date(parts[2], parts[1] - 1, parts[0]);
            }
        }
        if (isNaN(d.getTime())) return dateStr;
        const day = d.getDate().toString().padStart(2, '0');
        const monthName = KHMER_MONTHS[d.getMonth()];
        const year = d.getFullYear();
        return `${day}-${monthName}-${year}`;
    } catch (e) { return dateStr; }
};

const parseKhmerMonthDate = (khmerStr) => {
    try {
        if (!khmerStr) return new Date().toISOString();
        const parts = khmerStr.split('-');
        if (parts.length !== 3) return khmerStr; // Return original if not matching format

        const day = parseInt(parts[0]);
        const monthIndex = KHMER_MONTHS.indexOf(parts[1]);
        const year = parseInt(parts[2]);

        if (monthIndex === -1) return new Date().toISOString();

        const d = new Date(year, monthIndex, day);
        d.setHours(12, 0, 0, 0);
        return d.toISOString();
    } catch (e) { return new Date().toISOString(); }
};

const getLastPaidAmount = (s) => {
    let lastAmount = parseFloat(s.initialPayment) || 0;

    // If installments exist, take amount of last one
    if (s.installments) {
        let installs = [];
        if (Array.isArray(s.installments)) {
            installs = s.installments;
        } else {
            // Object: ensure we sort by key or date to find the "last" one
            // Firebase keys are chronological if pushed, but if manual keys (0, 1, 2) it works too.
            // Let's sort by keys to be safe.
            const keys = Object.keys(s.installments).sort((a, b) => {
                // Try numeric sort
                if (!isNaN(a) && !isNaN(b)) return Number(a) - Number(b);
                return a.localeCompare(b);
            });
            installs = keys.map(k => s.installments[k]);
        }

        // Iterate and keep the last one that has a real value
        installs.forEach(inst => {
            const amt = parseFloat(inst.amount) || 0;
            if (amt > 0) {
                lastAmount = amt;
            }
        });
    }
    return lastAmount;
};

const getPaidSummaryHtml = (s) => {
    let yearSummary = {}; // { 2024: { list: [], total: 100 } }
    let grandTotal = 0;

    const installs = s.installments ? (Array.isArray(s.installments) ? s.installments : Object.values(s.installments)) : [];
    // Check initial payment too if it's considered a transaction
    if (!s.installments && s.initialPayment > 0 && s.startDate) {
        installs.push({
            date: s.startDate,
            amount: s.initialPayment,
            stage: '1', // Assumption for initial
            months: s.paymentMonths || '1',
            receiver: 'System'
        });
    }

    installs.forEach(inst => {
        if (!inst.date) return;
        let d = new Date(inst.date);
        if (isNaN(d.getTime())) return;

        // Use full year
        let year = d.getFullYear();
        let amt = (parseFloat(inst.amount) || 0);

        if (!yearSummary[year]) yearSummary[year] = { total: 0, list: [] };

        yearSummary[year].list.push(inst);
        yearSummary[year].total += amt;
        grandTotal += amt;
    });

    if (Object.keys(yearSummary).length === 0) return '';

    let html = `<div class="mt-4 pt-3 border-top">
        <h6 class="fw-bold small text-secondary mb-3"><i class="fi fi-rr-time-forward me-1"></i>ប្រវត្តិបង់ប្រាក់សរុប (Summary by Year/Month)</h6>
        <div class="accordion accordion-flush rounded border" id="paymentSummaryAccordion">`;

    // Sort years descending
    Object.keys(yearSummary).sort().reverse().forEach((year, idx) => {
        const yData = yearSummary[year];
        const isExpanded = idx === 0 ? 'show' : ''; // Expand first year by default
        const collapsed = idx === 0 ? '' : 'collapsed';

        // Sort items by date descending (optional, but good for history)
        yData.list.sort((a, b) => new Date(b.date) - new Date(a.date));

        html += `
            <div class="accordion-item">
                <h2 class="accordion-header">
                    <button class="accordion-button ${collapsed} py-2 bg-light small fw-bold" type="button" data-bs-toggle="collapse" data-bs-target="#collapseYear${year}">
                        <div class="d-flex w-100 justify-content-between me-2">
                            <span>ឆ្នាំ ${year}</span>
                            <span class="text-primary">$${yData.total.toFixed(2)}</span>
                        </div>
                    </button>
                </h2>
                <div id="collapseYear${year}" class="accordion-collapse collapse ${isExpanded}" data-bs-parent="#paymentSummaryAccordion">
                    <div class="accordion-body p-0">
                        <div class="table-responsive">
                            <table class="table table-sm table-borderless table-striped mb-0 small">
                                <thead class="text-muted bg-light border-bottom">
                                    <tr>
                                        <th class="px-3">កាលបរិច្ឆេទ</th>
                                        <th>ទឹកប្រាក់</th>
                                        <th>លើកទី</th>
                                        <th>ចំនួនខែ</th>
                                        <th>អ្នកទទួល</th>
                                    </tr>
                                </thead>
                                <tbody>`;

        yData.list.forEach(item => {
            html += `
                                    <tr>
                                        <td class="px-3">${convertToKhmerDate(item.date)}</td>
                                        <td class="fw-bold text-success">$${(parseFloat(item.amount) || 0).toFixed(2)}</td>
                                        <td class="text-center">${item.stage || '-'}</td>
                                        <td class="text-center">${item.months || 1} ខែ</td>
                                        <td>${item.receiver || '-'}</td>
                                    </tr>`;
        });

        html += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>`;
    });

    html += `</div>
        <div class="d-flex justify-content-between align-items-center mt-3 p-3 bg-light rounded border">
            <div>
                <div class="small text-muted fw-bold">សរុបបានបង់ (Total Paid):</div>
                <div class="h5 mb-0 fw-bold text-success">$${grandTotal.toFixed(2)}</div>
            </div>
            <div class="text-end">
                <div class="small text-muted fw-bold">នៅខ្វះ (Outstanding):</div>
                <div class="h5 mb-0 fw-bold text-danger">$${calculateRemainingAmount(s).toFixed(2)}</div>
            </div>
        </div>
    </div>`;
    return html;
};

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
            if (p.length === 3) {
                // Check if middle part is MMM (Jan, Feb, etc.)
                const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
                const mStr = p[1].toLowerCase();
                if (months[mStr]) {
                    // DD-MMM-YYYY -> MM/DD/YYYY
                    return `${months[mStr]}/${parseInt(p[0])}/${p[2]}`;
                }
                // Fallback to YYYY-MM-DD -> MM/DD/YYYY
                return `${parseInt(p[1])}/${parseInt(p[2])}/${p[0]}`;
            }
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
    if (status.status === 'today') return `<span class="text-primary fw-bold" style="color:#0d6efd !important;">${khDate} (ថ្ងៃនេះ)</span>`;
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

    // populateSelect('filterTime', 'studyTime', '🔍 ទាំងអស់ (ម៉ោង)', timeSort);
    // populateSelect('filterLevel', 'studyLevel', '🎓 ទាំងអស់ (កម្រិត)', levelSort);
    // populateSelect('filterClassTeacher', 'teacherName', '👨‍🏫 ទាំងអស់ (គ្រូ)');
};

// ----------------------------------------------------
// Core Functions: Loading & Rendering
// ----------------------------------------------------

let rawStudentsArray = [];

const renderFilteredTable = () => {
    const filteredArray = filterStudents(rawStudentsArray);

    // View Management
    const tableCard = document.querySelector('.card .table-responsive');
    const reportContainer = document.getElementById('reportViewContainer');
    const overdueContainer = document.getElementById('overdueReportContainer');

    if (window.SHOW_OVERDUE_REPORT) {
        if (tableCard) tableCard.style.display = 'none';
        if (reportContainer) reportContainer.style.display = 'none';
        renderOverdueReport(filteredArray);
    } else if (window.SHOW_FINISHED_REPORT) {
        if (tableCard) tableCard.style.display = 'none';
        if (overdueContainer) {
            overdueContainer.style.display = 'none';
            overdueContainer.innerHTML = '';
        }
        renderFinishedReport(filteredArray);
    } else {
        // Show Table
        if (tableCard) tableCard.style.display = 'block';

        // Hide/Clear Reports
        if (reportContainer) {
            reportContainer.style.display = 'none';
            reportContainer.innerHTML = '';
        }
        if (overdueContainer) {
            overdueContainer.style.display = 'none'; // Or keep it but empty
            overdueContainer.innerHTML = '';
        }

        renderTableData(filteredArray);
    }
    updateStatistics(rawStudentsArray);
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
        // setupSearchListener(); // Removed to prevent duplicate binding. Listener is set once in $(document).ready
        renderFilteredTable();
        if (!window.SHOW_DROPOUTS) {
            checkPaymentAlerts(allStudentsData);

            if (typeof isFirstLoad === 'undefined') window.isFirstLoad = true;
            if (window.isFirstLoad) {
                checkAllPayments();
                window.isFirstLoad = false;
            }
        }

        showLoading(false);
    }, (error) => {
        console.error("Firebase Error:", error);
        showAlert(`Error: ${error.message}`, 'danger');
        showLoading(false);
    });
};

function updateStatistics(students) {
    const stats = { total: 0, paid: 0, pending: 0, installment: 0, warning: 0, overdue: 0, today: 0 };
    let totalIncome = 0;
    let totalOutstanding = 0;

    // Specific Course Counts
    let chineseFullTimeCount = 0;
    let englishFullTimeCount = 0; // Tracked to ensure exclusion from Part-time if needed
    let partTimeTotalCount = 0;
    let activeTotalCount = 0;

    students.forEach(s => {
        // 1. Calculate General Payment Stats (Global - includes everyone in the list, but list might be filtered?)
        // Wait, 'students' argument passed to this function is 'rawStudentsArray' (all students) or 'filteredArray'?
        // In renderFilteredTable, it calls updateStatistics(rawStudentsArray). So it IS all students including dropouts? 
        // No, rawStudentsArray contains everyone.

        // We need to adhere to the Global Active logic for the top cards.

        // Let's rely on s.enrollmentStatus for the Top Cards.
        const isDropout = s.enrollmentStatus === 'dropout';

        // Payment Stats (Legacy logic mixed with new requirements)
        // If we want payment stats to reflect the TABLE view, we should use the filtered list.
        // But the function is called with rawStudentsArray in renderFilteredTable().
        // So these stats are GLOBAL.

        stats.total++; // This counts EVERYONE in the raw array (including dropouts)

        const status = getPaymentStatus(s).status;
        if (stats.hasOwnProperty(status)) stats[status]++;
        else if (status === 'warning') stats.warning++;
        else if (status === 'overdue') stats.overdue++;

        // Financials
        totalIncome += calculateTotalPaid(s);
        totalOutstanding += calculateRemainingAmount(s);

        // 2. Calculate Strict Enrollment Counts (Active Students Only)
        if (!isDropout) {
            activeTotalCount++;

            const type = (s.studyType || s.courseType || '').trim();

            // Normalize type check
            const isChineseFullTime = type === 'cFullTime' || type === 'chinese-fulltime';
            const isEnglishFullTime = type === 'eFullTime' || type === 'english-fulltime';

            if (isChineseFullTime) {
                chineseFullTimeCount++;
            } else if (isEnglishFullTime) {
                englishFullTimeCount++;
            } else {
                // If it's not Chinese Full-time OR English Full-time, we count it as Part-time
                // This covers: cPartTime, ePartTime, one-language, two-languages, three-languages, etc.
                partTimeTotalCount++;
            }
        }
    });

    statistics = stats;

    // Update New Breakdown Stats Cards (Active Only)
    if (document.getElementById('statChineseFullTime')) {
        document.getElementById('statChineseFullTime').innerText = `${chineseFullTimeCount} នាក់`;
    }
    if (document.getElementById('statPartTimeTotal')) {
        document.getElementById('statPartTimeTotal').innerText = `${partTimeTotalCount} នាក់`;
    }
    if (document.getElementById('statTotalStudents')) {
        document.getElementById('statTotalStudents').innerText = `${activeTotalCount} នាក់`;
    }

    // Update Dropout Page Statistics if present
    if (window.SHOW_DROPOUTS) {
        const statTotalDropout = document.getElementById('statTotalDropout');
        const statDropoutMale = document.getElementById('statDropoutMale');
        const statDropoutFemale = document.getElementById('statDropoutFemale');
        const statDropoutDebt = document.getElementById('statDropoutDebt');
        const statDropoutMonth = document.getElementById('statDropoutMonth');

        if (statTotalDropout) {
            // Recalculate dropouts specifically
            const dropoutStudents = students.filter(s => s.enrollmentStatus === 'dropout');
            const maleCount = dropoutStudents.filter(s => s.gender === 'ប្រុស' || s.gender === 'Male').length;
            const femaleCount = dropoutStudents.filter(s => s.gender === 'ស្រី' || s.gender === 'Female').length;

            // Calculate debts for dropouts specifically
            let dropoutDebt = 0;
            dropoutStudents.forEach(s => dropoutDebt += calculateRemainingAmount(s));

            statTotalDropout.innerText = `${dropoutStudents.length} នាក់`;
            if (statDropoutMale) statDropoutMale.innerText = maleCount;
            if (statDropoutFemale) statDropoutFemale.innerText = femaleCount;
            if (statDropoutDebt) statDropoutDebt.innerText = `$${dropoutDebt.toFixed(2)}`;
        }

        if (statDropoutMonth) {
            const currentMonth = new Date().getMonth();
            const currentYear = new Date().getFullYear();
            const thisMonthCount = students.filter(s => {
                if (s.enrollmentStatus !== 'dropout') return false;
                // Check dropoutDate first, if not convert lastUpdated
                const dStr = s.dropoutDate || s.lastUpdated;
                if (!dStr) return false;
                const d = new Date(dStr);
                return !isNaN(d.getTime()) && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
            }).length;
            statDropoutMonth.innerText = `${thisMonthCount} នាក់`;
        }
    }
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
            <td class="text-center">${s.teacherName || 'N/A'}</td>
            ${window.SHOW_DROPOUTS ? `<td class="text-center">${convertToKhmerDate(s.startDate)}</td>` : ''}
            <td class="text-center">${formatDueDateWithColor(s)}</td>
            <td class="text-center"><i class="fi fi-rr-calendar-check me-1 text-secondary small"></i>${s.paymentMonths || 1} ខែ</td>
            <td class="text-center fw-bold text-primary"><i class="fi fi-rr-dollar me-1"></i>${getLastPaidAmount(s).toFixed(2)}</td>
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
                    ${!window.SHOW_DROPOUTS ? `<button class="btn btn-sm btn-warning edit-btn shadow-sm" data-key="${s.key}" title="កែប្រែ"><i class="fi fi-rr-edit me-1"></i> កែប្រែ</button>` : ''}
                    ${s.enrollmentStatus === 'dropout' ?
                `<button class="btn btn-sm btn-success re-enroll-btn shadow-sm" onclick="reEnrollStudent('${s.key}')" title="ចូលរៀនវិញ"><i class="fi fi-rr-user-add me-1"></i> ចូលវិញ</button>` :
                (remaining > 0 ? `<button class="btn btn-sm btn-success mark-paid-btn shadow-sm" data-key="${s.key}" title="បង់ប្រាក់"><i class="fi fi-rr-receipt me-1"></i> បង់ប្រាក់</button>` : '')
            }
                    <button class="btn btn-sm btn-danger delete-btn btn-premium-delete shadow-sm" data-key="${s.key}" data-display-id="${s.displayId}" title="លុប"><i class="fi fi-rr-user-delete me-1"></i> លុប</button>
                </div>
            </td>`;
    };

    // Case 1: DataTable NOT initialized yet (First Load)
    if (!$.fn.DataTable.isDataTable(tableId)) {
        let html = '';
        studentsArray.forEach((s, i) => {
            html += `<tr class="align-middle animate__animated animate__fadeIn" style="animation-delay: ${Math.min(i * 0.05, 1)}s;">${buildRowContent(s, i)}</tr>`;
        });
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
            columnDefs: [{ orderable: false, targets: -1 }],
            order: [[1, 'asc']], // Order by Student ID
            language: {
                url: 'https://cdn.datatables.net/plug-ins/1.13.4/i18n/km.json',
                emptyTable: '<div class="text-center text-muted py-5"><i class="fi fi-rr-database fa-3x mb-3 d-block animate__animated animate__pulse animate__infinite"></i>គ្មានទិន្នន័យសិស្សទេ</div>',
                zeroRecords: '<div class="text-center text-muted py-5"><i class="fi fi-rr-database fa-3x mb-3 d-block animate__animated animate__pulse animate__infinite"></i>រកមិនឃើញទិន្នន័យសិស្សទេ</div>',
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


// ==========================================
// OVERDUE REPORT GENERATION
// ==========================================
function renderOverdueReport(studentsArray) {
    const container = document.getElementById('overdueReportContainer');
    if (!container) return;

    container.innerHTML = '';

    // 1. Filter relevant students (Overdue, Warning, Pending/Unpaid)
    // We want students who owe money or are late
    const reportData = studentsArray.filter(s => {
        const paymentStatus = getPaymentStatus(s);
        const debt = calculateRemainingAmount(s);
        const isDebt = debt > 0;

        // Include if Overdue OR Warning OR Today OR (Unpaid AND Debt > 0)
        return paymentStatus.status === 'overdue' || paymentStatus.status === 'warning' || paymentStatus.status === 'today' || (paymentStatus.status === 'pending' && isDebt) || (paymentStatus.status === 'installment' && isDebt);
    });

    if (reportData.length === 0) {
        container.innerHTML = '<div class="alert alert-success text-center p-5 shadow-sm rounded-3"><i class="fi fi-rr-check-circle fa-2x mb-3"></i><h4>ល្អណាស់! មិនមានសិស្សហួសកំណត់បង់ប្រាក់ទេ។</h4></div>';
        return;
    }

    // 2. Group by Section (Study Type)
    const sections = {
        'cFullTime': { title: 'ថ្នាក់ភាសាចិនពេញម៉ោង (Full-time Chinese)', data: [] },
        'cPartTime': { title: 'ថ្នាក់ភាសាចិនក្រៅម៉ោង (Part-time Chinese)', data: [] },
        'one-language': { title: 'ថ្នាក់ភាសា (១ភាសា / 1 Language)', data: [] },
        'two-languages': { title: 'ថ្នាក់ភាសា (២ភាសា / 2 Languages)', data: [] },
        'three-languages': { title: 'ថ្នាក់ភាសា (៣ភាសា / 3 Languages)', data: [] },
        'other': { title: 'ផ្សេងៗ (Other)', data: [] }
    };

    reportData.forEach(s => {
        // Map study types
        let key = 'other';
        const type = s.studyType || s.courseType; // Handle both keys if possible

        if (type === 'cFullTime' || type === 'chinese-fulltime') key = 'cFullTime';
        else if (type === 'cPartTime' || type === 'chinese-parttime') key = 'cPartTime';
        else if (type === 'one-language' || type === 'ePartTime' || type === 'eFullTime') key = 'one-language'; // Assuming ePart/Full are 1 language matches
        else if (type === 'two-languages') key = 'two-languages';
        else if (type === 'three-languages') key = 'three-languages';

        if (sections[key]) sections[key].data.push(s);
        else sections['other'].data.push(s);
    });

    // 3. Render Each Section
    Object.keys(sections).forEach(key => {
        const section = sections[key];
        if (section.data.length === 0) return;

        // Sort by Due Date (Overdue first)
        section.data.sort((a, b) => {
            const dateA = a.nextPaymentDate ? convertToEnglishDate(a.nextPaymentDate) : '9999-99-99';
            const dateB = b.nextPaymentDate ? convertToEnglishDate(b.nextPaymentDate) : '9999-99-99';
            return new Date(dateA) - new Date(dateB);
        });

        const sectionHtml = buildReportSection(section.title, section.data);
        container.innerHTML += sectionHtml;
    });
}

function buildReportSection(title, data) {
    let totalAmount = 0;
    data.forEach(s => totalAmount += calculateRemainingAmount(s));

    let rows = '';
    data.forEach((s, idx) => {
        const status = getPaymentStatus(s);
        const remaining = calculateRemainingAmount(s);

        rows += `
            <tr class="align-middle border-bottom">
                <td class="text-center text-secondary">${idx + 1}</td>
                <td class="text-center fw-bold text-dark">${s.displayId}</td>
                <td>
                    <div class="fw-bold text-primary">${s.lastName} ${s.firstName}</div>
                    <div class="small text-muted">${s.chineseLastName || ''}${s.chineseFirstName || ''}</div>
                </td>
                <td class="text-center">${s.gender === 'Male' ? 'ប្រុស' : 'ស្រី'}</td>
                <td class="text-center">${s.homeroomTeacher || '-'}</td>
                <td class="text-center">${s.studyTime || '-'}</td>
                 <td class="text-center">${formatDueDateWithColor(s)}</td>
                 <td class="text-center fw-bold text-danger">$${remaining.toFixed(2)}</td>
                 <td class="text-center">
                    <span class="payment-status-badge ${status.badge} shadow-sm" style="font-size: 0.8rem;">
                        ${status.text}
                    </span>
                 </td>
            </tr>
        `;
    });

    return `
        <div class="card shadow-sm border-0 mb-4 animate__animated animate__fadeInUp">
            <div class="card-header bg-white border-bottom border-light py-3 px-4 d-flex justify-content-between align-items-center flex-wrap gap-2">
                <h5 class="fw-bold text-pink-primary mb-0"><i class="fi fi-rr-folder me-2"></i>${title}</h5>
                <div class="d-flex gap-3 text-secondary small fw-bold">
                    <span class="bg-light px-3 py-1 rounded-pill"><i class="fi fi-rr-users-alt me-1"></i>ចំនួន: ${data.length} នាក់</span>
                    <span class="bg-danger-subtle text-danger px-3 py-1 rounded-pill"><i class="fi fi-rr-money-bill-wave me-1"></i>សរុប: $${totalAmount.toFixed(2)}</span>
                </div>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover mb-0" style="font-size: 0.95rem;">
                        <thead class="bg-light text-secondary">
                            <tr>
                                <th class="text-center py-3" width="50">L.R</th>
                                <th class="text-center py-3" width="100">ID</th>
                                <th class="py-3">ឈ្មោះសិស្ស</th>
                                <th class="text-center py-3" width="80">ភេទ</th>
                                <th class="text-center py-3">គ្រូបន្ទុកថ្នាក់</th>
                                <th class="text-center py-3">ម៉ោងសិក្សា</th>
                                <th class="text-center py-3">ថ្ងៃផុតកំណត់</th>
                                <th class="text-center py-3">ចំនួនប្រាក់</th>
                                <th class="text-center py-3">ស្ថានភាព</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ==========================================
// FINISHED STUDENTS REPORT GENERATION
// ==========================================
function renderFinishedReport(studentsArray) {
    // Check if table card exists to hide it
    const tableCard = document.querySelector('.card .table-responsive');
    let reportContainer = document.getElementById('reportViewContainer');

    // Create report container if missing
    if (!reportContainer) {
        reportContainer = document.createElement('div');
        reportContainer.id = 'reportViewContainer';
        if (tableCard && tableCard.parentNode) {
            tableCard.parentNode.insertBefore(reportContainer, tableCard);
        } else {
            // Fallback if table card not found (though it should be there)
            document.querySelector('.card-body').appendChild(reportContainer);
        }
    }

    // Hide Table, Show Report
    if (tableCard) tableCard.style.display = 'none';
    reportContainer.innerHTML = '';
    reportContainer.style.display = 'block';

    // 1. Filter relevant students (Status = Finished)
    const reportData = studentsArray.filter(s => {
        const status = getPaymentStatus(s);
        return status.status === 'finished';
    });

    if (reportData.length === 0) {
        reportContainer.innerHTML = '<div class="alert alert-info text-center p-5 shadow-sm rounded-3"><i class="fi fi-rr-info fa-2x mb-3"></i><h4>មិនមានសិស្សដែលបានបញ្ចប់ការសិក្សានៅឡើយទេ។</h4></div>';
        return;
    }

    // Group by Level
    const sections = {};

    reportData.forEach(s => {
        const level = s.studyLevel || 'Other';
        if (!sections[level]) sections[level] = [];
        sections[level].push(s);
    });

    // Sort levels logic (optional, reuse filter sort if possible)
    const sortedLevels = Object.keys(sections).sort((a, b) => {
        const getNum = (s) => parseInt(s.match(/\d+/)?.[0] || 0);
        return getNum(a) - getNum(b);
    });

    sortedLevels.forEach(level => {
        const data = sections[level];
        let title = `សិស្សបញ្ចប់ការសិក្សា - ${level}`;

        // For Level 4, try to append Teacher Name if consistent or present
        if (level.includes('4') || level.includes('៤')) {
            // Find teacher name (default to '黄' if missing as per user request example)
            const teacher = data[0]?.teacherName || data[0]?.homeroomTeacher || '黄';
            title += ` (គ្រូបន្ទុកថ្នាក់: ${teacher})`;
        }

        const sectionHtml = buildReportSection(title, data);
        reportContainer.innerHTML += sectionHtml;
    });
}

// ----------------------------------------------------
// Details Modal
// ----------------------------------------------------

function viewStudentDetails(key) {
    const s = allStudentsData[key];
    if (!s) return;

    showLoading(true);

    // Calculate Financials
    const tuition = parseFloat(s.tuitionFee) || 0;
    const material = parseFloat(s.materialFee) || 0;
    const admin = parseFloat(s.adminFee) || 0;
    const discount = parseFloat(s.discount) || 0;
    const total = tuition + material + admin - discount;

    let paid = parseFloat(s.initialPayment) || 0;
    if (s.installments) {
        const installs = Array.isArray(s.installments) ? s.installments : Object.values(s.installments);
        installs.forEach(i => paid += (parseFloat(i.amount) || 0));
    }

    const remaining = calculateRemainingAmount(s);
    const status = getPaymentStatus(s);

    const bodyContent = `
        <div class="student-details-view animate__animated animate__fadeIn">
            
            <!-- Quick Actions & Header -->
            <div class="card border-0 shadow-sm mb-4 bg-white" style="border-radius: 15px; overflow: hidden;">
                <div class="card-body p-4">
                    <div class="row align-items-center">
                        <div class="col-md-auto text-center mb-3 mb-md-0">
                            <div class="position-relative d-inline-block">
                                ${s.imageUrl ?
            `<img src="${s.imageUrl}" class="rounded-circle shadow-sm border border-4 border-white" style="width: 100px; height: 100px; object-fit: cover;">` :
            `<div class="rounded-circle shadow-sm border border-4 border-white bg-light d-flex align-items-center justify-content-center text-secondary" style="width: 100px; height: 100px;">
                                        <i class="fi fi-rr-user fa-3x"></i>
                                    </div>`
        }
                                <div class="position-absolute bottom-0 end-0">
                                    <span class="badge rounded-circle bg-success border border-2 border-white p-2"><span class="visually-hidden">Active</span></span>
                                </div>
                            </div>
                        </div>
                        <div class="col-md ps-md-4 text-center text-md-start">
                            <h3 class="fw-bold text-dark mb-1" style="font-family: 'Khmer OS Muol Light';">${s.lastName || ''} ${s.firstName || ''}</h3>
                            <div class="text-secondary mb-2">${s.englishLastName || ''} ${s.englishFirstName || ''}</div>
                            <div class="d-flex flex-wrap justify-content-center justify-content-md-start gap-2 mb-3">
                                <span class="badge bg-light text-dark border"><i class="fi fi-rr-id-badge me-1"></i> ID: ${s.displayId}</span>
                                <span class="badge bg-pink-primary bg-opacity-10 text-pink-dark border border-pink-subtle"><i class="fi fi-rr-graduation-cap me-1"></i> ${formatStudyType(s)}</span>
                                <span class="badge ${status.badge} border border-white border-opacity-25 shadow-sm">${status.text}</span>
                            </div>
                        </div>
                        <div class="col-md-auto text-center text-md-end mt-3 mt-md-0">
                            <div class="d-flex flex-column gap-2">
                                <div class="btn-group shadow-sm">
                                    <button class="btn btn-outline-primary fw-bold btn-sm px-3" onclick="showRenewModal('${s.key}')"><i class="fi fi-rr-graduation-cap me-1"></i> ប្តូរថ្នាក់</button>
                                    <button class="btn btn-primary fw-bold btn-sm px-3" onclick="showAdditionalPaymentModal('${s.key}')"><i class="fi fi-rr-add me-1"></i> បង់ប្រាក់</button>
                                </div>
                                <div class="btn-group shadow-sm">
                                    <button class="btn btn-outline-dark btn-sm px-3" onclick="printPOSReceipt('${s.key}')"><i class="fi fi-rr-print me-1"></i> វិក្កយបត្រ</button>
                                    ${s.enrollmentStatus === 'dropout' ?
            `<button class="btn btn-success btn-sm px-3" onclick="reEnrollStudent('${s.key}')"><i class="fi fi-rr-user-add me-1"></i> ចូលរៀនវិញ</button>` :
            `<button class="btn btn-outline-danger btn-sm px-3" onclick="markAsDropout('${s.key}')"><i class="fi fi-rr-user-remove me-1"></i> បោះបង់</button>`
        }
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Tab Navigation -->
            <ul class="nav nav-pills nav-fill mb-4 p-1 bg-light rounded-pill shadow-sm" id="studentDetailsTabs" role="tablist" style="border: 1px solid #eee;">
                <li class="nav-item" role="presentation">
                    <button class="nav-link active rounded-pill fw-bold" id="info-tab" data-bs-toggle="tab" data-bs-target="#info" type="button" role="tab" aria-selected="true">
                        <i class="fi fi-rr-user me-2"></i>ព័ត៌មានទូទៅ
                    </button>
                </li>
                <li class="nav-item" role="presentation">
                    <button class="nav-link rounded-pill fw-bold" id="family-tab" data-bs-toggle="tab" data-bs-target="#family" type="button" role="tab" aria-selected="false">
                        <i class="fi fi-rr-users me-2"></i>គ្រួសារ
                    </button>
                </li>
                <li class="nav-item" role="presentation">
                    <button class="nav-link rounded-pill fw-bold" id="finance-tab" data-bs-toggle="tab" data-bs-target="#finance" type="button" role="tab" aria-selected="false">
                        <i class="fi fi-rr-hand-holding-usd me-2"></i>ហិរញ្ញវត្ថុ
                    </button>
                </li>
            </ul>

            <!-- Tab Content -->
            <div class="tab-content" id="studentDetailsTabContent">
                
                <!-- 1. General Info Tab -->
                <div class="tab-pane fade show active" id="info" role="tabpanel" aria-labelledby="info-tab">
                    <div class="row g-4">
                        <!-- Personal Info -->
                        <div class="col-lg-6">
                            <div class="card h-100 border-0 shadow-sm" style="border-radius: 15px;">
                                <div class="card-header bg-white border-0 py-3">
                                    <h6 class="fw-bold text-primary mb-0"><i class="fi fi-rr-info me-2"></i>ព័ត៌មានផ្ទាល់ខ្លួន</h6>
                                </div>
                                <div class="card-body pt-0">
                                    <ul class="list-group list-group-flush">
                                        <li class="list-group-item px-0 d-flex justify-content-between">
                                            <span class="text-muted">ភេទ</span>
                                            <span class="fw-bold">${s.gender === 'Male' ? 'ប្រុស' : 'ស្រី'}</span>
                                        </li>
                                        <li class="list-group-item px-0 d-flex justify-content-between">
                                            <span class="text-muted">ថ្ងៃកំណើត</span>
                                            <span class="fw-bold">${convertToKhmerDate(s.dob)}</span>
                                        </li>
                                        <li class="list-group-item px-0 d-flex justify-content-between">
                                            <span class="text-muted">សញ្ជាតិ</span>
                                            <span class="fw-bold">${s.nationality || 'ខ្មែរ'}</span>
                                        </li>
                                        <li class="list-group-item px-0 d-flex justify-content-between">
                                            <span class="text-muted">លេខទូរស័ព្ទ</span>
                                            <span class="fw-bold text-primary" style="font-family: 'Poppins';">${s.personalPhone || 'N/A'}</span>
                                        </li>
                                        <li class="list-group-item px-0">
                                            <div class="text-muted mb-1">អាសយដ្ឋានបច្ចុប្បន្ន (Current Address)</div>
                                            <div class="fw-bold text-dark bg-light p-2 rounded small">
                                                <div class="d-flex align-items-start mb-1">
                                                    <i class="fi fi-rr-marker text-danger mt-1 me-2"></i>
                                                    <div>
                                                        ${s.village ? `<span>ភូមិ ${s.village}</span><br>` : ''}
                                                        ${s.commune ? `<span>ឃុំ/សង្កាត់ ${s.commune}</span><br>` : ''}
                                                        ${s.district ? `<span>ស្រុក/ខណ្ឌ ${s.district}</span><br>` : ''}
                                                        ${s.province ? `<span>ខេត្ត/ក្រុង ${s.province}</span>` : ''}
                                                    </div>
                                                </div>
                                                ${s.studentAddress ? `<div class="mt-2 text-secondary border-top pt-1 text-break"><i class="fi fi-rr-home me-1"></i>${s.studentAddress}</div>` : ''}
                                            </div>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <!-- Academic Info -->
                        <div class="col-lg-6">
                            <div class="card h-100 border-0 shadow-sm" style="border-radius: 15px;">
                                <div class="card-header bg-white border-0 py-3">
                                    <h6 class="fw-bold text-success mb-0"><i class="fi fi-rr-book-alt me-2"></i>ការសិក្សា (Academic)</h6>
                                </div>
                                <div class="card-body pt-0">
                                    <div class="row g-3">
                                        <div class="col-6">
                                            <div class="p-3 rounded bg-success bg-opacity-10 h-100">
                                                <div class="small text-muted mb-1">កម្រិតសិក្សា</div>
                                                <div class="fw-bold text-success">${s.studyLevel || 'N/A'}</div>
                                            </div>
                                        </div>
                                        <div class="col-6">
                                            <div class="p-3 rounded bg-info bg-opacity-10 h-100">
                                                <div class="small text-muted mb-1">ម៉ោងសិក្សា</div>
                                                <div class="fw-bold text-info">${s.studyTime || 'N/A'}</div>
                                            </div>
                                        </div>
                                        <div class="col-12">
                                            <div class="p-3 rounded bg-light border">
                                                <div class="d-flex justify-content-between mb-2">
                                                    <span class="text-muted small">គ្រូបន្ទុកថ្នាក់:</span>
                                                    <span class="fw-bold">${s.teacherName || 'មិនទាន់កំណត់'}</span>
                                                </div>
                                                <div class="d-flex justify-content-between">
                                                    <span class="text-muted small">បន្ទប់រៀន:</span>
                                                    <span class="fw-bold">${s.classroom || 'N/A'}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="col-12">
                                            <div class="p-3 rounded border border-warning border-opacity-50 bg-warning bg-opacity-10 text-center">
                                                <div class="small text-muted mb-2"><i class="fi fi-rr-calendar-clock me-1"></i>ថ្ងៃត្រូវបង់បន្ទាប់ (Due Payment Date)</div>
                                                <div class="h5 fw-bold text-danger bg-white p-2 rounded shadow-sm border border-danger mb-0 d-inline-block">
                                                    ${s.nextPaymentDate ? convertToKhmerDate(s.nextPaymentDate) : 'N/A'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 2. Family Info Tab -->
                <div class="tab-pane fade" id="family" role="tabpanel" aria-labelledby="family-tab">
                    <div class="row g-4">
                        <!-- Father -->
                        <div class="col-md-4">
                            <div class="card h-100 border-0 shadow-sm text-center" style="border-radius: 15px;">
                                <div class="card-body">
                                    <div class="d-inline-flex align-items-center justify-content-center bg-primary bg-opacity-10 text-primary rounded-circle mb-3" style="width: 60px; height: 60px;">
                                        <i class="fi fi-rr-man-head fa-2x"></i>
                                    </div>
                                    <h6 class="fw-bold">ឪពុក (Father)</h6>
                                    <hr class="w-25 mx-auto my-3 text-primary opacity-25">
                                    <h5 class="fw-bold text-dark mb-1" style="font-family: 'Khmer OS Muol Light'; font-size: 1rem;">${s.fatherName || 'មិនបានបញ្ជាក់'}</h5>
                                    <p class="text-muted small mb-3">${s.fatherJob || 'មុខរបរមិនបានបញ្ជាក់'}</p>
                                    
                                    <div class="bg-light p-2 rounded mb-3 text-start small">
                                        <div class="d-flex align-items-start">
                                            <i class="fi fi-rr-marker text-muted mt-1 me-2"></i>
                                            <span class="text-secondary">${s.fatherAddress || 'អាសយដ្ឋានមិនបានបញ្ជាក់'}</span>
                                        </div>
                                    </div>

                                    ${s.fatherPhone ? `<a href="tel:${s.fatherPhone}" class="btn btn-outline-primary btn-sm rounded-pill px-3"><i class="fi fi-rr-phone-call me-2"></i>${s.fatherPhone}</a>` : '<span class="text-muted small">គ្មានលេខទូរស័ព្ទ</span>'}
                                </div>
                            </div>
                        </div>
                        <!-- Mother -->
                        <div class="col-md-4">
                            <div class="card h-100 border-0 shadow-sm text-center" style="border-radius: 15px;">
                                <div class="card-body">
                                    <div class="d-inline-flex align-items-center justify-content-center bg-pink-primary bg-opacity-10 text-pink-dark rounded-circle mb-3" style="width: 60px; height: 60px;">
                                        <i class="fi fi-rr-woman-head fa-2x"></i>
                                    </div>
                                    <h6 class="fw-bold">ម្តាយ (Mother)</h6>
                                    <hr class="w-25 mx-auto my-3 text-pink-dark opacity-25">
                                    <h5 class="fw-bold text-dark mb-1" style="font-family: 'Khmer OS Muol Light'; font-size: 1rem;">${s.motherName || 'មិនបានបញ្ជាក់'}</h5>
                                    <p class="text-muted small mb-3">${s.motherJob || 'មុខរបរមិនបានបញ្ជាក់'}</p>

                                    <div class="bg-light p-2 rounded mb-3 text-start small">
                                        <div class="d-flex align-items-start">
                                            <i class="fi fi-rr-marker text-muted mt-1 me-2"></i>
                                            <span class="text-secondary">${s.motherAddress || 'អាសយដ្ឋានមិនបានបញ្ជាក់'}</span>
                                        </div>
                                    </div>

                                    ${s.motherPhone ? `<a href="tel:${s.motherPhone}" class="btn btn-outline-pink btn-sm rounded-pill px-3" style="border-color: var(--bs-pink-primary); color: var(--bs-pink-primary);"><i class="fi fi-rr-phone-call me-2"></i>${s.motherPhone}</a>` : '<span class="text-muted small">គ្មានលេខទូរស័ព្ទ</span>'}
                                </div>
                            </div>
                        </div>
                        <!-- Guardian -->
                        <div class="col-md-4">
                            <div class="card h-100 border-0 shadow-sm text-center" style="border-radius: 15px;">
                                <div class="card-body">
                                    <div class="d-inline-flex align-items-center justify-content-center bg-warning bg-opacity-10 text-warning rounded-circle mb-3" style="width: 60px; height: 60px;">
                                        <i class="fi fi-rr-shield-check fa-2x"></i>
                                    </div>
                                    <h6 class="fw-bold">អាណាព្យាបាល (Guardian)</h6>
                                    <hr class="w-25 mx-auto my-3 text-warning opacity-25">
                                    <h5 class="fw-bold text-dark mb-1" style="font-family: 'Khmer OS Muol Light'; font-size: 1rem;">${s.guardianName || 'មិនមាន'}</h5>
                                    <p class="text-muted small mb-3">${s.guardianRelation || 'ត្រូវជា...'}</p>
                                    
                                     <div class="bg-light p-2 rounded mb-3 text-start small">
                                        <div class="d-flex align-items-start">
                                            <i class="fi fi-rr-marker text-muted mt-1 me-2"></i>
                                            <span class="text-secondary">${s.guardianAddress || 'អាសយដ្ឋានមិនបានបញ្ជាក់'}</span>
                                        </div>
                                    </div>

                                    ${s.guardianPhone ? `<a href="tel:${s.guardianPhone}" class="btn btn-outline-warning btn-sm rounded-pill px-3"><i class="fi fi-rr-phone-call me-2"></i>${s.guardianPhone}</a>` : '<span class="text-muted small">...</span>'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 3. Financial Info Tab -->
                <div class="tab-pane fade" id="finance" role="tabpanel" aria-labelledby="finance-tab">
                    <div class="row g-4">
                        <!-- Financial Summary -->
                        <div class="col-lg-4">
                            <div class="card border-0 shadow-sm bg-primary bg-gradient text-white h-100" style="border-radius: 15px;">
                                <div class="card-body position-relative overflow-hidden">
                                     <!-- Decorative Circles -->
                                    <div class="position-absolute rounded-circle bg-white opacity-10" style="width: 150px; height: 150px; top: -50px; right: -50px;"></div>
                                    <div class="position-absolute rounded-circle bg-white opacity-10" style="width: 100px; height: 100px; bottom: -20px; left: -20px;"></div>
                                    
                                    <h5 class="fw-bold mb-4 border-bottom border-white border-opacity-25 pb-2">សង្ខេបការបង់ប្រាក់</h5>
                                    
                                    <div class="d-flex justify-content-between mb-2 opacity-75 small">
                                        <span>ថ្លៃសិក្សា (Tuition)</span>
                                        <span>$${tuition.toFixed(2)}</span>
                                    </div>
                                    <div class="d-flex justify-content-between mb-2 opacity-75 small">
                                        <span>ថ្លៃសម្ភារៈ (Material)</span>
                                        <span>$${material.toFixed(2)}</span>
                                    </div>
                                    <div class="d-flex justify-content-between mb-2 opacity-75 small">
                                        <span>ថ្លៃរដ្ឋបាល (Admin)</span>
                                        <span>$${admin.toFixed(2)}</span>
                                    </div>
                                    ${discount > 0 ? `
                                    <div class="d-flex justify-content-between mb-2 text-warning fw-bold small">
                                        <span>បញ្ចុះតម្លៃ (Discount)</span>
                                        <span>-$${discount.toFixed(2)}</span>
                                    </div>` : ''}
                                    
                                    <hr class="bg-white opacity-25 my-3">
                                    
                                    <div class="d-flex justify-content-between align-items-end mb-3">
                                        <span class="fw-bold">សរុបត្រូវបង់</span>
                                        <span class="fs-4 fw-bold">$${total.toFixed(2)}</span>
                                    </div>
                                     <div class="d-flex justify-content-between align-items-end mb-3 text-light">
                                        <span class="fw-bold">បានបង់រួច</span>
                                        <span class="fs-5 fw-bold">$${paid.toFixed(2)}</span>
                                    </div>

                                    <div class="bg-white bg-opacity-25 rounded p-3 text-center mt-3 backdrop-blur">
                                        <div class="small fw-bold mb-1">នៅខ្វះ (Balance Due)</div>
                                        <div class="fs-2 fw-bold text-white">$${remaining.toFixed(2)}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Installment History -->
                        <div class="col-lg-8">
                            <div class="card h-100 border-0 shadow-sm" style="border-radius: 15px;">
                                <div class="card-header bg-white border-0 py-3 d-flex justify-content-between align-items-center">
                                    <h6 class="fw-bold mb-0 text-dark"><i class="fi fi-rr-time-past me-2"></i>ប្រវត្តិបង់ប្រាក់</h6>
                                    <span class="badge bg-light text-dark">${s.installments ? (Array.isArray(s.installments) ? s.installments.length : Object.keys(s.installments).length) : 0} ដង</span>
                                </div>
                                <div class="card-body p-0">
                                    <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                                        <table class="table table-hover align-middle mb-0">
                                            <thead class="bg-light sticky-top">
                                                <tr class="text-secondary small">
                                                    <th class="ps-4">កាលបរិច្ឆេទ</th>
                                                    <th class="text-center">ទឹកប្រាក់</th>
                                                    <th class="text-center">សម្រាប់</th>
                                                    <th>អ្នកទទួល</th>
                                                    <th class="text-end pe-4">ស្ថានការណ៍</th>
                                                </tr>
                                            </thead>
                                            <tbody class="border-top-0">
                                                 ${renderInstallmentHistoryRows(s)}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

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

function renderInstallmentHistoryRows(student) {
    let installments = [];
    if (student.installments) {
        if (Array.isArray(student.installments)) {
            installments = student.installments;
        } else if (typeof student.installments === 'object') {
            installments = Object.values(student.installments);
        }
    }

    if (installments.length === 0) {
        return `<tr><td colspan="5" class="text-center py-5 text-muted">
            <i class="fi fi-rr-box-open fa-2x mb-2 d-block opacity-25"></i>
            មិនទាន់មានប្រវត្តិបង់ប្រាក់
        </td></tr>`;
    }

    // Sort by date descending (newest first)
    installments.sort((a, b) => new Date(b.date) - new Date(a.date));

    return installments.map((inst, index) => `
        <tr>
            <td class="ps-4">
                <div class="fw-bold text-dark">${convertToKhmerDate(inst.date)}</div>
                <div class="small text-muted" style="font-size: 0.75rem;">${inst.paymentMethod || 'Cash'}</div>
            </td>
            <td class="text-center">
                <span class="fw-bold text-primary">$${(parseFloat(inst.amount) || 0).toFixed(2)}</span>
            </td>
            <td class="text-center">
                <span class="badge bg-light text-dark border">${inst.months || 1} ខែ</span>
            </td>
            <td>
                <div class="d-flex align-items-center">
                    <div class="bg-light rounded-circle p-1 me-2 d-flex justify-content-center align-items-center" style="width: 25px; height: 25px;">
                        <i class="fi fi-rr-user text-secondary" style="font-size: 0.7rem;"></i>
                    </div>
                    <span class="small">${inst.receiver || '-'}</span>
                </div>
            </td>
            <td class="text-end pe-4">
                <button class="btn btn-sm btn-light rounded-circle shadow-sm hover-scale" onclick="printPaymentReceipt('${student.key}', ${installments.length - 1 - index})" title="Print Receipt">
                    <i class="fi fi-rr-print text-secondary"></i>
                </button>
            </td>
        </tr>
    `).join('');
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
                                                    <th width="8%">ដំណាក់កាល</th>
                                                    <th width="16%">ថ្ងៃទីខែឆ្នាំ</th>
                                                    <th width="16%">ចំនួនទឹកប្រាក់ ($)</th>
                                                    <th width="16%">អ្នកទទួល</th>
                                                    <th width="16%">ប្រភេទការបង់</th>
                                                    <th width="20%">ចំណាំ</th>
                                                    <th width="8%">លុប</th>
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
        <td>${getReceiverSelectHtml(receiver, '', 'form-control form-control-sm inst-receiver')}</td>
        <td>${getPaymentMethodSelectHtml(data.paymentMethod || '', '', 'form-control form-control-sm inst-method')}</td>
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
            paymentMethod: row.querySelector('.inst-method').value,
            note: row.querySelector('.inst-note').value,
            paid: !!row.querySelector('.inst-receiver').value,
            status: row.querySelector('.inst-receiver').value ? 'paid' : 'pending'
        });
    });

    showLoading(true);

    // Optimistic Update (Immediate UI Refresh)
    if (allStudentsData[key]) {
        Object.assign(allStudentsData[key], {
            ...data,
            installments: installments,
            updatedAt: new Date().toISOString()
        });
        renderFilteredTable(); // refresh table
    }

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

let additionalPaymentModal = null;

async function showAdditionalPaymentModal(key) {
    const s = allStudentsData[key];
    if (!s) return;

    // Get current user for default receiver
    let currentUser = '';
    if (firebase.auth().currentUser) {
        // Try to get from our system users if possible, or fallback to auth
        // We already have fetchSystemUsers but it puts names in array.
        // Let's just use auth display name for default, or empty.
        // Actually, we should try to match key if we had it, but name is fine.
        currentUser = firebase.auth().currentUser.displayName || '';
    }

    // Attempt to get consistent name if we have a way (we added getCurrentUserName before)
    // If not, we use the simple fallback
    if (typeof getCurrentUserName === 'function') {
        const name = await getCurrentUserName();
        if (name) currentUser = name;
    }

    const modalHtml = `
    <div class="modal fade" id="additionalPaymentModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content shadow-lg border-0" style="border-radius: 15px;">
                <div class="modal-header bg-success text-white">
                    <h5 class="modal-title fw-bold"><i class="fi fi-rr-add me-2"></i>បង់ប្រាក់បន្ថែម (Additional Payment)</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body p-4 bg-light">
                    <form id="additionalPaymentForm">
                        <div class="alert alert-white shadow-sm border-0 d-flex align-items-center mb-4 p-3" style="border-left: 5px solid #198754 !important;">
                            <div class="bg-success bg-opacity-10 p-3 rounded-circle me-3">
                                <i class="fi fi-rr-user-student text-success fa-2x"></i>
                            </div>
                            <div>
                                <h6 class="fw-bold mb-1 text-dark">${s.lastName || ''} ${s.firstName || ''} <span class="text-muted fw-normal">(${s.englishFirstName || ''})</span></h6>
                                <div class="badge bg-success bg-opacity-75">ID: ${s.displayId}</div>
                            </div>
                        </div>

                        <div class="card border-0 shadow-sm">
                            <div class="card-body">
                                <div class="row g-3">
                                    <!-- Row 1: Date & Amount -->
                                    <!-- Row 1: Date, Amount, Discounts -->
                                    <div class="col-md-3">
                                        <label class="form-label fw-bold small text-muted">កាលបរិច្ឆេទ (Date)</label>
                                        <input type="text" class="form-control" id="payDate" value="${(() => {
            const d = new Date();
            const khmerMonths = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
            const m = khmerMonths[d.getMonth()];
            const dd = String(d.getDate()).padStart(2, '0');
            return `${dd}-${m}-${d.getFullYear()}`;
        })()}" required placeholder="DD-MMM-YYYY">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label fw-bold small text-success">ទឹកប្រាក់ (Amount $)</label>
                                        <div class="input-group">
                                            <span class="input-group-text bg-success text-white fw-bold">$</span>
                                            <input type="number" step="0.01" class="form-control fw-bold text-success" id="payAmount" required placeholder="0.00">
                                        </div>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label fw-bold small text-primary">បញ្ចុះតម្លៃ (Disc %)</label>
                                        <div class="input-group">
                                            <input type="number" step="0.01" class="form-control text-primary" id="payDiscountPercent" placeholder="0">
                                            <span class="input-group-text bg-light">%</span>
                                        </div>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label fw-bold small text-primary">បញ្ចុះតម្លៃ (Disc $)</label>
                                        <div class="input-group">
                                            <span class="input-group-text bg-light">$</span>
                                            <input type="number" step="0.01" class="form-control text-primary" id="payDiscountDollar" placeholder="0.00">
                                        </div>
                                    </div>

                                    <!-- Row 1.5: Extra Fees -->
                                    <div class="col-md-6">
                                        <label class="form-label fw-bold small text-secondary">សេវារដ្ឋបាល (Admin Fee $)</label>
                                        <div class="input-group">
                                            <span class="input-group-text bg-light border-0"><i class="fi fi-rr-briefcase text-muted"></i></span>
                                            <input type="number" step="0.01" class="form-control" id="payAdminFee" placeholder="0.00">
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label fw-bold small text-secondary">សម្ភារៈសិក្សា (Material Fee $)</label>
                                        <div class="input-group">
                                            <span class="input-group-text bg-light border-0"><i class="fi fi-rr-book-alt text-muted"></i></span>
                                            <input type="number" step="0.01" class="form-control" id="payMaterialFee" placeholder="0.00">
                                        </div>
                                    </div>

                                    <!-- Row 2: Months & Payment Type -->
                                    <div class="col-md-6">
                                        <label class="form-label fw-bold small text-muted">ចំនួនខែដែលបង់ (Paid Months)</label>
                                        <input type="number" step="0.1" class="form-control" id="payMonths" value="1" oninput="calculateNextDueDateFromInput()">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label fw-bold small text-muted">ប្រភេទការបង់ (Payment Type)</label>
                                        ${getPaymentMethodSelectHtml('ABA BANK', 'payMethod', 'form-select', 'payMethod')}
                                    </div>

                                    <!-- Row 3: Next Due Date & Total Duration -->
                                    <div class="col-md-6">
                                        <label class="form-label fw-bold small text-danger">កាលបរិច្ឆេទផុតកំណត់ថ្មី (Next Due Date)</label>
                                        <div class="input-group">
                                            <span class="input-group-text text-danger"><i class="fi fi-rr-calendar-clock"></i></span>
                                            <input type="text" class="form-control text-danger fw-bold" id="payNextDueDate" value="${s.nextPaymentDate || ''}" placeholder="DD/MM/YYYY">
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label fw-bold small text-primary">ចំនួនខែសិក្សាសរុប (Total Duration)</label>
                                        <input type="number" class="form-control text-primary fw-bold" id="payTotalMonths" value="${s.paymentMonths || ''}">
                                    </div>

                                    <!-- Row 4: Receiver -->
                                    <div class="col-12">
                                        <label class="form-label fw-bold small text-muted">អ្នកទទួល (Receiver)</label>
                                        <input type="text" class="form-control" id="payReceiver" value="${currentUser}" list="receiverList">
                                        <datalist id="receiverList">
                                            <!-- Options can be populated dynamically if needed, or rely on browser history -->
                                        </datalist>
                                    </div>

                                    <!-- Row 5: Note -->
                                    <div class="col-12">
                                        <label class="form-label fw-bold small text-muted">កំណត់សម្គាល់ (Note)</label>
                                        <textarea class="form-control" id="payNote" rows="2" placeholder="Ex: Add tuition fee..."></textarea>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
                <script>
                    function calculateNextDueDateFromInput() {
                        const paidMonths = parseFloat(document.getElementById('payMonths').value) || 0;
                        const currentNextDue = '${s.nextPaymentDate || ''}'; // Original next due date from server
                        
                        let baseDate = new Date(); // Default to today
                        let validDateFound = false;

                        // Helper to parse "DD/MM/YYYY" or "DD-Mon-YYYY"
                        if (currentNextDue && currentNextDue !== 'មិនមាន' && currentNextDue !== 'N/A') {
                            // Try DD/MM/YYYY
                            if (currentNextDue.includes('/')) {
                                const parts = currentNextDue.split('/');
                                if (parts.length === 3) {
                                    baseDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                                    validDateFound = true;
                                }
                            } 
                            // Try DD-MMM-YYYY (e.g. 05-Jan-2026 or 05-មករា-2026)
                            else if (currentNextDue.includes('-')) {
                                const parts = currentNextDue.split('-');
                                if (parts.length === 3) {
                                     const monthStr = parts[1];
                                     const engMonths = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                                     const khmerMonths = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
                                     
                                     let mIndex = engMonths.findIndex(m => m === monthStr.toLowerCase() || monthStr.toLowerCase().startsWith(m));
                                     if(mIndex === -1) mIndex = khmerMonths.indexOf(monthStr);

                                     if (mIndex !== -1) {
                                         baseDate = new Date(parseInt(parts[2]), mIndex, parseInt(parts[0]));
                                         validDateFound = true;
                                     }
                                }
                            }
                        }

                        // Add Months
                        const additionalMonths = Math.floor(paidMonths);
                        const additionalFraction = paidMonths - additionalMonths;
                        
                        baseDate.setMonth(baseDate.getMonth() + additionalMonths);
                        
                        if (additionalFraction > 0.001) {
                            baseDate.setDate(baseDate.getDate() + Math.round(additionalFraction * 30));
                        }
                        
                        const dd = String(baseDate.getDate()).padStart(2, '0');
                        const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
                        const yyyy = baseDate.getFullYear();
                        
                        document.getElementById('payNextDueDate').value = \`\${dd}/\${mm}/\${yyyy}\`;
                    }

                    // Run once on load to populate initial state
                    setTimeout(calculateNextDueDateFromInput, 100);
                </script>
                <div class="modal-footer border-0 p-4 bg-light" style="border-bottom-left-radius: 15px; border-bottom-right-radius: 15px;">
                    <button type="button" class="btn btn-light px-4 fw-bold shadow-sm" data-bs-dismiss="modal">បោះបង់</button>
                    <button type="button" class="btn btn-success px-5 fw-bold shadow-sm" onclick="saveAdditionalPayment('${key}')">
                        <i class="fi fi-rr-check-circle me-2"></i>រក្សាទុក (Save)
                    </button>
                </div>
            </div>
        </div>
    </div>`;

    // Remove existing
    const existingModal = document.getElementById('additionalPaymentModal');
    if (existingModal) existingModal.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    additionalPaymentModal = new bootstrap.Modal(document.getElementById('additionalPaymentModal'));
    additionalPaymentModal.show();
}

function saveAdditionalPayment(key) {
    const s = allStudentsData[key];
    if (!s) return;

    const dateInput = document.getElementById('payDate').value;
    const amount = parseFloat(document.getElementById('payAmount').value);
    const months = document.getElementById('payMonths').value;
    const receiver = document.getElementById('payReceiver').value;
    const note = document.getElementById('payNote').value;
    const method = document.getElementById('payMethod').value;
    const nextDueDate = document.getElementById('payNextDueDate').value;
    const totalMonths = document.getElementById('payTotalMonths').value;
    const discountPercent = parseFloat(document.getElementById('payDiscountPercent').value) || 0;
    const discountDollar = parseFloat(document.getElementById('payDiscountDollar').value) || 0;
    const adminFee = parseFloat(document.getElementById('payAdminFee').value) || 0;
    const materialFee = parseFloat(document.getElementById('payMaterialFee').value) || 0;

    if (!amount || amount <= 0) {
        return showAlert('សូមបញ្ចូលទឹកប្រាក់ត្រឹមត្រូវ', 'warning');
    }

    // Prepare new installment object
    // Need to determine "Next Stage".
    // Count existing installments + 1, or just label it 'Add'
    let currentCount = 0;
    if (s.installments) {
        if (Array.isArray(s.installments)) currentCount = s.installments.length;
        else currentCount = Object.keys(s.installments).length;
    }
    const nextStage = currentCount + 1;

    // We can auto-calculate "paid" status for this specific transaction?
    // It IS a payment transaction, so it is "paid".

    // Calculate Payment Period (From previous due date to new due date)
    const periodStart = s.nextPaymentDate || s.startDate || 'N/A';
    const periodEnd = nextDueDate || 'N/A';
    const paymentPeriod = `${periodStart} ដល់ ${periodEnd}`;

    // Calculate Month Name
    let forMonth = '';
    const khmerMonthsList = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];
    if (periodStart !== 'N/A') {
        const parts = periodStart.split(/[/-]/);
        if (parts.length === 3) {
            // Assume format DD/MM/YYYY
            const mIndex = parseInt(parts[1]) - 1;
            if (khmerMonthsList[mIndex]) {
                forMonth = khmerMonthsList[mIndex];
            }
        }
    }

    const newInstallment = {
        stage: nextStage.toString(),
        date: dateInput,
        amount: amount,
        paidAmount: amount,
        paid: true,
        status: 'paid',
        receiver: receiver,
        paymentMethod: method,
        note: note,
        months: months,
        period: paymentPeriod,
        forMonth: forMonth, // Added Month Name
        discountPercent: discountPercent,
        discountDollar: discountDollar,
        adminServicesFee: adminFee,
        materialFee: materialFee
    };

    // Date formatting to DD/MM/YYYY if needed, but existing code might handle dateInput (YYYY-MM-DD) -> Display format.
    // For consistency with other parts, let's keep input format or format it upon display.
    // Actually existing saveAdditionalPayment converted it? No, it just saved dateInput.
    // Let's stick to simple logic.

    let installments = [];
    if (s.installments) {
        installments = Array.isArray(s.installments) ? [...s.installments] : Object.values(s.installments);
    }
    installments.push(newInstallment);

    // Update object
    const updateData = {
        installments: installments,
        updatedAt: new Date().toISOString()
    };

    // Update root fields if provided
    if (nextDueDate) updateData.nextPaymentDate = nextDueDate;
    if (totalMonths) updateData.paymentMonths = totalMonths;

    // Optimistic Update
    if (allStudentsData[key]) {
        Object.assign(allStudentsData[key], updateData);
        // If date/amount changed, status might change, so re-render table too
        renderFilteredTable();
        // Update details view immediately
        viewStudentDetails(key);
    }

    showLoading(true);
    studentsRef.child(key).update(updateData)
        .then(() => {
            showAlert('បង់ប្រាក់បន្ថែមជោគជ័យ', 'success');

            // ============================================
            // TELEGRAM NOTIFICATION
            // ============================================
            try {
                const telMsg = `
<b>💰 ការបង់ប្រាក់បន្ថែម (Additional Payment)</b>
--------------------------------
<b>អត្តលេខ (ID):</b> ${s.displayId || 'N/A'}
<b>ឈ្មោះ (Name):</b> ${s.lastName} ${s.firstName} (${s.englishLastName} ${s.englishFirstName})
<b>កាលបរិច្ឆេទ (Date):</b> ${newInstallment.date}
<b>ទឹកប្រាក់ (Amount):</b> $${newInstallment.amount}
<b>រយៈពេល (Duration):</b> ${newInstallment.months} ខែ
<b>ដំណាក់កាល (Stage):</b> ${newInstallment.stage}
<b>អ្នកទទួល (Receiver):</b> ${newInstallment.receiver}
<b>វិធីបង់ (Method):</b> ${newInstallment.paymentMethod}
<b>សម្គាល់ (Note):</b> ${newInstallment.note || 'None'}
--------------------------------
<i>System Notification</i>
`;
                sendTelegramNotification(telMsg);
            } catch (err) { console.error('Telegram Error:', err); }

            if (additionalPaymentModal) additionalPaymentModal.hide();
            // detailed view already updated optimistically
        })
        .catch(e => {
            console.error(e);
            showAlert('មានបញ្ហាក្នុងការរក្សាទុក', 'danger');
        })
        .finally(() => showLoading(false));


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

    const updateData = {
        paymentStatus: 'Paid',
        nextPaymentDate: nextDate,
        updatedAt: new Date().toISOString()
    };

    // Optimistic Update
    if (allStudentsData[key]) {
        Object.assign(allStudentsData[key], updateData);
        renderFilteredTable();
        // If modal is open, refresh it
        const modalEl = document.getElementById('studentDetailsModal');
        if (modalEl && modalEl.classList.contains('show')) {
            viewStudentDetails(key);
        }
    }

    studentsRef.child(key).update(updateData).then(() => {
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

    // Find the latest installment for display
    let lastPaymentHtml = '<div class="text-center text-muted small py-2">មិនទាន់មានប្រវត្តិបង់ប្រាក់</div>';
    if (s.installments) {
        let installs = Array.isArray(s.installments) ? s.installments : Object.values(s.installments);
        if (installs.length > 0) {
            const last = installs[installs.length - 1];
            lastPaymentHtml = `
                <table class="table table-sm table-bordered mb-0 small" style="background: #f8f9fa;">
                    <thead>
                        <tr class="text-secondary">
                            <th>កាលបរិច្ឆេទ</th>
                            <th>ទឹកប្រាក់</th>
                            <th>ចំនួនខែ</th>
                            <th>អ្នកទទួល</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="fw-bold">${convertToKhmerDate(last.date)}</td>
                            <td class="fw-bold text-success">$${(parseFloat(last.amount) || 0).toFixed(2)}</td>
                            <td>${last.months || '1'} ខែ</td>
                            <td>${last.receiver || '-'}</td>
                        </tr>
                    </tbody>
                </table>
            `;
        }
    }

    const html = `
        <div class="modal fade" id="renewStudentModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-md modal-dialog-centered">
                <div class="modal-content border-0 shadow-lg" style="border-radius: 20px;">
                    <div class="modal-header bg-purple text-white p-4 border-0 shadow-sm" style="background-color: #6f42c1;">
                        <h5 class="modal-title fw-bold">
                            <i class="fi fi-rr-graduation-cap me-2"></i>បច្ចុប្បន្នភាពការសិក្សា (Academic Upgrade)
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body p-4 bg-light">
                        <form id="renewStudentForm">
                            <input type="hidden" name="key" value="${s.key}">
                            
                            <!-- Academic Updates -->
                            <div class="card border-0 shadow-sm">
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
                                        <!-- Removed Financial Section -->
                                        <div class="col-12 mt-3">
                                            <label class="form-label small fw-bold">កំណត់សម្គាល់ (Note)</label>
                                            <input type="text" class="form-control" name="note" placeholder="សម្គាល់...">
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
    const note = form.note.value.trim();

    // 1. Update Academic Info
    const updateData = {
        studyLevel: newLevel,
        studyTime: newTime,
        teacherName: newTeacher,
        classroom: newClassroom,
        updatedAt: new Date().toISOString()
    };

    // Note handling: if note is provided, user might want to set it.
    // If we want to append history we can, but usually overwriting 'note' field or just not touching it if empty is fine. Let's update if not empty.
    if (note) updateData.note = note;

    // Optimistic Update
    if (allStudentsData[key]) {
        Object.assign(allStudentsData[key], updateData);
        renderFilteredTable();
        viewStudentDetails(key);
    }

    showLoading(true);
    studentsRef.child(key).update(updateData)
        .then(() => {
            showAlert('បច្ចុប្បន្នភាពការសិក្សាជោគជ័យ!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('renewStudentModal')).hide();
            if (studentDetailsModal) {
                studentDetailsModal.hide();
                setTimeout(() => viewStudentDetails(key), 500);
            }
        })
        .catch(e => showAlert('Error: ' + e.message, 'danger'))
        .finally(() => showLoading(false));
}

// ----------------------------------------------------
// Installment Actions (Edit/Delete)
// ----------------------------------------------------

function deleteInstallment(key, index) {
    if (!confirm('តើអ្នកពិតជាចង់លុបប្រវត្តិនេះមែនទេ?')) return;

    const s = allStudentsData[key];
    if (!s || !s.installments) return;

    let installments = Array.isArray(s.installments) ? [...s.installments] : Object.values(s.installments);

    if (index >= 0 && index < installments.length) {
        installments.splice(index, 1);

        showLoading(true);
        studentsRef.child(key).update({
            installments: installments,
            updatedAt: new Date().toISOString()
        })
            .then(() => {
                showAlert('លុបជោគជ័យ', 'success');
                if (studentDetailsModal) {
                    studentDetailsModal.hide();
                    setTimeout(() => viewStudentDetails(key), 500);
                }
            })
            .catch(e => showAlert(e.message, 'danger'))
            .finally(() => showLoading(false));
    }
}

function showEditInstallmentModal(key, index) {
    const s = allStudentsData[key];
    if (!s || !s.installments) return;

    let installments = Array.isArray(s.installments) ? [...s.installments] : Object.values(s.installments);
    const inst = installments[index];
    if (!inst) return;

    const existing = document.getElementById('editInstallmentModal');

    function deleteInstallmentFromModal(key, index) {
        if (confirm('តើអ្នកពិតជាចង់លុបប្រវត្តិបង់ប្រាក់នេះមែនទេ?')) {
            deleteInstallment(key, index); // Reuse existing delete logic
            const modal = bootstrap.Modal.getInstance(document.getElementById('editInstallmentModal'));
            if (modal) modal.hide();
        }
    }


    const html = `
        <div class="modal fade" id="editInstallmentModal" tabindex="-1" aria-hidden="true" style="z-index: 1060;">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content border-0 shadow-lg" style="border-radius: 15px;">
                    <div class="modal-header bg-warning text-dark border-0">
                        <h6 class="modal-title fw-bold"><i class="fi fi-rr-edit me-2"></i>កែប្រែប្រវត្តិបង់ប្រាក់ (Installment ${inst.stage || index + 1})</h6>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body p-4 bg-light">
                        <form id="editInstallmentForm">
                            <div class="mb-3">
                                <label class="form-label small fw-bold">កាលបរិច្ឆេទ (DD-Month-YYYY)</label>
                                <input type="text" class="form-control" name="date" value="${formatKhmerMonthDate(inst.date)}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold">ទឹកប្រាក់ ($)</label>
                                <input type="number" step="0.01" class="form-control" name="amount" value="${inst.amount || 0}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold">អ្នកទទួល</label>
                                ${getReceiverSelectHtml(inst.receiver || '', 'receiver', 'form-control')}
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold">ប្រភេទការបង់ (Payment Type)</label>
                                ${getPaymentMethodSelectHtml(inst.paymentMethod || '', 'paymentMethod', 'form-control')}
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold">ចំនួនខែ (Months)</label>
                                <input type="number" class="form-control" name="months" value="${inst.months || ''}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold">ចំណាំ</label>
                                <input type="text" class="form-control" name="note" value="${inst.note || ''}">
                            </div>
                             <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" id="instPaidCheck" name="paid" ${inst.paid ? 'checked' : ''}>
                                <label class="form-check-label small" for="instPaidCheck">បានបង់រួច (Paid)</label>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer border-0 bg-white d-flex justify-content-between">
                        <button type="button" class="btn btn-outline-danger shadow-sm border-0" onclick="deleteInstallmentFromModal('${key}', ${index})"><i class="fi fi-rr-trash me-2"></i>លុបប្រវត្តិ</button>
                        <div>
                            <button type="button" class="btn btn-light me-2" data-bs-dismiss="modal">បោះបង់</button>
                            <button type="button" class="btn btn-primary fw-bold px-4" onclick="saveInstallmentEdit('${key}', ${index})">រក្សាទុក</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    new bootstrap.Modal(document.getElementById('editInstallmentModal')).show();
}

function saveInstallmentEdit(key, index) {
    const s = allStudentsData[key];
    if (!s || !s.installments) return;

    const form = document.getElementById('editInstallmentForm');

    // Parse Date back if it matches Khmer Format
    let dateVal = form.date.value;
    if (dateVal.includes('-')) {
        // Try parse khmer month
        dateVal = parseKhmerMonthDate(dateVal);
    }

    const newData = {
        date: dateVal,
        amount: parseFloat(form.amount.value) || 0,
        receiver: form.receiver.value,
        paymentMethod: form.paymentMethod.value,
        note: form.note.value,
        months: form.months.value,
        paid: form.paid.checked
    };

    let installments = Array.isArray(s.installments) ? [...s.installments] : Object.values(s.installments);
    if (index >= 0 && index < installments.length) {
        newData.stage = installments[index].stage;
        installments[index] = newData;

        showLoading(true);

        // Update both installments AND the root paymentMonths if changed
        const updatePayload = {
            installments: installments,
            updatedAt: new Date().toISOString()
        };

        if (newData.months) {
            updatePayload.paymentMonths = newData.months;
        }

        studentsRef.child(key).update(updatePayload)
            .then(() => {
                showAlert('កែប្រែជោគជ័យ', 'success');
                bootstrap.Modal.getInstance(document.getElementById('editInstallmentModal')).hide();
                if (studentDetailsModal) {
                    studentDetailsModal.hide();
                    setTimeout(() => viewStudentDetails(key), 500);
                }
            })
            .catch(e => showAlert(e.message, 'danger'))
            .finally(() => showLoading(false));
    }
}

// ----------------------------------------------------
// Reports & Exports
// ----------------------------------------------------

function getFilteredStudents() {
    return Object.values(allStudentsData).filter(s => {
        // Name Search
        const term = (currentFilters.searchName || '').toLowerCase().trim();

        // Consolidate all searchable fields into one string for easier matching
        const searchableText = [
            s.lastName, s.firstName,
            s.englishLastName, s.englishFirstName,
            s.chineseLastName, s.chineseFirstName,
            s.displayId
        ].filter(Boolean).join(' ').toLowerCase();

        // Token matching: Split search term by spaces and ensure EVERY word appears in the student record
        // This allows "First Last", "Last First", or "Name ID" searches to work perfectly.
        const searchTokens = term.split(/\s+/);
        const nameMatch = !term || searchTokens.every(token => searchableText.includes(token));

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
    let students = data || getFilteredStudents();

    if (window.SHOW_OVERDUE_REPORT) {
        // Filter for Overdue Report
        students = students.filter(s => {
            const status = getPaymentStatus(s);
            const debt = calculateRemainingAmount(s);
            const isDebt = debt > 0;
            return status.status === 'overdue' || status.status === 'warning' || (status.status === 'pending' && isDebt) || (status.status === 'installment' && isDebt);
        });
        filename = 'Overdue_Report';
    }

    if (students.length === 0) return showAlert('គ្មានទិន្នន័យសម្រាប់នាំចេញ', 'warning');

    let csv = '\uFEFFល.រ,អត្តលេខ,ឈ្មោះ,ភេទ,លេខទូរស័ព្ទ,កម្រិត,ម៉ោង,ថ្ងៃចុះឈ្មោះ,ថ្ងៃផុតកំណត់,ចំនួនខែ,គ្រូបន្ទុកថ្នាក់,ចំណាំ,តម្លៃ,ខ្វះ,ស្ថានភាព\n';
    students.forEach((s, i) => {
        const status = getPaymentStatus(s);
        // Use homeroomTeacher if available, fallback to teacherName or empty
        const teacher = s.homeroomTeacher || s.teacherName || '';
        csv += `${i + 1},${s.displayId},"${s.lastName} ${s.firstName}",${s.gender === 'Male' ? 'ប្រុស' : 'ស្រី'},${s.personalPhone || ''},${s.studyLevel || ''},${s.studyTime || ''},${s.startDate || ''},${s.nextPaymentDate || ''},${s.paymentMonths || ''},"${teacher}","${s.remark || ''}",$${calculateTotalAmount(s)},$${calculateRemainingAmount(s)},${status.text}\n`;
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
    const remark = '';

    // 1. Group Data
    const categories = {
        'Chinese Fulltime': { title: 'ភាសាចិនពេញម៉ោង', groups: { today: [], overdue: [], warning: [], unpaid: [] }, totalDebt: 0 },
        'Chinese Parttime': { title: 'ភាសាចិនក្រៅម៉ោង', groups: { today: [], overdue: [], warning: [], unpaid: [] }, totalDebt: 0 },
        '1 Language': { title: 'ភាសា (១ភាសា)', groups: { today: [], overdue: [], warning: [], unpaid: [] }, totalDebt: 0 },
        '2 Languages': { title: 'ភាសា (២ភាសា)', groups: { today: [], overdue: [], warning: [], unpaid: [] }, totalDebt: 0 },
        '3 Languages': { title: 'ភាសា (៣ភាសា)', groups: { today: [], overdue: [], warning: [], unpaid: [] }, totalDebt: 0 },
        'Other': { title: 'ផ្សេងៗ', groups: { today: [], overdue: [], warning: [], unpaid: [] }, totalDebt: 0 }
    };

    // Global Stats for Dashboard
    const stats = {
        today: { count: 0, amount: 0 },
        overdue: { count: 0, amount: 0 },
        warning: { count: 0, amount: 0 },
        unpaid: { count: 0, amount: 0 },
        total: { count: 0, amount: 0 }
    };

    const students = Object.values(allStudentsData).filter(s => {
        if (s.enrollmentStatus === 'dropout') return false;

        const debt = calculateRemainingAmount(s);
        const status = getPaymentStatus(s);
        const isTimeCritical = ['overdue', 'today', 'warning'].includes(status.status);

        // Include if they owe money OR are time-critical (Overdue/Today/Warning)
        // This ensures students who need to renew (0 debt but date passed) are included.
        if (debt > 0 || isTimeCritical) return true;

        return false;
    });

    if (students.length === 0) return showAlert('ល្អណាស់! មិនមានសិស្សជំពាក់ប្រាក់ហួសកំណត់ទេ', 'success');

    // Sort by ID
    students.sort((a, b) => (a.displayId || '').localeCompare(b.displayId || ''));

    students.forEach(s => {
        const type = (s.studyType || '').toLowerCase();
        const prog = (s.studyProgram || '').toLowerCase();
        let catKey = 'Other';

        if (prog.includes('3_languages') || prog.includes('៣ ភាសា')) catKey = '3 Languages';
        else if (prog.includes('2_languages') || prog.includes('២ ភាសា')) catKey = '2 Languages';
        else if (prog.includes('1_language') || prog.includes('១ ភាសា')) catKey = '1 Language';
        else if (type.includes('fulltime') || type.includes('ពេញម៉ោង')) catKey = 'Chinese Fulltime';
        else if (type.includes('parttime') || type.includes('ក្រៅម៉ោង')) catKey = 'Chinese Parttime';

        const statusObj = getPaymentStatus(s);
        const days = statusObj.daysRemaining;
        const debt = calculateRemainingAmount(s);

        // Determine Date Validity
        const hasDate = s.nextPaymentDate && !['N/A', 'មិនមាន', ''].includes(s.nextPaymentDate);

        let groupKey = 'unpaid'; // Default to generic Unpaid

        if (hasDate) {
            if (days < 0) groupKey = 'overdue';
            else if (days === 0) groupKey = 'today';
            else if (days > 0 && days <= 10) groupKey = 'warning';
            // If days > 10, stay as 'unpaid' (Future debt)
        }

        // Push and update stats
        categories[catKey].groups[groupKey].push(s);
        categories[catKey].totalDebt += debt;

        stats[groupKey].count++;
        stats[groupKey].amount += debt;
        stats.total.count++;
        stats.total.amount += debt;
    });

    // Open Popup
    let win = window.open('', 'OverdueReport', 'width=1200,height=900,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes');
    if (!win) { showAlert('Please allow popups for this website', 'error'); return; }

    let html = `<html><head><title>របាយការណ៍បំណុលសិស្ស</title>
        <base href="${window.location.href}">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
        <link href="https://fonts.googleapis.com/css2?family=Battambang:wght@400;700&family=Moul&display=swap" rel="stylesheet">
        <style>
            @page { margin: 20mm; size: auto; }
            body { font-family: 'Battambang', sans-serif !important; background: #eaecf1; color: #333; font-size: 14px; margin: 0; padding: 20px; padding-top: 80px; }
            
            /* Header Styling */
            .header-container { 
                background: white; 
                padding: 20px 40px; 
                border-radius: 0; 
                margin-bottom: 30px; 
                position: relative;
                border-bottom: 4px solid #8a0e5b;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 30px;
            }
            .logo-box { width: 100px; text-align: left; flex-shrink: 0; }
            .logo { width: 100px; height: auto; object-fit: contain; }
            
            .school-text { flex: 1; text-align: center; min-width: 250px; }
            .school-text h1 { font-family: 'Moul', serif; margin: 0; font-size: 24px; color: #8a0e5b; line-height: 1.4; }
            .school-text h2 { font-family: 'Times New Roman', serif; margin: 5px 0 15px; font-size: 14px; color: #2c3e50; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; }
            
            .report-badge { 
                background: #8a0e5b; 
                color: white; 
                padding: 8px 20px; 
                border-radius: 50px; 
                font-size: 14px; 
                font-weight: bold; 
                display: inline-block;
                box-shadow: 0 4px 10px rgba(138, 14, 91, 0.3);
                white-space: nowrap;
            }

            .date-box { width: 140px; text-align: right; font-size: 11px; color: #666; font-weight: bold; flex-shrink: 0; }

            /* Action Floating Bar */
            .action-bar { 
                position: fixed; top: 20px; left: 50%; transform: translateX(-50%); 
                width: 90%; max-width: 700px; 
                background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(12px); 
                padding: 8px 15px; border-radius: 50px; 
                box-shadow: 0 8px 25px rgba(0,0,0,0.12); 
                display: flex; justify-content: space-between; align-items: center; 
                z-index: 1000; border: 1px solid rgba(255,255,255,0.8); 
            }
            .btn-action { 
                text-decoration: none; padding: 10px 25px; border-radius: 30px; 
                color: white; border: none; cursor: pointer; display: inline-flex; 
                align-items: center; gap: 8px; font-weight: bold; font-size: 13px; 
                transition: all 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.1); 
            }
            .btn-action:hover { transform: translateY(-2px); box-shadow: 0 6px 12px rgba(0,0,0,0.15); }
            .btn-home { background: linear-gradient(135deg, #667eea, #764ba2); }
            .btn-print { background: linear-gradient(135deg, #ff6b6b, #ee0979); }

            /* Summary Dashboard */
            .dashboard-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 20px;
                margin-bottom: 40px;
                break-inside: avoid;
            }
            .stat-card {
                background: white;
                padding: 15px;
                border-radius: 12px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.03);
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
                border: 1px solid #eee;
                position: relative;
                overflow: hidden;
            }
            .stat-card::before { content:''; position:absolute; top:0; left:0; width:100%; height:4px; }
            .stat-card.blue::before { background: #0d6efd; }
            .stat-card.red::before { background: #dc3545; }
            .stat-card.orange::before { background: #fd7e14; }
            .stat-card.gray::before { background: #6c757d; }
            
            .stat-icon { font-size: 20px; margin-bottom: 8px; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
            .blue .stat-icon { background: #e7f1ff; color: #0d6efd; }
            .red .stat-icon { background: #fff5f5; color: #dc3545; }
            .orange .stat-icon { background: #fff9db; color: #fd7e14; }
            .gray .stat-icon { background: #f8f9fa; color: #6c757d; }
            
            .stat-title { font-family: 'Moul', serif; font-size: 11px; color: #666; margin-bottom: 5px; }
            .stat-value { font-size: 18px; font-weight: 800; color: #333; }
            .stat-debt { font-size: 13px; font-weight: bold; color: #666; margin-top: 4px; background: #f8f9fa; padding: 2px 8px; border-radius: 10px; }

            /* Category Sections */
            .category-section { background: white; margin-bottom: 30px; border-radius: 15px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.03); border: 0; }
            .section-header { padding: 12px 20px; font-size: 15px; font-weight: bold; background: #fff; color: #333; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; }
            .section-blue { border-left: 5px solid #0d6efd; }
            .section-orange { border-left: 5px solid #fd7e14; }
            .section-green { border-left: 5px solid #198754; }
            .section-gray { border-left: 5px solid #6c757d; }

            .sub-section-container { padding: 5px 20px 20px; }
            .sub-title { font-size: 14px; font-family: 'Moul', serif; margin: 20px 0 10px; padding-bottom: 8px; border-bottom: 2px dashed #eee; display: flex; align-items: center; gap: 8px; }
            
            table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; border: 1px solid #f0f0f0; border-radius: 10px; overflow: hidden; margin-bottom: 10px; }
            th { background: #f9fafb; color: #555; font-weight: bold; padding: 10px; border-bottom: 1px solid #eee; text-transform: uppercase; font-size: 11px; }
            td { padding: 10px; border-bottom: 1px solid #f5f5f5; text-align: center; vertical-align: middle; }
            tr:last-child td { border-bottom: none; }
            tr:hover td { background: #fcfcfc; }
            
            .amount-positive { color: #dc3545; font-weight: 800; background: #fff5f5; padding: 4px 8px; border-radius: 8px; font-size:12px; }
            
            /* Print Footer */
            .print-footer { display: none; }

            @media print {
                /* Set Margins */
                @page { margin: 20mm; }
                
                .no-print { display: none !important; }
                body { padding: 0; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; height: auto; margin-bottom: 30px; }
                
                .header-container { 
                    border-bottom: 2px solid #8a0e5b !important; 
                    margin-bottom: 25px; 
                    padding: 0 0 20px 0;
                    box-shadow: none !important;
                    gap: 20px;
                    justify-content: space-between;
                }
                .school-text h1 { color: #8a0e5b !important; -webkit-text-fill-color: #8a0e5b; font-size: 22px; }
                .report-badge { 
                    background: white !important; 
                    color: black !important; 
                    border: 2px solid #8a0e5b; 
                    padding: 4px 15px;
                    font-size: 14px;
                    box-shadow: none !important;
                }

                .category-section { 
                    /* Allow breaking across pages to avoid blank pages */
                    break-inside: auto; 
                    page-break-inside: auto;
                    border: 1px solid #ddd !important; 
                    box-shadow: none !important; 
                    margin-bottom: 15px;
                    display: block; /* Ensure it behaves like a block */
                }
                
                .dashboard-grid { 
                    display: grid;
                    grid-template-columns: repeat(4, 1fr) !important; 
                    gap: 15px !important;
                    margin-top: 20px !important;
                    border-top: 1px dashed #999 !important;
                    padding-top: 20px !important;
                    break-inside: avoid; /* Keep summary together if possible */
                }
                .stat-card { 
                    border: 1px solid #ccc !important; 
                    box-shadow: none !important; 
                    padding: 8px !important;
                    background: #f9f9f9 !important;
                    flex-direction: column !important; /* Stack for better fit in Portrait */
                    justify-content: center;
                    text-align: center;
                    align-items: center;
                }
                .stat-icon { margin-bottom: 5px !important; margin-right: 0 !important; }
                .stat-value { font-size: 14px !important; }
                .stat-title { font-size: 11px !important; }
                
                table { border: 1px solid #999; width: 100%; border-collapse: collapse; }
                th { background-color: #eee !important; color: black !important; border: 1px solid #999; font-weight: bold; font-size: 10px; padding: 6px; }
                td { border: 1px solid #999; color: black; font-size: 10px; padding: 6px; }
                tr { break-inside: avoid; page-break-inside: avoid; }
                
                .section-header { background-color: #eee !important; border-bottom: 1px solid #999 !important; color: black !important;  padding: 6px 15px; font-size: 13px;}
                .print-footer {
                    display: flex;
                    position: fixed;
                    bottom: 0;
                    left: 0; 
                    width: 100%;
                    height: 30px;
                    justify-content: space-between;
                    align-items: center;
                    padding: 0 40px; /* Match header padding */
                    border-top: 1px solid #ccc;
                    font-size: 10px;
                    color: #666;
                    background: white;
                    z-index: 9999;
                }
                .page-number:after {
                    content: "Page " counter(page);
                }
            }
        </style>
        </head><body>

    <div class="action-bar no-print">
        <a href="javascript:void(0)" onclick="window.close()" class="btn-action btn-home"><i class="fa fa-times-circle"></i> បិទ (Close)</a>
        <button onclick="window.print()" class="btn-action btn-print"><i class="fa fa-print"></i> បោះពុម្ព (Print)</button>
    </div>

    <div class="header-container">
        <div class="logo-box">
            <img src="img/1.jpg" class="logo" onerror="this.src='img/logo.jpg'">
        </div>
        <div class="school-text">
            <h1>សាលាអន្តរជាតិ ធានស៊ីន</h1>
            <h2>TIAN XIN INTERNATIONAL SCHOOL</h2>
            <div class="report-badge">របាយការណ៍បំណុលសិស្ស (Debt Report)</div>
        </div>
        <div class="date-box">
            <i class="fa fa-calendar-alt me-1"></i> ${new Date().toLocaleDateString('km-KH')}
        </div>
    </div>
    
    <div class="remark-container">
        <div class="remark-line">
            <span class="remark-label">សម្គាល់ (Note):</span>
            <div id="remarkDisplay" class="remark-text" style="display:inline-block;">${remark}</div>
            <textarea id="remarkInput" class="remark-input no-print" style="display:none;"></textarea>
            
            <button id="btnEdit" onclick="toggleEditRemark()" class="btn-icon no-print" title="កែប្រែ (Edit)">
                <i class="fa fa-pen"></i>
            </button>
            <button id="btnSave" onclick="saveRemark()" class="btn-icon btn-save no-print" style="display:none;" title="រក្សាទុក (Save)">
                <i class="fa fa-check"></i>
            </button>
        </div>
    </div>

    <script>
    function toggleEditRemark() {
        const display = document.getElementById('remarkDisplay');
        const input = document.getElementById('remarkInput');
        const btnEdit = document.getElementById('btnEdit');
        const btnSave = document.getElementById('btnSave');

        input.value = display.innerText;
        
        display.style.display = 'none';
        btnEdit.style.display = 'none';
        
        input.style.display = 'inline-block';
        btnSave.style.display = 'inline-flex';
        input.focus();
    }

    function saveRemark() {
        const display = document.getElementById('remarkDisplay');
        const input = document.getElementById('remarkInput');
        const btnEdit = document.getElementById('btnEdit');
        const btnSave = document.getElementById('btnSave');

        display.innerText = input.value;
        
        input.style.display = 'none';
        btnSave.style.display = 'none';
        
        display.style.display = 'inline-block';
        btnEdit.style.display = 'inline-flex';
    }
    </script>
    
    <style>
    .remark-container {
        margin-bottom: 25px;
        padding: 0 40px; /* Match header padding */
    }
    .remark-line {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        font-size: 14px;
        color: #333;
        line-height: 1.6;
    }
    .remark-label {
        font-weight: bold;
        white-space: nowrap;
        color: #8a0e5b;
        margin-top: 4px; /* Align with text */
    }
    .remark-text {
        flex: 1;
        border-bottom: 1px dotted #ccc;
        min-height: 24px;
        padding-bottom: 2px;
    }
    .remark-input {
        flex: 1;
        font-family: inherit;
        font-size: inherit;
        padding: 5px;
        border: 1px solid #0d6efd;
        border-radius: 4px;
        resize: vertical;
        min-height: 60px;
    }
    .btn-icon {
        background: none;
        border: none;
        cursor: pointer;
        color: #999;
        padding: 4px;
        border-radius: 4px;
        transition: all 0.2s;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }
    .btn-icon:hover {
        background: #f0f0f0;
        color: #333;
    }
    .btn-save {
        color: #198754;
        background: #e8f5e9;
    }
    .btn-save:hover {
        background: #198754;
        color: white;
    }

    @media print {
        .remark-container { padding: 0; margin-bottom: 15px; }
        .remark-text { border-bottom: none; }
        .no-print { display: none !important; }
        .remark-line { gap: 5px; }
    }
    </style>



    `;

    Object.keys(categories).forEach(catKey => {
        const cat = categories[catKey];
        const count = cat.groups.today.length + cat.groups.overdue.length + cat.groups.warning.length + cat.groups.unpaid.length;
        if (count === 0) return;

        let hdrClass = 'section-gray';
        if (catKey.includes('Fulltime')) hdrClass = 'section-blue';
        else if (catKey.includes('Parttime')) hdrClass = 'section-orange';
        else if (catKey.includes('Language')) hdrClass = 'section-green';

        html += `
            <div class="category-section">
                <div class="section-header ${hdrClass}">
                    <span><i class="fa fa-bookmark me-2"></i>${cat.title}</span>
                    <div>
                        <span class="badge" style="font-size:12px; color:#555; background:#f8f9fa; border:1px solid #eee; padding:5px 12px; border-radius:30px; margin-right:5px;">សិស្ស: ${count}</span>
                        <span class="badge" style="font-size:12px; color:#dc3545; background:#fff5f5; border:1px solid #ffebeb; padding:5px 12px; border-radius:30px;">$${cat.totalDebt.toFixed(2)}</span>
                    </div>
                </div>
                <div class="sub-section-container">
        `;

        const renderSubTable = (title, color, list, icon) => {
            if (list.length === 0) return '';
            let tbl = `
                <div class="sub-title" style="color:${color}"><i class="${icon}"></i> ${title} <span style="font-size:12px; color:#999; margin-left:5px;">(${list.length} នាក់)</span></div>
                <table>
                    <thead>
                        <tr>
                            <th width="40">L.R</th>
                            <th width="70">ID</th>
                            <th style="text-align:left;">ឈ្មោះសិស្ស</th>
                            <th width="50">ភេទ</th>
                            <th width="90">ម៉ោង</th>
                            <th width="100">គ្រូបន្ទុកថ្នាក់</th>
                            <th width="90">ទូរស័ព្ទឪពុក</th>
                            <th width="90">ទូរស័ព្ទម្តាយ</th>
                            <th width="100">ថ្ងៃកំណត់</th>
                            <th width="100">ស្ថានភាព</th>
                            <th width="90">ជំពាក់</th>
                        </tr>
                    </thead>
                    <tbody>`;

            list.forEach((s, idx) => {
                const statusObj = getPaymentStatus(s);
                const debt = calculateRemainingAmount(s);
                const days = statusObj.daysRemaining;
                const hasDate = s.nextPaymentDate && !['N/A', '', 'មិនមាន'].includes(s.nextPaymentDate);

                let badge = '';
                if (color === '#0d6efd') badge = `<span style="color:#0d6efd; background:#e7f1ff; padding:4px 10px; border-radius:50px; font-weight:bold; font-size:11px;">ថ្ងៃនេះ</span>`;
                else if (color === '#dc3545') badge = `<span style="color:#dc3545; background:#fff5f5; padding:4px 10px; border-radius:50px; font-weight:bold; font-size:11px;">ហួស ${Math.abs(days)} ថ្ងៃ</span>`;
                else if (color === '#fd7e14') badge = `<span style="color:#fd7e14; background:#fff9db; padding:4px 10px; border-radius:50px; font-weight:bold; font-size:11px;">សល់ ${days} ថ្ងៃ</span>`;
                else badge = `<span style="color:#666; background:#f8f9fa; padding:4px 10px; border-radius:50px; font-size:11px;">មិនទាន់បង់</span>`;

                tbl += `
                    <tr>
                        <td>${idx + 1}</td>
                        <td style="font-weight:bold; color:#555;">${s.displayId}</td>
                        <td style="text-align:left;">
                            <div style="font-weight:bold; color:#333;">${s.lastName || ''} ${s.firstName || ''}</div>
                            <div style="font-size:11px; color:#888; text-transform:uppercase;">${s.englishLastName || ''} ${s.englishFirstName || ''}</div>
                        </td>
                        <td>${s.gender === 'Male' ? 'ប្រុស' : 'ស្រី'}</td>
                        <td>${s.studyTime || '-'}</td>
                        <td style="font-size:12px; color:#555;">${s.homeroomTeacher || s.teacherName || '-'}</td>
                        <td style="font-size:11px;">${s.fatherPhone || '-'}</td>
                        <td style="font-size:11px;">${s.motherPhone || '-'}</td>
                        <td style="font-weight:bold;">${hasDate ? convertToKhmerDate(s.nextPaymentDate) : '-'}</td>
                        <td>${badge}</td>
                        <td class="amount-positive">$${debt.toFixed(2)}</td>
                    </tr>`;
            });
            tbl += `</tbody></table>`;
            return tbl;
        };

        html += renderSubTable('ត្រូវបង់ថ្ងៃនេះ (Due Today)', '#0d6efd', cat.groups.today, 'fa fa-calendar-day');
        html += renderSubTable('ហួសកំណត់ (Overdue)', '#dc3545', cat.groups.overdue, 'fa fa-exclamation-circle');
        html += renderSubTable('ជិតដល់ថ្ងៃ (Upcoming)', '#fd7e14', cat.groups.warning, 'fa fa-clock');
        html += renderSubTable('មិនទាន់បង់ផ្សេងៗ (Other Unpaid)', '#6c757d', cat.groups.unpaid, 'fa fa-file-invoice-dollar');

        html += `</div></div>`;
    });

    html += `
    <div class="dashboard-grid" style="margin-top: 50px; border-top: 2px dashed #ddd; padding-top: 30px; break-inside: avoid;">
        <div class="stat-card blue">
            <div class="stat-icon"><i class="fa fa-calendar-day"></i></div>
            <div class="stat-title">ត្រូវបង់ថ្ងៃនេះ</div>
            <div class="stat-value">${stats.today.count} នាក់</div>
            <div class="stat-debt">$${stats.today.amount.toFixed(2)}</div>
        </div>
        <div class="stat-card red">
            <div class="stat-icon"><i class="fa fa-exclamation-triangle"></i></div>
            <div class="stat-title">ហួសកំណត់</div>
            <div class="stat-value">${stats.overdue.count} នាក់</div>
            <div class="stat-debt">$${stats.overdue.amount.toFixed(2)}</div>
        </div>
        <div class="stat-card orange">
            <div class="stat-icon"><i class="fa fa-clock"></i></div>
            <div class="stat-title">ជិតដល់ថ្ងៃ</div>
            <div class="stat-value">${stats.warning.count} នាក់</div>
            <div class="stat-debt">$${stats.warning.amount.toFixed(2)}</div>
        </div>
        <div class="stat-card gray">
            <div class="stat-icon"><i class="fa fa-users"></i></div>
            <div class="stat-title">សរុបរួម</div>
            <div class="stat-value" style="color:#8a0e5b;">${stats.total.count} នាក់</div>
            <div class="stat-debt" style="color:#dc3545;">$${stats.total.amount.toFixed(2)}</div>
        </div>
    </div>`;

    html += `
        <div style="margin-top: 60px; display: flex; justify-content: space-around; break-inside: avoid;">
            <div style="text-align: center;">
                <p style="font-weight:bold; color:#555;">រៀបចំដោយ</p>
                <div style="height:60px;"></div>
                <div style="width:120px; border-top:1px solid #bbb; margin:0 auto;"></div>
                <p style="margin-top:8px; font-size:13px; color:#777;">បេឡាករ</p>
            </div>
            <div style="text-align: center;">
                <p style="font-weight:bold; color:#555;">ត្រួតពិនិត្យដោយ</p>
                <div style="height:60px;"></div>
                <div style="width:120px; border-top:1px solid #bbb; margin:0 auto;"></div>
                <p style="margin-top:8px; font-size:13px; color:#777;">ប្រធានគណនេយ្យ</p>
            </div>
            <div style="text-align: center;">
                <p style="font-weight:bold; color:#555;">អនុម័តដោយ</p>
                <div style="height:60px;"></div>
                <div style="width:120px; border-top:1px solid #bbb; margin:0 auto;"></div>
                <p style="margin-top:8px; font-size:13px; color:#777;">នាយកសាលា</p>
            </div>
        </div>
        
        <div class="print-footer">
            <div>Tian Xin International School</div>
            <div class="page-number"></div>
            <div>${new Date().toLocaleDateString('en-GB')}</div>
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
            @page { margin: 15mm; size: landscape; }
            @font-face {
                font-family: 'Khmer OS Battambang';
                src: url(data:font/truetype;charset=utf-8;base64,${typeof khmerFontBase64 !== 'undefined' ? khmerFontBase64 : ''}) format('truetype');
                font-weight: normal;
                font-style: normal;
            }
            body { 
                font-family: 'Khmer OS Battambang', sans-serif !important; 
                padding: 10px; 
                color: #333; 
                background: #fff; 
                margin-bottom: 40px;
            }
            .header-container { margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 20px; display: flex; align-items: center; gap: 20px; text-align: left; }
            .logo { width: 85px; height: 85px; object-fit: cover; }
            .school-text { flex: 1; }
            .school-text h1 { margin: 0; font-size: 1.6rem; color: #2c3e50; font-weight: bold; }
            .school-text h2 { margin: 5px 0 0; font-size: 1.1rem; color: #8a0e5b; font-weight: bold; }
            .report-title { position: absolute; right: 20px; top: 110px; text-align: right; }
            .report-title h2 { margin: 0; color: #d63384; text-transform: uppercase; font-size: 1.3rem; text-decoration: underline; }
            .report-subtitle { margin-top: 5px; font-weight: bold; color: #555; }
            .date-info { text-align: right; margin-top: 5px; font-size: 0.9rem; font-style: italic; }
            
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

            .print-footer { display: none; }

            @media print { 
                @page { margin: 20mm; }
                .no-print { display: none !important; } 
                body { padding: 0; margin-bottom: 40px; }
                table { page-break-inside: auto; }
                tr { page-break-inside: avoid; page-break-after: auto; }
                
                 .print-footer {
                     display: flex;
                     position: fixed;
                     bottom: 0;
                     left: 0; 
                     width: 100%;
                     height: 30px;
                     justify-content: space-between;
                     align-items: center;
                     padding: 0 40px;
                     border-top: 1px solid #ccc;
                     font-size: 10px;
                     color: #666;
                     background: white;
                     z-index: 9999;
                 }
                 .page-number:after {
                    content: "Page " counter(page);
                 }
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
        
        <div class="print-footer">
            <div>Tian Xin International School</div>
            <div class="page-number"></div>
            <div>${new Date().toLocaleDateString('en-GB')}</div>
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
    // 1. Filter students who are overdue or warning
    const alertStudents = Object.values(allStudentsData).filter(s => {
        const status = getPaymentStatus(s);
        const remaining = calculateRemainingAmount(s);
        // "Overdue" or "Warning" AND has remaining balance
        return ['overdue', 'warning'].includes(status.status) && remaining > 0;
    });

    if (alertStudents.length === 0) return showAlert('គ្មានសិស្សត្រូវជូនដំណឹង (No students to alert)', 'info');

    // 2. Define Categories
    const categories = {
        'chinese_full': { label: 'ថ្នាក់ភាសាចិនពេញម៉ោង (Chinese Full-time)', students: [], total: 0 },
        'chinese_part': { label: 'ថ្នាក់ភាសាចិនក្រៅម៉ោង (Chinese Part-time)', students: [], total: 0 },
        'lang_1': { label: 'ថ្នាក់ភាសា (១ភាសា / 1 Language)', students: [], total: 0 },
        'lang_2': { label: 'ថ្នាក់ភាសា (២ភាសា / 2 Languages)', students: [], total: 0 },
        'lang_3': { label: 'ថ្នាក់ភាសា (៣ភាសា / 3 Languages)', students: [], total: 0 },
        'other': { label: 'ផ្សេងៗ (Other)', students: [], total: 0 }
    };

    // 3. Categorize Students
    alertStudents.forEach(s => {
        const level = (s.studyLevel || '').toLowerCase();
        let catKey = 'other';

        if (level.includes('ពេញម៉ោង') || level.includes('full')) {
            catKey = 'chinese_full';
        } else if (level.includes('ក្រៅម៉ោង') || level.includes('part')) {
            catKey = 'chinese_part';
        } else if (level.includes('១ភាសា') || level.includes('1 language')) {
            catKey = 'lang_1';
        } else if (level.includes('២ភាសា') || level.includes('2 language')) {
            catKey = 'lang_2';
        } else if (level.includes('៣ភាសា') || level.includes('3 language')) {
            catKey = 'lang_3';
        }

        categories[catKey].students.push(s);
        categories[catKey].total += calculateRemainingAmount(s);
    });

    let grandTotal = 0;
    Object.values(categories).forEach(c => grandTotal += c.total);

    let win = window.open('', '_blank');
    let html = `<html><head><title>របាយការណ៍សិស្សហួសកំណត់បង់ប្រាក់</title>
        <base href="${window.location.href}">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
        <style>
            @font-face {
                font-family: 'Khmer OS Battambang';
                src: url(data:font/truetype;charset=utf-8;base64,${typeof khmerFontBase64 !== 'undefined' ? khmerFontBase64 : ''}) format('truetype');
                font-weight: normal;
                font-style: normal;
            }
            @page { margin: 15mm; size: landscape; }
            body { 
                font-family: 'Khmer OS Battambang', sans-serif !important; 
                padding: 15px; 
                margin: 0;
                color: #333; 
                background: #f8f9fa; 
                margin-bottom: 40px;
            }
            .header-container { margin-bottom: 20px; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: flex; align-items: center; gap: 25px; text-align: left; }
            .logo { width: 85px; height: 85px; object-fit: cover; }
            .school-text { flex: 1; }
            .school-text h1 { margin: 0; font-size: 1.6rem; color: #2c3e50; font-weight: bold; }
            .school-text h2 { margin: 5px 0 0; font-size: 1.1rem; color: #8a0e5b; font-weight: bold; }
            .report-title h2 { margin: 10px 0; color: #d63384; text-transform: uppercase; font-size: 1.3rem; text-decoration: underline; }
            .date-info { text-align: right; margin-top: 5px; font-size: 0.9rem; font-style: italic; color: #666; }
            
            .section-container { margin-bottom: 30px; background: white; padding: 15px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            .section-header { 
                background-color: #e9ecef; 
                padding: 10px 15px; 
                font-weight: bold; 
                color: #495057; 
                border-left: 5px solid #d63384; 
                margin-bottom: 10px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            table { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 0.85rem; }
            th, td { border: 1px solid #dee2e6; padding: 8px 5px; text-align: center; vertical-align: middle; }
            th { background-color: #212529; color: #fff; font-weight: normal; vertical-align: middle; }
            tr:nth-child(even) { background-color: #f8f9fa; }
            
            .text-left { text-align: left !important; padding-left: 10px; }
            .text-right { text-align: right !important; padding-right: 10px; }
            .text-danger { color: #dc3545; font-weight: bold; }
            .text-warning { color: #fd7e14; font-weight: bold; }
            .fw-bold { font-weight: bold; }

            .summary-card {
                display: inline-block;
                background: white;
                border: 1px solid #dee2e6;
                border-radius: 8px;
                padding: 10px 15px;
                margin: 0 10px 10px 0;
                min-width: 200px;
                text-align: left;
            }
            .summary-card h4 { margin: 0 0 5px 0; font-size: 0.9rem; color: #6c757d; }
            .summary-card p { margin: 0; font-size: 1.1rem; font-weight: bold; color: #d63384; }

            /* Action Bar */
            /* Action Bar - Changed from fixed to sticky/relative so it doesn't block content */
            .action-bar { 
                position: relative;
                top: 0; 
                left: 0; 
                width: 100%; 
                background: #343a40; 
                padding: 10px 20px; 
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                margin-bottom: 20px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            }
            .content-wrapper { margin-top: 0; } /* Removed margin-top since bar is not fixed */

            .footer { margin-top: 40px; display: flex; justify-content: space-around; font-size: 0.9rem; page-break-inside: avoid; background: white; padding: 20px; border-radius: 8px; }
            .signature-box { text-align: center; width: 200px; }
            .signature-line { margin-top: 50px; border-top: 1px solid #333; width: 80%; margin-left: auto; margin-right: auto; }

            .print-footer { display: none; }

            @media print { 
                @page { margin: 20mm; }
                .no-print { display: none !important; } 
                body { padding: 0; background: white; margin-bottom: 40px; }
                .content-wrapper { margin-top: 0; }
                .header-container { margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #8a0e5b !important; }
                /* Allow sections to break across pages */
                .section-container { box-shadow: none; border: 1px solid #eee; break-inside: auto; }
                .section-header { background: #f8f9fa; border-left-color: #000; color: #000; }
                th { background-color: #e9ecef; color: #000; font-weight: bold; border-color: #000; }
                td { border-color: #000; }
                tr { break-inside: avoid; page-break-inside: avoid; }
                thead { display: table-header-group; }
                .summary-card { border: 1px solid #000; }
                .summary-card p { color: #000; }

                .print-footer {
                     display: flex;
                     position: fixed;
                     bottom: 0;
                     left: 0; 
                     width: 100%;
                     height: 30px;
                     justify-content: space-between;
                     align-items: center;
                     padding: 0 40px;
                     border-top: 1px solid #ccc;
                     font-size: 10px;
                     color: #666;
                     background: white;
                     z-index: 9999;
                 }
                 .page-number:after {
                    content: "Page " counter(page);
                 }
            }
        </style>
        <script>
            function searchTable() {
                var input, filter, tables, tr, td, i, txtValue;
                input = document.getElementById("searchReportInput");
                filter = input.value.toUpperCase();
                // Search all tbody rows
                tables = document.getElementsByTagName("table");
                for (var t = 0; t < tables.length; t++) {
                     tr = tables[t].getElementsByTagName("tr");
                     for (i = 0; i < tr.length; i++) {
                        // Check multiple columns (ID, Name)
                        var tdId = tr[i].getElementsByTagName("td")[1];
                        var tdName = tr[i].getElementsByTagName("td")[2];
                        if (tdId || tdName) {
                            var txtId = tdId ? (tdId.textContent || tdId.innerText) : "";
                            var txtName = tdName ? (tdName.textContent || tdName.innerText) : "";
                            if (txtId.toUpperCase().indexOf(filter) > -1 || txtName.toUpperCase().indexOf(filter) > -1) {
                                tr[i].style.display = "";
                            } else {
                                // Don't hide header rows or footer rows if they exist in main body (unlikely here)
                                // Only hide data rows
                                if(tr[i].getElementsByTagName("td").length > 0 && !tr[i].classList.contains("total-row")) {
                                     tr[i].style.display = "none";
                                }
                            }
                        }
                     }
                }
            }
        </script>
        </head><body>
        
        <div class="action-bar no-print">
            <div class="d-flex align-items-center">
                 <h4><i class="fas fa-file-invoice-dollar me-2"></i>របាយការណ៍ហួសកំណត់</h4>
            </div>
            <div class="d-flex align-items-center">
                 <div class="search-container me-3">
                    <i class="fas fa-search text-muted"></i>
                    <input type="text" id="searchReportInput" class="search-input" onkeyup="searchTable()" placeholder="ស្វែងរកឈ្មោះ/អត្តលេខ...">
                 </div>
                <a href="data-tracking.html" class="btn btn-back" onclick="window.close(); return false;">
                    <i class="fas fa-home"></i> ត្រឡប់ទៅផ្ទាំងដើម
                </a>
                <button class="btn btn-print ms-2" onclick="window.print()">
                    <i class="fas fa-print"></i> បោះពុម្ព
                </button>
            </div>
        </div>

        <div class="content-wrapper">
            <div class="header-container">
                <img src="img/1.jpg" class="logo" onerror="this.src='img/1.jpg'">
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
                
                <div style="text-align: center; margin-top: 20px;">
                    <div class="summary-card">
                        <h4>សរុបសិស្សហួសកំណត់</h4>
                        <p>${alertStudents.length} នាក់</p>
                    </div>
                     <div class="summary-card">
                        <h4>ទឹកប្រាក់ខ្វះសរុប</h4>
                        <p class="text-danger">$${grandTotal.toFixed(2)}</p>
                    </div>
                </div>
            </div>

            ${Object.keys(categories).map(key => {
        const cat = categories[key];
        if (cat.students.length === 0) return ''; // Skip empty categories

        // Sort students in category
        cat.students.sort((a, b) => (parseInt(a.displayId) || 0) - (parseInt(b.displayId) || 0));

        return `
                <div class="section-container">
                    <div class="section-header">
                        <span>${cat.label.toUpperCase()}</span>
                        <span class="badge bg-danger text-white px-2 rounded">${cat.students.length} នាក់</span>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th width="4%">ល.រ</th>
                                <th width="7%">អត្តលេខ</th>
                                <th width="15%">ឈ្មោះសិស្ស</th>
                                <th width="5%">ភេទ</th>
                                <th width="10%">គ្រូបន្ទុកថ្នាក់</th>
                                <th width="10%">ម៉ោងសិក្សា</th>
                                <th width="8%">កាលបរិច្ឆេទបង់</th>
                                <th width="8%">ចំនួនខែ</th>
                                <th width="12%">ស្ថានភាព</th>
                                <th width="10%">ទឹកប្រាក់ខ្វះ</th>
                                <th width="10%">កំណត់សម្គាល់</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${cat.students.map((s, index) => {
            const statusObj = getPaymentStatus(s);
            const days = statusObj.daysRemaining;
            let statusLabel = "";
            let statusClass = "";

            if (days < 0) {
                statusLabel = `ហួស ${Math.abs(days)} ថ្ងៃ`;
                statusClass = "text-danger";
            } else {
                statusLabel = `ជិតដល់ (${days} ថ្ងៃទៀត)`;
                statusClass = "text-warning";
            }

            // Override if unpaid but not strictly overdue by date logic (rare but possible if manually set)
            if (statusObj.status === 'paid') statusLabel = "បានបង់ (Verified)"; // Should not happen due to filter

            return `
                                <tr>
                                    <td>${index + 1}</td>
                                    <td class="fw-bold">${s.displayId}</td>
                                    <td class="text-left">${s.lastName} ${s.firstName}</td>
                                    <td>${s.gender === 'Male' ? 'ប្រុស' : 'ស្រី'}</td>
                                    <td>${s.teacherName || '-'}</td>
                                    <td>${s.studyTime || '-'}</td>
                                    <td>${s.nextPaymentDate || '-'}</td>
                                    <td>${s.paymentMonths || 1} ខែ</td>
                                    <td class="${statusClass}">${statusLabel}</td>
                                    <td class="text-right text-danger">$${calculateRemainingAmount(s).toFixed(2)}</td>
                                    <td></td>
                                </tr>
                                `;
        }).join('')}
                            <tr class="total-row" style="background-color: #ffe6e6; font-weight: bold;">
                                <td colspan="9" class="text-right">សរុបផ្នែកនេះ (Subtotal):</td>
                                <td class="text-right text-danger">$${cat.total.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                `;
    }).join('')}

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
        </div>
        
        <div class="print-footer">
            <div>Tian Xin International School</div>
            <div class="page-number"></div>
            <div>${new Date().toLocaleDateString('en-GB')}</div>
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
            @page { size: landscape; margin: 15mm; }
            @font-face {
                font-family: 'Khmer OS Battambang';
                src: url(data:font/truetype;charset=utf-8;base64,${typeof khmerFontBase64 !== 'undefined' ? khmerFontBase64 : ''}) format('truetype');
            }
            body { font-family: 'Khmer OS Battambang', sans-serif; padding: 20px; color: #333; }
            .header { display: flex; align-items: center; gap: 20px; margin-bottom: 30px; border-bottom: 3px solid #3498db; padding-bottom: 20px; }
            .school-info { display: flex; align-items: center; gap: 20px; flex: 1; }
            .logo { width: 85px; height: 85px; object-fit: cover; border-radius: 10px; border: 2px solid #3498db; }
            .school-name h2 { margin: 0; color: #2980b9; }
            .school-name p { margin: 5px 0 0; font-size: 0.9rem; color: #666; }
            .report-title { text-align: center; margin: 20px 0; }
            .report-title h1 { color: #2980b9; font-size: 1.8rem; text-decoration: underline; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
            th, td { border: 1px solid #dee2e6; padding: 12px; text-align: center; }
            th { background: linear-gradient(135deg, #3498db, #2980b9); color: white; }
            tr:nth-child(even) { background-color: #fcfcfc; }
            .footer { margin-top: 50px; text-align: right; font-style: italic; font-size: 0.9rem; }
            @media print { 
                .no-print { display: none; } 
                tr { break-inside: avoid; page-break-inside: avoid; }
                thead { display: table-header-group; }
            }
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


let systemUserNames = [];


function fetchSystemUsers() {
    firebase.database().ref('users').once('value').then(snapshot => {
        const users = snapshot.val();
        if (users) {
            systemUserNames = Object.values(users).map(u => u.name).filter(n => n);
        }
    }).catch(err => console.error("Error fetching users:", err));
}

function getReceiverSelectHtml(selectedValue, nameAttr, classAttr, idAttr) {
    let html = `<select class="form-select ${classAttr || ''}" name="${nameAttr || ''}" ${idAttr ? `id="${idAttr}"` : ''}>`;
    html += `<option value="">ជ្រើសរើសអ្នកទទួល...</option>`;

    // Sort names
    let options = [...new Set(systemUserNames)].sort();

    options.forEach(name => {
        const selected = (selectedValue === name) ? 'selected' : '';
        html += `<option value="${name}" ${selected}>${name}</option>`;
    });

    // If selectedValue is not in the list (legacy data or manual entry), add it as an option
    if (selectedValue && !options.includes(selectedValue)) {
        html += `<option value="${selectedValue}" selected>${selectedValue}</option>`;
    }

    html += `</select>`;
    return html;
}

function getPaymentMethodSelectHtml(selectedValue, nameAttr, classAttr, idAttr) {
    let html = `<select class="form-select ${classAttr || ''}" name="${nameAttr || ''}" ${idAttr ? `id="${idAttr}"` : ''}>`;
    // User requested specifically "តាមធនាគារ (Bank)" and "ប្រាក់សុទ្ធ (Cash)"
    const methods = [
        { value: "Cash", label: "ប្រាក់សុទ្ធ (Cash)" },
        { value: "Bank", label: "តាមធនាគារ (Bank)" }
    ];

    methods.forEach(m => {
        const selected = (selectedValue === m.value) ? 'selected' : '';
        html += `<option value="${m.value}" ${selected}>${m.label}</option>`;
    });

    // Legacy check
    if (selectedValue && !methods.some(m => m.value === selectedValue)) {
        html += `<option value="${selectedValue}" selected>${selectedValue}</option>`;
    }

    html += `</select>`;
    return html;
}

// Setup Real-time Search Listener
function setupSearchListener() {
    let debounceTimer;

    $('#searchName').off('input search keyup paste').on('input search keyup paste', function (e) {
        // Prevent enter key from submitting if inside a form
        if (e.type === 'keyup' && e.which === 13) {
            e.preventDefault();
            return false;
        }

        const val = $(this).val();

        // Use debounce to prevent freezing on fast typing
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            currentFilters.searchName = val;
            renderFilteredTable();
        }, 150); // 150ms delay for "instant" feel but good performance
    });

    // Prevent Enter form submission (Crucial for "No Reload")
    $('#searchName').off('keypress').on('keypress', function (e) {
        if (e.which === 13) {
            e.preventDefault();
            return false;
        }
    });
}

$(document).ready(function () {
    fetchSystemUsers();
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
    // Call search listener immediately (using global function)
    setupSearchListener();
    $('#filterStatus').on('change', function () { currentFilters.status = $(this).val(); renderFilteredTable(); });
    $('#filterTime').on('change', function () { currentFilters.filterTime = $(this).val(); renderFilteredTable(); });
    $('#filterLevel').on('change', function () { currentFilters.filterLevel = $(this).val(); renderFilteredTable(); });
    $('#filterGender').on('change', function () { currentFilters.gender = $(this).val(); renderFilteredTable(); });
    $('#filterClassTeacher').on('change', function () { currentFilters.filterClassTeacher = $(this).val(); renderFilteredTable(); });
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
            endDate: '',
            filterClassTeacher: 'all'
        };
        $('#searchName').val('');
        $('#filterStatus').val('all');
        $('#filterTime').val('all');
        $('#filterLevel').val('all');
        $('#filterGender').val('all');
        $('#filterClassTeacher').val('all');
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
    /**
     * Shows the receipt in a NEW POPUP WINDOW for review and printing.
     * This ensures 100% clean printing without main page interference.
     */
    function printPOSReceipt(studentKey) {
        const s = allStudentsData[studentKey];
        if (!s) return;

        const exchangeRate = 4100;
        const totalUSD = calculateTotalAmount(s);
        const totalKHR = totalUSD * exchangeRate;
        const paidUSD = calculateTotalPaid(s);
        const remainingUSD = calculateRemainingAmount(s);

        const receiptDate = new Date().toLocaleString("en-GB", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit", second: "2-digit",
            hour12: true
        });

        const googleMapsUrl = "https://maps.app.goo.gl/PfPwVquPbs7k4sHb6";
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(googleMapsUrl)}`;

        // Open a new window with specific A5-like dimensions for preview
        // A5 is 148mm x 210mm (Landscape width ~800px, height ~600px)
        const win = window.open('', '_blank', 'width=900,height=700,status=no,toolbar=no,menubar=no,location=no');

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>POS Receipt - ${s.displayId}</title>
            <style>
                @font-face {
                    font-family: 'Khmer OS Battambang';
                    src: url(data:font/truetype;charset=utf-8;base64,${typeof khmerFontBase64 !== 'undefined' ? khmerFontBase64 : ''}) format('truetype');
                }
                body { margin: 0; padding: 20px; background: #555; font-family: 'Khmer OS Battambang', sans-serif; }
                
                /* The Receipt Paper visual on screen */
                .pos-receipt-paper {
                    width: 210mm;
                    height: 148mm;
                    background: white;
                    padding: 15mm;
                    box-sizing: border-box;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                    position: relative;
                    overflow: hidden;
                }

                /* Print Styles - Crucial for "1 Page" */
                @media print {
                    body { background: white; margin: 0; padding: 0; display: block; }
                    .pos-receipt-paper {
                        width: 100%;
                        height: 100%; /* Force A5 landscape fill */
                        box-shadow: none;
                        margin: 0;
                        padding: 15mm; /* Maintain internal padding */
                        page-break-after: avoid;
                        page-break-inside: avoid;
                    }
                    /* Hide print button when printing */
                    .no-print { display: none !important; }
                    
                    @page {
                        size: A5 landscape;
                        margin: 0;
                    }
                }

                /* Utility Headers */
                .header-row { display: flex; border-bottom: 3px double #d63384; padding-bottom: 10px; margin-bottom: 15px; }
                .logo-col { flex: 0 0 35mm; }
                .text-col { flex: 1; text-align: center; }
                .meta-col { flex: 0 0 40mm; text-align: right; }
                
                .school-kh { font-family: 'Moul', serif; font-size: 16pt; color: #d63384; line-height: 1.2; }
                .school-en { font-size: 10pt; font-weight: bold; color: #0d6efd; letter-spacing: 0.5px; margin-top: 5px; }
                .contact { font-size: 8pt; color: #444; margin-top: 5px; line-height: 1.3; }
                
                .receipt-badge { background: #d63384; color: white; padding: 5px 10px; border-radius: 4px; display: inline-block; text-align: center; min-width: 25mm; }
                .receipt-title-kh { font-size: 11pt; font-weight: bold; }
                .receipt-title-en { font-size: 6pt; letter-spacing: 1px; }

                /* Data Grid */
                .content-grid { display: flex; gap: 15px; align-items: flex-start; height: 65mm; } /* Fixed height to ensuring fitting */
                .left-panel { flex: 1; border: 1px dashed #ccc; padding: 10px; border-radius: 8px; height: 100%; }
                .right-panel { flex: 1.4; height: 100%; }

                table { width: 100%; border-collapse: collapse; }
                td, th { padding: 3px 2px; vertical-align: middle; }
                
                .info-label { font-size: 9pt; color: #666; }
                .info-val { font-size: 9.5pt; font-weight: bold; color: #000; text-align: right; }
                
                .invoice-table th { background: #f8f9fa; border-bottom: 2px solid #444; font-size: 9pt; text-align: right; padding: 5px; }
                .invoice-table th:first-child { text-align: left; }
                .invoice-table td { border-bottom: 1px solid #eee; font-size: 9pt; padding: 4px 5px; text-align: right; }
                .invoice-table td:first-child { text-align: left; }
                
                .total-row td { border-top: 2px solid #333; background: #fffadd; font-weight: bold; font-size: 10pt; padding: 6px 5px; color: black !important; }

                /* Footer */
                .footer-row { display: flex; margin-top: 10px; border-top: 2px solid #eee; padding-top: 10px; }
                .footer-note { flex: 1.5; font-size: 7.5pt; color: #444; line-height: 1.4; }
                .footer-sig { flex: 1; display: flex; justify-content: space-between; padding-left: 20px; }
                .sig-box { text-align: center; width: 45%; }
                .sig-line { border-top: 1px solid #333; margin-top: 35px; }
                .sig-label { font-size: 8pt; font-weight: bold; }

                /* Floating Print Button */
                .print-fab {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background: #0d6efd;
                    color: white;
                    border: none;
                    border-radius: 50%;
                    width: 60px;
                    height: 60px;
                    font-size: 24px;
                    cursor: pointer;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
                    display: flex; align-items: center; justify-content: center;
                    transition: transform 0.2s;
                    z-index: 1000;
                }
                .print-fab:hover { transform: scale(1.1); background: #0b5ed7; }
            </style>
        </head>
        <body>
            <button class="print-fab no-print" onclick="window.print()" title="Print Receipt"><i class="fa fa-print"></i></button>

            <div class="pos-receipt-paper">
                <!-- Header -->
                <div class="header-row">
                    <div class="logo-col"><img src="img/1.jpg" onerror="this.src='img/logo.jpg'" style="width:100%;"></div>
                    <div class="text-col">
                        <div class="school-kh">សាលាអន្តរជាតិ ធាន ស៊ីន</div>
                        <div class="school-en">TIAN XIN INTERNATIONAL SCHOOL</div>
                        <div class="contact">សាខាទី២ ភូមិក្រាំង សង្កាត់ក្រាំងអំពិល ក្រុងកំពត ខេត្តកំពត<br>Tel: 093 83 56 78</div>
                    </div>
                    <div class="meta-col">
                        <div class="receipt-badge">
                            <div class="receipt-title-kh">វិក្កយបត្រ</div>
                            <div class="receipt-title-en">RECEIPT</div>
                        </div>
                        <div style="font-size:9pt; font-weight:bold; margin-top:8px;">No: ${s.displayId}</div>
                    </div>
                </div>

                <!-- Body -->
                <div class="content-grid">
                    <div class="left-panel">
                        <div style="font-weight:bold; font-size:10pt; color:#d63384; border-bottom:1px solid #eee; margin-bottom:5px;">
                            <i class="fa fa-user-graduate"></i> ព័ត៌មានសិស្ស
                        </div>
                        <table>
                            <tr><td class="info-label">ឈ្មោះ / Name:</td><td class="info-val">${s.lastName} ${s.firstName}</td></tr>
                            <tr><td class="info-label">ភេទ / Gender:</td><td class="info-val">${s.gender === 'Male' ? 'ប្រុស (M)' : 'ស្រី (F)'}</td></tr>
                            <tr><td class="info-label">កម្រិត / Level:</td><td class="info-val">${s.studyLevel || '-'}</td></tr>
                            <tr><td class="info-label">ម៉ោង / Time:</td><td class="info-val">${s.studyTime || '-'}</td></tr>
                            <tr><td class="info-label" style="color:#0d6efd">ថ្ងៃចូល / Start:</td><td class="info-val" style="color:#0d6efd">${s.startDate || '-'}</td></tr>
                            <tr><td class="info-label">ចំនួនខែ / Paid:</td><td class="info-val">${s.paymentMonths || '0'} ខែ</td></tr>
                            <tr><td class="info-label" style="color:#dc3545">ផុតកំណត់ / Due:</td><td class="info-val" style="color:#dc3545">${s.nextPaymentDate || s.paymentDueDate || '-'}</td></tr>
                        </table>
                    </div>

                    <div class="right-panel">
                        <table class="invoice-table">
                            <thead>
                                <tr><th>បរិយាយ (Description)</th><th width="30%">តម្លៃ (Price)</th></tr>
                            </thead>
                            <tbody>
                                <tr><td>ថ្លៃសិក្សា / Tuition Fee</td><td>$${(parseFloat(s.tuitionFee) || 0).toFixed(2)}</td></tr>
                                ${(parseFloat(s.registrationFee) || 0) > 0 ? `<tr><td>ថ្លៃចុះឈ្មោះ / Registration</td><td>$${(parseFloat(s.registrationFee) || 0).toFixed(2)}</td></tr>` : ''}
                                ${(parseFloat(s.bookFee) || 0) > 0 ? `<tr><td>ថ្លៃសៀវភៅ / Book Fee</td><td>$${(parseFloat(s.bookFee) || 0).toFixed(2)}</td></tr>` : ''}
                                ${(parseFloat(s.fulltimeBookFee) || 0) > 0 ? `<tr><td>ថ្លៃសៀវភៅពេញម៉ោង / FT Book</td><td>$${(parseFloat(s.fulltimeBookFee) || 0).toFixed(2)}</td></tr>` : ''}
                                ${(parseFloat(s.uniformFee) || 0) > 0 ? `<tr><td>ថ្លៃឯកសណ្ឋាន / Uniform</td><td>$${(parseFloat(s.uniformFee) || 0).toFixed(2)}</td></tr>` : ''}
                                ${(parseFloat(s.adminServicesFee) || 0) > 0 ? `<tr><td>សេវារដ្ឋបាល / Admin Service</td><td>$${(parseFloat(s.adminServicesFee) || 0).toFixed(2)}</td></tr>` : ''}
                                ${s.discountPercent > 0 ? `<tr style="color:#dc3545; font-style:italic;"><td>Discounts (${s.discountPercent}%)</td><td>-$${(s.tuitionFee * s.discountPercent / 100).toFixed(2)}</td></tr>` : ''}
                                ${s.discount > 0 ? `<tr style="color:#dc3545; font-style:italic;"><td>Other Discount</td><td>-$${parseFloat(s.discount).toFixed(2)}</td></tr>` : ''}
                            </tbody>
                            <tfoot>
                                <tr class="total-row"><td>សរុបរួម / TOTAL:</td><td>$${totalUSD.toFixed(2)}</td></tr>
                                <tr style="color:#198754; font-weight:bold;"><td>បានបង់ / PAID:</td><td align="right">$${paidUSD.toFixed(2)}</td></tr>
                                <tr style="color:#dc3545; font-weight:bold;"><td>នៅខ្វះ / BALANCE:</td><td align="right">$${remainingUSD.toFixed(2)}</td></tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                <!-- Footer -->
                <div class="footer-row">
                    <div class="footer-note">
                        <div style="font-weight:bold; text-decoration:underline;">ចំណាំ / Note:</div>
                        <div>1. ប្រាក់បង់រួច មិនអាចដកវិញបានទេ (Paid money is non-refundable)</div>
                        <div>2. សូមពិនិត្យបង្កាន់ដៃមុនចាកចេញ (Check receipt before leaving)</div>
                        <div>3. ត្រូវមានបង្កាន់ដៃពី Reception (Receipt required)</div>
                        <div style="margin-top:5px; font-style:italic; font-size:7pt; color:#999;">Printed: ${receiptDate}</div>
                    </div>
                    <div class="footer-sig">
                        <div class="sig-box">
                            <div class="sig-label">អ្នកបង់ប្រាក់ / Payer</div>
                            <div class="sig-line"></div>
                        </div>
                        <div class="sig-box">
                            <div class="sig-label">អ្នកទទួល / Receiver</div>
                            <div class="sig-line"></div>
                        </div>
                    </div>
                </div>
            </div>
            <script>
                // Auto print context can be enabled if desired
                // window.onload = function() { window.print(); }
            </script>
        </body>
        </html>
        `;

        win.document.write(html);
        win.document.close();
    }

    /**
     * Triggers browser print for the receipt modal
     */
    function printModalReceipt() {
        window.print();
    }

    /**
     * Mark student as DROPOUT
     */
    const markAsDropout = (key) => {
        if (confirm("តើអ្នកពិតជាចង់កំណត់សិស្សនេះជា 'សិស្សបោះបង់ការសិក្សា' មែនទេ?")) {
            showLoading(true);
            studentsRef.child(key).update({
                enrollmentStatus: 'dropout',
                dropoutDate: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            }).then(() => {
                showLoading(false);
                // Close modal if open
                const modalEl = document.getElementById('studentDetailsModal');
                if (modalEl) {
                    const modal = bootstrap.Modal.getInstance(modalEl);
                    if (modal) modal.hide();
                }

                showAlert("សិស្សត្រូវបានកំណត់ជាបោះបង់ការសិក្សាដោយជោគជ័យ", "success");
            }).catch(err => {
                showLoading(false);
                showAlert("កំហុស: " + err.message, "danger");
            });
        }
    };

    /**
     * Re-enroll student (Active)
     */
    const reEnrollStudent = (key) => {
        if (confirm("តើអ្នកពិតជាចង់នាំសិស្សនេះមកសិក្សាវិញមែនទេ?")) {
            showLoading(true);
            studentsRef.child(key).update({
                enrollmentStatus: 'active',
                reEnrollDate: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            }).then(() => {
                showLoading(false);
                // Close modal if open
                const modalEl = document.getElementById('studentDetailsModal');
                if (modalEl) {
                    const modal = bootstrap.Modal.getInstance(modalEl);
                    if (modal) modal.hide();
                }

                showAlert("សិស្សត្រូវបាននាំមកសិក្សាវិញដោយជោគជ័យ", "success");
            }).catch(err => {
                showLoading(false);
                showAlert("កំហុស: " + err.message, "danger");
            });
        }
    };

    // Make functions globally accessible for HTML onclick attributes
    window.viewStudentDetails = viewStudentDetails;
    window.showEditModal = showEditModal;
    window.saveStudentChanges = saveStudentChanges;
    window.deleteStudent = deleteStudent;
    window.markAsPaid = markAsPaid;
    window.markAsDropout = markAsDropout;
    window.reEnrollStudent = reEnrollStudent;
    window.printPOSReceipt = printPOSReceipt;
    window.printModalReceipt = printModalReceipt;
    window.generateMonthlyReport = generateMonthlyReport;
    window.generateDetailedAlertReport = generateDetailedAlertReport;
    window.checkAllPayments = checkAllPayments;
    window.exportToExcel = exportToExcel;
    window.downloadMonthlyReport = downloadMonthlyReport;
    window.downloadYearlyReport = downloadYearlyReport;
    window.downloadMonthlyReport = downloadMonthlyReport;
    window.downloadYearlyReport = downloadYearlyReport;
    window.exportOverdueReport = exportOverdueReport;
    window.printPaymentReceipt = printPaymentReceipt;

    window.filterDueToday = () => {
        currentFilters.status = 'today';
        $('#filterStatus').val('today');
        renderFilteredTable();
        showAlert('កំពុងបង្ហាញសិស្សដែលត្រូវបង់ថ្ងៃនេះ', 'info');
    };

    window.exportTodayDuePDF = () => {
        const todayDue = rawStudentsArray.filter(s => {
            if (s.enrollmentStatus === 'dropout') return false;
            return getPaymentStatus(s).status === 'today';
        });

        if (todayDue.length === 0) {
            return showAlert('គ្មានសិស្សត្រូវបង់នៅថ្ងៃនេះទេ', 'info');
        }

        generateStudentListPDF(todayDue, 'របាយការណ៍សិស្សត្រូវបង់ថ្ងៃនេះ (Students Due Today)');
    };

    window.generateStudentListPDF = async (students, title, subtitle = '') => {
        if (!students || students.length === 0) return showAlert('គ្មានទិន្នន័យសម្រាប់បង្កើតរបាយការណ៍', 'warning');

        // Sort
        students.sort((a, b) => (parseInt(a.displayId) || 0) - (parseInt(b.displayId) || 0));

        let totalDueAmount = 0;
        const rows = students.map((s, index) => {
            const remaining = calculateRemainingAmount(s);
            totalDueAmount += remaining;
            const status = getPaymentStatus(s);
            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${s.displayId || '-'}</td>
                    <td class="text-left">${s.lastName || ''} ${s.firstName || ''}</td>
                    <td>${s.gender === 'Male' ? 'ប្រុស' : 'ស្រី'}</td>
                    <td>${s.personalPhone || s.fatherPhone || '-'}</td>
                    <td>${s.studyLevel || ''}</td>
                    <td>${s.studyTime || ''}</td>
                    <td>${convertToKhmerDate(s.startDate)}</td>
                    <td>${s.nextPaymentDate ? convertToKhmerDate(s.nextPaymentDate) : '-'}</td>
                    <td>${status.text}</td>
                    <td class="text-right text-danger fw-bold">$${remaining.toFixed(2)}</td>
                </tr>`;
        }).join('');

        let win = window.open('', '_blank');
        let html = `<html><head><title>${title}</title>
            <style>
                @page { size: landscape; margin: 10mm; }
                @font-face {
                    font-family: 'Khmer OS Battambang';
                    src: url(data:font/truetype;charset=utf-8;base64,${typeof khmerFontBase64 !== 'undefined' ? khmerFontBase64 : ''}) format('truetype');
                }
                body { font-family: 'Khmer OS Battambang', sans-serif; padding: 20px; color: #333; }
                .header { display: flex; align-items: center; gap: 20px; margin-bottom: 30px; padding-bottom: 20px; }
                .logo { width: 90px; height: 90px; object-fit: cover; }
                .school-info { flex: 1; }
                .school-name h1 { margin: 0; color: #8a0e5b; font-size: 1.8rem; font-weight: bold; }
                .school-name h2 { margin: 5px 0 0; color: #2c3e50; font-size: 1.1rem; font-weight: bold; }
                .report-title { text-align: right; }
                .report-title h2 { margin: 0; color: #d63384; text-decoration: underline; }
                
                table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 0.85rem; }
                th, td { border: 1px solid #999; padding: 8px 4px; text-align: center; vertical-align: middle; }
                th { background-color: #f1f1f1; font-weight: bold; color: #000; }
                .text-left { text-align: left !important; padding-left: 8px; }
                .text-right { text-align: right !important; padding-right: 8px; }
                .text-danger { color: #dc3545; }
                .fw-bold { font-weight: bold; }
                
                .footer { margin-top: 40px; display: flex; justify-content: space-around; font-size: 0.9rem; page-break-inside: avoid; }
                .signature-box { text-align: center; width: 200px; }
                .signature-line { margin-top: 50px; border-top: 1px solid #333; width: 100%; }
                
                .no-print { margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; background: #f8f9fa; padding: 10px 20px; border-radius: 8px; }
                .btn { padding: 8px 20px; background: #0d6efd; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; text-decoration: none; }
                
                @media print {
                    .no-print { display: none; }
                    tr { break-inside: avoid; }
                    thead { display: table-header-group; }
                }
            </style>
        </head><body>
            <div class="no-print">
                <span class="fw-bold">របាយការណ៍ត្រូវបានបង្កើតជោគជ័យ</span>
                <button class="btn" onclick="window.print()">បោះពុម្ព (Print)</button>
            </div>
            <div class="header">
                <img src="img/1.jpg" class="logo" onerror="this.src='img/logo.jpg'">
                <div class="school-info">
                    <div class="school-name">
                        <h1>សាលាអន្តរជាតិ ធានស៊ីន</h1>
                        <h2>TIAN XIN INTERNATIONAL SCHOOL</h2>
                    </div>
                </div>
                <div class="report-title">
                    <h2>${title}</h2>
                    ${subtitle ? `<div class="fw-bold">${subtitle}</div>` : ''}
                    <div style="font-size: 0.85rem; margin-top: 5px;">
                        កាលបរិច្ឆេទ: ${new Date().toLocaleDateString('km-KH')}
                    </div>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th width="4%">ល.រ</th>
                        <th width="8%">អត្តលេខ</th>
                        <th>ឈ្មោះសិស្ស</th>
                        <th width="6%">ភេទ</th>
                        <th width="10%">ទូរស័ព្ទ</th>
                        <th width="8%">កំរិត</th>
                        <th width="8%">ម៉ោង</th>
                        <th width="10%">ថ្ងៃចុះឈ្មោះ</th>
                        <th width="10%">ថ្ងៃកំណត់</th>
                        <th width="10%">ស្ថានភាព</th>
                        <th width="8%">ជំពាក់</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                    <tr style="background: #f1f1f1; font-weight: bold;">
                        <td colspan="10" class="text-right">សរុបទឹកប្រាក់ខ្វះ (Total Due):</td>
                        <td class="text-right text-danger">$${totalDueAmount.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>
            
            <div class="footer">
                <div class="signature-box">
                    <div class="fw-bold">អ្នករៀបចំ (Prepared By)</div>
                    <div class="signature-line"></div>
                </div>
                <div class="signature-box">
                    <div class="fw-bold">អ្នកត្រួតពិនិត្យ (Reviewed By)</div>
                    <div class="signature-line"></div>
                </div>
                <div class="signature-box">
                    <div class="fw-bold">នាយកសាលា (Principal)</div>
                    <div class="signature-line"></div>
                </div>
            </div>
        </body></html>`;

        win.document.write(html);
        win.document.close();
    };

    /**
     * Download Report by Class Teacher
     */
    window.downloadClassTeacherReport = (format) => {
        if (currentFilters.filterClassTeacher === 'all') {
            return showAlert('សូមជ្រើសរើសគ្រូបន្ទុកថ្នាក់ជាមុនសិន!', 'warning');
        }

        const filteredStudents = filterStudents(rawStudentsArray);
        if (filteredStudents.length === 0) {
            return showAlert('គ្មានទិន្នន័យសម្រាប់គ្រូនេះទេ!', 'warning');
        }

        const teacherName = currentFilters.filterClassTeacher;

        if (format === 'excel') {
            exportToExcel(filteredStudents, `Report_Teacher_${teacherName.replace(/\s+/g, '_')}`);
        } else {
            generateStudentListPDF(filteredStudents, `របាយការណ៍សិស្ស (គ្រូ៖ ${teacherName})`, `Teacher: ${teacherName}`);
        }
    };

    /**
     * Print Receipt for a specific historical installment
     */
    function printPaymentReceipt(studentKey, index) {
        const s = allStudentsData[studentKey];
        if (!s) return;

        // Flatten installments to find the one matching the index
        let installments = [];
        if (s.installments) {
            if (Array.isArray(s.installments)) {
                installments = s.installments;
            } else if (typeof s.installments === 'object') {
                installments = Object.values(s.installments);
            }
        }

        const inst = installments[index];
        if (!inst) return showAlert('រកមិនឃើញទិន្នន័យបង់ប្រាក់', 'error');

        const amount = parseFloat(inst.amount) || 0;

        // Open a new window with specific A5-like dimensions for preview
        const win = window.open('', '_blank', 'width=900,height=700,status=no,toolbar=no,menubar=no,location=no');

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Payment Receipt - ${s.displayId}</title>
            <style>
                @font-face {
                    font-family: 'Khmer OS Battambang';
                    src: url(data:font/truetype;charset=utf-8;base64,${typeof khmerFontBase64 !== 'undefined' ? khmerFontBase64 : ''}) format('truetype');
                }
                body { margin: 0; padding: 20px; background: #555; font-family: 'Khmer OS Battambang', sans-serif; }
                
                /* The Receipt Paper visual on screen */
                .pos-receipt-paper {
                    width: 210mm;
                    height: 148mm;
                    background: white;
                    padding: 15mm;
                    box-sizing: border-box;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                    position: relative;
                    overflow: hidden;
                }

                /* Print Styles - Crucial for "1 Page" */
                @media print {
                    body { background: white; margin: 0; padding: 0; display: block; }
                    .pos-receipt-paper {
                        width: 100%;
                        height: 100%; /* Force A5 landscape fill */
                        box-shadow: none;
                        margin: 0;
                        padding: 15mm; /* Maintain internal padding */
                        page-break-after: avoid;
                        page-break-inside: avoid;
                    }
                    /* Hide print button when printing */
                    .no-print { display: none !important; }
                    
                    @page {
                        size: A5 landscape;
                        margin: 0;
                    }
                }

                /* Utility Headers */
                .header-row { display: flex; border-bottom: 3px double #d63384; padding-bottom: 10px; margin-bottom: 15px; }
                .logo-col { flex: 0 0 35mm; }
                .text-col { flex: 1; text-align: center; }
                .meta-col { flex: 0 0 40mm; text-align: right; }
                
                .school-kh { font-family: 'Moul', serif; font-size: 16pt; color: #d63384; line-height: 1.2; }
                .school-en { font-size: 10pt; font-weight: bold; color: #0d6efd; letter-spacing: 0.5px; margin-top: 5px; }
                .contact { font-size: 8pt; color: #444; margin-top: 5px; line-height: 1.3; }
                
                .receipt-badge { background: #d63384; color: white; padding: 5px 10px; border-radius: 4px; display: inline-block; text-align: center; min-width: 25mm; }
                .receipt-title-kh { font-size: 11pt; font-weight: bold; }
                .receipt-title-en { font-size: 6pt; letter-spacing: 1px; }

                /* Data Grid */
                .content-grid { display: flex; gap: 15px; align-items: flex-start; height: 65mm; }
                .left-panel { flex: 1; border: 1px dashed #ccc; padding: 10px; border-radius: 8px; height: 100%; }
                .right-panel { flex: 1.4; height: 100%; }

                table { width: 100%; border-collapse: collapse; }
                td, th { padding: 3px 2px; vertical-align: middle; }
                
                .info-label { font-size: 9pt; color: #666; }
                .info-val { font-size: 9.5pt; font-weight: bold; color: #000; text-align: right; }
                
                .invoice-table th { background: #f8f9fa; border-bottom: 2px solid #444; font-size: 9pt; text-align: right; padding: 5px; }
                .invoice-table th:first-child { text-align: left; }
                .invoice-table td { border-bottom: 1px solid #eee; font-size: 9pt; padding: 4px 5px; text-align: right; }
                .invoice-table td:first-child { text-align: left; }
                
                .total-row td { border-top: 2px solid #333; background: #fffadd; font-weight: bold; font-size: 10pt; padding: 6px 5px; color: black !important; }

                /* Footer */
                .footer-row { display: flex; margin-top: 10px; border-top: 2px solid #eee; padding-top: 10px; }
                .footer-note { flex: 1.5; font-size: 7.5pt; color: #444; line-height: 1.4; }
                .footer-sig { flex: 1; display: flex; justify-content: space-between; padding-left: 20px; }
                .sig-box { text-align: center; width: 45%; }
                .sig-line { border-top: 1px solid #333; margin-top: 35px; }
                .sig-label { font-size: 8pt; font-weight: bold; }

                /* Floating Print Button */
                .print-fab {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background: #0d6efd;
                    color: white;
                    border: none;
                    border-radius: 50%;
                    width: 60px;
                    height: 60px;
                    font-size: 24px;
                    cursor: pointer;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
                    display: flex; align-items: center; justify-content: center;
                    transition: transform 0.2s;
                    z-index: 1000;
                }
                .print-fab:hover { transform: scale(1.1); background: #0b5ed7; }
            </style>
        </head>
        <body>
            <button class="print-fab no-print" onclick="window.print()" title="Print Receipt"><i class="fa fa-print"></i></button>

            <div class="pos-receipt-paper">
                <!-- Header -->
                <div class="header-row">
                    <div class="logo-col"><img src="img/1.jpg" onerror="this.src='img/logo.jpg'" style="width:100%;"></div>
                    <div class="text-col">
                        <div class="school-kh">សាលាអន្តរជាតិ ធាន ស៊ីន</div>
                        <div class="school-en">TIAN XIN INTERNATIONAL SCHOOL</div>
                        <div class="contact">សាខាទី២ ភូមិក្រាំង សង្កាត់ក្រាំងអំពិល ក្រុងកំពត ខេត្តកំពត<br>Tel: 093 83 56 78</div>
                    </div>
                    <div class="meta-col">
                        <div class="receipt-badge">
                            <div class="receipt-title-kh">វិក្កយបត្រ</div>
                            <div class="receipt-title-en">RECEIPT</div>
                        </div>
                        <div style="font-size:9pt; font-weight:bold; margin-top:8px;">No: ${s.displayId}-${index + 1}</div>
                    </div>
                </div>

                <!-- Body -->
                <div class="content-grid">
                    <div class="left-panel">
                        <div style="font-weight:bold; font-size:10pt; color:#d63384; border-bottom:1px solid #eee; margin-bottom:5px;">
                            <i class="fa fa-user-graduate"></i> ព័ត៌មានសិស្ស
                        </div>
                        <table>
                            <tr><td class="info-label">ឈ្មោះ / Name:</td><td class="info-val">${s.lastName} ${s.firstName}</td></tr>
                            <tr><td class="info-label">ភេទ / Gender:</td><td class="info-val">${s.gender === 'Male' ? 'ប្រុស (M)' : 'ស្រី (F)'}</td></tr>
                            <tr><td class="info-label">កម្រិត / Level:</td><td class="info-val">${s.studyLevel || '-'}</td></tr>
                            <tr><td class="info-label">ម៉ោង / Time:</td><td class="info-val">${s.studyTime || '-'}</td></tr>
                            <tr><td class="info-label" style="color:#0d6efd">ថ្ងៃបង់ / Date:</td><td class="info-val" style="color:#0d6efd">${convertToKhmerDate(inst.date) || '-'}</td></tr>
                            <tr><td class="info-label">ចំនួនខែ / Months:</td><td class="info-val">${inst.months || '1'} ខែ</td></tr>
                        </table>
                    </div>

                    <div class="right-panel">
                        <table class="invoice-table">
                            <thead>
                                <tr><th>បរិយាយ (Description)</th><th width="30%">តម្លៃ (Price)</th></tr>
                            </thead>
                            <tbody>
                                <tr><td>ថ្លៃសិក្សា (Tuition Fee)</td><td>$${amount.toFixed(2)}</td></tr>
                                ${inst.materialFee > 0 ? `<tr><td>ថ្លៃសម្ភារៈ (Material Fee)</td><td>$${parseFloat(inst.materialFee).toFixed(2)}</td></tr>` : ''}
                                ${inst.adminServicesFee > 0 ? `<tr><td>ថ្លៃរដ្ឋបាល (Admin Fee)</td><td>$${parseFloat(inst.adminServicesFee).toFixed(2)}</td></tr>` : ''}
                                ${inst.discountPercent > 0 ? `<tr style="color:#d63384; font-style:italic;"><td>ការបញ្ចុះតម្លៃ (Discount ${inst.discountPercent}%)</td><td>-$${(amount * inst.discountPercent / 100).toFixed(2)}</td></tr>` : ''}
                                ${inst.discountDollar > 0 ? `<tr style="color:#d63384; font-style:italic;"><td>ការបញ្ចុះតម្លៃ (Discount)</td><td>-$${parseFloat(inst.discountDollar).toFixed(2)}</td></tr>` : ''}
                                ${inst.note ? `<tr><td style="font-style:italic; font-size:8pt; color:#666;">* ${inst.note}</td><td></td></tr>` : ''}
                            </tbody>
                            <tfoot>
                                <tr class="total-row"><td>សរុបបង់ / TOTAL PAID:</td><td>$${(() => {
                let total = amount + (parseFloat(inst.materialFee) || 0) + (parseFloat(inst.adminServicesFee) || 0);
                if (inst.discountPercent > 0) total -= (amount * inst.discountPercent / 100);
                if (inst.discountDollar > 0) total -= parseFloat(inst.discountDollar);
                return total.toFixed(2);
            })()}</td></tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                <!-- Footer -->
                <div class="footer-row">
                    <div class="footer-note">
                        <div style="font-weight:bold; text-decoration:underline;">ចំណាំ / Note:</div>
                        <div>1. ប្រាក់បង់រួច មិនអាចដកវិញបានទេ (Paid money is non-refundable)</div>
                        <div>2. សូមពិនិត្យបង្កាន់ដៃមុនចាកចេញ (Check receipt before leaving)</div>
                        <div>3. ត្រូវមានបង្កាន់ដៃពី Reception (Receipt required)</div>
                        <div style="margin-top:5px; font-style:italic; font-size:7pt; color:#999;">Printed: ${new Date().toLocaleString("en-GB")}</div>
                    </div>
                    <div class="footer-sig">
                        <div class="sig-box">
                            <div class="sig-label">អ្នកបង់ប្រាក់ / Payer</div>
                            <div class="sig-line"></div>
                        </div>
                        <div class="sig-box">
                            <div class="sig-label">អ្នកទទួល / Receiver (User: ${inst.receiver || '-'})</div>
                            <div class="sig-line"></div>
                        </div>
                    </div>
                </div>
            </div>
            <script>
                // window.onload = function() { window.print(); }
            </script>
        </body>
        </html>
        `;

        win.document.write(html);
        win.document.close();
    }
});

// Initialization for Dropout Report Date Inputs
$(document).ready(function () {
    if (document.getElementById('dropoutReportStartDate') && document.getElementById('dropoutReportEndDate')) {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

        // Helper to formatting ISO Date Local
        const toLocalISO = (date) => {
            const offset = date.getTimezoneOffset();
            date = new Date(date.getTime() - (offset * 60 * 1000));
            return date.toISOString().split('T')[0];
        };

        document.getElementById('dropoutReportStartDate').value = toLocalISO(firstDay);
        document.getElementById('dropoutReportEndDate').value = toLocalISO(today);
    }
});