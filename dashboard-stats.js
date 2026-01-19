/**
 * dashboard-stats.js - Enhanced Version
 * ប្រព័ន្ធគ្រប់គ្រងទិន្នន័យសម្រាប់សាលាអន្តរជាតិ ធានស៊ីន
 */

// ========================================================
// 1. GLOBAL VARIABLES & CONFIGURATION
// ========================================================
let isInitialLoad = true;
let dashboardUpdateInterval = null;
const UPDATE_INTERVAL = 30000; // 30 seconds
const MAX_RETRY_ATTEMPTS = 3;
let retryCount = 0;

// Firebase references
let database = null;
let studentsRef = null;
let staffRef = null;
let expenseRef = null;
let paymentsRef = null;
let classesRef = null;
let transactionsRef = null;

// ========================================================
// 2. UTILITY FUNCTIONS
// ========================================================

/**
 * Format amount to USD currency
 */
function formatCurrency(amount) {
    if (isNaN(amount) || amount === null || amount === undefined) {
        amount = 0;
    }

    amount = parseFloat(amount);
    if (isNaN(amount)) amount = 0;

    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

/**
 * Format number with Khmer locale
 */
function formatNumber(num) {
    if (isNaN(num) || num === null || num === undefined) {
        num = 0;
    }

    num = parseFloat(num);
    if (isNaN(num)) num = 0;

    return num.toLocaleString('km-KH');
}

/**
 * Animate value changes smoothly
 */
function animateValue(elementId, start, end, duration = 1000) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.warn(`Element with ID "${elementId}" not found for animation`);
        return;
    }

    if (isNaN(start)) start = 0;
    if (isNaN(end)) end = 0;

    const startTime = performance.now();
    const isCurrency = elementId.includes('Revenue') ||
        elementId.includes('Expense') ||
        elementId.includes('revenue') ||
        elementId.includes('expense');

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(start + (end - start) * easeOut);

        if (isCurrency) {
            element.textContent = formatCurrency(current);
        } else {
            element.textContent = formatNumber(current);
        }

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            if (isCurrency) {
                element.textContent = formatCurrency(end);
            } else {
                element.textContent = formatNumber(end);
            }
        }
    }

    requestAnimationFrame(update);
}

/**
 * Show loading state on stat cards
 */
function showLoadingState(show = true) {
    if (show) {
        if (window.showUniversalLoader) window.showUniversalLoader();
    } else {
        if (window.hideUniversalLoader) window.hideUniversalLoader();
    }

    const cards = document.querySelectorAll('.stat-card, .card');
    cards.forEach(card => {
        if (show) {
            card.classList.add('loading');
        } else {
            card.classList.remove('loading');
        }
    });
}

/**
 * Show error/success message
 */
