import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import { getFirestore, collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
const db = getFirestore(app);

// تصدير الدوال والبيانات للقراءة فقط
window.db = db;
window.itemsCol = collection(db, 'items');
window.query = query;
window.orderBy = orderBy;
window.onSnapshot = onSnapshot;

console.log('✅ تم تحميل الموقع بنجاح — وضع العرض فقط');
