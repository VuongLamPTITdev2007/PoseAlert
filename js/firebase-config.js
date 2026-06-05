/* ================================================
   firebase-config.js — Cấu hình kết nối Firebase
   ================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyCvWaGIFm40EA0flXXyua6WxZaYNaVCmcs",
  authDomain: "posealert-c38d4.firebaseapp.com",
  // Nếu bạn chọn Location là Singapore, URL sẽ có dạng asia-southeast1
  // Nếu bạn chọn US (mặc định), URL sẽ là: https://posealert-c38d4-default-rtdb.firebaseio.com
  databaseURL: "https://posealert-c38d4-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "posealert-c38d4",
  storageBucket: "posealert-c38d4.firebasestorage.app",
  messagingSenderId: "134096274436",
  appId: "1:134096274436:web:b2b80cb21b4748edfca151",
  measurementId: "G-MY95J6KP75"
};

// Khởi tạo Firebase
firebase.initializeApp(firebaseConfig);

// Các service dùng chung
const auth = firebase.auth();
const db = firebase.database();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Kiểm tra config hợp lệ
const isFirebaseConfigured = true;
