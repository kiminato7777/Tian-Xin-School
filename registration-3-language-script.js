// registration-script.js - ប្រព័ន្ធចុះឈ្មោះ និងកែទិន្នន័យសិស្សពេញលេញ
document.addEventListener('DOMContentLoaded', function () {
    // ============================================
    // 1. INITIALIZE FIREBASE AND DOM ELEMENTS
    // ============================================
    const database = firebase.database();
    const storage = firebase.storage();

    // DOM Elements
    const studentForm = document.getElementById('studentRegistrationForm');
    const studentImage = document.getElementById('reg_studentImage');
    const imagePreview = document.getElementById('imagePreview');
    const displayId = document.getElementById('reg_displayId');
    const submitBtn = document.getElementById('submitBtn');
    const updateBtn = document.getElementById('updateBtn');
    const resetBtn = document.getElementById('resetBtn');
    const alertContainer = document.getElementById('alertContainer');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const formTitle = document.getElementById('formTitle');
    const editModeIndicator = document.getElementById('editModeIndicator');

    // Course Selection Elements
    const chineseFulltimeCheckbox = document.getElementById('reg_cFullTime');
    const chineseParttimeCheckbox = document.getElementById('reg_cPartTime');
    const chineseFulltimeDetails = document.getElementById('chineseFulltimeDetails');
    const chineseParttimeDetails = document.getElementById('chineseParttimeDetails');
    const studyLevelRadios = document.querySelectorAll('input[name="reg_studyLevel"]');
    const studyDurationSelect = document.getElementById('reg_studyDuration');
    const tuitionFeeInput = document.getElementById('reg_tuitionFee');

    // New Elements for manual input
    const enableManualFeeCheckbox = document.getElementById('reg_enableManualFee');
    const manualFeeFields = document.getElementById('manualFeeFields');
    const fulltimeManualDurationCheckbox = document.getElementById('reg_fulltime_manualDuration');
    const fulltimeManualDurationFields = document.getElementById('fulltime_manualDurationFields');
    const parttimeManualDurationCheckbox = document.getElementById('reg_parttime_manualDuration');
    const parttimeManualDurationFields = document.getElementById('parttime_manualDurationFields');

    // Display elements
    const durationDisplay = document.getElementById('durationDisplay');
    const paymentDurationDisplay = document.getElementById('paymentDurationDisplay');
    const tuitionFeeDisplay = document.getElementById('tuitionFeeDisplay');
    const paymentDueDateDisplay = document.getElementById('paymentDueDateDisplay');
    const paymentMonthsDisplayInput = document.getElementById('reg_paymentMonthsDisplay');

    // Study time elements
    const fulltimeStudyTimeRadios = document.querySelectorAll('input[name="reg_fulltime_studyTime"]');
    const parttimeStudyTimeRadios = document.querySelectorAll('input[name="reg_parttime_studyTime"]');
    const fulltimeCustomStart = document.getElementById('fulltime_custom_start');
    const fulltimeCustomEnd = document.getElementById('fulltime_custom_end');

    // Installment elements
    const installmentContainer = document.getElementById('installmentStagesContainer');
    const installmentCountInput = document.getElementById('reg_installmentCount');
    const installmentTotalInput = document.getElementById('reg_installmentTotal');
    const installmentDifferenceInput = document.getElementById('reg_installmentDifference');
    const installmentDifferenceText = document.getElementById('installmentDifferenceText');


    // Summary fee elements - បន្ថែមថ្មីសម្រាប់សេវារដ្ឋបាល
    const summaryDiscountCash = document.getElementById('summaryDiscountCash');
    const summaryDiscountPercent = document.getElementById('summaryDiscountPercent');
    const summaryTuitionFee = document.getElementById('summaryTuitionFee');
    const summaryNetTuition = document.getElementById('summaryNetTuition');
    const summaryTotalFees = document.getElementById('summaryTotalFees');
    const summaryPaid = document.getElementById('summaryPaid');
    const summaryBalance = document.getElementById('summaryBalance');

    // សម្រាប់សេវារដ្ឋបាល
    const adminServicesCheckbox = document.getElementById('reg_adminServicesCheck'); // ថ្មី
    const adminServicesFeeInput = document.getElementById('reg_adminServicesFee'); // ថ្មី

    // Variables
    let studentImageFile = null;
    let studentImageUrl = '';
    let studentCounter = 1;
    let isEditMode = false;
    let currentStudentKey = null;
    let originalImageUrl = '';
    let isCalculatingAdminMaterials = false;
    let isCalculatingFees = false;


    // Course prices
    const chineseFulltimePrices = {
        'មូលដ្ឋានគ្រឹះ': { '6': 250, '12': 500 },
        'កម្រិត១': { '6': 260, '12': 520 },
        'កម្រិត២': { '6': 270, '12': 540 },
        'កម្រិត៣': { '6': 280, '12': 560 },
        'កម្រិត៤': { '6': 290, '12': 580 }
    };

    const chineseParttimePrices = {
        'new': { '3': 45, '1': 15 },
        'old': { '3': 60, '1': 15 }
    };

    // ============================================
    // 2. INITIALIZATION
    // ============================================
    loadStudentCounter();

    initSnowAnimation();

    // ============================================
    // 3. SNOW ANIMATION
    // ============================================
    function initSnowAnimation() {
        const snowContainer = document.getElementById('snow-container');
        if (!snowContainer) return;

        const snowflakeCount = 50;

        for (let i = 0; i < snowflakeCount; i++) {
            const snowflake = document.createElement('div');
            snowflake.className = 'snowflake';
            const size = Math.random() * 5 + 2;
            snowflake.style.width = `${size}px`;
            snowflake.style.height = `${size}px`;
            snowflake.style.left = `${Math.random() * 100}%`;
            snowflake.style.opacity = Math.random() * 0.5 + 0.3;
            const duration = Math.random() * 5 + 5;
            snowflake.style.animationDuration = `${duration}s`;
            snowflake.style.animationDelay = `${Math.random() * 5}s`;
            snowContainer.appendChild(snowflake);
        }
    }

    // ============================================
    // 4. STUDENT ID MANAGEMENT
    // ============================================
    async function loadStudentCounter() {
        try {
            const snapshot = await database.ref('students').once('value');
            let maxId = 0;

            if (snapshot.exists()) {
                const students = snapshot.val();
                Object.values(students).forEach(student => {
                    if (student.displayId) {
                        const idMatch = student.displayId.match(/TX-(\d+)/);
                        if (idMatch) {
                            const idNum = parseInt(idMatch[1]);
                            if (idNum > maxId) maxId = idNum;
                        }
                    }
                });
            }

            const newId = maxId + 1;
            const paddedId = newId.toString().padStart(3, '0');
            if (displayId) displayId.value = `TX-${paddedId}`;
            await database.ref('studentCounter').set(newId);

        } catch (error) {
            console.error('Error loading student counter:', error);
            if (displayId) displayId.value = 'TX-001';
        }
    }

    async function generateUniqueStudentId() {
        try {
            const snapshot = await database.ref('students').once('value');
            let usedIds = new Set();

            if (snapshot.exists()) {
                const students = snapshot.val();
                Object.values(students).forEach(student => {
                    if (student.displayId) usedIds.add(student.displayId);
                });
            }

            let newId = 1;
            let found = false;

            while (!found && newId <= 999) {
                const paddedId = newId.toString().padStart(3, '0');
                const candidateId = `TX-${paddedId}`;
                if (!usedIds.has(candidateId)) {
                    found = true;
                    if (displayId) displayId.value = candidateId;
                    await database.ref('studentCounter').set(newId);
                } else {
                    newId++;
                }
            }

            if (!found) {
                for (let i = 1; i <= 999; i++) {
                    const paddedId = i.toString().padStart(3, '0');
                    const candidateId = `TX-${paddedId}`;
                    if (!usedIds.has(candidateId)) {
                        if (displayId) displayId.value = candidateId;
                        await database.ref('studentCounter').set(i);
                        break;
                    }
                }
            }

        } catch (error) {
            console.error('Error generating unique ID:', error);
            if (displayId) displayId.value = 'TX-001';
        }
    }

    // ============================================
    // 5. COURSE SELECTION FUNCTIONS
    // ============================================
    function initializeCourseSelection() {
        // Study Program Radios
        const studyProgramRadios = document.querySelectorAll('input[name="reg_studyProgram"]');
        studyProgramRadios.forEach(radio => {
            radio.addEventListener('change', handleCourseSelection);
        });

        // Study level radios
        studyLevelRadios.forEach(radio => {
            radio.addEventListener('change', calculateTuitionFee);
        });

        // Study duration select
        if (studyDurationSelect) {
            studyDurationSelect.addEventListener('change', function () {
                calculateTuitionFee();
                calculatePaymentDates();
            });
        }

        // Old student checkbox
        const oldStudentCheck = document.getElementById('reg_isOldStudentCheck');
        if (oldStudentCheck) {
            oldStudentCheck.addEventListener('change', handleOldStudentChange);
        }

        // Duration checkboxes for part-time
        document.querySelectorAll('.duration-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', handleParttimeDurationSelection);
        });

        // Duration option clicks
        document.querySelectorAll('.study-duration-option').forEach(option => {
            option.addEventListener('click', function (e) {
                if (e.target.type !== 'checkbox') {
                    const checkbox = this.querySelector('.duration-checkbox');
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            });
        });

        // Study time radios for full-time
        if (fulltimeStudyTimeRadios) {
            fulltimeStudyTimeRadios.forEach(radio => {
                radio.addEventListener('change', function () {
                    handleStudyTimeSelection(this, true);
                });
            });
        }

        // Study time radios for part-time
        if (parttimeStudyTimeRadios) {
            parttimeStudyTimeRadios.forEach(radio => {
                radio.addEventListener('change', function () {
                    handleStudyTimeSelection(this, false);
                });
            });
        }

        // Custom time inputs
        if (fulltimeCustomStart && fulltimeCustomEnd) {
            fulltimeCustomStart.addEventListener('change', function () {
                updateCustomTimeSelection();
            });
            fulltimeCustomEnd.addEventListener('change', function () {
                updateCustomTimeSelection();
            });
        }

        // Manual fee input toggle
        if (enableManualFeeCheckbox) {
            enableManualFeeCheckbox.addEventListener('change', function () {
                if (this.checked) {
                    if (manualFeeFields) manualFeeFields.style.display = 'block';

                    const tuitionFeeField = document.getElementById('reg_tuitionFee');
                    const discountField = document.getElementById('reg_discount');
                    const discountPercentField = document.getElementById('reg_discountPercent');
                    const initialPaymentField = document.getElementById('reg_initialPayment');

                    if (tuitionFeeField) tuitionFeeField.readOnly = true;
                    if (discountField) discountField.readOnly = true;
                    if (discountPercentField) discountPercentField.readOnly = true;
                    if (initialPaymentField) initialPaymentField.readOnly = true;

                    // បង្ហាញសេវារដ្ឋបាលនៅក្នុងសង្ខេប
                    if (summaryServicesFeeLabel && summaryServicesFeeLabel.parentElement) {
                        summaryServicesFeeLabel.parentElement.style.display = 'flex';
                    }

                    copyManualValuesToMain();

                    // Set default payment months
                    const paymentMonthsInput = document.getElementById('reg_paymentMonths_manual');
                    if (paymentMonthsInput && !paymentMonthsInput.value) {
                        const studyDurationInput = document.getElementById('reg_studyDuration_manual');
                        const studyDuration = studyDurationInput ? studyDurationInput.value : '6';
                        paymentMonthsInput.value = studyDuration;
                    }

                } else {
                    if (manualFeeFields) manualFeeFields.style.display = 'none';

                    const tuitionFeeField = document.getElementById('reg_tuitionFee');
                    const discountField = document.getElementById('reg_discount');
                    const discountPercentField = document.getElementById('reg_discountPercent');
                    const initialPaymentField = document.getElementById('reg_initialPayment');

                    if (tuitionFeeField) tuitionFeeField.readOnly = false;
                    if (discountField) discountField.readOnly = false;
                    if (discountPercentField) discountPercentField.readOnly = false;
                    if (initialPaymentField) initialPaymentField.readOnly = false;

                    // លាក់សេវារដ្ឋបាលនៅក្នុងសង្ខេប
                    if (summaryServicesFeeLabel && summaryServicesFeeLabel.parentElement) {
                        summaryServicesFeeLabel.parentElement.style.display = 'none';
                    }

                    calculateTuitionFee();
                }
                calculateFees();
                updateStudyDurationDisplay();
                calculatePaymentDates();
            });
        }

        // Manual duration for full-time
        if (fulltimeManualDurationCheckbox) {
            fulltimeManualDurationCheckbox.addEventListener('change', function () {
                if (this.checked && chineseFulltimeCheckbox && chineseFulltimeCheckbox.checked) {
                    if (fulltimeManualDurationFields) fulltimeManualDurationFields.style.display = 'block';
                    if (studyDurationSelect) studyDurationSelect.disabled = true;

                    // កំណត់តម្លៃដើមសម្រាប់រយៈពេលសិក្សា
                    const studyDurationInput = document.getElementById('reg_studyDuration_manual');
                    const paymentMonthsInput = document.getElementById('reg_paymentMonths_manual');

                    if (studyDurationInput && !studyDurationInput.value) {
                        studyDurationInput.value = '6';
                    }
                    if (paymentMonthsInput && !paymentMonthsInput.value) {
                        const duration = studyDurationInput ? studyDurationInput.value : '6';
                        paymentMonthsInput.value = duration;
                    }

                } else {
                    if (fulltimeManualDurationFields) fulltimeManualDurationFields.style.display = 'none';
                    if (studyDurationSelect) studyDurationSelect.disabled = false;
                }
                updateStudyDurationDisplay();
                calculatePaymentDates();
            });
        }

        // Manual duration for part-time
        if (parttimeManualDurationCheckbox) {
            parttimeManualDurationCheckbox.addEventListener('change', function () {
                if (this.checked && chineseParttimeCheckbox && chineseParttimeCheckbox.checked) {
                    if (parttimeManualDurationFields) parttimeManualDurationFields.style.display = 'block';
                    document.querySelectorAll('.duration-checkbox').forEach(cb => cb.disabled = true);

                    const studyDuration = document.getElementById('reg_parttime_studyDuration_manual');
                    const paymentMonths = document.getElementById('reg_parttime_paymentMonths_manual');

                    if (studyDuration && !studyDuration.value) {
                        studyDuration.value = '3';
                    }
                    if (paymentMonths && !paymentMonths.value) {
                        paymentMonths.value = studyDuration ? studyDuration.value : '3';
                    }

                } else {
                    if (parttimeManualDurationFields) parttimeManualDurationFields.style.display = 'none';
                    document.querySelectorAll('.duration-checkbox').forEach(cb => cb.disabled = false);
                }
                updateStudyDurationDisplay();
                calculatePaymentDates();
            });
        }

        // Manual fee input changes
        const manualFeeInputs = [
            'reg_tuitionFee_manual', 'reg_discount_manual', 'reg_discountPercent_manual',
            'reg_initialPayment_manual', 'reg_materialFee_manual', 'reg_adminFee_manual',
            'reg_studyDuration_manual', 'reg_paymentMonths_manual'
        ];

        manualFeeInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', function () {
                    if (enableManualFeeCheckbox && enableManualFeeCheckbox.checked) {
                        copyManualValuesToMain();
                        calculateFees();
                        updateStudyDurationDisplay();
                        calculatePaymentDates();
                    }
                });
            }
        });

        // Manual duration input changes
        const manualDurationInputs = [
            'reg_studyDuration_manual', 'reg_paymentMonths_manual',
            'reg_parttime_studyDuration_manual', 'reg_parttime_paymentMonths_manual'
        ];

        manualDurationInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', function () {
                    // Auto-update payment months when study duration changes for full-time
                    if (id === 'reg_studyDuration_manual' && chineseFulltimeCheckbox && chineseFulltimeCheckbox.checked && fulltimeManualDurationCheckbox && fulltimeManualDurationCheckbox.checked) {
                        const studyDuration = document.getElementById('reg_studyDuration_manual');
                        const paymentMonthsInput = document.getElementById('reg_paymentMonths_manual');
                        if (paymentMonthsInput && !paymentMonthsInput.value && studyDuration) {
                            paymentMonthsInput.value = studyDuration.value;
                        }
                    }

                    // Auto-update payment months when study duration changes for part-time
                    if (id === 'reg_parttime_studyDuration_manual' && chineseParttimeCheckbox && chineseParttimeCheckbox.checked && parttimeManualDurationCheckbox && parttimeManualDurationCheckbox.checked) {
                        const studyDuration = document.getElementById('reg_parttime_studyDuration_manual');
                        const paymentMonthsInput = document.getElementById('reg_parttime_paymentMonths_manual');
                        if (paymentMonthsInput && !paymentMonthsInput.value && studyDuration) {
                            paymentMonthsInput.value = studyDuration.value;
                        }
                    }

                    updateStudyDurationDisplay();
                    calculatePaymentDates();
                });
            }
        });

        // សេវារដ្ឋបាល checkbox
        if (adminServicesCheckbox) {
            adminServicesCheckbox.addEventListener('change', function () {
                if (this.checked) {
                    if (adminServicesFeeInput) {
                        adminServicesFeeInput.readOnly = false;
                        adminServicesFeeInput.value = '5.00'; // តម្លៃដើម
                    }
                } else {
                    if (adminServicesFeeInput) {
                        adminServicesFeeInput.readOnly = true;
                        adminServicesFeeInput.value = '0.00';
                    }
                }
                calculateFees();
            });
        }

        // សេវារដ្ឋបាល input
        if (adminServicesFeeInput) {
            adminServicesFeeInput.addEventListener('input', calculateFees);
        }
    }

    function copyManualValuesToMain() {
        // Copy values from manual fields to main fields
        const tuitionFeeManual = document.getElementById('reg_tuitionFee_manual');
        const discountManual = document.getElementById('reg_discount_manual');
        const discountPercentManual = document.getElementById('reg_discountPercent_manual');
        const initialPaymentManual = document.getElementById('reg_initialPayment_manual');

        const tuitionFeeMain = document.getElementById('reg_tuitionFee');
        const discountMain = document.getElementById('reg_discount');
        const discountPercentMain = document.getElementById('reg_discountPercent');
        const initialPaymentMain = document.getElementById('reg_initialPayment');

        if (tuitionFeeManual && tuitionFeeMain) {
            tuitionFeeMain.value = tuitionFeeManual.value || '0.00';
        }
        if (discountManual && discountMain) {
            discountMain.value = discountManual.value || '0.00';
        }
        if (discountPercentManual && discountPercentMain) {
            discountPercentMain.value = discountPercentManual.value || '0';
        }
        if (initialPaymentManual && initialPaymentMain) {
            initialPaymentMain.value = initialPaymentManual.value || '0.00';
        }

        // Copy study duration for full-time
        const studyDurationManual = document.getElementById('reg_studyDuration_manual');
        const paymentMonthsManual = document.getElementById('reg_paymentMonths_manual');

        // Update study duration select if full-time is selected
        if (chineseFulltimeCheckbox && chineseFulltimeCheckbox.checked && studyDurationManual) {
            const studyDurationSelect = document.getElementById('reg_studyDuration');
            if (studyDurationSelect) {
                studyDurationSelect.value = studyDurationManual.value;
            }
        }

        // Copy admin fees from manual fields
        const materialFeeManual = document.getElementById('reg_materialFee_manual');
        const adminFeeManual = document.getElementById('reg_adminFee_manual');

        const materialFee = materialFeeManual ? parseFloat(materialFeeManual.value) || 0 : 0;
        const adminFee = adminFeeManual ? parseFloat(adminFeeManual.value) || 0 : 0;

        // Update admin materials
        updateAdminMaterialsFromManual(materialFee, adminFee);
    }

    function updateAdminMaterialsFromManual(materialFee, adminFee) {
        const totalAdminFees = materialFee + adminFee;
        const totalAdminFeesField = document.getElementById('reg_totalAdminFees');
        if (totalAdminFeesField) {
            totalAdminFeesField.value = totalAdminFees.toFixed(2);
        }

        // Update summary display
        if (summaryAdminMaterials) {
            summaryAdminMaterials.textContent = `$${totalAdminFees.toFixed(2)}`;
        }
    }

    function handleCourseSelection() {
        const selectedProgram = document.querySelector('input[name="reg_studyProgram"]:checked')?.value || '3_languages';

        // Assuming 3_languages and 2_languages use fulltime logic, and 1_language uses parttime or simplified logic
        // For now, we'll default to Fulltime display for 3/2 languages to show the detailed fee structure if needed,
        // or just rely on manual input.

        // Let's treat them as:
        // 3 Languages -> Fulltime Logic (Uses fulltime prices table if available, or manual)
        // 2 Languages -> Fulltime Logic
        // 1 Language -> Parttime Logic

        if (selectedProgram === '3_languages' || selectedProgram === '2_languages') {
            if (chineseFulltimeDetails) chineseFulltimeDetails.style.display = 'block';
            if (chineseParttimeDetails) chineseParttimeDetails.style.display = 'none';

            // Update duration options
            updateStudyDurationOptions(true);

            // Hide part-time fields
            if (parttimeManualDurationCheckbox) {
                parttimeManualDurationCheckbox.checked = false;
                if (parttimeManualDurationFields) parttimeManualDurationFields.style.display = 'none';
            }
        } else {
            if (chineseFulltimeDetails) chineseFulltimeDetails.style.display = 'none';
            if (chineseParttimeDetails) chineseParttimeDetails.style.display = 'block';

            updateStudyDurationOptions(false);

            // Hide full-time fields
            if (fulltimeManualDurationCheckbox) {
                fulltimeManualDurationCheckbox.checked = false;
                if (fulltimeManualDurationFields) fulltimeManualDurationFields.style.display = 'none';
            }
        }

        calculateTuitionFee();
        updateStudyDurationDisplay();
        calculatePaymentDates();
    }

    function handleOldStudentChange() {
        const oldStudentValue = document.getElementById('reg_isOldStudent');
        if (oldStudentValue) {
            oldStudentValue.value = this.checked;
        }
        calculateTuitionFee();
        updateStudyDurationDisplay();
    }

    function handleParttimeDurationSelection() {
        if (this.checked && chineseParttimeCheckbox && chineseParttimeCheckbox.checked) {
            document.querySelectorAll('.duration-checkbox').forEach(cb => {
                if (cb !== this) cb.checked = false;
            });

            document.querySelectorAll('.study-duration-option').forEach(option => {
                if (option.querySelector('.duration-checkbox') === this) {
                    option.classList.add('selected');
                } else {
                    option.classList.remove('selected');
                }
            });
        }

        calculateTuitionFee();
        updateStudyDurationDisplay();
    }

    function handleStudyTimeSelection(radio, isFulltime) {
        const studyTimeOptions = document.querySelectorAll(isFulltime ? '.study-time-options .study-time-option' : '.study-time-options .study-time-option');
        studyTimeOptions.forEach(option => {
            const optionRadio = option.querySelector('input[type="radio"]');
            if (optionRadio === radio) {
                option.classList.add('selected');
            } else {
                option.classList.remove('selected');
            }
        });

        // Show/hide custom time inputs
        if (isFulltime && radio.id === 'fulltime_custom') {
            if (fulltimeCustomStart && fulltimeCustomEnd) {
                const startParent = fulltimeCustomStart.parentElement;
                const endParent = fulltimeCustomEnd.parentElement;
                if (startParent) startParent.style.display = 'block';
                if (endParent) endParent.style.display = 'block';
            }
        } else if (isFulltime) {
            if (fulltimeCustomStart && fulltimeCustomEnd) {
                const startParent = fulltimeCustomStart.parentElement;
                const endParent = fulltimeCustomEnd.parentElement;
                if (startParent) startParent.style.display = 'none';
                if (endParent) endParent.style.display = 'none';
            }
        }
    }

    function updateCustomTimeSelection() {
        if (fulltimeCustomStart && fulltimeCustomEnd) {
            const startValue = fulltimeCustomStart.value;
            const endValue = fulltimeCustomEnd.value;

            if (startValue && endValue) {
                const customRadio = document.getElementById('fulltime_custom');
                if (customRadio) {
                    customRadio.value = `${startValue}-${endValue}`;
                }
            }
        }
    }

    function updateStudyDurationOptions(isFullTime) {
        if (studyDurationSelect) {
            if (isFullTime) {
                studyDurationSelect.innerHTML = `
                    <option value="6">៦ខែ</option>
                    <option value="12">១ឆ្នាំ</option>
                `;
                studyDurationSelect.disabled = false;
            } else {
                studyDurationSelect.innerHTML = `
                    <option value="">-- ជ្រើសរើសពេលជ្រើសរើសពេញម៉ោង --</option>
                `;
                studyDurationSelect.disabled = true;
            }
        }
    }

    function calculateTuitionFee() {
        let fee = 0;
        let duration = 0;
        let durationText = '';

        if (enableManualFeeCheckbox && enableManualFeeCheckbox.checked) {
            // Manual input
            const tuitionFeeManual = document.getElementById('reg_tuitionFee_manual');
            const studyDurationManual = document.getElementById('reg_studyDuration_manual');
            const paymentMonthsManual = document.getElementById('reg_paymentMonths_manual');

            fee = tuitionFeeManual ? parseFloat(tuitionFeeManual.value) || 0 : 0;
            duration = studyDurationManual ? parseInt(studyDurationManual.value) || 0 : 0;
            const paymentMonths = paymentMonthsManual ? parseInt(paymentMonthsManual.value) || 0 : 0;

            if (duration > 0) {
                durationText = `${duration} ខែ`;
            } else {
                durationText = 'បញ្ចូលដោយខ្លួនឯង';
            }

            // Auto-update payment months if empty
            if (paymentMonths === 0 && duration > 0 && paymentMonthsManual) {
                paymentMonthsManual.value = duration;
            }

        } else if (chineseFulltimeCheckbox && chineseFulltimeCheckbox.checked) {
            const selectedLevel = document.querySelector('input[name="reg_studyLevel"]:checked');

            if (fulltimeManualDurationCheckbox && fulltimeManualDurationCheckbox.checked) {
                const studyDurationManual = document.getElementById('reg_studyDuration_manual');
                duration = studyDurationManual ? parseInt(studyDurationManual.value) || 0 : 0;
                durationText = `${duration} ខែ`;

                // ប្រសិនបើមិនមានការបញ្ចូលតម្លៃដោយខ្លួនឯង កំណត់តម្លៃដោយស្វ័យប្រវត្តិ
                if (selectedLevel && chineseFulltimePrices[selectedLevel.value]) {
                    const basePrice = chineseFulltimePrices[selectedLevel.value]['6'];
                    fee = (basePrice / 6) * duration;
                }

                // Auto-set payment months
                const paymentMonthsInput = document.getElementById('reg_paymentMonths_manual');
                if (paymentMonthsInput && !paymentMonthsInput.value && duration > 0) {
                    paymentMonthsInput.value = duration;
                }
            } else {
                duration = studyDurationSelect ? studyDurationSelect.value : '6';

                if (selectedLevel && chineseFulltimePrices[selectedLevel.value]) {
                    fee = chineseFulltimePrices[selectedLevel.value][duration] || 0;
                }

                if (duration === '6') {
                    durationText = '៦ខែ';
                } else if (duration === '12') {
                    durationText = '១ឆ្នាំ';
                }
            }

        } else if (chineseParttimeCheckbox && chineseParttimeCheckbox.checked) {
            if (parttimeManualDurationCheckbox && parttimeManualDurationCheckbox.checked) {
                const studyDurationManual = document.getElementById('reg_parttime_studyDuration_manual');
                duration = studyDurationManual ? parseInt(studyDurationManual.value) || 0 : 0;
                durationText = `${duration} ខែ`;

                const oldStudentCheck = document.getElementById('reg_isOldStudentCheck');
                const isOldStudent = oldStudentCheck ? oldStudentCheck.checked : false;
                const priceType = isOldStudent ? 'old' : 'new';
                const basePrice = chineseParttimePrices[priceType]['3'];
                fee = (basePrice / 3) * duration;

                // Auto-set payment months
                const paymentMonthsInput = document.getElementById('reg_parttime_paymentMonths_manual');
                if (paymentMonthsInput && !paymentMonthsInput.value && duration > 0) {
                    paymentMonthsInput.value = duration;
                }

            } else {
                const selectedDurationCheckbox = document.querySelector('.duration-checkbox:checked');
                if (selectedDurationCheckbox) {
                    const parentOption = selectedDurationCheckbox.closest('.study-duration-option');
                    duration = parentOption ? parseInt(parentOption.getAttribute('data-duration')) || 0 : 0;

                    const oldStudentCheck = document.getElementById('reg_isOldStudentCheck');
                    const isOldStudent = oldStudentCheck ? oldStudentCheck.checked : false;
                    const priceType = isOldStudent ? 'old' : 'new';

                    fee = chineseParttimePrices[priceType][duration] || 0;

                    if (duration === 3) {
                        durationText = '៣ខែ';
                    } else if (duration === 1) {
                        durationText = '១ខែ';
                    }

                    const priceSpan = parentOption ? parentOption.querySelector('.duration-price') : null;
                    if (isOldStudent && duration === 3 && priceSpan) {
                        priceSpan.textContent = '$60';
                    } else if (priceSpan) {
                        priceSpan.textContent = duration === 3 ? '$45' : '$15';
                    }
                } else {
                    durationText = 'មិនទាន់បានជ្រើសរើស';
                }
            }
        } else {
            durationText = 'មិនទាន់បានជ្រើសរើស';
        }

        if (durationDisplay) durationDisplay.textContent = durationText;
        if (tuitionFeeInput) tuitionFeeInput.value = fee.toFixed(2);
        if (tuitionFeeDisplay) tuitionFeeDisplay.textContent = `$${fee.toFixed(2)}`;

        calculateFees();
        updateStudyDurationDisplay();
    }

    function updateStudyDurationDisplay() {
        let studyDurationText = '';
        let paymentDurationText = '';
        let paymentMonthsValue = 0;

        if (enableManualFeeCheckbox && enableManualFeeCheckbox.checked) {
            const studyDurationManual = document.getElementById('reg_studyDuration_manual');
            const paymentMonthsManual = document.getElementById('reg_paymentMonths_manual');

            const studyMonths = studyDurationManual ? parseInt(studyDurationManual.value) || 0 : 0;
            const paymentMonths = paymentMonthsManual ? parseInt(paymentMonthsManual.value) || 0 : 0;

            studyDurationText = studyMonths > 0 ? `${studyMonths} ខែ` : 'បញ្ចូលដោយខ្លួនឯង';
            paymentDurationText = paymentMonths > 0 ? `${paymentMonths} ខែ` : 'បញ្ចូលដោយខ្លួនឯង';
            paymentMonthsValue = paymentMonths;

        } else if (chineseFulltimeCheckbox && chineseFulltimeCheckbox.checked) {
            if (fulltimeManualDurationCheckbox && fulltimeManualDurationCheckbox.checked) {
                const studyDurationManual = document.getElementById('reg_studyDuration_manual');
                const paymentMonthsManual = document.getElementById('reg_paymentMonths_manual');

                const studyMonths = studyDurationManual ? parseInt(studyDurationManual.value) || 0 : 0;
                const paymentMonths = paymentMonthsManual ? parseInt(paymentMonthsManual.value) || 0 : 0;

                studyDurationText = studyMonths > 0 ? `${studyMonths} ខែ` : 'បញ្ចូលដោយខ្លួនឯង';
                paymentDurationText = paymentMonths > 0 ? `${paymentMonths} ខែ` : 'បញ្ចូលដោយខ្លួនឯង';
                paymentMonthsValue = paymentMonths;
            } else {
                const duration = studyDurationSelect ? studyDurationSelect.value : '';
                if (duration === '6') {
                    studyDurationText = '៦ខែ';
                    paymentDurationText = '៦ ខែ';
                    paymentMonthsValue = 6;
                } else if (duration === '12') {
                    studyDurationText = '១ឆ្នាំ';
                    paymentDurationText = '១ ឆ្នាំ';
                    paymentMonthsValue = 12;
                }
            }
        } else if (chineseParttimeCheckbox && chineseParttimeCheckbox.checked) {
            if (parttimeManualDurationCheckbox && parttimeManualDurationCheckbox.checked) {
                const studyDurationManual = document.getElementById('reg_parttime_studyDuration_manual');
                const paymentMonthsManual = document.getElementById('reg_parttime_paymentMonths_manual');

                const studyMonths = studyDurationManual ? parseInt(studyDurationManual.value) || 0 : 0;
                const paymentMonths = paymentMonthsManual ? parseInt(paymentMonthsManual.value) || 0 : 0;

                studyDurationText = studyMonths > 0 ? `${studyMonths} ខែ` : 'មិនទាន់បញ្ចូល';
                paymentDurationText = paymentMonths > 0 ? `${paymentMonths} ខែ` : 'មិនទាន់បញ្ចូល';
                paymentMonthsValue = paymentMonths;
            } else {
                const selectedDurationCheckbox = document.querySelector('.duration-checkbox:checked');
                if (selectedDurationCheckbox) {
                    const parentOption = selectedDurationCheckbox.closest('.study-duration-option');
                    const months = parentOption ? parseInt(parentOption.getAttribute('data-duration')) || 0 : 0;

                    if (months === 3) {
                        studyDurationText = '៣ខែ';
                        paymentDurationText = '៣ ខែ';
                        paymentMonthsValue = 3;
                    } else if (months === 1) {
                        studyDurationText = '១ខែ';
                        paymentDurationText = '១ ខែ';
                        paymentMonthsValue = 1;
                    }
                }
            }
        }

        if (durationDisplay) durationDisplay.textContent = studyDurationText || 'មិនទាន់បានជ្រើសរើស';
        if (paymentDurationDisplay) paymentDurationDisplay.textContent = paymentDurationText || 'មិនទាន់បានជ្រើសរើស';

        if (paymentMonthsDisplayInput && paymentDurationText) {
            paymentMonthsDisplayInput.value = paymentDurationText;
        }

        return paymentMonthsValue;
    }

    // ============================================
    // 6. IMAGE HANDLING
    // ============================================


    // ============================================
    // 7. FEE CALCULATIONS
    // ============================================
    function calculateFees() {
        if (isCalculatingFees) return;
        isCalculatingFees = true;

        try {
            let tuitionFee = 0;
            let discount = 0;
            let discountPercent = 0;
            let initialPayment = 0;
            let materialFee = 0;
            let adminFee = 0;
            let adminServicesFee = 0;

            // Simplified manual logic (default)
            const tuitionFeeField = document.getElementById('reg_tuitionFee');
            const discountField = document.getElementById('reg_discount');
            const discountPercentField = document.getElementById('reg_discountPercent');
            const initialPaymentField = document.getElementById('reg_initialPayment');
            const materialFeeField = document.getElementById('reg_materialFee');
            const adminFeeField = document.getElementById('reg_adminFee');

            tuitionFee = tuitionFeeField ? parseFloat(tuitionFeeField.value) || 0 : 0;
            discount = discountField ? parseFloat(discountField.value) || 0 : 0;
            discountPercent = discountPercentField ? parseFloat(discountPercentField.value) || 0 : 0;
            initialPayment = initialPaymentField ? parseFloat(initialPaymentField.value) || 0 : 0;
            materialFee = materialFeeField ? parseFloat(materialFeeField.value) || 0 : 0;
            adminFee = adminFeeField ? parseFloat(adminFeeField.value) || 0 : 0;

            const discountFromPercent = tuitionFee * (discountPercent / 100);
            const totalDiscount = discount + discountFromPercent;
            const netTuition = Math.max(0, tuitionFee - totalDiscount);

            const totalAdminFees = materialFee + adminFee;
            const totalAllFees = netTuition + totalAdminFees;
            const balance = Math.max(0, totalAllFees - initialPayment);

            if (document.getElementById('reg_totalAdminFees')) {
                document.getElementById('reg_totalAdminFees').value = totalAdminFees.toFixed(2);
            }

            const totalAllFeesField = document.getElementById('reg_totalAllFees');
            if (totalAllFeesField) {
                totalAllFeesField.value = totalAllFees.toFixed(2);
            }

            // Update summary
            updateSummaryDisplay(tuitionFee, discount, discountPercent, totalDiscount, netTuition,
                totalAdminFees, totalAllFees, initialPayment, balance);

            return { totalAllFees, balance, totalAdminFees, materialFee, adminFee, adminServicesFee };
        } finally {
            isCalculatingFees = false;
        }
    }

    function updateSummaryDisplay(tuitionFee, discount, discountPercent, totalDiscount, netTuition,
        totalAdminFees, totalAllFees, initialPayment, balance) {

        // Update tuition section
        if (summaryTuitionFee) summaryTuitionFee.textContent = `$${tuitionFee.toFixed(2)}`;
        if (summaryDiscountCash) summaryDiscountCash.textContent = `$${discount.toFixed(2)}`;
        if (summaryDiscountPercent) summaryDiscountPercent.textContent = `${discountPercent}%`;
        if (summaryNetTuition) summaryNetTuition.textContent = `$${netTuition.toFixed(2)}`;

        // Update totals
        if (summaryTotalFees) summaryTotalFees.textContent = `$${totalAllFees.toFixed(2)}`;
        if (summaryPaid) summaryPaid.textContent = `$${initialPayment.toFixed(2)}`;
        if (summaryBalance) summaryBalance.textContent = `$${balance.toFixed(2)}`;
    }







    // ============================================
    // 8. មុខងារដំណាក់កាលអ្នកជំណាក់
    // ============================================




    // ============================================
    // 9. DATE CALCULATIONS AND HANDLING
    // ============================================
    function setupDateInputs() {
        // កំណត់ event listeners សម្រាប់កាលបរិច្ឆេទទាំងអស់
        const dateInputs = document.querySelectorAll('.date-input, [id*="Date"], [id*="date"]');

        dateInputs.forEach(input => {
            // លុប event listeners ចាស់
            const newInput = input.cloneNode(true);
            input.parentNode.replaceChild(newInput, input);

            // បន្ថែម event listener ថ្មី
            newInput.addEventListener('input', function (e) {
                autoFormatDateInput(e);
            });

            newInput.addEventListener('blur', function () {
                validateAndFormatDate(this);
            });

            newInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    validateAndFormatDate(this);
                }
            });
        });

        // កាលបរិច្ឆេទចូលរៀនដំបូង
        const startDateInput = document.getElementById('reg_startDate');
        if (startDateInput) {
            startDateInput.addEventListener('change', calculatePaymentDates);
        }

        // កាលបរិច្ឆេទបង់ប្រាក់
        const paymentDueDateInput = document.getElementById('reg_paymentDueDate');
        if (paymentDueDateInput) {
            paymentDueDateInput.addEventListener('blur', function () {
                validateAndFormatDate(this);
            });
        }

        // កាលបរិច្ឆេទកើត
        const dobInput = document.getElementById('reg_dob');
        if (dobInput) {
            dobInput.addEventListener('blur', function () {
                validateAndFormatDate(this);
            });
        }
    }

    function autoFormatDateInput(e) {
        let value = e.target.value.replace(/[^\d\/]/g, '');

        // លុប / ចុងក្រោយប្រសិនបើមានលើស
        if (value.split('/').length > 3) {
            value = value.substring(0, value.lastIndexOf('/'));
        }

        // បន្ថែម / ដោយស្វ័យប្រវត្តិ
        if (value.length === 2 && !value.includes('/')) {
            value = value + '/';
        } else if (value.length === 5 && value.split('/').length === 2) {
            value = value + '/';
        }

        // ដាក់ដែនកំណត់លើខ្ទង់
        if (value.length >= 1) {
            let day = value.split('/')[0];
            if (day && day.length === 2) {
                const dayNum = parseInt(day);
                if (dayNum > 31) {
                    day = '31';
                    value = day + (value.includes('/') ? value.substring(2) : '');
                }
            }
        }

        if (value.length >= 4) {
            const parts = value.split('/');
            if (parts.length >= 2) {
                let month = parts[1];
                if (month && month.length === 2) {
                    const monthNum = parseInt(month);
                    if (monthNum > 12) {
                        month = '12';
                        parts[1] = month;
                        value = parts.join('/');
                    }
                }
            }
        }

        // ដាក់ដែនកំណត់ចំនួនតួអក្សរ
        if (value.length > 10) {
            value = value.substring(0, 10);
        }

        e.target.value = value;
    }

    function validateAndFormatDate(input) {
        const value = input.value.trim();
        if (!value) {
            input.classList.remove('is-invalid', 'is-valid');
            return;
        }

        const date = parseDateDDMMYYYY(value);
        if (!date) {
            input.classList.add('is-invalid');
            input.classList.remove('is-valid');
            showFieldError(input, 'ទម្រង់កាលបរិច្ឆេទមិនត្រឹមត្រូវ (ត្រូវតែជា DD/MM/YYYY)');
            return;
        }

        // ពិនិត្យថាកាលបរិច្ឆេទមិនជាអនាគតឆ្ងាយពេក
        const today = new Date();
        const maxFutureDate = new Date();
        maxFutureDate.setFullYear(today.getFullYear() + 10); // 10 ឆ្នាំទៅមុខ

        if (date > maxFutureDate) {
            input.classList.add('is-invalid');
            input.classList.remove('is-valid');
            showFieldError(input, 'កាលបរិច្ឆេទមិនអាចលើសពី 10 ឆ្នាំទៅមុខ');
            return;
        }

        // ប្រសិនបើជាកាលបរិច្ឆេទកើត ពិនិត្យថាមិនជាអនាគត
        if (input.id === 'reg_dob' && date > today) {
            input.classList.add('is-invalid');
            input.classList.remove('is-valid');
            showFieldError(input, 'កាលបរិច្ឆេទកើនមិនអាចជាអនាគត');
            return;
        }

        // ប្រសិនបើជាកាលបរិច្ឆេទចូលរៀន ពិនិត្យថាមិនជាអតីតកាលឆ្ងាយពេក
        if (input.id === 'reg_startDate') {
            const minPastDate = new Date();
            minPastDate.setFullYear(today.getFullYear() - 1); // 1 ឆ្នាំមុន

            if (date < minPastDate) {
                input.classList.add('is-invalid');
                input.classList.remove('is-valid');
                showFieldError(input, 'កាលបរិច្ឆេទចូលរៀនមិនអាចមុនពេល 1 ឆ្នាំ');
                return;
            }
        }

        input.value = formatDateDDMMYYYY(date);
        input.classList.remove('is-invalid');
        input.classList.add('is-valid');

        // ប្រសិនបើជាកាលបរិច្ឆេទចូលរៀន គណនាកាលបរិច្ឆេទបង់ប្រាក់
        if (input.id === 'reg_startDate') {
            calculatePaymentDates();
        }
    }

    // ============================================
    // INSTALLMENT SYSTEM FUNCTIONS
    // ============================================
    function calculateInstallmentTotal() {
        let total = 0;
        const count = installmentCountInput ? parseInt(installmentCountInput.value) || 3 : 3;

        for (let i = 1; i <= count; i++) {
            const amountInput = document.getElementById(`reg_installment${i}_amount`);
            if (amountInput) {
                total += parseFloat(amountInput.value) || 0;
            }
        }

        if (installmentTotalInput) {
            installmentTotalInput.value = total.toFixed(2);
        }

        const balanceText = document.getElementById('summaryBalance')?.textContent.replace('$', '') || '0';
        const balance = parseFloat(balanceText) || 0;
        const difference = total - balance;

        if (installmentDifferenceInput) {
            installmentDifferenceInput.value = Math.abs(difference).toFixed(2);
        }

        if (installmentDifferenceText) {
            if (Math.abs(difference) < 0.01) {
                installmentDifferenceText.textContent = 'គ្រប់ចំនួន ($0.00)';
                installmentDifferenceText.className = 'text-success';
            } else if (difference > 0) {
                installmentDifferenceText.textContent = `លើស ($${difference.toFixed(2)})`;
                installmentDifferenceText.className = 'text-warning';
            } else {
                installmentDifferenceText.textContent = `នៅខ្វះ ($${Math.abs(difference).toFixed(2)})`;
                installmentDifferenceText.className = 'text-danger';
            }
        }
    }

    function setupInstallmentSystem() {
        if (installmentCountInput) {
            installmentCountInput.addEventListener('change', updateInstallmentStages);
        }

        const enableInstallmentCheckbox = document.getElementById('reg_enableInstallment');

        if (enableInstallmentCheckbox && installmentContainer) {
            installmentContainer.style.display = enableInstallmentCheckbox.checked ? 'block' : 'none';
            if (enableInstallmentCheckbox.checked) updateInstallmentStages();

            enableInstallmentCheckbox.addEventListener('change', function () {
                if (this.checked) {
                    installmentContainer.style.display = 'block';
                    updateInstallmentStages();
                } else {
                    installmentContainer.style.display = 'none';
                }
            });
        }
    }

    function updateInstallmentStages() {
        if (!installmentContainer) return;
        const count = installmentCountInput ? parseInt(installmentCountInput.value) || 3 : 3;

        installmentContainer.innerHTML = '';
        for (let i = 1; i <= count; i++) {
            const stageDiv = document.createElement('div');
            stageDiv.className = 'installment-stage mb-3 p-3 border rounded bg-white';
            stageDiv.innerHTML = `
                <h6 class="fw-bold text-primary mb-3">ដំណាក់កាលទី ${i}</h6>
                <div class="row g-2">
                    <div class="col-md-4">
                        <label class="form-label small">កាលបរិច្ឆេទ</label>
                        <input type="text" id="reg_installment${i}_date" class="form-control date-input" placeholder="DD/MM/YYYY">
                    </div>
                    <div class="col-md-4">
                        <label class="form-label small">ចំនួនទឹកប្រាក់ ($)</label>
                        <input type="number" step="0.01" id="reg_installment${i}_amount" class="form-control installment-amount" oninput="calculateInstallmentTotal()">
                    </div>
                    <div class="col-md-4">
                        <label class="form-label small">អ្នកទទួល</label>
                        <input type="text" id="reg_installment${i}_receiver" class="form-control" placeholder="ឈ្មោះអ្នកទទួល">
                    </div>
                </div>
            `;
            installmentContainer.appendChild(stageDiv);
        }
        setupDateInputs();
        calculateFees();
    }

    function updateInstallmentAmounts(balance) {
        const enableInstallmentCheckbox = document.getElementById('reg_enableInstallment');
        if (enableInstallmentCheckbox && enableInstallmentCheckbox.checked) {
            const count = installmentCountInput ? parseInt(installmentCountInput.value) || 3 : 3;
            if (count <= 0) return;

            const equalAmount = balance / count;
            let currentTotal = 0;

            for (let i = 1; i <= count; i++) {
                const amountInput = document.getElementById(`reg_installment${i}_amount`);
                if (amountInput) {
                    if (i < count) {
                        const val = Math.floor(equalAmount * 100) / 100;
                        amountInput.value = val.toFixed(2);
                        currentTotal += val;
                    } else {
                        amountInput.value = (balance - currentTotal).toFixed(2);
                    }
                }
            }
            calculateInstallmentTotal();
        }
    }

    function updateInstallmentDates(startDate, paymentMonths) {
        const enableInstallmentCheckbox = document.getElementById('reg_enableInstallment');
        if (enableInstallmentCheckbox && enableInstallmentCheckbox.checked && startDate) {
            const count = installmentCountInput ? parseInt(installmentCountInput.value) || 3 : 3;

            for (let i = 1; i <= count; i++) {
                const installmentDate = new Date(startDate);
                const monthsPerStage = paymentMonths / count;
                installmentDate.setMonth(installmentDate.getMonth() + Math.floor((i - 1) * monthsPerStage));

                const dateInput = document.getElementById(`reg_installment${i}_date`);
                if (dateInput && !dateInput.value) {
                    dateInput.value = formatDateDDMMYYYY(installmentDate);
                }
            }
        }
    }

    // ============================================
    // DATE HANDLING FUNCTIONS
    // ============================================
    function setupDateInputs() {
        const dateInputs = document.querySelectorAll('.date-input, [id*="Date"], [id*="date"]');
        dateInputs.forEach(input => {
            const newInput = input.cloneNode(true);
            input.parentNode.replaceChild(newInput, input);
            newInput.addEventListener('input', function (e) { autoFormatDateInput(e); });
            newInput.addEventListener('blur', function () { validateAndFormatDate(this); });
            newInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') validateAndFormatDate(this); });
        });

        const startDateInput = document.getElementById('reg_startDate');
        if (startDateInput) startDateInput.addEventListener('change', calculatePaymentDates);

        const paymentDueDateInput = document.getElementById('reg_paymentDueDate');
        if (paymentDueDateInput) paymentDueDateInput.addEventListener('blur', function () { validateAndFormatDate(this); });

        const dobInput = document.getElementById('reg_dob');
        if (dobInput) dobInput.addEventListener('blur', function () { validateAndFormatDate(this); });
    }

    function autoFormatDateInput(e) {
        let value = e.target.value.replace(/[^\d\/]/g, '');
        if (value.split('/').length > 3) value = value.substring(0, value.lastIndexOf('/'));
        if (value.length === 2 && !value.includes('/')) value = value + '/';
        else if (value.length === 5 && value.split('/').length === 2) value = value + '/';

        if (value.length > 10) value = value.substring(0, 10);
        e.target.value = value;
    }

    function validateAndFormatDate(input) {
        const value = input.value.trim();
        if (!value) {
            input.classList.remove('is-invalid', 'is-valid');
            return;
        }
        const date = parseDateDDMMYYYY(value);
        if (!date) {
            showFieldError(input, 'ទម្រង់កាលបរិច្ឆេទមិនត្រឹមត្រូវ (ត្រូវតែជា DD/MM/YYYY)');
            return;
        }

        // Basic future check (10 years)
        const maxFutureDate = new Date();
        maxFutureDate.setFullYear(maxFutureDate.getFullYear() + 10);
        if (date > maxFutureDate) {
            showFieldError(input, 'កាលបរិច្ឆេទមិនអាចលើសពី 10 ឆ្នាំទៅមុខ');
            return;
        }

        input.value = formatDateDDMMYYYY(date);
        input.classList.remove('is-invalid');
        input.classList.add('is-valid');

        if (input.id === 'reg_startDate') calculatePaymentDates();
    }

    function showFieldError(input, message) {
        if (typeof showAlert === 'function') showAlert(message, 'warning');
        if (input) input.classList.add('is-invalid');
    }

    function calculatePaymentDates() {
        const startDateInput = document.getElementById('reg_startDate');
        const paymentMonthsDisplayInput = document.getElementById('reg_paymentMonthsDisplay');

        // Get the number of months to pay from various sources
        let paymentMonths = 0;

        // First, check if user manually entered payment months in the display field
        if (paymentMonthsDisplayInput && paymentMonthsDisplayInput.value) {
            const manualValue = parseInt(paymentMonthsDisplayInput.value);
            if (manualValue > 0) {
                paymentMonths = manualValue;
            }
        }

        // If no manual value, calculate from study duration
        if (paymentMonths === 0) {
            // Check if manual fee input is enabled
            if (enableManualFeeCheckbox && enableManualFeeCheckbox.checked) {
                const paymentMonthsManual = document.getElementById('reg_paymentMonths_manual');
                paymentMonths = paymentMonthsManual ? parseInt(paymentMonthsManual.value) || 0 : 0;
            }
            // Check if fulltime with manual duration
            else if (chineseFulltimeCheckbox && chineseFulltimeCheckbox.checked) {
                if (fulltimeManualDurationCheckbox && fulltimeManualDurationCheckbox.checked) {
                    const paymentMonthsManual = document.getElementById('reg_paymentMonths_manual');
                    paymentMonths = paymentMonthsManual ? parseInt(paymentMonthsManual.value) || 0 : 0;
                } else {
                    // Use study duration select
                    const duration = studyDurationSelect ? studyDurationSelect.value : '';
                    paymentMonths = parseInt(duration) || 0;
                }
            }
            // Check if parttime with manual duration
            else if (chineseParttimeCheckbox && chineseParttimeCheckbox.checked) {
                if (parttimeManualDurationCheckbox && parttimeManualDurationCheckbox.checked) {
                    const paymentMonthsManual = document.getElementById('reg_parttime_paymentMonths_manual');
                    paymentMonths = paymentMonthsManual ? parseInt(paymentMonthsManual.value) || 0 : 0;
                } else {
                    // Get from selected duration checkbox
                    const selectedDurationCheckbox = document.querySelector('.duration-checkbox:checked');
                    if (selectedDurationCheckbox) {
                        const parentOption = selectedDurationCheckbox.closest('.study-duration-option');
                        paymentMonths = parentOption ? parseInt(parentOption.getAttribute('data-duration')) || 0 : 0;
                    }
                }
            }

            // Update the payment months display field only if it was auto-calculated
            if (paymentMonthsDisplayInput && paymentMonths > 0) {
                paymentMonthsDisplayInput.value = paymentMonths;
            }
        }

        // Calculate payment due date if we have start date and payment months
        if (startDateInput && startDateInput.value && paymentMonths > 0) {
            try {
                const startDate = parseDateDDMMYYYY(startDateInput.value);

                if (startDate) {
                    const dueDate = new Date(startDate);
                    dueDate.setMonth(dueDate.getMonth() + paymentMonths);

                    const dueDateText = formatDateDDMMYYYY(dueDate);
                    const paymentDueDateField = document.getElementById('reg_paymentDueDate');
                    if (paymentDueDateField) {
                        paymentDueDateField.value = dueDateText;
                        paymentDueDateField.classList.add('is-valid');
                    }
                    if (paymentDueDateDisplay) {
                        paymentDueDateDisplay.textContent = dueDateText;
                    }
                }
            } catch (error) {
                console.error('Error calculating payment dates:', error);
            }
        }
    }

    function parseDateDDMMYYYY(dateString) {
        if (!dateString) return null;

        // សម្អាតខ្សែអក្សរ
        const cleanString = dateString.replace(/[^\d\/]/g, '');
        const parts = cleanString.split('/');

        if (parts.length === 3) {
            let day = parseInt(parts[0]);
            let month = parseInt(parts[1]) - 1;
            let year = parseInt(parts[2]);

            // ប្រសិនបើឆ្នាំមានតែ 2 ខ្ទង់
            if (year < 100) {
                if (year >= 0 && year <= 30) {
                    year += 2000;
                } else {
                    year += 1900;
                }
            }

            // ពិនិត្យថាខែនិងថ្ងៃត្រឹមត្រូវ
            if (day < 1 || day > 31) return null;
            if (month < 0 || month > 11) return null;

            const date = new Date(year, month, day);

            // ពិនិត្យថាកាលបរិច្ឆេទត្រឹមត្រូវ
            if (date.getFullYear() === year &&
                date.getMonth() === month &&
                date.getDate() === day) {
                return date;
            }
        }
        return null;
    }

    function formatDateDDMMYYYY(date) {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }

    // ============================================
    // 10. ALERT FUNCTIONS
    // ============================================
    function showAlert(message, type = 'info') {
        if (!alertContainer) return;
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show shadow-sm animate__animated animate__fadeInDown`;
        alertDiv.role = 'alert';
        alertDiv.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : (type === 'danger' ? 'exclamation-circle' : 'info-circle')} me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        alertContainer.appendChild(alertDiv);
        setTimeout(() => {
            alertDiv.classList.replace('animate__fadeInDown', 'animate__fadeOutUp');
            setTimeout(() => alertDiv.remove(), 500);
        }, 5000);
    }

    function showLoadingOverlay() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'flex';
    }

    function hideLoadingOverlay() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    async function getStudentById(studentId) {
        try {
            const snapshot = await database.ref(`students/${studentId}`).once('value');
            return snapshot.val();
        } catch (error) {
            console.error('Error fetching student by ID:', error);
            throw error;
        }
    }

    // ============================================
    // 11. FORM MODE MANAGEMENT
    // ============================================
    function setEditMode(edit) {
        isEditMode = edit;

        if (edit) {
            if (submitBtn) submitBtn.style.display = 'none';
            if (updateBtn) updateBtn.style.display = 'block';
            if (cancelEditBtn) cancelEditBtn.style.display = 'block';
            if (resetBtn) resetBtn.style.display = 'block';

            const allInputs = document.querySelectorAll('#studentRegistrationForm input, #studentRegistrationForm select, #studentRegistrationForm textarea');
            allInputs.forEach(input => {
                if (input.id !== 'reg_displayId' && input.id !== 'reg_studentKey') {
                    input.readOnly = false;
                    input.disabled = false;
                    input.style.backgroundColor = '';
                }
            });

            if (displayId) {
                displayId.readOnly = true;
                displayId.style.backgroundColor = '#f8f9fa';
            }

            if (editModeIndicator) editModeIndicator.style.display = 'inline-block';
            if (formTitle) formTitle.textContent = 'កែសម្រួលទិន្នន័យសិស្ស';

            showAlert('ទម្រង់ត្រូវបានបើកសម្រាប់ការកែសម្រួលទិន្នន័យ', 'info');
        } else {
            if (submitBtn) submitBtn.style.display = 'block';
            if (updateBtn) updateBtn.style.display = 'none';
            if (cancelEditBtn) cancelEditBtn.style.display = 'none';

            const allInputs = document.querySelectorAll('#studentRegistrationForm input, #studentRegistrationForm select, #studentRegistrationForm textarea');
            allInputs.forEach(input => {
                input.readOnly = false;
                input.style.backgroundColor = '';
            });

            if (displayId) {
                displayId.readOnly = true;
                displayId.style.backgroundColor = '#fff0f6';
            }

            if (editModeIndicator) editModeIndicator.style.display = 'none';
            if (formTitle) formTitle.textContent = 'ទម្រង់បែបបទចុះឈ្មោះសិស្សថ្មី';

            currentStudentKey = null;
            const studentKeyField = document.getElementById('reg_studentKey');
            if (studentKeyField) studentKeyField.value = '';
            originalImageUrl = '';
            studentImageFile = null;

            showAlert('ទម្រង់ត្រូវបានត្រឡប់ទៅរបៀបចុះឈ្មោះថ្មី', 'info');
        }
    }

    // ============================================
    // 12. FORM VALIDATION
    // ============================================
    function validateForm() {
        const requiredFields = [
            'reg_lastName', 'reg_firstName', 'reg_gender'
        ];

        for (let fieldId of requiredFields) {
            const field = document.getElementById(fieldId);
            if (!field || !field.value.trim()) {
                const fieldName = field ? field.labels[0] ? field.labels[0].textContent : fieldId : fieldId;
                showAlert(`សូមបំពេញព័ត៌មាន: ${fieldName}`, 'warning');
                if (field) field.focus();
                return false;
            }
        }

        // Check if a course is selected
        if ((!chineseFulltimeCheckbox || !chineseFulltimeCheckbox.checked) &&
            (!chineseParttimeCheckbox || !chineseParttimeCheckbox.checked)) {
            showAlert('សូមជ្រើសរើសប្រភេទការសិក្សា', 'warning');
            return false;
        }

        // Check study time for full-time
        if (chineseFulltimeCheckbox && chineseFulltimeCheckbox.checked) {
            const selectedStudyTime = document.querySelector('input[name="reg_fulltime_studyTime"]:checked');
            if (!selectedStudyTime) {
                showAlert('សូមជ្រើសរើសម៉ោងសិក្សាសម្រាប់ពេញម៉ោង', 'warning');
                return false;
            }

            if (selectedStudyTime.id === 'fulltime_custom') {
                if (!fulltimeCustomStart || !fulltimeCustomStart.value || !fulltimeCustomEnd || !fulltimeCustomEnd.value) {
                    showAlert('សូមបំពេញម៉ោងចាប់ផ្តើម និងម៉ោងបញ្ចប់សម្រាប់ម៉ោងសិក្សាផ្ទាល់ខ្លួន', 'warning');
                    return false;
                }
            }

            // ពិនិត្យរយៈពេលសិក្សាសម្រាប់ពេញម៉ោងបញ្ចូលដោយខ្លួនឯង
            if (fulltimeManualDurationCheckbox && fulltimeManualDurationCheckbox.checked) {
                const studyDurationManual = document.getElementById('reg_studyDuration_manual');
                const studyDuration = studyDurationManual ? parseInt(studyDurationManual.value) || 0 : 0;
                if (studyDuration <= 0 || studyDuration > 72) { // 72 ខែ = 6 ឆ្នាំ
                    showAlert('រយៈពេលសិក្សាត្រូវតែចន្លោះ 1-72 ខែ', 'warning');
                    if (studyDurationManual) studyDurationManual.focus();
                    return false;
                }

                const paymentMonthsManual = document.getElementById('reg_paymentMonths_manual');
                const paymentMonths = paymentMonthsManual ? parseInt(paymentMonthsManual.value) || 0 : 0;
                if (paymentMonths <= 0 || paymentMonths > 72) {
                    showAlert('រយៈពេលបង់ត្រូវតែចន្លោះ 1-72 ខែ', 'warning');
                    if (paymentMonthsManual) paymentMonthsManual.focus();
                    return false;
                }
            }
        }

        // Check study time for part-time
        if (chineseParttimeCheckbox && chineseParttimeCheckbox.checked) {
            const selectedStudyTime = document.querySelector('input[name="reg_parttime_studyTime"]:checked');
            if (!selectedStudyTime) {
                showAlert('សូមជ្រើសរើសម៉ោងសិក្សាសម្រាប់ពេលកន្លះម៉ោង', 'warning');
                return false;
            }

            // ពិនិត្យរយៈពេលសិក្សាសម្រាប់ក្រៅម៉ោងបញ្ចូលដោយខ្លួនឯង
            if (parttimeManualDurationCheckbox && parttimeManualDurationCheckbox.checked) {
                const studyDurationManual = document.getElementById('reg_parttime_studyDuration_manual');
                const studyDuration = studyDurationManual ? parseInt(studyDurationManual.value) || 0 : 0;
                if (studyDuration <= 0 || studyDuration > 72) {
                    showAlert('រយៈពេលសិក្សាត្រូវតែចន្លោះ 1-72 ខែ', 'warning');
                    if (studyDurationManual) studyDurationManual.focus();
                    return false;
                }

                const paymentMonthsManual = document.getElementById('reg_parttime_paymentMonths_manual');
                const paymentMonths = paymentMonthsManual ? parseInt(paymentMonthsManual.value) || 0 : 0;
                if (paymentMonths <= 0 || paymentMonths > 72) {
                    showAlert('រយៈពេលបង់ត្រូវតែចន្លោះ 1-72 ខែ', 'warning');
                    if (paymentMonthsManual) paymentMonthsManual.focus();
                    return false;
                }
            }
        }

        // Validate dates
        const dateFields = ['reg_dob', 'reg_startDate', 'reg_paymentDueDate'];
        for (let fieldId of dateFields) {
            const field = document.getElementById(fieldId);
            if (field && field.value) {
                const date = parseDateDDMMYYYY(field.value);
                if (!date) {
                    const fieldName = field.labels[0] ? field.labels[0].textContent : fieldId;
                    showAlert(`ទម្រង់កាលបរិច្ឆេទមិនត្រឹមត្រូវ: ${fieldName} (ត្រូវតែជា DD/MM/YYYY)`, 'warning');
                    field.focus();
                    return false;
                }

                // ពិនិត្យថាកាលបរិច្ឆេទចូលរៀនមុនកាលបរិច្ឆេទបង់ប្រាក់
                if (fieldId === 'reg_startDate') {
                    const paymentDueDateField = document.getElementById('reg_paymentDueDate');
                    if (paymentDueDateField && paymentDueDateField.value) {
                        const dueDate = parseDateDDMMYYYY(paymentDueDateField.value);
                        if (dueDate && date > dueDate) {
                            showAlert('កាលបរិច្ឆេទចូលរៀនមិនអាចមកក្រោយកាលបរិច្ឆេទបង់ប្រាក់', 'warning');
                            field.focus();
                            return false;
                        }
                    }
                }
            }
        }

        // Check if payment months is set for manual input
        if (enableManualFeeCheckbox && enableManualFeeCheckbox.checked) {
            const paymentMonthsManual = document.getElementById('reg_paymentMonths_manual');
            const paymentMonths = paymentMonthsManual ? paymentMonthsManual.value : '';
            if (!paymentMonths || parseInt(paymentMonths) <= 0) {
                showAlert('សូមបញ្ចូលចំនួនខែត្រូវបង់', 'warning');
                if (paymentMonthsManual) paymentMonthsManual.focus();
                return false;
            }

            // ពិនិត្យថាមិនលើស 120 ខែ (10 ឆ្នាំ)
            if (parseInt(paymentMonths) > 72) {
                showAlert('រយៈពេលបង់មិនត្រូវលើស 72 ខែ', 'warning');
                if (paymentMonthsManual) paymentMonthsManual.focus();
                return false;
            }
        }



        return true;
    }

    // ============================================
    // 13. IMAGE UPLOAD
    // ============================================
    async function uploadImage(file) {
        const storageRef = storage.ref();
        const imageRef = storageRef.child(`student_images/${Date.now()}_${file.name}`);
        await imageRef.put(file);
        return await imageRef.getDownloadURL();
    }

    // ============================================
    // 14. DATA COLLECTION
    // ============================================
    function collectFormData() {
        const studyProgram = document.querySelector('input[name="reg_studyProgram"]:checked')?.value || '';
        let courseType = studyProgram; // Use studyProgram as courseType or separate field



        let studyDuration = 0;
        let studyDurationText = '';
        let paymentMonths = 0;
        let paymentMonthsText = '';

        if (chineseFulltimeCheckbox && chineseFulltimeCheckbox.checked) {
            if (fulltimeManualDurationCheckbox && fulltimeManualDurationCheckbox.checked) {
                const studyDurationManual = document.getElementById('reg_studyDuration_manual');

                studyDuration = studyDurationManual ? parseInt(studyDurationManual.value) || 0 : 0;
                studyDurationText = studyDuration > 0 ? `${studyDuration} ខែ` : 'បញ្ចូលដោយខ្លួនឯង';
                paymentMonths = 0; // Will be overridden
                paymentMonthsText = 'បញ្ចូលដោយខ្លួនឯង';
            } else {
                // Default or 0 since selector is removed
                studyDuration = 0;
                studyDurationText = '';
                paymentMonths = 0;
                paymentMonthsText = '';
            }
        } else if (chineseParttimeCheckbox && chineseParttimeCheckbox.checked) {
            if (parttimeManualDurationCheckbox && parttimeManualDurationCheckbox.checked) {
                const studyDurationManual = document.getElementById('reg_parttime_studyDuration_manual');

                studyDuration = studyDurationManual ? parseInt(studyDurationManual.value) || 0 : 0;
                studyDurationText = studyDuration > 0 ? `${studyDuration} ខែ` : 'បញ្ចូលដោយខ្លួនឯង';
                paymentMonths = 0; // Will be overridden
                paymentMonthsText = 'បញ្ចូលដោយខ្លួនឯង';
            } else {
                const selectedDurationCheckbox = document.querySelector('.duration-checkbox:checked');
                if (selectedDurationCheckbox) {
                    const parentOption = selectedDurationCheckbox.closest('.study-duration-option');
                    studyDuration = parentOption ? parseInt(parentOption.getAttribute('data-duration')) || 0 : 0;
                    studyDurationText = studyDuration === 3 ? '៣ខែ' : '១ខែ';
                    paymentMonths = studyDuration;
                    paymentMonthsText = studyDurationText;
                }
            }
        }

        // Priority: Use the manual payment months input if available
        const paymentMonthsDisplayInput = document.getElementById('reg_paymentMonthsDisplay');
        if (paymentMonthsDisplayInput && paymentMonthsDisplayInput.value) {
            paymentMonths = parseFloat(paymentMonthsDisplayInput.value) || 0;
            paymentMonthsText = `${paymentMonths} ខែ`;
        }

        // Get study time
        let studyTime = '';
        if (chineseFulltimeCheckbox && chineseFulltimeCheckbox.checked) {
            const selectedTime = document.querySelector('input[name="reg_fulltime_studyTime"]:checked');
            if (selectedTime) {
                studyTime = selectedTime.value;
                if (selectedTime.id === 'fulltime_custom' && fulltimeCustomStart && fulltimeCustomEnd &&
                    fulltimeCustomStart.value && fulltimeCustomEnd.value) {
                    studyTime = `${fulltimeCustomStart.value}-${fulltimeCustomEnd.value}`;
                }
            }
        } else if (chineseParttimeCheckbox && chineseParttimeCheckbox.checked) {
            const selectedTime = document.querySelector('input[name="reg_parttime_studyTime"]:checked');
            if (selectedTime) studyTime = selectedTime.value;
        }

        // Calculate fees
        let tuitionFee = 0;
        let discount = 0;
        let discountPercent = 0;
        let materialFee = 0;
        let adminFee = 0;
        let adminServicesFee = 0;

        // Calculate fees from consolidated inputs
        const tuitionFeeField = document.getElementById('reg_tuitionFee');
        const discountField = document.getElementById('reg_discount');
        const discountPercentField = document.getElementById('reg_discountPercent');
        const materialFeeField = document.getElementById('reg_materialFee');
        const adminFeeField = document.getElementById('reg_adminFee');

        tuitionFee = tuitionFeeField ? parseFloat(tuitionFeeField.value) || 0 : 0;
        discount = discountField ? parseFloat(discountField.value) || 0 : 0;
        discountPercent = discountPercentField ? parseFloat(discountPercentField.value) || 0 : 0;
        materialFee = materialFeeField ? parseFloat(materialFeeField.value) || 0 : 0;
        adminFee = adminFeeField ? parseFloat(adminFeeField.value) || 0 : 0;
        adminServicesFee = 0;

        const discountFromPercent = tuitionFee * (discountPercent / 100);
        const totalDiscount = discount + discountFromPercent;
        const netTuition = Math.max(0, tuitionFee - totalDiscount);

        const initialPaymentField = document.getElementById('reg_initialPayment');
        const initialPayment = initialPaymentField ? parseFloat(initialPaymentField.value) || 0 : 0;
        const totalAdminFees = materialFee + adminFee;
        const totalAllFees = netTuition + totalAdminFees;
        const balance = Math.max(0, totalAllFees - initialPayment);

        // Collect installment data
        // Installments removed
        const installments = [];


        return {
            // Basic info
            displayId: displayId ? displayId.value || '' : '',
            lastName: document.getElementById('reg_lastName') ? document.getElementById('reg_lastName').value.trim() || '' : '',
            firstName: document.getElementById('reg_firstName') ? document.getElementById('reg_firstName').value.trim() || '' : '',
            gender: document.getElementById('reg_gender') ? document.getElementById('reg_gender').value || '' : '',
            dob: document.getElementById('reg_dob') ? document.getElementById('reg_dob').value.trim() || '' : '',
            nationality: document.getElementById('reg_nationality') ? document.getElementById('reg_nationality').value.trim() || 'ខ្មែរ' : 'ខ្មែរ',

            // Address
            village: document.getElementById('reg_village') ? document.getElementById('reg_village').value.trim() || '' : '',
            commune: document.getElementById('reg_commune') ? document.getElementById('reg_commune').value.trim() || '' : '',
            district: document.getElementById('reg_district') ? document.getElementById('reg_district').value.trim() || '' : '',
            province: document.getElementById('reg_province') ? document.getElementById('reg_province').value || '' : '',

            // Teacher info
            teacherName: document.getElementById('reg_teacherName') ? document.getElementById('reg_teacherName').value.trim() || '' : '',
            teacherPhone: document.getElementById('reg_teacherPhone') ? document.getElementById('reg_teacherPhone').value.trim() || '' : '',
            classroom: document.getElementById('reg_classroom') ? document.getElementById('reg_classroom').value.trim() || '' : '',

            // Study info
            courseType: courseType || '',
            studyProgram: studyProgram || '3_languages',
            studyLevel: '', // Removed
            studyDuration: studyDuration || 0,
            studyDurationText: studyDurationText || '',
            paymentMonths: paymentMonths || 0,
            paymentMonthsText: paymentMonthsText || '',
            studyTime: studyTime || '',
            isOldStudent: document.getElementById('reg_isOldStudentCheck') ? document.getElementById('reg_isOldStudentCheck').checked : false,

            // Financial info
            tuitionFee: tuitionFee || 0,
            discount: discount || 0,
            discountPercent: discountPercent || 0,
            totalDiscount: totalDiscount || 0,
            netTuition: netTuition || 0,

            totalAdminFees: totalAdminFees || 0,
            initialPayment: initialPayment || 0,
            totalAllFees: totalAllFees || 0,
            balance: balance || 0,

            isManualInput: (enableManualFeeCheckbox && enableManualFeeCheckbox.checked) || false,
            isManualDuration: (fulltimeManualDurationCheckbox && fulltimeManualDurationCheckbox.checked) ||
                (parttimeManualDurationCheckbox && parttimeManualDurationCheckbox.checked) || false,

            // Payment dates
            startDate: document.getElementById('reg_startDate') ? document.getElementById('reg_startDate').value.trim() || '' : '',
            paymentDueDate: document.getElementById('reg_paymentDueDate') ? document.getElementById('reg_paymentDueDate').value.trim() || '' : '',
            nextPaymentDate: document.getElementById('reg_paymentDueDate') ? document.getElementById('reg_paymentDueDate').value.trim() || '' : '',

            // Guardian info
            guardianName: document.getElementById('reg_guardianName') ? document.getElementById('reg_guardianName').value.trim() || '' : '',
            guardianRelation: document.getElementById('reg_guardianRelation') ? document.getElementById('reg_guardianRelation').value || '' : '',
            guardianPhone: document.getElementById('reg_guardianPhone') ? document.getElementById('reg_guardianPhone').value.trim() || '' : '',
            guardianAddress: document.getElementById('reg_guardianAddress') ? document.getElementById('reg_guardianAddress').value.trim() || '' : '',

            // Father info
            fatherName: document.getElementById('reg_fatherName') ? document.getElementById('reg_fatherName').value.trim() || '' : '',
            fatherAge: document.getElementById('reg_fatherAge') ? parseInt(document.getElementById('reg_fatherAge').value) || 0 : 0,
            fatherJob: document.getElementById('reg_fatherJob') ? document.getElementById('reg_fatherJob').value.trim() || '' : '',
            fatherPhone: document.getElementById('reg_fatherPhone') ? document.getElementById('reg_fatherPhone').value.trim() || '' : '',
            fatherAddress: document.getElementById('reg_fatherAddress') ? document.getElementById('reg_fatherAddress').value.trim() || '' : '',

            // Mother info
            motherName: document.getElementById('reg_motherName') ? document.getElementById('reg_motherName').value.trim() || '' : '',
            motherAge: document.getElementById('reg_motherAge') ? parseInt(document.getElementById('reg_motherAge').value) || 0 : 0,
            motherJob: document.getElementById('reg_motherJob') ? document.getElementById('reg_motherJob').value.trim() || '' : '',
            motherPhone: document.getElementById('reg_motherPhone') ? document.getElementById('reg_motherPhone').value.trim() || '' : '',
            motherAddress: document.getElementById('reg_motherAddress') ? document.getElementById('reg_motherAddress').value.trim() || '' : '',

            // Living arrangement
            livingWith: document.querySelector('input[name="reg_livingWith"]:checked') ? document.querySelector('input[name="reg_livingWith"]:checked').value : 'parents',

            // Health info
            healthStatus: document.querySelector('input[name="reg_healthStatus"]:checked') ? document.querySelector('input[name="reg_healthStatus"]:checked').value : 'normal',
            healthProblem: document.getElementById('reg_healthProblem') ? document.getElementById('reg_healthProblem').value.trim() || '' : '',
            healthAllergy: document.getElementById('reg_healthAllergy') ? document.getElementById('reg_healthAllergy').value.trim() || '' : '',

            // Authorized escorts
            authorizedEscorts: [
                {
                    name: document.getElementById('reg_escortName1') ? document.getElementById('reg_escortName1').value.trim() || '' : '',
                    gender: document.getElementById('reg_escortGender1') ? document.getElementById('reg_escortGender1').value || '' : '',
                    phone: document.getElementById('reg_escortPhone1') ? document.getElementById('reg_escortPhone1').value.trim() || '' : ''
                },
                {
                    name: document.getElementById('reg_escortName2') ? document.getElementById('reg_escortName2').value.trim() || '' : '',
                    gender: document.getElementById('reg_escortGender2') ? document.getElementById('reg_escortGender2').value || '' : '',
                    phone: document.getElementById('reg_escortPhone2') ? document.getElementById('reg_escortPhone2').value.trim() || '' : ''
                },
                {
                    name: document.getElementById('reg_escortName3') ? document.getElementById('reg_escortName3').value.trim() || '' : '',
                    gender: document.getElementById('reg_escortGender3') ? document.getElementById('reg_escortGender3').value || '' : '',
                    phone: document.getElementById('reg_escortPhone3') ? document.getElementById('reg_escortPhone3').value.trim() || '' : ''
                }
            ],

            // Status
            status: 'active',
            hasOutstandingPayment: balance > 0,
            createdAt: isEditMode ? undefined : firebase.database.ServerValue.TIMESTAMP,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        };
    }



    function sanitizeFirebaseData(data) {
        const sanitized = {};
        for (const key in data) {
            if (data[key] !== undefined && data[key] !== null) {
                if (typeof data[key] === 'object' && !Array.isArray(data[key])) {
                    const sanitizedObject = sanitizeFirebaseData(data[key]);
                    if (Object.keys(sanitizedObject).length > 0) sanitized[key] = sanitizedObject;
                } else {
                    sanitized[key] = data[key];
                }
            }
        }
        return sanitized;
    }

    // ============================================
    // 15. SAVE AND UPDATE FUNCTIONS
    // ============================================
    async function saveNewStudent() {
        if (!submitBtn) return;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="loader loader-btn"></span> កំពុងរក្សាទុក...';

        try {
            showLoadingOverlay();
            showAlert('កំពុងរក្សាទុកទិន្នន័យសិស្ស...', 'info');

            let imageUrl = '';
            if (studentImageFile) imageUrl = await uploadImage(studentImageFile);

            studentImageUrl = imageUrl;

            const studentData = collectFormData();
            studentData.imageUrl = imageUrl;

            const sanitizedStudentData = sanitizeFirebaseData(studentData);
            const newStudentRef = database.ref('students').push();
            await newStudentRef.set(sanitizedStudentData);

            const enableInstallmentCheckbox = document.getElementById('reg_enableInstallment');
            if (enableInstallmentCheckbox && enableInstallmentCheckbox.checked) {
                const installmentData = collectInstallmentData();
                installmentData.studentId = newStudentRef.key;
                const sanitizedInstallmentData = sanitizeFirebaseData(installmentData);
                await database.ref('installments').push().set(sanitizedInstallmentData);
            }

            showAlert('ទិន្នន័យសិស្សត្រូវបានរក្សាទុកដោយជោគជ័យ!', 'success');
            resetForm();
            await generateUniqueStudentId();

            setTimeout(() => {
                showAlert(`
                    សិស្សត្រូវបានចុះឈ្មោះដោយជោគជ័យ! 
                    <a href="data-tracking.html" class="alert-link">ចុចទីនេះដើម្បីមើលបញ្ជីសិស្ស</a>
                `, 'success');
            }, 1000);

        } catch (error) {
            console.error('Error saving student:', error);
            showAlert(`កំហុសក្នុងការរក្សាទុកទិន្នន័យ: ${error.message}`, 'danger');
        } finally {
            hideLoadingOverlay();
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> បញ្ជូនទម្រង់ចុះឈ្មោះ';
        }
    }

    async function updateStudent() {
        if (!currentStudentKey) {
            showAlert('មិនមានទិន្នន័យសិស្សដើម្បីធ្វើបច្ចុប្បន្នភាព', 'warning');
            return;
        }

        if (!updateBtn) return;

        updateBtn.disabled = true;
        updateBtn.innerHTML = '<span class="loader loader-btn"></span> កំពុងរក្សាទុក...';

        try {
            showLoadingOverlay();
            console.log('--- ចាប់ផ្តើមបច្ចុប្បន្នភាពទិន្នន័យ ---');
            showAlert('កំពុងដំណើរការរក្សាទុកទិន្នន័យ...', 'info');

            // 1. Upload រូបភាពប្រសិនបើមានការប្តូរថ្មី
            if (studentImageFile) {
                console.log('កំពុង Upload រូបភាពថ្មី...');
                studentImageUrl = await uploadImage(studentImageFile);
            }

            // 2. ប្រមូលទិន្នន័យពី Form
            const studentData = collectFormData();

            // បន្ថែមរូបភាព និងព័ត៌មានដែលខ្វះខាត
            studentData.imageUrl = studentImageUrl || originalImageUrl || '';
            studentData.studentKey = currentStudentKey;
            studentData.updatedAt = firebase.database.ServerValue.TIMESTAMP;

            console.log('ទិន្នន័យដែលត្រូវរក្សាទុក:', studentData);

            const sanitizedStudentData = sanitizeFirebaseData(studentData);

            // 3. ធ្វើបច្ចុប្បន្នភាពទិន្នន័យសិស្សក្នុង Firebase
            console.log(`កំពុងបច្ចុប្បន្នភាពសិស្ស: ${currentStudentKey}`);
            await database.ref(`students/${currentStudentKey}`).update(sanitizedStudentData);



            console.log('បច្ចុប្បន្នភាពទទួលបានជោគជ័យ!');
            showAlert('ទិន្នន័យសិស្សត្រូវបានធ្វើបច្ចុប្បន្នភាពដោយជោគជ័យ!', 'success');

            // រង់ចាំបន្តិចដើម្បីឱ្យអ្នកប្រើមើលសារជោគជ័យ
            setTimeout(() => {
                setEditMode(false);
                resetForm();
                generateUniqueStudentId();
                // ប្រសិនបើចង់ត្រឡប់ទៅទំព័របញ្ជីសិស្ស
                if (confirm('តើអ្នកចង់ត្រឡប់ទៅទំព័រតាមដានទិន្នន័យវិញដែរឬទេ?')) {
                    window.location.href = 'data-tracking.html';
                }
            }, 1000);

        } catch (error) {
            console.error('កំហុសក្នុងការបច្ចុប្បន្នភាព:', error);
            showAlert(`កំហុសក្នុងការធ្វើបច្ចុប្បន្នភាពទិន្នន័យ: ${error.message}. សូមពិនិត្យមើល Console (F12) សម្រាប់ព័ត៌មានលម្អិត។`, 'danger');
            throw error;
        } finally {
            hideLoadingOverlay();
            updateBtn.disabled = false;
            updateBtn.innerHTML = '<i class="fas fa-save"></i> រក្សាទុកការផ្លាស់ប្តូរ';
        }
    }



    // ============================================
    // 16. FORM RESET
    // ============================================
    function resetForm() {
        if (studentForm) studentForm.reset();



        // Reset Study Program
        const program3Lang = document.getElementById('program3Lang');
        if (program3Lang) {
            program3Lang.checked = true;
            // Trigger change event to update UI
            program3Lang.dispatchEvent(new Event('change'));
        }

        if (chineseFulltimeDetails) chineseFulltimeDetails.style.display = 'block'; // Default
        if (chineseParttimeDetails) chineseParttimeDetails.style.display = 'none';

        updateStudyDurationOptions(true);

        const oldStudentCheck = document.getElementById('reg_isOldStudentCheck');
        if (oldStudentCheck) {
            oldStudentCheck.checked = false;
        }
        const oldStudentValue = document.getElementById('reg_isOldStudent');
        if (oldStudentValue) {
            oldStudentValue.value = 'false';
        }

        document.querySelectorAll('.duration-checkbox').forEach(cb => {
            cb.checked = false;
            cb.disabled = false;
        });
        document.querySelectorAll('.study-duration-option').forEach(option => {
            option.classList.remove('selected');
        });

        if (fulltimeStudyTimeRadios) {
            fulltimeStudyTimeRadios.forEach(radio => radio.checked = false);
        }
        if (parttimeStudyTimeRadios) {
            parttimeStudyTimeRadios.forEach(radio => radio.checked = false);
        }
        document.querySelectorAll('.study-time-option').forEach(option => {
            option.classList.remove('selected');
        });

        if (fulltimeCustomStart && fulltimeCustomEnd) {
            fulltimeCustomStart.value = '';
            fulltimeCustomEnd.value = '';
            const startParent = fulltimeCustomStart.parentElement;
            const endParent = fulltimeCustomEnd.parentElement;
            if (startParent) startParent.style.display = 'none';
            if (endParent) endParent.style.display = 'none';
        }


        if (fulltimeManualDurationCheckbox) {
            fulltimeManualDurationCheckbox.checked = false;
            if (fulltimeManualDurationFields) fulltimeManualDurationFields.style.display = 'none';
        }
        if (parttimeManualDurationCheckbox) {
            parttimeManualDurationCheckbox.checked = false;
            if (parttimeManualDurationFields) parttimeManualDurationFields.style.display = 'none';
        }

        const manualInputs = [
            'reg_studyDuration_manual', 'reg_paymentMonths_manual',
            'reg_parttime_studyDuration_manual', 'reg_parttime_paymentMonths_manual',
            'reg_healthProblem', 'reg_healthAllergy',
            'reg_escortName1', 'reg_escortGender1', 'reg_escortPhone1',
            'reg_escortName2', 'reg_escortGender2', 'reg_escortPhone2',
            'reg_escortName3', 'reg_escortGender3', 'reg_escortPhone3'
        ];

        manualInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = '';
        });

        if (durationDisplay) durationDisplay.textContent = 'មិនទាន់បានជ្រើសរើស';
        if (paymentDurationDisplay) paymentDurationDisplay.textContent = 'មិនទាន់បានជ្រើសរើស';
        if (tuitionFeeDisplay) tuitionFeeDisplay.textContent = '$0.00';
        if (paymentDueDateDisplay) paymentDueDateDisplay.textContent = 'មិនទាន់បានគណនា';
        if (paymentMonthsDisplayInput) paymentMonthsDisplayInput.value = ''; // Updated default for number input

        const tuitionFeeField = document.getElementById('reg_tuitionFee');
        const discountField = document.getElementById('reg_discount');
        const discountPercentField = document.getElementById('reg_discountPercent');
        const initialPaymentField = document.getElementById('reg_initialPayment');
        const nationalityField = document.getElementById('reg_nationality');

        if (tuitionFeeField) tuitionFeeField.value = '0.00';
        if (discountField) discountField.value = '0.00';
        if (discountPercentField) discountPercentField.value = '0';
        if (initialPaymentField) initialPaymentField.value = '0.00';
        if (nationalityField) nationalityField.value = 'ខ្មែរ';



        // សម្អាតកាលបរិច្ឆេទទាំងអស់
        document.querySelectorAll('.date-input, [id*="Date"], [id*="date"]').forEach(input => {
            if (input.id !== 'reg_startDate') {
                input.value = '';
            }
        });

        calculateFees();
        calculatePaymentDates();
        setupDateInputs();
    }

    // ============================================
    // 20. EDITING LOGIC (FETCH DATA)
    // ============================================
    async function checkEditMode() {
        const urlParams = new URLSearchParams(window.location.search);
        const editId = urlParams.get('id');

        if (editId) {
            currentStudentKey = editId;
            try {
                showLoadingOverlay();
                showAlert('កំពុងទាញយកទិន្នន័យសិស្សដើម្បីកែប្រែ...', 'info');

                const studentData = await getStudentById(editId);

                if (studentData) {
                    setEditMode(true);
                    populateFormForEdit(studentData);
                    showAlert('បានទាញយកទិន្នន័យបានជោគជ័យ!', 'success');
                } else {
                    showAlert('មិនឃើញទិន្នន័យសិស្សនេះទេ!', 'danger');
                }
            } catch (error) {
                console.error('Error fetching student data:', error);
                showAlert(`កំហុសក្នុងការទាញយកទិន្នន័យ: ${error.message}`, 'danger');
            } finally {
                hideLoadingOverlay();
            }
        }
    }

    function populateFormForEdit(data) {
        resetForm();

        // Basic Info
        if (document.getElementById('reg_studentKey')) document.getElementById('reg_studentKey').value = currentStudentKey || '';
        if (displayId) displayId.value = data.displayId || '';
        if (document.getElementById('reg_lastName')) document.getElementById('reg_lastName').value = data.lastName || '';
        if (document.getElementById('reg_firstName')) document.getElementById('reg_firstName').value = data.firstName || '';

        if (document.getElementById('reg_gender')) document.getElementById('reg_gender').value = data.gender || '';
        if (document.getElementById('reg_dob')) document.getElementById('reg_dob').value = data.dob || '';
        if (document.getElementById('reg_nationality')) document.getElementById('reg_nationality').value = data.nationality || 'ខ្មែរ';


        // Image
        originalImageUrl = data.imageUrl || '';
        studentImageUrl = originalImageUrl;
        // Preview removed

        // Address
        if (document.getElementById('reg_village')) document.getElementById('reg_village').value = data.village || '';
        if (document.getElementById('reg_commune')) document.getElementById('reg_commune').value = data.commune || '';
        if (document.getElementById('reg_district')) document.getElementById('reg_district').value = data.district || '';
        if (document.getElementById('reg_province')) document.getElementById('reg_province').value = data.province || '';

        // Teacher
        if (document.getElementById('reg_teacherName')) document.getElementById('reg_teacherName').value = data.teacherName || '';
        if (document.getElementById('reg_teacherPhone')) document.getElementById('reg_teacherPhone').value = data.teacherPhone || '';
        if (document.getElementById('reg_classroom')) document.getElementById('reg_classroom').value = data.classroom || '';

        // Living Arrangement
        if (data.livingWith) {
            const livingRadio = document.querySelector(`input[name="reg_livingWith"][value="${data.livingWith}"]`);
            if (livingRadio) livingRadio.checked = true;
        }

        // Health Info
        if (data.healthStatus) {
            const healthRadio = document.querySelector(`input[name="reg_healthStatus"][value="${data.healthStatus}"]`);
            if (healthRadio) healthRadio.checked = true;
        }
        if (document.getElementById('reg_healthProblem')) document.getElementById('reg_healthProblem').value = data.healthProblem || '';
        if (document.getElementById('reg_healthAllergy')) document.getElementById('reg_healthAllergy').value = data.healthAllergy || '';

        // Authorized Escorts
        if (data.authorizedEscorts && Array.isArray(data.authorizedEscorts)) {
            data.authorizedEscorts.forEach((escort, index) => {
                const i = index + 1;
                if (i <= 3) {
                    if (document.getElementById(`reg_escortName${i}`)) document.getElementById(`reg_escortName${i}`).value = escort.name || '';
                    if (document.getElementById(`reg_escortGender${i}`)) document.getElementById(`reg_escortGender${i}`).value = escort.gender || '';
                    if (document.getElementById(`reg_escortPhone${i}`)) document.getElementById(`reg_escortPhone${i}`).value = escort.phone || '';
                }
            });
        }

        // Course Selection / Study Program
        if (data.studyProgram) {
            const programRadio = document.querySelector(`input[name="reg_studyProgram"][value="${data.studyProgram}"]`);
            if (programRadio) {
                programRadio.checked = true;
                handleCourseSelection(); // Update UI
            }
        } else if (data.courseType === 'chinese-fulltime') {
            const programRadio = document.getElementById('program3Lang');
            if (programRadio) {
                programRadio.checked = true;
                handleCourseSelection();
            }
        }

        // isOldStudent
        if (data.isOldStudent) {
            const oldCheck = document.getElementById('reg_isOldStudentCheck');
            if (oldCheck) {
                oldCheck.checked = true;
                handleOldStudentChange.call(oldCheck);
            }
        }



        // Study Time
        if (data.studyTime) {
            if (data.courseType === 'chinese-fulltime') {
                const timeRadio = document.querySelector(`input[name="reg_fulltime_studyTime"][value="${data.studyTime}"]`);
                if (timeRadio) {
                    timeRadio.checked = true;
                    handleStudyTimeSelection(timeRadio, true);
                } else if (data.studyTime.includes('-')) {
                    const customRadio = document.getElementById('fulltime_custom');
                    if (customRadio) {
                        customRadio.checked = true;
                        handleStudyTimeSelection(customRadio, true);
                        const parts = data.studyTime.split('-');
                        if (parts.length === 2) {
                            if (fulltimeCustomStart) fulltimeCustomStart.value = parts[0];
                            if (fulltimeCustomEnd) fulltimeCustomEnd.value = parts[1];
                        }
                    }
                }
            } else {
                const timeRadio = document.querySelector(`input[name="reg_parttime_studyTime"][value="${data.studyTime}"]`);
                if (timeRadio) {
                    timeRadio.checked = true;
                    handleStudyTimeSelection(timeRadio, false);
                }
            }
        }

        // Manual Input / Duration
        if (data.isManualInput) {
            if (enableManualFeeCheckbox) {
                enableManualFeeCheckbox.checked = true;
                if (manualFeeFields) manualFeeFields.style.display = 'block';
                // Trigger any manual fee logic
                enableManualFeeCheckbox.dispatchEvent(new Event('change'));
            }
            if (document.getElementById('reg_tuitionFee_manual')) document.getElementById('reg_tuitionFee_manual').value = data.tuitionFee || 0;
            if (document.getElementById('reg_discount_manual')) document.getElementById('reg_discount_manual').value = data.discount || 0;
            if (document.getElementById('reg_discountPercent_manual')) document.getElementById('reg_discountPercent_manual').value = data.discountPercent || 0;
            if (document.getElementById('reg_initialPayment_manual')) document.getElementById('reg_initialPayment_manual').value = data.initialPayment || 0;
            if (document.getElementById('reg_materialFee_manual')) document.getElementById('reg_materialFee_manual').value = data.materialFee || 0;
            if (document.getElementById('reg_adminFee_manual')) document.getElementById('reg_adminFee_manual').value = data.adminFee || 0;
            if (document.getElementById('reg_studyDuration_manual')) {
                document.getElementById('reg_studyDuration_manual').value = data.studyDuration || 0;
                document.getElementById('reg_studyDuration_manual').dispatchEvent(new Event('input'));
            }
            if (document.getElementById('reg_paymentMonths_manual')) document.getElementById('reg_paymentMonths_manual').value = data.paymentMonths || 0;
        } else {
            // Handle regular duration
            if (data.courseType === 'chinese-fulltime') {
                if (data.isManualDuration) {
                    if (fulltimeManualDurationCheckbox) {
                        fulltimeManualDurationCheckbox.checked = true;
                        if (fulltimeManualDurationFields) fulltimeManualDurationFields.style.display = 'block';
                    }
                    if (document.getElementById('reg_studyDuration_manual')) document.getElementById('reg_studyDuration_manual').value = data.studyDuration || 0;
                    if (document.getElementById('reg_paymentMonths_manual')) document.getElementById('reg_paymentMonths_manual').value = data.paymentMonths || 0;
                } else {

                }
            } else if (data.courseType === 'chinese-parttime') {
                if (data.isManualDuration) {
                    if (parttimeManualDurationCheckbox) {
                        parttimeManualDurationCheckbox.checked = true;
                        if (parttimeManualDurationFields) parttimeManualDurationFields.style.display = 'block';
                    }
                    if (document.getElementById('reg_parttime_studyDuration_manual')) document.getElementById('reg_parttime_studyDuration_manual').value = data.studyDuration || 0;
                    if (document.getElementById('reg_parttime_paymentMonths_manual')) document.getElementById('reg_parttime_paymentMonths_manual').value = data.paymentMonths || 0;
                } else {
                    // Fix: find the parent with data-duration and then get the checkbox inside
                    const durationOption = document.querySelector(`.study-duration-option[data-duration="${data.studyDuration}"]`);
                    if (durationOption) {
                        const durationRadio = durationOption.querySelector('.duration-checkbox');
                        if (durationRadio) {
                            durationRadio.checked = true;
                            handleParttimeDurationSelection.call(durationRadio);
                        }
                    }
                }
            }
        }

        // Financials (Main Fields)
        if (document.getElementById('reg_tuitionFee')) document.getElementById('reg_tuitionFee').value = data.tuitionFee || 0;
        if (document.getElementById('reg_discount')) document.getElementById('reg_discount').value = data.discount || 0;
        if (document.getElementById('reg_discountPercent')) document.getElementById('reg_discountPercent').value = data.discountPercent || 0;
        if (document.getElementById('reg_initialPayment')) document.getElementById('reg_initialPayment').value = data.initialPayment || 0;

        // Admin Materials & Fees
        if (document.getElementById('reg_totalAdminFees')) document.getElementById('reg_totalAdminFees').value = data.totalAdminFees || 0;
        if (document.getElementById('reg_adminFee')) document.getElementById('reg_adminFee').value = data.adminFee || 0;
        if (document.getElementById('reg_adminServicesFee')) document.getElementById('reg_adminServicesFee').value = data.adminServicesFee || 0;



        // Dates
        if (document.getElementById('reg_startDate')) document.getElementById('reg_startDate').value = data.startDate || '';
        if (document.getElementById('reg_paymentDueDate')) document.getElementById('reg_paymentDueDate').value = data.paymentDueDate || '';

        // Guardian
        if (document.getElementById('reg_guardianName')) document.getElementById('reg_guardianName').value = data.guardianName || '';
        if (document.getElementById('reg_guardianRelation')) document.getElementById('reg_guardianRelation').value = data.guardianRelation || '';
        if (document.getElementById('reg_guardianPhone')) document.getElementById('reg_guardianPhone').value = data.guardianPhone || '';
        if (document.getElementById('reg_guardianAddress')) document.getElementById('reg_guardianAddress').value = data.guardianAddress || '';

        // Father
        if (document.getElementById('reg_fatherName')) document.getElementById('reg_fatherName').value = data.fatherName || '';
        if (document.getElementById('reg_fatherAge')) document.getElementById('reg_fatherAge').value = data.fatherAge || 0;
        if (document.getElementById('reg_fatherJob')) document.getElementById('reg_fatherJob').value = data.fatherJob || '';
        if (document.getElementById('reg_fatherPhone')) document.getElementById('reg_fatherPhone').value = data.fatherPhone || '';
        if (document.getElementById('reg_fatherAddress')) document.getElementById('reg_fatherAddress').value = data.fatherAddress || '';

        // Mother
        if (document.getElementById('reg_motherName')) document.getElementById('reg_motherName').value = data.motherName || '';
        if (document.getElementById('reg_motherAge')) document.getElementById('reg_motherAge').value = data.motherAge || 0;
        if (document.getElementById('reg_motherJob')) document.getElementById('reg_motherJob').value = data.motherJob || '';
        if (document.getElementById('reg_motherPhone')) document.getElementById('reg_motherPhone').value = data.motherPhone || '';
        if (document.getElementById('reg_motherAddress')) document.getElementById('reg_motherAddress').value = data.motherAddress || '';

        // Other fields


        // Installments


        // Recalculate everything to ensure UI state is consistent
        calculateFees();
        updateStudyDurationDisplay();
    }

    // ============================================
    // 17. EVENT LISTENERS SETUP
    // ============================================
    function setupEventListeners() {
        if (studentForm) {
            studentForm.addEventListener('submit', async function (e) {
                e.preventDefault();
                if (!validateForm()) return;
                if (isEditMode) await updateStudent();
                else await saveNewStudent();
            });
        }

        if (updateBtn) {
            updateBtn.addEventListener('click', function () {
                if (validateForm()) updateStudent();
            });
        }

        if (cancelEditBtn) {
            cancelEditBtn.addEventListener('click', function () {
                if (confirm('តើអ្នកពិតជាចង់ដូច្នេះមែន? ការផ្លាស់ប្តូរដែលមិនបានរក្សាទុកនឹងបាត់បង់។')) {
                    setEditMode(false);
                    resetForm();
                }
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                if (isEditMode) {
                    if (confirm('តើអ្នកពិតជាចង់លុបការកែសម្រួល និងត្រឡប់ទៅទម្រង់ថ្មី? ការផ្លាស់ប្តូរដែលមិនបានរក្សាទុកនឹងបាត់បង់។')) {
                        setEditMode(false);
                        resetForm();
                    }
                } else {
                    if (confirm('តើអ្នកពិតជាចង់សម្អាតទម្រង់ទាំងស្រុង? ទិន្នន័យទាំងអស់នឹងត្រូវលុប។')) {
                        resetForm();
                    }
                }
            });
        }

        // Auto-calculate events
        const feeInputs = ['reg_tuitionFee', 'reg_discount', 'reg_discountPercent', 'reg_initialPayment', 'reg_materialFee', 'reg_adminFee'];
        feeInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', calculateFees);
            }
        });



        // Auto-format phone numbers
        document.querySelectorAll('[id*="Phone"]').forEach(input => {
            input.addEventListener('input', function (e) {
                let value = e.target.value.replace(/\D/g, '');
                if (value.length > 0) {
                    if (value.length <= 3) value = value;
                    else if (value.length <= 6) value = value.slice(0, 3) + ' ' + value.slice(3);
                    else if (value.length <= 9) value = value.slice(0, 3) + ' ' + value.slice(3, 6) + ' ' + value.slice(6);
                    else value = value.slice(0, 3) + ' ' + value.slice(3, 6) + ' ' + value.slice(6, 9) + ' ' + value.slice(9, 11);
                }
                e.target.value = value;
            });
        });

        // Real-time form validation
        document.querySelectorAll('#studentRegistrationForm input, #studentRegistrationForm select').forEach(input => {
            input.addEventListener('blur', function () {
                validateField(this);
            });
        });
    }

    // ============================================
    // 18. FIELD VALIDATION
    // ============================================
    function validateField(field) {
        const value = field.value.trim();
        const fieldId = field.id;

        if (field.hasAttribute('required') && !value) {
            field.classList.add('is-invalid');
            showFieldError(field, 'អ្នកត្រូវតែបំពេញព័ត៌មាននេះ');
            return false;
        }

        field.classList.remove('is-invalid');

        if (fieldId.includes('Phone') && value) {
            if (!isValidCambodianPhone(value)) {
                field.classList.add('is-invalid');
                showFieldError(field, 'លេខទូរស័ព្ទមិនត្រឹមត្រូវ');
                return false;
            }
        }

        // Validate date fields
        if ((fieldId.includes('date') || fieldId.includes('Date')) && value) {
            validateAndFormatDate(field);
        }

        // ពិនិត្យរយៈពេលសិក្សាសម្រាប់ពេញម៉ោងបញ្ចូលដោយខ្លួនឯង
        if (fieldId === 'reg_studyDuration_manual' && fulltimeManualDurationCheckbox && fulltimeManualDurationCheckbox.checked) {
            const studyMonths = parseInt(value);
            if (!studyMonths || studyMonths <= 0 || studyMonths > 120) { // 10 ឆ្នាំ = 120 ខែ
                field.classList.add('is-invalid');
                showFieldError(field, 'រយៈពេលសិក្សាត្រូវតែចន្លោះ 1-120 ខែ (10 ឆ្នាំ)');
                return false;
            }
        }

        // ពិនិត្យរយៈពេលបង់សម្រាប់ពេញម៉ោងបញ្ចូលដោយខ្លួនឯង
        if (fieldId === 'reg_paymentMonths_manual' && fulltimeManualDurationCheckbox && fulltimeManualDurationCheckbox.checked) {
            const paymentMonths = parseInt(value);
            if (!paymentMonths || paymentMonths <= 0 || paymentMonths > 120) {
                field.classList.add('is-invalid');
                showFieldError(field, 'រយៈពេលបង់ត្រូវតែចន្លោះ 1-120 ខែ (10 ឆ្នាំ)');
                return false;
            }
        }

        // ពិនិត្យរយៈពេលសិក្សាសម្រាប់ក្រៅម៉ោងបញ្ចូលដោយខ្លួនឯង
        if (fieldId === 'reg_parttime_studyDuration_manual' && parttimeManualDurationCheckbox && parttimeManualDurationCheckbox.checked) {
            const studyMonths = parseInt(value);
            if (!studyMonths || studyMonths <= 0 || studyMonths > 120) {
                field.classList.add('is-invalid');
                showFieldError(field, 'រយៈពេលសិក្សាត្រូវតែចន្លោះ 1-120 ខែ (10 ឆ្នាំ)');
                return false;
            }
        }

        // ពិនិត្យរយៈពេលបង់សម្រាប់ក្រៅម៉ោងបញ្ចូលដោយខ្លួនឯង
        if (fieldId === 'reg_parttime_paymentMonths_manual' && parttimeManualDurationCheckbox && parttimeManualDurationCheckbox.checked) {
            const paymentMonths = parseInt(value);
            if (!paymentMonths || paymentMonths <= 0 || paymentMonths > 120) {
                field.classList.add('is-invalid');
                showFieldError(field, 'រយៈពេលបង់ត្រូវតែចន្លោះ 1-120 ខែ (10 ឆ្នាំ)');
                return false;
            }
        }

        if (fieldId === 'reg_paymentMonths_manual' && enableManualFeeCheckbox && enableManualFeeCheckbox.checked) {
            const paymentMonths = parseInt(value);
            if (!paymentMonths || paymentMonths <= 0 || paymentMonths > 120) {
                field.classList.add('is-invalid');
                showFieldError(field, 'ចំនួនខែត្រូវបង់ត្រូវតែចន្លោះ 1-120 ខែ');
                return false;
            }
        }

        if ((fieldId === 'fulltime_custom_start' || fieldId === 'fulltime_custom_end') && value) {
            if (!/^\d{1,2}:\d{2}$/.test(value)) {
                field.classList.add('is-invalid');
                showFieldError(field, 'ទម្រង់ម៉ោងមិនត្រឹមត្រូវ (ត្រូវតែជា HH:MM)');
                return false;
            }
        }

        return true;
    }

    function showFieldError(field, message) {
        const existingError = field.parentNode.querySelector('.invalid-feedback');
        if (existingError) existingError.remove();

        const errorDiv = document.createElement('div');
        errorDiv.className = 'invalid-feedback';
        errorDiv.textContent = message;
        field.parentNode.appendChild(errorDiv);
    }

    function isValidCambodianPhone(phone) {
        const cleanedPhone = phone.replace(/[\s\-+]/g, '');
        const khmerPhonePattern = /^(\+?855|0)?(1[0-9]|6[0-9]|7[0-9]|8[0-9]|9[0-9])[0-9]{6,7}$/;
        const chinaPhonePattern = /^(\+?86)?1[3-9][0-9]{9}$/;
        return khmerPhonePattern.test(cleanedPhone) || chinaPhonePattern.test(cleanedPhone);
    }

    // ============================================
    // 19. FINAL INITIALIZATION
    // ============================================
    setupInstallmentSystem();
    initializeCourseSelection();
    setupDateInputs();
    calculateFees();

    // Add event listener for payment months display field
    if (paymentMonthsDisplayInput) {
        paymentMonthsDisplayInput.addEventListener('input', function () {
            calculatePaymentDates();
        });
    }

    const today = new Date();
    const startDateField = document.getElementById('reg_startDate');
    if (startDateField) {
        startDateField.value = formatDateDDMMYYYY(today);
    }
    updateStudyDurationDisplay();
    calculatePaymentDates();

    if (imagePreview) {
        imagePreview.innerHTML = `
            <div class="d-flex flex-column align-items-center justify-content-center h-100">
                <i class="fas fa-camera fa-3x text-secondary"></i>
                <small class="mt-2 text-muted">រូបភាពសិស្ស</small>
            </div>
        `;
    }

    const nationalityField = document.getElementById('reg_nationality');
    if (nationalityField) {
        nationalityField.value = 'ខ្មែរ';
    }

    // Check for edit mode from URL
    checkEditMode();

    setTimeout(() => {
        if (!isEditMode) {
            showAlert('សូមស្វាគមន៍មកកាន់ប្រព័ន្ធគ្រប់គ្រងសាលា សូមចុះឈ្មោះសិស្សថ្មី។', 'info');
        }
    }, 1000);
    // ============================================
    // 25. ADDRESS COPY FUNCTIONALITY
    // ============================================
    const setupAddressCopy = () => {
        const getStudentAddress = () => {
            const village = document.getElementById('reg_village')?.value.trim();
            const commune = document.getElementById('reg_commune')?.value.trim();
            const district = document.getElementById('reg_district')?.value.trim();
            const province = document.getElementById('reg_province')?.value.trim();

            let parts = [];
            if (village) parts.push(`ភូមិ ${village}`);
            if (commune) parts.push(`ឃុំ/សង្កាត់ ${commune}`);
            if (district) parts.push(`ក្រុង/ស្រុក ${district}`);
            if (province) parts.push(`ខេត្ត/ក្រុង ${province}`);

            return parts.join(', ');
        };

        const setupCheckbox = (checkboxId, targetAreaId) => {
            const checkbox = document.getElementById(checkboxId);
            const target = document.getElementById(targetAreaId);

            if (!checkbox || !target) return;

            checkbox.addEventListener('change', function () {
                if (this.checked) {
                    const address = getStudentAddress();
                    if (address) {
                        target.value = address;
                        target.classList.add('bg-light'); // Visual cue
                    } else {
                        showAlert('សូមបំពេញអាសយដ្ឋានសិស្សជាមុនសិន!', 'warning');
                        this.checked = false;
                    }
                } else {
                    target.value = ''; // Optional: clear or leave it
                    target.classList.remove('bg-light');
                }
            });
        };

        setupCheckbox('reg_guardianSameAddress', 'reg_guardianAddress');
        setupCheckbox('reg_fatherSameAddress', 'reg_fatherAddress');
        setupCheckbox('reg_motherSameAddress', 'reg_motherAddress');
    };

    // Initialize Address Copy
    setupAddressCopy();

});