/**
 * auth-check.js
 * Protects pages from unauthorized access.
 */
document.addEventListener("DOMContentLoaded", () => {
    // Determine if we are on the login page
    const isLoginPage = window.location.pathname.endsWith("login.html") || window.location.pathname.endsWith("login");

    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            console.log("Authenticated as: " + user.email);
            if (isLoginPage) window.location.href = "index.html";

            // UI Elements
            const emailEl = document.getElementById('user-display-email');
            const roleEl = document.getElementById('user-role-badge');

            // Set User Info
            if (emailEl) {
                const displayEmail = user.email.length > 20 ? user.email.substring(0, 18) + '...' : user.email;
                emailEl.textContent = displayEmail;
                emailEl.title = user.email;
            }

            const isSuperAdmin = user.email === 'admin@school.com';

            // Function to apply permissions
            const applyPermissions = (perms) => {
                // Default Permissions (if null)
                const p = perms || { dashboard: false, registration: true, data: true, inventory: false, incomeExpense: false };

                // 1. Hide/Show Sidebar Links
                const links = {
                    'index.html': p.dashboard,
                    'registration.html': p.registration,
                    'data-tracking.html': p.data,
                    'inventory.html': p.inventory,
                    'income-expense.html': p.incomeExpense,
                    'user-management.html': false // Always false for non-super-admin
                };

                // Apply visibility
                for (const [page, allowed] of Object.entries(links)) {
                    // Use querySelectorAll to handle multiple links (sidebar, logo, back buttons)
                    const pageLinks = document.querySelectorAll(`a[href="${page}"]`);
                    pageLinks.forEach(link => {
                        link.style.display = allowed ? '' : 'none';
                    });
                }

                // 2. Check Current Page Access
                const path = window.location.pathname;
                const currentPage = path.split('/').pop() || 'index.html';

                // Map pages to permission keys
                const pagePermissionMap = {
                    'index.html': 'dashboard',
                    'registration.html': 'registration',
                    'data-tracking.html': 'data',
                    'inventory.html': 'inventory',
                    'income-expense.html': 'incomeExpense',
                    'user-management.html': 'admin_only'
                };

                const requiredPerm = pagePermissionMap[currentPage];

                // Allow if permission is true, OR if it's not in the map (public?), OR if super admin
                if (requiredPerm && requiredPerm !== 'admin_only' && !p[requiredPerm]) {
                    console.warn(`Access denied to ${currentPage}. Redirecting...`);
                    // Find a safe page to redirect to
                    if (p.registration) window.location.href = "registration.html";
                    else if (p.data) window.location.href = "data-tracking.html";
                    else if (p.incomeExpense) window.location.href = "income-expense.html";
                    else alert("គណនីរបស់អ្នកមិនមានសិទ្ធិប្រើប្រាស់ណាមួយទេ។ សូមទាក់ទង Admin។");
                } else if (requiredPerm === 'admin_only') {
                    console.warn(`Access denied (Admin Only). Redirecting...`);
                    window.location.href = "index.html"; // Will re-check and redirect based on perms
                }
            };

            // Logic Flow
            if (isSuperAdmin) {
                if (roleEl) {
                    roleEl.textContent = 'Admin (អ្នកគ្រប់គ្រង)';
                    roleEl.className = 'badge bg-warning text-dark mt-1 fw-normal';
                }
                // Admin sees everything
                const allLinks = document.querySelectorAll('.sidebar .nav-link');
                allLinks.forEach(l => l.style.display = 'block');
            } else {
                if (roleEl) {
                    roleEl.textContent = 'Staff (បុគ្គលិក)';
                    roleEl.className = 'badge bg-info mt-1 fw-normal';
                }

                // Fetch permissions from DB
                firebase.database().ref('users/' + user.uid).once('value').then(snapshot => {
                    const userData = snapshot.val();
                    const perms = userData ? userData.permissions : null;
                    applyPermissions(perms);
                }).catch(err => {
                    console.error("Error fetching permissions:", err);
                    // Fallback: Registration only
                    applyPermissions({ dashboard: false, registration: true, data: false, inventory: false, incomeExpense: false });
                });
            }

        } else {
            console.warn("User not authenticated.");
            if (!isLoginPage) window.location.href = "login.html";
        }
    });
});

/**
 * Handle Logout
 * Signs out the updated user and redirects to login page.
 */
function handleLogout(event) {
    if (event) event.preventDefault();

    if (confirm("តើអ្នកពិតជាចង់ចាកចេញមែនទេ?")) {
        firebase.auth().signOut().then(() => {
            console.log("User signed out.");
            window.location.href = "login.html";
        }).catch((error) => {
            console.error("Logout Error:", error);
            alert("មានបញ្ហាក្នុងការចាកចេញ។");
        });
    }
}