function showMessage(message, type = 'warning') {
    const existingAlerts = document.querySelectorAll('.dashboard-error-alert');
    existingAlerts.forEach(alert => {
        alert.style.opacity = '0';
        setTimeout(() => alert.remove(), 300);
    });

    const alertDiv = document.createElement('div');
    alertDiv.className = `dashboard-error-alert alert alert-${type} alert-dismissible fade show mt-3`;
    alertDiv.style.cssText = 'transition: opacity 0.3s;';

    let icon = 'fa-info-circle';
    if (type === 'danger') icon = 'fa-exclamation-triangle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'warning') icon = 'fa-exclamation-circle';

    alertDiv.innerHTML = `
        <i class="fas ${icon} me-2"></i>
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    const mainContent = document.getElementById('main-content');
    if (mainContent) {
        mainContent.insertBefore(alertDiv, mainContent.children[1]);
    }

    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.style.opacity = '0';
            setTimeout(() => alertDiv.remove(), 300);
        }
    }, 10000);
}

// ========================================================
// 3. FIREBASE INITIALIZATION
// ========================================================

function initializeFirebaseRefs() {
    try {
        console.log('Initializing Firebase references...');

        if (typeof firebase === 'undefined') {
            throw new Error('Firebase SDK is not loaded.');
        }

        if (!firebase.apps || firebase.apps.length === 0) {
            throw new Error('Firebase app is not initialized.');
        }

        database = firebase.database();

        if (!database) {
            throw new Error('Failed to get Firebase database instance.');
        }

        studentsRef = database.ref('students');
        staffRef = database.ref('staff');
        expenseRef = database.ref('expenses/currentMonth');
        paymentsRef = database.ref('payments');
        classesRef = database.ref('classes');
        transactionsRef = database.ref('transactions');

        console.log('Firebase references initialized successfully');
        return true;

    } catch (error) {
        console.error('Failed to initialize Firebase references:', error);

        let errorMessage = 'មិនអាចភ្ជាប់ទៅ Firebase Database។ ';

        if (error.message.includes('not loaded')) {
            errorMessage += 'សូមពិនិត្យការភ្ជាប់អ៊ីនធឺណិតរបស់អ្នក។';
        } else if (error.message.includes('not initialized')) {
            errorMessage += 'សូមពិនិត្យការកំណត់ Firebase របស់អ្នក។';
        } else {
            errorMessage += error.message;
        }

        showMessage(errorMessage, 'danger');
        return false;
    }
}

// ========================================================
// 4. DATA PROCESSING FUNCTIONS
// ========================================================

function updateStudentStats(studentsData) {
    if (!studentsData) {
        console.warn('No student data available');
        return;
    }

    try {
        const students = Object.values(studentsData);

        let fulltimeTotal = 0, fulltimeMale = 0, fulltimeFemale = 0;
        let parttimeTotal = 0, parttimeMale = 0, parttimeFemale = 0;
        let kindergartenTotal = 0, kindergartenMale = 0, kindergartenFemale = 0;

        students.forEach(student => {
            if (!student) return;

            // Get study type/course type
            const courseType = student.courseType ? student.courseType.toString() : '';
            const studyType = student.studyType ? student.studyType.toString() : '';
            const studyProgram = student.studyProgram ? student.studyProgram.toString() : '';
            const typeStr = (courseType + studyType + studyProgram).toLowerCase();
            const genderType = getStudentGender(student);

            // Determine categories
            const isKindergarten = typeStr.includes('3_languages') ||
                typeStr.includes('3 languages') ||
                typeStr.includes('៣ ភាសា') ||
                studyProgram === '3_languages';

            const isPartTime = !isKindergarten && (typeStr.includes('parttime') ||
                typeStr.includes('part-time') ||
                typeStr.includes('ក្រៅម៉ោង') ||
                typeStr.includes('chinese-parttime'));

            // Default to fulltime if likely Chinese and not parttime, but exclude Kindergarten
            const isFullTime = !isKindergarten && !isPartTime &&
                (typeStr.includes('fulltime') ||
                    typeStr.includes('ពេញម៉ោង') ||
                    typeStr.includes('chinese-fulltime') ||
                    typeStr !== '');

            if (isKindergarten) {
                kindergartenTotal++;
                if (genderType === 'ប្រុស') kindergartenMale++;
                else if (genderType === 'ស្រី') kindergartenFemale++;
            } else if (isPartTime) {
                parttimeTotal++;
                if (genderType === 'ប្រុស') parttimeMale++;
                else if (genderType === 'ស្រី') parttimeFemale++;
            } else if (isFullTime) {
                fulltimeTotal++;
                if (genderType === 'ប្រុស') fulltimeMale++;
                else if (genderType === 'ស្រី') fulltimeFemale++;
            }
        });

        const allTotal = fulltimeTotal + parttimeTotal;
        const allMale = fulltimeMale + parttimeMale;
        const allFemale = fulltimeFemale + parttimeFemale;

        // Get previous values for smooth animation
        const getPrevValue = (id) => {
            const element = document.getElementById(id);
            if (!element) return 0;

            const text = element.textContent || '0';
            const cleaned = text.replace(/[^0-9.-]+/g, '');
            return parseInt(cleaned) || 0;
        };

        const prevFulltime = getPrevValue('totalFulltimeStudents');
        const prevParttime = getPrevValue('totalParttimeStudents');
        const prevKindergarten = getPrevValue('totalKindergartenStudents');
        const prevAll = getPrevValue('totalAllStudents');

        // Update Full-time stats
        if (document.getElementById('totalFulltimeStudents')) {
            animateValue('totalFulltimeStudents', prevFulltime, fulltimeTotal);
        }
        if (document.getElementById('totalFulltimeMale')) {
            animateValue('totalFulltimeMale', 0, fulltimeMale);
        }
        if (document.getElementById('totalFulltimeFemale')) {
            animateValue('totalFulltimeFemale', 0, fulltimeFemale);
        }

        // Update Part-time stats
        if (document.getElementById('totalParttimeStudents')) {
            animateValue('totalParttimeStudents', prevParttime, parttimeTotal);
        }
        if (document.getElementById('totalParttimeMale')) {
            animateValue('totalParttimeMale', 0, parttimeMale);
        }
        if (document.getElementById('totalParttimeFemale')) {
            animateValue('totalParttimeFemale', 0, parttimeFemale);
        }

        // Update Kindergarten stats
        if (document.getElementById('totalKindergartenStudents')) {
            animateValue('totalKindergartenStudents', prevKindergarten, kindergartenTotal);
        }
        if (document.getElementById('totalKindergartenMale')) {
            animateValue('totalKindergartenMale', 0, kindergartenMale);
        }
        if (document.getElementById('totalKindergartenFemale')) {
            animateValue('totalKindergartenFemale', 0, kindergartenFemale);
        }

        // Calculate All Students Total
        const allTotalCount = fulltimeTotal + parttimeTotal + kindergartenTotal;
        const allMaleCount = fulltimeMale + parttimeMale + kindergartenMale;
        const allFemaleCount = fulltimeFemale + parttimeFemale + kindergartenFemale;

        // Update All Students stats
        if (document.getElementById('totalAllStudents')) {
            animateValue('totalAllStudents', prevAll, allTotalCount);
        }
        if (document.getElementById('totalAllMale')) {
            animateValue('totalAllMale', 0, allMaleCount);
        }
        if (document.getElementById('totalAllFemale')) {
            animateValue('totalAllFemale', 0, allFemaleCount);
        }

        console.log('Student stats updated:', {
            fulltime: { total: fulltimeTotal, male: fulltimeMale, female: fulltimeFemale },
            parttime: { total: parttimeTotal, male: parttimeMale, female: parttimeFemale },
            kindergarten: { total: kindergartenTotal, male: kindergartenMale, female: kindergartenFemale },
            all: { total: allTotalCount, male: allMaleCount, female: allFemaleCount }
        });

    } catch (error) {
        console.error('Error updating student stats:', error);
    }
}

/**
 * Update staff statistics (Placeholder as no UI exists yet)
 */
function updateStaffStats(staffData) {
    if (!staffData) return;
    // Currently no UI elements for staff stats, just logging to prevent error
    const count = Object.keys(staffData).length;
    console.log(`Staff data updated: ${count} staff members`);
}

/**
 * Calculate total amount (Price) for a student
 */
function calculateTotalAmount(student) {
    if (!student) return 0;
    // Base fee
    let total = parseFloat(student.coursePrice) || parseFloat(student.tuitionFee) || parseFloat(student.netFee) || 0;

    // Add other fees if stored separately (adjust based on your data structure)
    // Assuming netFee/coursePrice is the main "Total Payable"
    return total;
}

/**
 * Calculate total paid amount for a student
 */
function calculateTotalPaid(student) {
    if (!student) return 0;
    let paid = parseFloat(student.initialPayment) || parseFloat(student.paidAmount) || 0;

    if (student.installments) {
        Object.values(student.installments).forEach(inst => {
            paid += parseFloat(inst.amount) || 0;
        });
    }
    return paid;
}

function updatePaymentStats(studentsData, paymentsData) {
    if (!studentsData) return;

    try {
        let upcomingPayment = 0;
        let latePendingTotal = 0;
        let totalIncomeCollected = 0;
        let totalOutstandingAmount = 0;

        const now = new Date();
        const tenDaysFromNow = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

        Object.values(studentsData).forEach(student => {
            if (!student) return;

            // Financial Calculations
            const totalAmount = calculateTotalAmount(student);
            const totalPaid = calculateTotalPaid(student);
            const remaining = totalAmount - totalPaid;

            totalIncomeCollected += totalPaid;
            // Only add positive outstanding
            if (remaining > 0) {
                totalOutstandingAmount += remaining;
            }

            // Determine Status for Late/Pending Count
            // A simple approximation for Dashboard: If unpaid > 0 or status is overdue
            // We'll rely on our standard 'daysRemaining' check to be consistent
            let daysRemaining = 999;
            if (student.nextPaymentDate) {
                // Convert 'DD/MM/YYYY' to Date object
                const parts = student.nextPaymentDate.split('/');
                if (parts.length === 3) {
                    // Note: parts[0]=day, parts[1]=month, parts[2]=year if format is DD/MM/YYYY
                    // OR parts[0]=month if MM/DD/YYYY? 
                    // Standard in this app seems to be DD/MM/YYYY based on other files
                    // Let's assume standard parsing function availability or do it manually safe:
                    // We will assume "DD/MM/YYYY" which is common in Cambodia/UK.
                    // But usually our data is saved as DD/MM/YYYY.
                    const day = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
                    const year = parseInt(parts[2], 10);

                    const due = new Date(year, month, day);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    const diffTime = due - today;
                    daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                }
            }

            // Late/Pending: Overdue (days < 0) or simply has debt?
            // User requested "Late Pending Payments Card" usually means Overdue + Outstanding
            // Let's count Overdue (days < 0) here
            if (daysRemaining < 0) {
                latePendingTotal++;
            }

            // Upcoming Payment (Near Due): 0 <= days <= 10
            if (daysRemaining >= 0 && daysRemaining <= 10) {
                upcomingPayment++;
            }
        });

        const getPrevValue = (id) => {
            const element = document.getElementById(id);
            if (!element) return 0;
            const text = element.textContent || '0';
            const cleaned = text.replace(/[^0-9.-]+/g, '');
            return parseFloat(cleaned) || 0;
        };

        const prevUpcoming = getPrevValue('upcomingPayment');
        const prevLate = getPrevValue('latePendingTotal');
        const prevIncome = getPrevValue('totalIncomeCollected');
        const prevOutstanding = getPrevValue('totalOutstandingAmount');

        if (document.getElementById('upcomingPayment')) {
            animateValue('upcomingPayment', prevUpcoming, upcomingPayment);
        }
        if (document.getElementById('latePendingTotal')) {
            animateValue('latePendingTotal', prevLate, latePendingTotal);
        }

        const incomeElement = document.getElementById('totalIncomeCollected');
        if (incomeElement) {
            animateValue('totalIncomeCollected', prevIncome, totalIncomeCollected);
        }

        const outstandingElement = document.getElementById('totalOutstandingAmount');
        if (outstandingElement) {
            animateValue('totalOutstandingAmount', prevOutstanding, totalOutstandingAmount);
        }

    } catch (error) {
        console.error('Error updating payment stats:', error);
    }
}

function updateDropoutStats(studentsData) {
    if (!studentsData) return;

    try {
        const students = Object.values(studentsData);
        let totalDropout = 0;
        let totalDropoutMale = 0;
        let totalDropoutFemale = 0;

        students.forEach(student => {
            if (!student) return;

            // Check if student status is 'dropout' or 'ឈប់រៀន'
            const status = student.enrollmentStatus ? student.enrollmentStatus.toString().toLowerCase() : '';
            const isActive = status === 'dropout' || status === 'ឈប់រៀន';

            if (isActive) {
                totalDropout++;
                const gender = getStudentGender(student);
                if (gender === 'ប្រុស') {
                    totalDropoutMale++;
                } else if (gender === 'ស្រី') {
                    totalDropoutFemale++;
                }
            }
        });

        const getPrevValue = (id) => {
            const element = document.getElementById(id);
            if (!element) return 0;
            const text = element.textContent || '0';
            const cleaned = text.replace(/[^0-9.-]+/g, '');
            return parseInt(cleaned) || 0;
        };

        const prevTotal = getPrevValue('totalDropoutStudents');
        const prevMale = getPrevValue('totalDropoutMale');
        const prevFemale = getPrevValue('totalDropoutFemale');

        if (document.getElementById('totalDropoutStudents')) {
            animateValue('totalDropoutStudents', prevTotal, totalDropout);
        }
        if (document.getElementById('totalDropoutMale')) {
            animateValue('totalDropoutMale', prevMale, totalDropoutMale);
        }
        if (document.getElementById('totalDropoutFemale')) {
            animateValue('totalDropoutFemale', prevFemale, totalDropoutFemale);
        }

    } catch (error) {
        console.error('Error updating dropout stats:', error);
    }
}

// Deprecated or Unused
// Expense Stats
function updateExpenseStats(transactionsData) {
    if (!transactionsData) {
        animateValue('totalExpenseAmount', 0, 0);
        return;
    }

    try {
        let totalExpense = 0;

        // transactionsData can be object or array depending on firebase return
        const transactions = Object.values(transactionsData);

        transactions.forEach(t => {
            if (t.type === 'expense') {
                totalExpense += parseFloat(t.amount) || 0;
            }
        });

        const getPrevValue = (id) => {
            const element = document.getElementById(id);
            if (!element) return 0;
            const text = element.textContent || '0';
            const cleaned = text.replace(/[^0-9.-]+/g, '');
            return parseFloat(cleaned) || 0;
        };

        const prevExpense = getPrevValue('totalExpenseAmount');
        if (document.getElementById('totalExpenseAmount')) {
            animateValue('totalExpenseAmount', prevExpense, totalExpense);
        }

    } catch (error) {
        console.error('Error updating expense stats:', error);
    }
}

function updateRevenueWithClasses(studentsData, classesData) {
    if (!studentsData || !classesData) return;

    try {
        let detailedRevenue = 0;

        Object.values(studentsData).forEach(student => {
            if (!student) return;

            if (student.status === 'inactive') return;

            let studentRevenue = 0;

            if (student.classId && classesData[student.classId]) {
                const classInfo = classesData[student.classId];
                const tuitionFee = parseFloat(classInfo.tuitionFee) || 0;
                const discount = parseFloat(student.discount) || 0;
                studentRevenue = tuitionFee - discount;
            } else if (student.netFee) {
                studentRevenue = parseFloat(student.netFee) || 0;
            }

            detailedRevenue += studentRevenue;
        });

        const revenueElement = document.getElementById('monthlyRevenue');
        if (revenueElement) {
            const prevRevenue = parseFloat(
                revenueElement.textContent.replace(/[^0-9.-]+/g, "") || 0
            );
            animateValue('monthlyRevenue', prevRevenue, detailedRevenue);
        }
    } catch (error) {
        console.error('Error updating revenue with classes:', error);
    }
}

// ========================================================
// 5. ENHANCED FUNCTIONS FOR NOTIFICATION SYSTEM
// ========================================================

/**
 * Get upcoming payment students (within 7 days)
 */
function getUpcomingPaymentStudents(studentsData, daysThreshold = 7) {
    if (!studentsData) return [];

    const upcomingStudents = [];
    const now = new Date();
    const thresholdDate = new Date(now.getTime() + daysThreshold * 24 * 60 * 60 * 1000);

    Object.entries(studentsData).forEach(([studentId, student]) => {
        if (!student || !student.paymentDueDate) return;

        try {
            const dueDate = new Date(student.paymentDueDate);

            if (dueDate > now && dueDate <= thresholdDate) {
                const paymentStatus = student.paymentStatus ?
                    student.paymentStatus.toString().toLowerCase() : '';

                if (paymentStatus === 'pending' || paymentStatus === 'partial' ||
                    paymentStatus === 'មិនទាន់បង់' || paymentStatus === 'បានបង់ខ្លះ') {
                    const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

                    upcomingStudents.push({
                        id: studentId,
                        name: student.fullName || student.name || 'គ្មានឈ្មោះ',
                        studentId: student.studentCode || student.studentId || '',
                        dueDate: student.paymentDueDate,
                        daysUntilDue: daysUntilDue,
                        amountDue: student.balanceDue || student.netFee || 0,
                        className: student.className || student.course || '',
                        phone: student.phone || student.contact || '',
                        gender: getStudentGender(student)
                    });
                }
            }
        } catch (error) {
            console.warn('Invalid due date format:', student.paymentDueDate);
        }
    });

    upcomingStudents.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

    return upcomingStudents;
}

/**
 * Get unpaid boarding students
 */
function getUnpaidBoardingStudents(studentsData) {
    if (!studentsData) return [];

    const unpaidBoardingStudents = [];
    const now = new Date();

    Object.entries(studentsData).forEach(([studentId, student]) => {
        if (!student) return;

        const hasBoarding = student.hasBoarding === true ||
            student.boardingStatus === 'active' ||
            student.residenceType === 'boarding' ||
            student.accommodation === 'boarding' ||
            student.residence === 'boarding' ||
            student.stayType === 'boarding' ||
            (student.notes && student.notes.toString().toLowerCase().includes('boarding')) ||
            (student.remarks && student.remarks.toString().toLowerCase().includes('ជំណាក់'));

        if (!hasBoarding) return;

        const paymentStatus = student.paymentStatus ?
            student.paymentStatus.toString().toLowerCase() : '';

        const isUnpaid = paymentStatus === 'pending' ||
            paymentStatus === 'late' ||
            paymentStatus === 'partial' ||
            paymentStatus === 'overdue' ||
            paymentStatus === 'ពន្យារ' ||
            paymentStatus === 'មិនទាន់បង់';

        let isPaymentOverdue = false;
        if (student.paymentDueDate) {
            try {
                const dueDate = new Date(student.paymentDueDate);
                isPaymentOverdue = dueDate < now;
            } catch (e) {
                console.warn('Invalid due date:', student.paymentDueDate);
            }
        }

        const balanceDue = parseFloat(student.balanceDue) || 0;
        const amountPaid = parseFloat(student.amountPaid) || 0;
        const netFee = parseFloat(student.netFee) || 0;
        const amountDue = parseFloat(student.amountDue) || 0;

        const hasUnpaidBalance = balanceDue > 0 ||
            (netFee > 0 && amountPaid < netFee) ||
            amountDue > 0;

        if (isUnpaid || isPaymentOverdue || hasUnpaidBalance) {
            unpaidBoardingStudents.push({
                id: studentId,
                name: student.fullName || student.name || student.englishName || 'គ្មានឈ្មោះ',
                studentId: student.studentCode || student.studentId || student.code || '',
                phone: student.phone || student.contact || student.phoneNumber || student.tel || '',
                paymentStatus: student.paymentStatus || 'pending',
                dueDate: student.paymentDueDate || student.dueDate || '',
                amountDue: Math.max(balanceDue, amountDue, netFee - amountPaid),
                className: student.className || student.course || student.class || '',
                boardingType: student.boardingType || student.residenceType || 'ជំណាក់ធម្មតា',
                gender: getStudentGender(student),
                registrationDate: student.registrationDate || student.createdAt || '',
                lastPaymentDate: student.lastPaymentDate || '',
                notes: student.notes || student.remarks || ''
            });
        }
    });

    return unpaidBoardingStudents;
}

/**
 * Get student gender
 */
function getStudentGender(student) {
    if (!student) return 'មិនស្គាល់';

    const genderData = student.gender || student.sex || '';
    const g = genderData.toString().toLowerCase().trim();

    // Check Female first to avoid confusion if fuzzy matching
    if (g === 'female' || g === 'f' || g === 'ស្រី' || g.includes('female') || g.includes('ស្រី')) {
        return 'ស្រី';
    }

    if (g === 'male' || g === 'm' || g === 'ប្រុស' || g.includes('male') || g.includes('ប្រុស')) {
        return 'ប្រុស';
    }

    return 'មិនស្គាល់';
}

/**
 * Calculate gender statistics
 */
function calculateGenderStatistics(students) {
    let male = 0;
    let female = 0;
    let unknown = 0;

    students.forEach(student => {
        const gender = getStudentGender(student);
        if (gender === 'ប្រុស') male++;
        else if (gender === 'ស្រី') female++;
        else unknown++;
    });

    return { male, female, unknown };
}

/**
 * Format date for display
 */
function formatDate(dateString) {
    if (!dateString) return 'មិនមាន';

    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('km-KH', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    } catch (error) {
        return dateString;
    }
}

// ========================================================
// 6. MAIN DASHBOARD FUNCTIONS
// ========================================================

function initializeDashboard() {
    console.log('🚀 Initializing dashboard...');

    const isDashboardPage = document.getElementById('totalFulltimeStudents') ||
        document.querySelector('.dashboard-container') ||
        document.querySelector('[data-dashboard="true"]');

    if (!isDashboardPage) {
        console.log('Not on dashboard page, skipping initialization');
        return;
    }

    showLoadingState(true);

    const firebaseInitialized = initializeFirebaseRefs();

    if (!firebaseInitialized) {
        showLoadingState(false);

        if (retryCount < MAX_RETRY_ATTEMPTS) {
            retryCount++;
            console.log(`Retrying Firebase initialization (attempt ${retryCount}/${MAX_RETRY_ATTEMPTS})...`);
            setTimeout(initializeDashboard, 3000);
        }
        return;
    }

    retryCount = 0;

    loadAllData();

    setupRealtimeListeners();

    if (dashboardUpdateInterval) {
        clearInterval(dashboardUpdateInterval);
    }
    dashboardUpdateInterval = setInterval(loadAllData, UPDATE_INTERVAL);

    addUpdateIndicator();

    console.log('✅ Dashboard initialization complete');
}

function loadAllData() {
    showUpdateIndicator();

    if (!studentsRef || !staffRef || !expenseRef || !paymentsRef || !classesRef) {
        console.error('Firebase references not initialized');
        showMessage('ទិន្នន័យមិនត្រូវបានចាប់ផ្តើម។ កំពុងព្យាយាមម្តងទៀត...', 'warning');
        return;
    }

    Promise.all([
        studentsRef.once('value').catch(err => {
            console.error('Error fetching students:', err);
            return { val: () => null };
        }),
        staffRef.once('value').catch(err => {
            console.error('Error fetching staff:', err);
            return { val: () => null };
        }),
        expenseRef.once('value').catch(err => {
            console.error('Error fetching expenses:', err);
            return { val: () => null };
        }),
        paymentsRef.once('value').catch(err => {
            console.error('Error fetching payments:', err);
            return { val: () => null };
        }),
        classesRef.once('value').catch(err => {
            console.error('Error fetching classes:', err);
            return { val: () => null };
        }),
        transactionsRef.once('value').catch(err => {
            console.error('Error fetching transactions:', err);
            return { val: () => null };
        })
    ]).then(([studentsSnap, staffSnap, expenseSnap, paymentsSnap, classesSnap, transactionsSnap]) => {
        const studentsData = studentsSnap.val();
        const staffData = staffSnap.val();
        const expenseData = expenseSnap.val();
        const paymentsData = paymentsSnap.val();
        const classesData = classesSnap.val();
        const transactionsData = transactionsSnap.val();

        updateStudentStats(studentsData);
        updateDropoutStats(studentsData);
        updateExpenseStats(transactionsData);
        updatePaymentStats(studentsData, paymentsData);
        // updateRevenueWithClasses(studentsData, classesData); // Disabled

        // 🔥 UPDATE NOTIFICATION SYSTEM 🔥
        updateNotificationSystem(studentsData, paymentsData);

        if (document.getElementById('unpaidBoardingList')) {
            const unpaidBoarding = getUnpaidBoardingStudents(studentsData);
            displayUnpaidBoardingStudents(unpaidBoarding);
        }

        if (document.getElementById('chineseFulltimeList')) {
            const chineseFulltime = getChineseClassStudents(studentsData, 'fulltime');
            displayChineseClassStudents(chineseFulltime, 'fulltime');
        }

        if (document.getElementById('chineseParttimeList')) {
            const chineseParttime = getChineseClassStudents(studentsData, 'parttime');
            displayChineseClassStudents(chineseParttime, 'parttime');
        }

        if (document.getElementById('upcomingPaymentList')) {
            const upcomingStudents = getUpcomingPaymentStudents(studentsData, 7);
            displayUpcomingPaymentStudents(upcomingStudents);
        }

        updateLastUpdatedTime();

        if (isInitialLoad) {
            showLoadingState(false);
            isInitialLoad = false;
            console.log('📊 Dashboard data loaded successfully!');
            showMessage('ទិន្នន័យត្រូវបានទាញយកដោយជោគជ័យ!', 'success');
        }

    }).catch(error => {
        console.error('Error loading data:', error);
        showMessage('កំហុសក្នុងការទាញយកទិន្នន័យ។ ' + error.message, 'danger');
        showLoadingState(false);
    });
}

function setupRealtimeListeners() {
    if (!database) return;

    console.log('Setting up real-time listeners...');

    if (studentsRef) {
        studentsRef.on('value', (snapshot) => {
            updateStudentStats(snapshot.val());

            if (paymentsRef) {
                paymentsRef.once('value').then(paymentsSnap => {
                    updatePaymentStats(snapshot.val(), paymentsSnap.val());
                    // 🔥 Update notification system when data changes
                    updateNotificationSystem(snapshot.val(), paymentsSnap.val());
                });
            }
        });
    }

    if (staffRef) {
        staffRef.on('value', (snapshot) => {
            updateStaffStats(snapshot.val());
        });
    }

    if (expenseRef) {
        expenseRef.on('value', (snapshot) => {
            updateExpenseStats(snapshot.val());
        });
    }
}

function addUpdateIndicator() {
    if (document.getElementById('data-update-indicator')) return;

    const indicator = document.createElement('div');
    indicator.id = 'data-update-indicator';
    indicator.innerHTML = '<i class="fas fa-sync-alt me-1"></i> កំពុងធ្វើបច្ចុប្បន្នភាពទិន្នន័យ...';
    indicator.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #0d6efd;
        color: white;
        padding: 10px 15px;
        border-radius: 5px;
        z-index: 9999;
        opacity: 0;
        transition: opacity 0.3s;
        font-size: 14px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    `;
    document.body.appendChild(indicator);
}

