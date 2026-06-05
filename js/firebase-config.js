/* ================================================
   firebase-config.js — Cấu hình kết nối Firebase
   ================================================
   
   HƯỚNG DẪN: Bạn cần tạo Firebase Project miễn phí tại https://console.firebase.google.com/
   rồi thay thế các giá trị bên dưới bằng thông tin project của bạn.
   
   Bước 1: Truy cập https://console.firebase.google.com/
   Bước 2: Nhấn "Add project" → đặt tên (VD: "posealert")
   Bước 3: Vào Project Settings → General → cuộn xuống "Your apps" → nhấn biểu tượng Web (</>)
   Bước 4: Đặt tên app → Register → Copy firebaseConfig
   Bước 5: Bật Authentication → Sign-in method → Google → Enable
   Bước 6: Bật Realtime Database → Create Database → Start in test mode
*/

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Khởi tạo Firebase
firebase.initializeApp(firebaseConfig);

// Các service dùng chung
const auth = firebase.auth();
const db = firebase.database();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Kiểm tra config hợp lệ
const isFirebaseConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";
