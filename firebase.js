import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import { 
  getAuth, onAuthStateChanged, 
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signOut,
  signInWithPhoneNumber, RecaptchaVerifier
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, query, orderBy, onSnapshot, serverTimestamp, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBCFV1z7cQG_zDaJDQoO6_S59Nq0K2kxRo",
  authDomain: "souqna-4361a.firebaseapp.com",
  projectId: "souqna-4361a",
  storageBucket: "souqna-4361a.firebasestorage.app",
  messagingSenderId: "133557996808",
  appId: "1:133557996808:web:418a8e7624607cc58ab0bd",
  measurementId: "G-BLNNQCZ567"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const actionCodeSettings = {
  url: window.location.origin + window.location.pathname,
  handleCodeInApp: true
};

let currentUser = null;
let confirmationResult = null; // لحفظ نتيجة إرسال رمز الهاتف
let recaptchaVerifier = null;

// === Mandatory Auth Check ===
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  updateAuthUI(user);
  
  if (!user) {
    if (typeof window.openAuthModal === 'function') window.openAuthModal();
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
    if (typeof window.closeAuthModal === 'function') window.closeAuthModal();
    
    // معالجة الدخول عبر رابط البريد
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = window.localStorage.getItem('emailForSignIn');
      if (!email) {
        email = window.prompt('يرجى تأكيد بريدك الإلكتروني لإتمام الدخول:');
      }
      if (email) {
        signInWithEmailLink(auth, email, window.location.href)
          .then(() => { 
            window.localStorage.removeItem('emailForSignIn'); 
            window.history.replaceState({}, document.title, window.location.pathname);
          })
          .catch((err) => { console.error(err); alert('خطأ في تأكيد البريد: ' + err.message); });
      }
    }
  }
});

function updateAuthUI(user) {
  const statusEl = document.getElementById('authStatus');
  const btnEl = document.getElementById('authBtn');
  if (!user) {
    statusEl.textContent = 'غير مسجل';
    btnEl.style.display = 'inline-block';
    btnEl.textContent = 'تسجيل الدخول';
    btnEl.onclick = () => { if(typeof window.openAuthModal === 'function') window.openAuthModal(); };
    return;
  }
  
  // عرض البريد أو رقم الهاتف
  const displayValue = user.email || user.phoneNumber || 'حساب مسجل';
  statusEl.textContent = displayValue;
  btnEl.style.display = 'inline-block';
  btnEl.textContent = 'تسجيل الخروج';
  btnEl.onclick = () => { signOut(auth); };
}

// === Phone Auth Functions ===

// تهيئة reCAPTCHA (مطلوب من Firebase)
window.initRecaptcha = function() {
  if (recaptchaVerifier) {
    try { recaptchaVerifier.clear(); } catch(e) {}
  }
  recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
    'size': 'invisible',
    'callback': () => {},
    'expired-callback': () => {
      const msg = document.getElementById('phoneAuthMsg');
      msg.className = 'modal-msg err';
      msg.textContent = 'انتهت صلاحية التحقق، حاول مرة أخرى.';
    }
  });
};

// إرسال رمز التحقق عبر SMS
window.sendPhoneCode = async function() {
  const countryCode = document.getElementById('phoneCountryCode').value;
  const phoneDigits = document.getElementById('authPhone').value.trim().replace(/\s+/g, '');
  const msgEl = document.getElementById('phoneAuthMsg');
  const btn = document.getElementById('sendCodeBtn');
  
  // التحقق من صحة الرقم
  if (!phoneDigits || !/^[0-9]{9,10}$/.test(phoneDigits)) {
    msgEl.className = 'modal-msg err';
    msgEl.textContent = 'يرجى إدخال رقم هاتف صحيح (9-10 أرقام).';
    return;
  }
  
  // تحويل الرقم إلى الصيغة الدولية
  let fullPhone = phoneDigits;
  if (phoneDigits.startsWith('0')) {
    fullPhone = '+213' + phoneDigits.substring(1);
  } else if (!phoneDigits.startsWith('+')) {
    fullPhone = countryCode + phoneDigits;
  }
  
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spinner"></span> جاري الإرسال...';
  msgEl.textContent = '';
  
  try {
    // تهيئة reCAPTCHA إذا لزم الأمر
    if (!recaptchaVerifier) {
      window.initRecaptcha();
    }
    
    confirmationResult = await signInWithPhoneNumber(auth, fullPhone, recaptchaVerifier);
    
    // عرض شاشة OTP
    document.getElementById('phoneAuthScreen').style.display = 'none';
    document.getElementById('otpScreen').style.display = 'block';
    document.getElementById('otpPhoneDisplay').textContent = fullPhone;
    document.getElementById('otpInput').focus();
    
    msgEl.className = 'modal-msg ok';
    msgEl.textContent = '✓ تم إرسال الرمز بنجاح!';
  } catch (err) {
    console.error(err);
    msgEl.className = 'modal-msg err';
    if (err.code === 'auth/too-many-requests') {
      msgEl.textContent = 'تم تجاوز الحد المسموح. حاول لاحقاً.';
    } else if (err.code === 'auth/invalid-phone-number') {
      msgEl.textContent = 'رقم الهاتف غير صالح.';
    } else {
      msgEl.textContent = 'خطأ: ' + err.message;
    }
    // إعادة تهيئة reCAPTCHA في حال الخطأ
    window.initRecaptcha();
  } finally {
    btn.disabled = false;
    btn.textContent = 'إرسال رمز التحقق';
  }
};