function showUpdateIndicator() {
    const indicator = document.getElementById('data-update-indicator');
    if (indicator) {
        indicator.style.opacity = '1';
        setTimeout(() => {
            indicator.style.opacity = '0';
        }, 2000);
    }
}

function updateLastUpdatedTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('km-KH', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    const timestampElement = document.getElementById('data-timestamp');
    if (timestampElement) {
        timestampElement.innerHTML = `<i class="fas fa-clock me-1"></i>ធ្វើបច្ចុប្បន្នភាពចុងក្រោយ: ${timeString}`;
    }

    // Try both IDs for better compatibility
    const lastUpdateTime = document.getElementById('last-update-time');
    if (lastUpdateTime) {
        lastUpdateTime.textContent = timeString;
    }

    const footerTimestamp = document.getElementById('footer-timestamp');
    if (footerTimestamp) {
        footerTimestamp.textContent = timeString;
    }
}

function cleanupDashboard() {
    console.log('🧹 Cleaning up dashboard resources...');

    if (dashboardUpdateInterval) {
        clearInterval(dashboardUpdateInterval);
        dashboardUpdateInterval = null;
    }

    if (studentsRef) {
        try { studentsRef.off(); } catch (e) { console.warn('Error removing students listener:', e); }
    }
    if (staffRef) {
        try { staffRef.off(); } catch (e) { console.warn('Error removing staff listener:', e); }
    }
    if (expenseRef) {
        try { expenseRef.off(); } catch (e) { console.warn('Error removing expense listener:', e); }
    }

    const indicator = document.getElementById('data-update-indicator');
    if (indicator) {
        indicator.remove();
    }

    console.log('✅ Dashboard cleanup complete');
}

