/**
 * user-management.js
 * Handles user creation, listing, and permission management.
 */

const usersRef = firebase.database().ref('users');
let editModalInstance = null;
let addUserModalInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    loadUsers();

    // Initialize Modals
    if (typeof bootstrap !== 'undefined') {
        const editEl = document.getElementById('editUserModal');
        if (editEl) editModalInstance = new bootstrap.Modal(editEl);

        const addEl = document.getElementById('addUserModal');
        if (addEl) addUserModalInstance = new bootstrap.Modal(addEl);
    }

    firebase.auth().onAuthStateChanged(user => {
        if (!user || user.email !== 'admin@school.com') {
            // Handled by auth-check.js
        }
    });

    // Handle Create User Form
    const createUserForm = document.getElementById('createUserForm');
    if (createUserForm) {
        createUserForm.addEventListener('submit', handleCreateUser);
    }

    // Handle Edit User Form
    const editUserForm = document.getElementById('editUserForm');
    if (editUserForm) {
        editUserForm.addEventListener('submit', handleUpdateUser);
    }
});

/**
 * Loads and displays users from Firebase Realtime Database
 */
function loadUsers() {
    usersRef.on('value', snapshot => {
        const users = snapshot.val();
        const tbody = document.getElementById('usersTableBody');
        const countBadge = document.getElementById('userCountBadge');
        tbody.innerHTML = '';

        if (!users) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4">មិនទាន់មានអ្នកប្រើប្រាស់នៅឡើយ</td></tr>';
            if (countBadge) countBadge.textContent = '0 Users';
            return;
        }

        const uniqueRoles = new Set(['admin', 'staff']); // Default roles
        let totalUsers = 0;

        Object.keys(users).forEach(key => {
            totalUsers++;
            const user = users[key];
            if (user.role) {
                uniqueRoles.add(user.role.toLowerCase());
            }

            const isTargetAdmin = user.email === 'admin@school.com';
            const userRole = user.role || (isTargetAdmin ? 'admin' : 'staff');

            // Encode permissions to pass to function safely (escape quotes)
            const permsJson = JSON.stringify(user.permissions || {}).replace(/"/g, '&quot;');

            const permissionsBadges = getPermissionBadges(user.permissions);

            // Role Badge Logics
            let roleBadgeClass = 'bg-info';
            if (userRole === 'admin') roleBadgeClass = 'bg-warning text-dark';
            else if (userRole === 'staff') roleBadgeClass = 'bg-primary';
            else roleBadgeClass = 'bg-secondary'; // Custom roles

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="ps-4 fw-bold text-dark">${user.name || '-'}</td>
                <td class="text-primary">${user.email}</td>
                <td><span class="badge ${roleBadgeClass} text-uppercase shadow-sm">${userRole}</span></td>
                <td>${permissionsBadges}</td>
                <td class="text-end pe-4">
                    <button class="btn btn-sm btn-outline-warning me-2 shadow-sm" onclick='openEditModal("${key}", "${user.name || ""}", "${user.email}", ${permsJson}, "${userRole}")'>
                        <i class="fi fi-rr-edit"></i> កែប្រែ
                    </button>
                    ${!isTargetAdmin ? `
                    <button class="btn btn-sm btn-outline-danger shadow-sm" onclick="deleteUser('${key}', '${user.email}')">
                        <i class="fi fi-rr-trash"></i> លុប
                    </button>
                    ` : '<span class="badge bg-secondary ms-1">System Protected</span>'}
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (countBadge) countBadge.textContent = `${totalUsers} Users`;

        // Update Dropdowns with collected roles
        updateRoleDropdowns(Array.from(uniqueRoles));

        // Re-apply filter if search input has value
        filterUsers();
    });
}

/**
 * Filter users based on search input
 */
function filterUsers() {
    const input = document.getElementById('searchInput');
    const filter = input.value.toLowerCase();
    const table = document.getElementById('usersTable');
    const tr = table.getElementsByTagName('tr');

    for (let i = 1; i < tr.length; i++) { // Start at 1 to skip header
        const tdName = tr[i].getElementsByTagName('td')[0];
        const tdEmail = tr[i].getElementsByTagName('td')[1];
        if (tdName || tdEmail) {
            const txtName = tdName.textContent || tdName.innerText;
            const txtEmail = tdEmail.textContent || tdEmail.innerText;
            if (txtName.toLowerCase().indexOf(filter) > -1 || txtEmail.toLowerCase().indexOf(filter) > -1) {
                tr[i].style.display = "";
            } else {
                tr[i].style.display = "none";
            }
        }
    }
}

function updateRoleDropdowns(roles) {
    const selects = ['newUserRole', 'editUserRole'];
    selects.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;

        const currentVal = select.value;
        // Keep "admin" and "staff" at top, then sort others
        const sortedRoles = roles.sort((a, b) => {
            if (a === 'admin') return -1;
            if (b === 'admin') return 1;
            if (a === 'staff') return -1;
            if (b === 'staff') return 1;
            return a.localeCompare(b);
        });

        select.innerHTML = sortedRoles.map(r =>
            `<option value="${r}" ${r === 'staff' ? 'selected' : ''}>${r.charAt(0).toUpperCase() + r.slice(1)}</option>`
        ).join('');

        // Restore previous selection if still exists, otherwise default
        if (roles.includes(currentVal)) {
            select.value = currentVal;
        }
    });
}

