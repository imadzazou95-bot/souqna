import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import { getAuth, onAuthStateChanged, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, deleteDoc, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

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

// Mandatory Auth Check
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  updateAuthUI(user);
  
  if (!user) {
    // إجباري: فتح نافذة الدخول ومنع التمرير في الخلفية
    if (typeof window.openAuthModal === 'function') {
      window.openAuthModal();
    }
    document.body.style.overflow = 'hidden';
  } else {
    // نجاح الدخول: السماح بالتمرير وإغلاق النافذة
    document.body.style.overflow = '';
    if (typeof window.closeAuthModal === 'function') {
      window.closeAuthModal();
    }
    
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
  
  // لم يعد هناك مستخدمين مجهولين (Anonymous)
  if (user.email) {
    statusEl.textContent = user.email;
    btnEl.style.display = 'inline-block';
    btnEl.textContent = 'تسجيل الخروج';
    btnEl.onclick = () => { signOut(auth); };
  }
}

// دوال المصادقة المتاحة عالمياً
window.sendEmailLink = async function() {
  const email = document.getElementById('authEmail').value.trim();
  const msgEl = document.getElementById('authMsg');
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
    btn.textContent = 'أرسل رابط الدخول';
  }
};

// تصدير المتغيرات والدوال لاستخدامها في app.js
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
