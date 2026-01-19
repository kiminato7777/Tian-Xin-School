/**
 * offline-manager.js
 * Handles internet connection state and displays offline notifications.
 * Automatically injects necessary CSS and HTML elements.
 */

(function () {
    // 1. Inject CSS Styles for Offline Banner
    const style = document.createElement('style');
    style.innerHTML = `
        /* Offline Banner Styles */
        #offline-status-banner {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            background: linear-gradient(45deg, #dc3545, #c82333);
            color: white;
            text-align: center;
            padding: 12px;
            font-family: 'Khmer OS Battambang', sans-serif;
            font-size: 1rem;
            font-weight: bold;
            z-index: 100000;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
            transform: translateY(-100%);
            transition: transform 0.3s ease-in-out;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }

        #offline-status-banner.visible {
            transform: translateY(0);
        }

        #offline-status-banner i {
            font-size: 1.2rem;
            animation: pulse-icon 1.5s infinite;
        }

        @keyframes pulse-icon {
            0% { opacity: 0.7; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.2); }
            100% { opacity: 0.7; transform: scale(1); }
        }

        /* Overlay to dim the app when offline (Optional, can be removed if too intrusive) */
        /*
        #offline-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(255, 255, 255, 0.5);
            z-index: 99999;
            backdrop-filter: blur(2px);
            display: none;
            pointer-events: none; /* Let users scroll but visualize disconnection */
        }
        #offline-overlay.visible {
            display: block;
        }
        */
        
        /* Disable specific buttons when offline */
        body.is-offline button[type="submit"],
        body.is-offline .btn-primary,
        body.is-offline .btn-success {
            opacity: 0.6;
            cursor: not-allowed;
            pointer-events: none;
            filter: grayscale(100%);
        }
    `;
    document.head.appendChild(style);

    // 2. Create Banner Element
    const banner = document.createElement('div');
    banner.id = 'offline-status-banner';
    banner.innerHTML = `
        <i class="fi fi-rr-wifi-slash"></i>
        <span>គ្មានការតភ្ជាប់អ៊ីនធឺណិត! សូមពិនិត្យមើលការតភ្ជាប់របស់អ្នក។ (No Internet Connection)</span>
    `;
    document.body.prepend(banner);

    // 6. Create Popup Modal Element
    const popup = document.createElement('div');
    popup.id = 'offline-popup-modal';
    popup.innerHTML = `
        <div class="offline-popup-content">
            <div class="offline-popup-icon">
                <i class="fi fi-rr-wifi-slash"></i>
            </div>
            <h3>គ្មានការតភ្ជាប់អ៊ីនធឺណិត!</h3>
            <p>សូមពិនិត្យមើលការតភ្ជាប់របស់អ្នក។ ប្រព័ន្ធនឹងបិទមុខងារមួយចំនួនជាបណ្តោះអាសន្ន។</p>
            <button id="offline-popup-close-btn">យល់ព្រម (OK)</button>
        </div>
    `;
    document.body.appendChild(popup);

    // 7. Add Styles for Popup Modal
    const popupStyle = document.createElement('style');
    popupStyle.innerHTML = `
        #offline-popup-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(5px);
            z-index: 100001; /* Higher than banner */
            display: none;
            justify-content: center;
            align-items: center;
            font-family: 'Khmer OS Battambang', sans-serif;
        }

        #offline-popup-modal.visible {
            display: flex;
            animation: fadeIn 0.3s ease-out;
        }

        .offline-popup-content {
            background: white;
            padding: 30px;
            border-radius: 20px;
            text-align: center;
            max-width: 90%;
            width: 400px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            animation: slideUp 0.3s ease-out;
            position: relative;
        }

        .offline-popup-icon {
            width: 80px;
            height: 80px;
            background: #ffecec;
            color: #dc3545;
            border-radius: 50%;
            display: flex;
            justify-content: center;
            align-items: center;
            font-size: 40px;
            margin: 0 auto 20px auto;
        }

        .offline-popup-content h3 {
            color: #dc3545;
            margin-bottom: 10px;
            font-family: 'Khmer OS Muol Light', serif;
        }

        .offline-popup-content p {
            color: #666;
            margin-bottom: 25px;
            line-height: 1.6;
        }

        #offline-popup-close-btn {
            background: #dc3545;
            color: white;
            border: none;
            padding: 10px 30px;
            border-radius: 50px;
            font-size: 16px;
            cursor: pointer;
            transition: background 0.2s;
            font-weight: bold;
        }

        #offline-popup-close-btn:hover {
            background: #c82333;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
    `;
    document.head.appendChild(popupStyle);

    // 8. Event Listener for Close Button
    document.getElementById('offline-popup-close-btn').addEventListener('click', function () {
        popup.classList.remove('visible');
    });

    // 3. State Management Functions (Updated)
    function showOffline() {
        banner.classList.add('visible');
        document.body.classList.add('is-offline');

        // Show Popup Modal
        if (!document.body.classList.contains('offline-popup-shown')) {
            popup.classList.add('visible');
            document.body.classList.add('offline-popup-shown');
        }

        console.warn('Network status: OFFLINE');

        // Show a toast or alert if Swal is available
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'warning',
                title: 'គ្មានការតភ្ជាប់អ៊ីនធឺណិត',
                text: 'សូមពិនិត្យមើលការតភ្ជាប់របស់អ្នក។ ប្រព័ន្ធនឹងបិទមុខងារមួយចំនួនជាបណ្តោះអាសន្ន។',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 5000,
                timerProgressBar: true
            });
        }
    }

    function showOnline() {
        banner.classList.remove('visible');
        popup.classList.remove('visible'); // Also hide popup if it's open
        document.body.classList.remove('is-offline');
        document.body.classList.remove('offline-popup-shown'); // Reset popup shown state so it can show again next time
        console.log('Network status: ONLINE');

        // Optional: Show "Back Online" temporary message
        if (typeof Swal !== 'undefined' && document.body.classList.contains('was-offline')) {
            Swal.fire({
                icon: 'success',
                title: 'អ៊ីនធឺណិតដំណើរការឡើងវិញ',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000
            });
        }
        document.body.classList.remove('was-offline');
    }

    function updateConnectionStatus() {
        if (navigator.onLine) {
            showOnline();
        } else {
            document.body.classList.add('was-offline');
            showOffline();
        }
    }

    // 4. Verification with Firebase (if available) - Stronger Check
    function checkFirebaseConnection() {
        if (typeof firebase !== 'undefined' && firebase.database) {
            const connectedRef = firebase.database().ref(".info/connected");
            connectedRef.on("value", function (snap) {
                if (snap.val() === true) {
                    showOnline();
                } else {
                    if (!navigator.onLine) {
                        showOffline();
                    } else {
                        console.warn('Firebase Disconnected, but Navigator Online');
                    }
                }
            });
        }
    }

    // 5. Event Listeners
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);

    // Initial Check
    updateConnectionStatus();

    // Check Firebase after a short delay to ensure SDK loads
    setTimeout(checkFirebaseConnection, 2000);

})();