function promptNewRole(selectId) {
    const roleName = prompt("សូមបញ្ចូលឈ្មោះតួនាទីថ្មី (Enter new Role name):");
    if (roleName && roleName.trim() !== "") {
        const cleanRole = roleName.trim().toLowerCase();
        const select = document.getElementById(selectId);

        // Check if exists
        let exists = false;
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value === cleanRole) {
                exists = true;
                select.options[i].selected = true;
                break;
            }
        }

        if (!exists) {
            const option = document.createElement("option");
            option.value = cleanRole;
            option.text = cleanRole.charAt(0).toUpperCase() + cleanRole.slice(1) + " (New)";
            option.selected = true;
            select.add(option);
        }
    }
}

function getPermissionBadges(perms) {
    if (!perms) return '<span class="text-muted small">No Access</span>';

    const map = {
        'dashboard': { label: 'Dashboard', color: 'bg-primary' },
        'registration': { label: 'Registration', color: 'bg-success' },
        'data': { label: 'Data', color: 'bg-info text-dark' },
        'inventory': { label: 'Inventory', color: 'bg-warning text-dark' },
        'incomeExpense': { label: 'Income/Exp', color: 'bg-danger' }
    };

    return Object.keys(perms).filter(k => perms[k]).map(k => {
        const conf = map[k];
        return conf ? `<span class="badge ${conf.color} me-1 mb-1 shadow-sm">${conf.label}</span>` : '';
    }).join('');
}

/**
 * Opens the Edit Modal and populates data
 */
function openEditModal(uid, name, email, perms, role) {
    document.getElementById('editUserUid').value = uid;
    document.getElementById('editUserName').value = name;
    document.getElementById('editUserEmail').value = email;
    document.getElementById('editUserRole').value = role || 'staff';
    document.getElementById('editUserPassword').value = ''; // Reset password field

    // Set checkboxes
    const p = typeof perms === 'string' ? JSON.parse(perms) : perms;
    const setCheck = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.checked = !!val;
    };

    setCheck('editPermDashboard', p.dashboard);
    setCheck('editPermRegistration', p.registration);
    setCheck('editPermData', p.data);
    setCheck('editPermInventory', p.inventory);
    setCheck('editPermIncomeExpense', p.incomeExpense);

    if (editModalInstance) editModalInstance.show();
}

/**
 * Update User Permissions
 */
