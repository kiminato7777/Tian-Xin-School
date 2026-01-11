let usernameRef = document.getElementById("username");
let passwordRef = document.getElementById("password");
let eyeL = document.querySelector(".eyeball-l");
let eyeR = document.querySelector(".eyeball-r");
let handL = document.querySelector(".hand-l");
let handR = document.querySelector(".hand-r");

let normalEyeStyle = () => {
  eyeL.style.cssText = "left: 0.6em; top: 0.6em;";
  eyeR.style.cssText = "right: 0.6em; top: 0.6em;";
};

let normalHandStyle = () => {
  handL.style.cssText =
    "height: 2.81em; top: 8.4em; left: 7.5em; transform: rotate(0deg);";
  handR.style.cssText =
    "height: 2.81em; top: 8.4em; right: 7.5em; transform: rotate(0deg);";
};

// When clicked on username input
usernameRef.addEventListener("focus", () => {
  eyeL.style.cssText = "left: 0.75em; top: 1.12em;";
  eyeR.style.cssText = "right: 0.75em; top: 1.12em;";
  normalHandStyle();
});

// When clicked on password input
passwordRef.addEventListener("focus", () => {
  handL.style.cssText =
    "height: 6.56em; top: 3.87em; left: 11.75em; transform: rotate(-155deg);";
  handR.style.cssText =
    "height: 6.56em; top: 3.87em; right: 11.75em; transform: rotate(155deg);";
  normalEyeStyle();
});

// Toggle Password Visibility
const togglePassword = document.getElementById('togglePassword');
if (togglePassword) {
  togglePassword.addEventListener('click', function (e) {
    // toggle the type attribute
    const type = passwordRef.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordRef.setAttribute('type', type);

    // toggle the eye slash icon
    this.classList.toggle('fi-rr-eye-crossed');
    this.classList.toggle('fa-eye');
  });
}

// When clicked outside username and password input
document.addEventListener("click", (e) => {
  let clickedElem = e.target;
  if (clickedElem != usernameRef && clickedElem != passwordRef && clickedElem != togglePassword) {
    normalEyeStyle();
    normalHandStyle();
  }
});

/**
 * AUTHENTICATION LOGIC
 */
const loginForm = document.getElementById('loginForm');

// Handle Create Admin Link (Dev Only)
const createAdminLink = document.getElementById('createAdminLink');
if (createAdminLink) {
  createAdminLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (confirm("Create admin account (admin@school.com / 123456)?")) {
      firebase.auth().createUserWithEmailAndPassword('admin@school.com', '123456')
        .then((userCredential) => {
          alert("Admin account created! You can now login.");
          if (usernameRef) usernameRef.value = 'admin@school.com';
          if (passwordRef) passwordRef.value = '123456';
        })
        .catch((error) => {
          alert("Error: " + error.message);
        });
    }
  });
}

if (loginForm) {
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const email = usernameRef.value.trim();
    const password = passwordRef.value;

    if (!email || !password) {
      showCustomAlert("សូមបញ្ចូលអ៊ីមែល និងពាក្យសម្ងាត់!");
      return;
    }

    const loginBtn = document.querySelector('button');
    const originalText = loginBtn.innerText;
    loginBtn.innerText = "កំពុងចូល...";
    loginBtn.disabled = true;

    firebase.auth().signInWithEmailAndPassword(email, password)
      .then((userCredential) => {
        // Signed in
        console.log("Logged in:", userCredential.user);
        window.location.href = "index.html";
      })
      .catch((error) => {
        console.error("Login error:", error);

        let errorMessage = "មានបញ្ហាកក្នុងការចូលប្រើប្រាស់។";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-login-credentials') {
          errorMessage = "អ៊ីមែល ឬ ពាក្យសម្ងាត់មិនត្រឹមត្រូវ!";
        } else if (error.code === 'auth/invalid-email') {
          errorMessage = "ទម្រង់អ៊ីមែលមិនត្រឹមត្រូវ!";
        } else if (error.code === 'auth/too-many-requests') {
          errorMessage = "ការព្យាយាមចូលច្រើនដងពេក។ សូមរង់ចាំមួយសន្ទុះ!";
        } else {
          errorMessage = "មានបញ្ហាកក្នុងការចូល៖ " + error.message;
        }

        showCustomAlert(errorMessage);
        loginBtn.innerText = originalText;
        loginBtn.disabled = false;
      });
  });
}

function showCustomAlert(message) {
  const alertBox = document.getElementById("customAlert");
  alertBox.innerText = message;
  alertBox.style.display = "block";
  setTimeout(() => {
    alertBox.style.display = "none";
  }, 3000);
}

// Check auth state
firebase.auth().onAuthStateChanged((user) => {
  if (user) {
    console.log("User already logged in, redirecting...");
    // Optional: if you want to prevent going back to login while logged in
    // window.location.href = "index.html";
  }
});