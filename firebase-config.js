/**
 * Firebase Configuration and Initialization
 * Centralized configuration for the school management system
 */

const firebaseConfig = {
    apiKey: "AIzaSyBO59ILt83-be1X6wbfezi5UReh8bhjTwQ",
    authDomain: "tx0000-dea44.firebaseapp.com",
    databaseURL: "https://tx0000-dea44-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "tx0000-dea44",
    storageBucket: "tx0000-dea44.appspot.com",
    messagingSenderId: "600503313930",
    appId: "1:600503313930:web:bc7c8b7f94275d9889a1f3"
};

// Initialize Firebase if not already initialized
if (typeof firebase !== 'undefined') {
    if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
        console.log("🔥 Firebase initialized (Centralized)");
    } else {
        console.log("🔥 Firebase already initialized");
    }

    // Global references
    window.db = firebase.database();
    window.storage = (typeof firebase.storage !== 'undefined') ? firebase.storage() : null;

    // Keep 'database' as a global constant if expected by other scripts
    if (typeof window.database === 'undefined') {
        window.database = window.db;
    }
} else {
    console.error("❌ Firebase SDK not found. Please ensure Firebase scripts are loaded before firebase-config.js");
}