// ========================================================
// 7. UI DISPLAY FUNCTIONS
// ========================================================

function displayUnpaidBoardingStudents(students) {
    const container = document.getElementById('unpaidBoardingList');
    if (!container) return;

    if (!students || students.length === 0) {
        container.innerHTML = `
            <div class="alert alert-success">
                <i class="fi fi-rr-check-circle me-2"></i>
                គ្មានសិស្សនៅជំណាក់មិនទាន់បង់
            </div>
        `;

        const countElement = document.getElementById('unpaidBoardingCount');
        if (countElement) countElement.textContent = '0';
        return;
    }

    let html = `
        <div class="table-responsive">
            <table class="table table-hover table-sm">
                <thead class="table-light">
                    <tr>
                        <th>#</th>
                        <th>ឈ្មោះសិស្ស</th>
                        <th>លេខសិស្ស</th>
                        <th>ថ្នាក់</th>
                        <th>ទូរស័ព្ទ</th>
                        <th>ស្ថានភាព</th>
                        <th>ថ្ងៃបង់</th>
                        <th>ទឹកប្រាក់ខ្វះ</th>
                    </tr>
                </thead>
                <tbody>
    `;

    students.forEach((student, index) => {
        const dueDate = student.dueDate ?
            new Date(student.dueDate).toLocaleDateString('km-KH') : 'មិនមាន';
        const amountDue = formatCurrency(student.amountDue);

        let statusBadge = '';
        const status = student.paymentStatus ? student.paymentStatus.toLowerCase() : '';

        if (status.includes('late') || status.includes('overdue')) {
            statusBadge = '<span class="badge bg-danger">ពន្យារ</span>';
        } else if (status.includes('partial')) {
            statusBadge = '<span class="badge bg-warning text-dark">បានបង់ខ្លះ</span>';
        } else {
            statusBadge = '<span class="badge bg-secondary">មិនទាន់បង់</span>';
        }

        html += `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${student.name}</strong></td>
                <td>${student.studentId}</td>
                <td>${student.className}</td>
                <td>${student.phone}</td>
                <td>${statusBadge}</td>
                <td>${dueDate}</td>
                <td class="text-danger fw-bold">${amountDue}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
        <div class="mt-2 text-end">
            <small class="text-muted">
                <i class="fas fa-info-circle"></i>
                សរុប: ${students.length} នាក់
            </small>
        </div>
    `;

    container.innerHTML = html;

    const countElement = document.getElementById('unpaidBoardingCount');
    if (countElement) countElement.textContent = students.length;
}

function displayChineseClassStudents(students, classType) {
    const containerId = classType === 'fulltime'
        ? 'chineseFulltimeList'
        : 'chineseParttimeList';

    const container = document.getElementById(containerId);
    if (!container) return;

    const title = classType === 'fulltime'
        ? 'សិស្សភាសាចិនពេញម៉ោង'
        : 'សិស្សភាសាចិនក្រៅម៉ោង';

    if (!students || students.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-info-circle me-2"></i>
                គ្មាន${title}
            </div>
        `;

        const countElement = document.getElementById(`chinese${classType === 'fulltime' ? 'Fulltime' : 'Parttime'}Count`);
        if (countElement) countElement.textContent = '0';
        return;
    }

    let html = `
        <h6 class="mb-3 text-primary">
            <i class="fas fa-language me-2"></i>${title} (${students.length} នាក់)
        </h6>
        <div class="table-responsive">
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>ឈ្មោះសិស្ស</th>
                        <th>លេខសិស្ស</th>
                        <th>ថ្នាក់</th>
                        <th>ប្រភេទ</th>
                        <th>ស្ថានភាព</th>
                    </tr>
                </thead>
                <tbody>
    `;

    students.forEach((student, index) => {
        let statusBadge = '';
        if (student.paymentStatus) {
            if (student.paymentStatus.toLowerCase().includes('paid')) {
                statusBadge = '<span class="badge bg-success">បានបង់</span>';
            } else if (student.paymentStatus.toLowerCase().includes('partial')) {
                statusBadge = '<span class="badge bg-warning text-dark">បានបង់ខ្លះ</span>';
            } else {
                statusBadge = '<span class="badge bg-secondary">មិនទាន់បង់</span>';
            }
        }

        html += `
            <tr>
                <td>${index + 1}</td>
                <td>${student.name}</td>
                <td>${student.studentId}</td>
                <td>${student.className}</td>
                <td>
                    <span class="badge ${classType === 'fulltime' ? 'bg-primary' : 'bg-info'}">
                        ${student.studyType}
                    </span>
                </td>
                <td>${statusBadge}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;

    const countElement = document.getElementById(`chinese${classType === 'fulltime' ? 'Fulltime' : 'Parttime'}Count`);
    if (countElement) countElement.textContent = students.length;
}

function displayUpcomingPaymentStudents(students) {
    const container = document.getElementById('upcomingPaymentList');
    if (!container) return;

    if (!students || students.length === 0) {
        container.innerHTML = `
            <div class="alert alert-success">
                <i class="fi fi-rr-check-circle me-2"></i>
                គ្មានសិស្សជិតដល់ថ្ងៃបង់ក្នុង១សប្តាហ៍ខាងមុខ
            </div>
        `;

        const countElement = document.getElementById('upcomingPaymentCount');
        if (countElement) countElement.textContent = '0';
        return;
    }

    let html = `
        <div class="table-responsive">
            <table class="table table-hover table-sm">
                <thead class="table-warning">
                    <tr>
                        <th>#</th>
                        <th>ឈ្មោះសិស្ស</th>
                        <th>លេខសិស្ស</th>
                        <th>ថ្នាក់</th>
                        <th>ថ្ងៃបង់</th>
                        <th>នៅសល់ (ថ្ងៃ)</th>
                        <th>ទឹកប្រាក់</th>
                        <th>ទូរស័ព្ទ</th>
                    </tr>
                </thead>
                <tbody>
    `;

    students.forEach((student, index) => {
        const dueDate = new Date(student.dueDate).toLocaleDateString('km-KH');
        const amountDue = formatCurrency(student.amountDue);

        let daysClass = '';
        if (student.daysUntilDue <= 1) {
            daysClass = 'danger';
        } else if (student.daysUntilDue <= 3) {
            daysClass = 'warning';
        } else {
            daysClass = 'success';
        }

        html += `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${student.name}</strong></td>
                <td>${student.studentId}</td>
                <td>${student.className}</td>
                <td>${dueDate}</td>
                <td>
                    <span class="badge bg-${daysClass}">
                        ${student.daysUntilDue} ថ្ងៃ
                    </span>
                </td>
                <td class="fw-bold">${amountDue}</td>
                <td>${student.phone}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
        <div class="mt-2">
            <small class="text-muted">
                <i class="fas fa-exclamation-triangle text-warning"></i>
                សរុបសិស្សជិតដល់ថ្ងៃបង់: ${students.length} នាក់
            </small>
        </div>
    `;

    container.innerHTML = html;

    const countElement = document.getElementById('upcomingPaymentCount');
    if (countElement) countElement.textContent = students.length;
}

// ========================================================
// 8. NOTIFICATION SYSTEM FUNCTIONS (INTEGRATED)
// ========================================================

let isNotificationPopoverOpen = false;
let notificationPopoverInstance = null;

/**
 * Initialize notification popover
 */
function initializeNotificationPopover() {
    const notificationBtn = document.getElementById('notification-btn');
    if (!notificationBtn) return;

    notificationPopoverInstance = new bootstrap.Popover(notificationBtn, {
        trigger: 'manual',
        html: true,
        placement: 'bottom',
        customClass: 'notification-popover',
        title: 'ការជូនដំណឹងសំខាន់ៗ',
        content: 'កំពុងទាញយកទិន្នន័យ...'
    });

    notificationBtn.addEventListener('shown.bs.popover', function () {
        isNotificationPopoverOpen = true;
    });

    notificationBtn.addEventListener('hidden.bs.popover', function () {
        isNotificationPopoverOpen = false;
    });

    notificationBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();

        if (isNotificationPopoverOpen) {
            notificationPopoverInstance.hide();
        } else {
            notificationPopoverInstance.show();
        }
    });

    document.addEventListener('click', function (event) {
        const popoverElement = document.querySelector('.popover');
        const notificationBtn = document.getElementById('notification-btn');

        if (popoverElement &&
            !popoverElement.contains(event.target) &&
            !notificationBtn.contains(event.target)) {
            notificationPopoverInstance.hide();
        }
    });
}

/**
 * Update notification badge
 */
function updateNotificationBadge(totalNotifications) {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;

    badge.textContent = totalNotifications;

    if (totalNotifications > 0) {
        badge.classList.add('notification-badge-pulse');
        badge.classList.remove('d-none');
    } else {
        badge.classList.remove('notification-badge-pulse');
        badge.classList.add('d-none');
    }
}

/**
 * Switch notification tab
 */
function switchNotificationTab(tabName) {
    document.querySelectorAll('.notification-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    const selectedTab = document.querySelector(`.notification-tab[onclick*="${tabName}"]`);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }

    document.querySelectorAll('.notification-tab-content').forEach(content => {
        content.style.display = 'none';
    });

    const selectedContent = document.getElementById(`notification-${tabName}-tab`);
    if (selectedContent) {
        selectedContent.style.display = 'block';
    }
}

/**
 * Update the entire notification system
 */
function updateNotificationSystem(studentsData, paymentsData) {
    if (!studentsData) {
        console.warn('No student data for notification system');
        return;
    }

    try {
        const upcomingStudents = getUpcomingPaymentStudents(studentsData, 7);
        const unpaidBoardingStudents = getUnpaidBoardingStudents(studentsData);

        const upcomingCount = upcomingStudents.length;
        const unpaidBoardingCount = unpaidBoardingStudents.length;
        const totalNotifications = upcomingCount + unpaidBoardingCount;

        let totalUpcomingAmount = 0;
        let totalUnpaidBoardingAmount = 0;

        upcomingStudents.forEach(student => {
            totalUpcomingAmount += parseFloat(student.amountDue) || 0;
        });

        unpaidBoardingStudents.forEach(student => {
            totalUnpaidBoardingAmount += parseFloat(student.amountDue) || 0;
        });

        updateNotificationBadge(totalNotifications);

        updateNotificationPopoverContent(
            upcomingStudents,
            unpaidBoardingStudents,
            totalUpcomingAmount,
            totalUnpaidBoardingAmount
        );

        updateNotificationButtonAppearance(upcomingCount, unpaidBoardingCount);

    } catch (error) {
        console.error('Error updating notification system:', error);
    }
}

/**
 * Update notification popover content
 */
function updateNotificationPopoverContent(upcomingStudents, unpaidBoardingStudents, totalUpcomingAmount, totalUnpaidBoardingAmount) {
    const notificationBtn = document.getElementById('notification-btn');
    if (!notificationBtn || !notificationPopoverInstance) return;

    const upcomingCount = upcomingStudents.length;
    const boardingCount = unpaidBoardingStudents.length;

    const boardingGenderStats = calculateGenderStatistics(unpaidBoardingStudents);

    let html = `
        <div class="notification-tabs">
            <button class="notification-tab active" onclick="switchNotificationTab('upcoming')">
                <i class="fas fa-clock me-1"></i>ជិតដល់ថ្ងៃបង់ (${upcomingCount})
            </button>
            <button class="notification-tab" onclick="switchNotificationTab('boarding')">
                <i class="fi fi-rr-home me-1"></i>ជំណាក់មិនទាន់បង់ (${boardingCount})
            </button>
        </div>
        
        <div class="notification-summary">
            <div class="summary-item">
                <span class="summary-label">សិស្សជិតដល់ថ្ងៃបង់:</span>
                <span class="summary-value upcoming">${upcomingCount} នាក់</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">ទឹកប្រាក់ជិតដល់:</span>
                <span class="summary-value upcoming">${formatCurrency(totalUpcomingAmount)}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">សិស្សជំណាក់មិនទាន់បង់:</span>
                <span class="summary-value late">${boardingCount} នាក់</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">ទឹកប្រាក់ជំណាក់ខ្វះ:</span>
                <span class="summary-value late">${formatCurrency(totalUnpaidBoardingAmount)}</span>
            </div>
        </div>
        
        <div id="notification-upcoming-tab" class="notification-tab-content">
    `;

    if (upcomingCount > 0) {
        html += `<ul class="notification-student-list">`;

        upcomingStudents.forEach((student, index) => {
            const daysLeft = student.daysUntilDue || 0;
            let statusClass = 'status-upcoming';
            let amountClass = 'amount-upcoming';

            if (daysLeft <= 1) {
                statusClass = 'status-late';
                amountClass = 'amount-late';
            }

            html += `
                <li class="notification-student-item">
                    <div class="student-info">
                        <div class="student-name">${student.name}</div>
                        <div class="student-details">
                            <span><i class="fas fa-user-graduate"></i> ${student.studentId}</span>
                            <span><i class="fas fa-chalkboard-teacher"></i> ${student.className}</span>
                            <span><i class="fas fa-calendar-day"></i> ${formatDate(student.dueDate)}</span>
                            <span class="${statusClass} student-status">
                                <i class="fas ${daysLeft <= 1 ? 'fa-exclamation-triangle' : 'fa-clock'}"></i>
                                ${daysLeft} ថ្ងៃទៀត
                            </span>
                        </div>
                    </div>
                    <div class="${amountClass} amount-due">
                        ${formatCurrency(student.amountDue)}
                    </div>
                </li>
            `;
        });

        html += `</ul>`;
    } else {
        html += `
            <div class="notification-empty">
                <i class="fi fi-rr-check-circle"></i>
                <p>គ្មានសិស្សដែលជិតដល់ថ្ងៃបង់ក្នុង៧ថ្ងៃខាងមុខ</p>
            </div>
        `;
    }

    html += `</div>`;

    html += `<div id="notification-boarding-tab" class="notification-tab-content" style="display: none;">`;

    if (boardingCount > 0) {
        html += `
            <div class="alert alert-info mb-3">
                <i class="fas fa-info-circle me-2"></i>
                <strong>ស្ថិតិភេទ:</strong> 
                <span class="text-primary">ប្រុស: ${boardingGenderStats.male}</span> | 
                <span class="text-danger">ស្រី: ${boardingGenderStats.female}</span>
            </div>
            
            <ul class="notification-student-list">
        `;

        unpaidBoardingStudents.forEach((student, index) => {
            const gender = student.gender || 'មិនស្គាល់';
            const genderIcon = gender === 'ប្រុស' ? 'fa-mars' : (gender === 'ស្រី' ? 'fa-venus' : 'fa-question');
            const genderColor = gender === 'ប្រុស' ? 'text-primary' : (gender === 'ស្រី' ? 'text-danger' : 'text-secondary');

            html += `
                <li class="notification-student-item">
                    <div class="student-info">
                        <div class="student-name">
                            ${student.name}
                            <small class="${genderColor} ms-2">
                                <i class="fas ${genderIcon}"></i>
                            </small>
                        </div>
                        <div class="student-details">
                            <span><i class="fi fi-rr-id-badge"></i> ${student.studentId}</span>
                            <span><i class="fi fi-rr-phone-call"></i> ${student.phone || 'មិនមាន'}</span>
                            <span><i class="fi fi-rr-home"></i> ${student.boardingType}</span>
                            <span class="status-late student-status">
                                <i class="fi fi-rr-exclamation-circle"></i>
                                ${student.paymentStatus || 'មិនទាន់បង់'}
                            </span>
                        </div>
                    </div>
                    <div class="amount-late amount-due">
                        ${formatCurrency(student.amountDue)}
                    </div>
                </li>
            `;
        });

        html += `</ul>`;
    } else {
        html += `
            <div class="notification-empty">
                <i class="fi fi-rr-check-circle"></i>
                <p>គ្មានសិស្សនៅជំណាក់មិនទាន់បង់</p>
            </div>
        `;
    }

    html += `</div>`;

    notificationPopoverInstance.setContent({ '.popover-body': html });

    if (isNotificationPopoverOpen) {
        const popoverBody = document.querySelector('.popover .popover-body');
        if (popoverBody) {
            popoverBody.innerHTML = html;
        }
    }
}

/**
 * Update notification button appearance
 */
function updateNotificationButtonAppearance(upcomingCount, boardingCount) {
    const btn = document.getElementById('notification-btn');
    if (!btn) return;

    btn.classList.remove('btn-danger', 'btn-warning', 'btn-success');

    if (boardingCount > 0 || upcomingCount > 5) {
        btn.classList.add('btn-danger');
        btn.style.animation = 'shake 0.5s ease-in-out';
        setTimeout(() => {
            btn.style.animation = '';
        }, 500);
    } else if (upcomingCount > 0) {
        btn.classList.add('btn-warning');
    } else {
        btn.classList.add('btn-success');
    }
}

// ========================================================
// 9. GLOBAL EXPORTS & EVENT HANDLERS
// ========================================================

window.initializeDashboard = initializeDashboard;
window.loadAllData = loadAllData;
window.cleanupDashboard = cleanupDashboard;
window.switchNotificationTab = switchNotificationTab;

window.dashboard = {
    initialize: initializeDashboard,
    loadData: loadAllData,
    cleanup: cleanupDashboard,
    refresh: () => {
        console.log('Manual refresh requested');
        loadAllData();
    },
    utils: {
        formatCurrency,
        formatNumber,
        getStudentGender,
        formatDate
    }
};

document.addEventListener('DOMContentLoaded', function () {
    console.log('📄 DOM fully loaded');

    initializeNotificationPopover();

    const shouldInitialize = document.getElementById('totalFulltimeStudents') ||
        document.querySelector('[data-dashboard="true"]');

    if (shouldInitialize) {
        const checkFirebaseInterval = setInterval(() => {
            if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
                clearInterval(checkFirebaseInterval);
                console.log('🔥 Firebase is ready, starting dashboard...');

                setTimeout(() => {
                    try {
                        initializeDashboard();
                        // Update time initially and every second
                        updateLastUpdatedTime();
                        setInterval(updateLastUpdatedTime, 1000);
                    } catch (error) {
                        console.error('Failed to initialize dashboard:', error);
                        showMessage(`កំហុសក្នុងការចាប់ផ្តើមផ្ទាំងគ្រប់គ្រង: ${error.message}`, 'danger');
                    }
                }, 500);
            }
        }, 100);

        setTimeout(() => {
            clearInterval(checkFirebaseInterval);
            if (typeof firebase === 'undefined') {
                showMessage('Firebase SDK មិនត្រូវបានផ្ទុក។ សូមពិនិត្យការភ្ជាប់អ៊ីនធឺណិត។', 'danger');
            }
        }, 10000);
    }
});

window.addEventListener('beforeunload', cleanupDashboard);

document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
        cleanupDashboard();
    }
});

document.addEventListener('click', function (event) {
    if (event.target.matches('[data-refresh-dashboard]')) {
        event.preventDefault();
        loadAllData();
        showMessage('កំពុងធ្វើបច្ចុប្បន្នភាពទិន្នន័យ...', 'info');
    }
});

window.addEventListener('error', function (event) {
    if (event.message.includes('initializeDashboard')) {
        console.error('Dashboard initialization error:', event.error);
        showMessage('កំហុសក្នុងការចាប់ផ្តើមផ្ទាំងគ្រប់គ្រង។ សូមផ្ទុកទំព័រម្តងទៀត។', 'danger');
    }
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initializeDashboard,
        loadAllData,
        cleanupDashboard,
        updateStudentStats,
        updatePaymentStats,
        updateStaffStats,
        updateExpenseStats,
        formatCurrency,
        formatNumber,
        getUpcomingPaymentStudents,
        getUnpaidBoardingStudents,
        getStudentGender,
        updateNotificationSystem
    };
}

console.log('✅ dashboard-stats.js loaded successfully');