function handleUpdateUser(e) {
    e.preventDefault();

    const uid = document.getElementById('editUserUid').value;
    const name = document.getElementById('editUserName').value.trim();
    const role = document.getElementById('editUserRole').value;
    const newPassword = document.getElementById('editUserPassword').value;

    const permissions = {
        dashboard: document.getElementById('editPermDashboard').checked,
        registration: document.getElementById('editPermRegistration').checked,
        data: document.getElementById('editPermData').checked,
        inventory: document.getElementById('editPermInventory').checked,
        incomeExpense: document.getElementById('editPermIncomeExpense').checked
    };

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fi fi-rr-refresh fa-spin"></i> កំពុងរក្សាទុក...';
    btn.disabled = true;

    // Base update data
    const updateData = {
        name: name,
        role: role,
        permissions: permissions
    };

    usersRef.child(uid).update(updateData)
        .then(() => {
            alert("✅ ទិន្នន័យត្រូវបានកែប្រែជោគជ័យ!");
            if (editModalInstance) editModalInstance.hide();
        })
        .catch((error) => {
            alert("❌ បរាជ័យ: " + error.message);
        })
        .finally(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
}

/**
 * Creates a new user using a secondary Firebase App instance.
 */
function handleCreateUser(e) {
    e.preventDefault();

    const name = document.getElementById('newUserName').value.trim();
    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;

    const role = document.getElementById('newUserRole').value; // Get role

    const permissions = {
        dashboard: document.getElementById('permDashboard').checked,
        registration: document.getElementById('permRegistration').checked,
        data: document.getElementById('permData').checked,
        inventory: document.getElementById('permInventory').checked,
        incomeExpense: document.getElementById('permIncomeExpense').checked
    };

    if (!name || !email || !password) return alert("សូមបញ្ចូលឈ្មោះ អ៊ីមែល និងពាក្យសម្ងាត់!");

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fi fi-rr-refresh fa-spin"></i> កំពុងបង្កើត...';
    btn.disabled = true;

    // Use a secondary app to create user
    const secondaryApp = firebase.initializeApp(firebaseConfig, "SecondaryApp");

    secondaryApp.auth().createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // User created in Auth. Now save profile to Database.
            const uid = userCredential.user.uid;

            // Save to 'users' node
            return usersRef.child(uid).set({
                name: name,
                email: email,
                role: role, // Use selected role
                permissions: permissions,
                createdAt: new Date().toISOString()
            });
        })
        .then(() => {
            alert("✅ បង្កើតអ្នកប្រើប្រាស់ជោគជ័យ!");
            document.getElementById('createUserForm').reset();
            // Reset checkboxes
            document.getElementById('permDashboard').checked = false;
            document.getElementById('permInventory').checked = false;
            document.getElementById('permIncomeExpense').checked = false;
            document.getElementById('permRegistration').checked = true;
            document.getElementById('permData').checked = true;

            if (addUserModalInstance) addUserModalInstance.hide();
            secondaryApp.delete();
        })
        .catch((error) => {
            console.error(error);
            alert("❌ បរាជ័យ: " + error.message);
            secondaryApp.delete();
        })
        .finally(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
}

function deleteUser(uid, email) {
    if (confirm(`តើអ្នកពិតជាចង់លុបអ្នកប្រើប្រាស់ ${email} ពីប្រព័ន្ធមែនទេ? \n(ចំណាំ៖ វានឹងលុបតែទិន្នន័យពី Database ហើយគណនីនេះនឹងមិនអាចចូលប្រើប្រាស់បានទៀតទេ)`)) {
        usersRef.child(uid).remove()
            .then(() => alert("✅ បានលុបនិងបិទគណនីជោគជ័យ។"))
            .catch(err => alert("កំហុស៖ " + err.message));
    }
}

// Helper to toggle password outside DOMContentLoaded to be global
function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    if (input.type === "password") {
        input.type = "text";
        icon.className = "fi fi-rr-eye-crossed";
    } else {
        input.type = "password";
        icon.className = "fi fi-rr-eye";
    }
}

