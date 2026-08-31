import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import { 
  getAuth, onAuthStateChanged, 
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, query, orderBy, onSnapshot, serverTimestamp, doc, deleteDoc, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

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

let currentUser = null;

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
  
  statusEl.textContent = user.email;
  btnEl.style.display = 'inline-block';
  btnEl.textContent = 'تسجيل الخروج';
  btnEl.onclick = () => { signOut(auth); };
}

// === Email + Password Auth ===

window.registerUser = async function() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const msgEl = document.getElementById('authMsg');
  const btn = document.getElementById('authSubmitBtn');
  
  if (!email || !email.includes('@')) {
    msgEl.className = 'modal-msg err';
    msgEl.textContent = 'يرجى إدخال بريد إلكتروني صحيح.';
    return;
  }
  
  if (!password || password.length < 6) {
    msgEl.className = 'modal-msg err';
    msgEl.textContent = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.';
    return;
  }
  
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spinner"></span> جاري التسجيل...';
  
  try {
    await createUserWithEmailAndPassword(auth, email, password);
    msgEl.className = 'modal-msg ok';
    msgEl.textContent = '✓ تم التسجيل بنجاح!';
    console.log('User registered:', email);
  } catch (err) {
    console.error('Register error:', err);
    msgEl.className = 'modal-msg err';
    
    if (err.code === 'auth/email-already-in-use') {
      msgEl.textContent = 'هذا البريد مسجل مسبقاً. استخدم تسجيل الدخول.';
    } else if (err.code === 'auth/invalid-email') {
      msgEl.textContent = 'البريد الإلكتروني غير صالح.';
    } else if (err.code === 'auth/weak-password') {
      msgEl.textContent = 'كلمة المرور ضعيفة جداً.';
    } else {
      msgEl.textContent = 'خطأ: ' + err.message;
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'إنشاء حساب جديد';
  }
};

window.loginUser = async function() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const msgEl = document.getElementById('authMsg');
  const btn = document.getElementById('authSubmitBtn');
  
  if (!email || !email.includes('@')) {
    msgEl.className = 'modal-msg err';
    msgEl.textContent = 'يرجى إدخال بريد إلكتروني صحيح.';
    return;
  }
  
  if (!password) {
    msgEl.className = 'modal-msg err';
    msgEl.textContent = 'يرجى إدخال كلمة المرور.';
    return;
  }
  
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spinner"></span> جاري الدخول...';
  
  try {
    await signInWithEmailAndPassword(auth, email, password);
    msgEl.className = 'modal-msg ok';
    msgEl.textContent = '✓ تم الدخول بنجاح!';
    console.log('User logged in:', email);
  } catch (err) {
    console.error('Login error:', err);
    msgEl.className = 'modal-msg err';
    
    if (err.code === 'auth/user-not-found') {
      msgEl.textContent = 'لا يوجد حساب بهذا البريد. سجّل حساباً جديداً.';
    } else if (err.code === 'auth/wrong-password') {
      msgEl.textContent = 'كلمة المرور غير صحيحة.';
    } else if (err.code === 'auth/invalid-email') {
      msgEl.textContent = 'البريد الإلكتروني غير صالح.';
    } else {
      msgEl.textContent = 'خطأ: ' + err.message;
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'تسجيل الدخول';
  }
};

// === Tab Switching ===
window.switchAuthMode = function(mode) {
  const loginTab = document.getElementById('tabLogin');
  const registerTab = document.getElementById('tabRegister');
  const submitBtn = document.getElementById('authSubmitBtn');
  const msgEl = document.getElementById('authMsg');
  
  msgEl.textContent = '';
  
  if (mode === 'login') {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    submitBtn.textContent = 'تسجيل الدخول';
    submitBtn.onclick = window.loginUser;
  } else {
    registerTab.classList.add('active');
    loginTab.classList.remove('active');
    submitBtn.textContent = 'إنشاء حساب جديد';
    submitBtn.onclick = window.registerUser;
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