// التحقق من رمز OTP
window.verifyPhoneCode = async function() {
  const code = document.getElementById('otpInput').value.trim();
  const msgEl = document.getElementById('otpAuthMsg');
  const btn = document.getElementById('verifyOtpBtn');
  
  if (!code || code.length !== 6 || !/^[0-9]{6}$/.test(code)) {
    msgEl.className = 'modal-msg err';
    msgEl.textContent = 'يرجى إدخال الرمز المكون من 6 أرقام.';
    return;
  }
  
  if (!confirmationResult) {
    msgEl.className = 'modal-msg err';
    msgEl.textContent = 'انتهت الجلسة، يرجى إعادة إرسال الرمز.';
    return;
  }
  
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spinner"></span> جاري التحقق...';
  
  try {
    await confirmationResult.confirm(code);
    msgEl.className = 'modal-msg ok';
    msgEl.textContent = '✓ تم الدخول بنجاح!';
    confirmationResult = null;
  } catch (err) {
    console.error(err);
    msgEl.className = 'modal-msg err';
    if (err.code === 'auth/invalid-verification-code') {
      msgEl.textContent = 'الرمز الذي أدخلته غير صحيح.';
    } else {
      msgEl.textContent = 'خطأ: ' + err.message;
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'تأكيد الرمز والدخول';
  }
};

// العودة إلى شاشة إدخال الرقم
window.backToPhoneEntry = function() {
  document.getElementById('otpScreen').style.display = 'none';
  document.getElementById('phoneAuthScreen').style.display = 'block';
  document.getElementById('otpInput').value = '';
  document.getElementById('otpAuthMsg').textContent = '';
  document.getElementById('phoneAuthMsg').textContent = '';
  confirmationResult = null;
};

// === Email Auth Function ===
window.sendEmailLink = async function() {
  const email = document.getElementById('authEmail').value.trim();
  const msgEl = document.getElementById('emailAuthMsg');
  const btn = document.getElementById('sendLinkBtn');
  
  if (!email || !email.includes('@')) {
    msgEl.className = 'modal-msg err';
    msgEl.textContent = 'يرجى إدخال بريد إلكتروني صحيح.';
    return;
  }
  
  btn.disabled = true;
  btn.textContent = 'جاري الإرسال...';
  try {
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    window.localStorage.setItem('emailForSignIn', email);
    msgEl.className = 'modal-msg ok';
    msgEl.textContent = '✓ تم الإرسال! افتح بريدك واضغط على الرابط.';
  } catch (err) {
    msgEl.className = 'modal-msg err';
    msgEl.textContent = 'خطأ: ' + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'أرسل رابط الدخول السحري';
  }
};

// === Tab Switching ===
window.switchAuthTab = function(tab) {
  const phoneTab = document.getElementById('tabPhone');
  const emailTab = document.getElementById('tabEmail');
  const phoneScreen = document.getElementById('phoneAuthScreen');
  const emailScreen = document.getElementById('emailAuthScreen');
  const otpScreen = document.getElementById('otpScreen');
  
  if (tab === 'phone') {
    phoneTab.classList.add('active');
    emailTab.classList.remove('active');
    phoneScreen.style.display = 'block';
    emailScreen.style.display = 'none';
    otpScreen.style.display = 'none';
  } else {
    emailTab.classList.add('active');
    phoneTab.classList.remove('active');
    emailScreen.style.display = 'block';
    phoneScreen.style.display = 'none';
    otpScreen.style.display = 'none';
  }
};

// === Export globals ===
window.db = db;
window.storage = storage;
window.itemsCol = collection(db, 'items');
window.addDoc = addDoc;
window.serverTimestamp = serverTimestamp;
window.collection = collection;
window.ref = ref;
window.uploadBytes = uploadBytes;
window.getDownloadURL = getDownloadURL;
window.doc = doc;
window.deleteDoc = deleteDoc;
window.deleteObject = deleteObject;
window.currentUser = () => currentUser;

// تهيئة reCAPTCHA عند تحميل الصفحة
window.addEventListener('load', () => {
  window.initRecaptcha();
});
