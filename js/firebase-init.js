/**
 * ============================================================
 *  PoseAlert — js/firebase-init.js
 *  Khởi tạo Firebase SDK (Auth, Firestore, Realtime Database)
 *  Dùng Firebase compat CDN (cho vanilla JS script tags)
 * ============================================================
 */

// ── Firebase config ──
// ⚠️ THAY BẰNG CONFIG TỪ FIREBASE CONSOLE CỦA BẠN
// Hướng dẫn: Vào Firebase Console → Project Settings → General → Your apps → SDK config
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
  databaseURL:       "https://YOUR_PROJECT-default-rtdb.asia-southeast1.firebasedatabase.app",
};

// ── Kiểm tra config đã điền chưa ──
const _isFirebaseConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY"
  && firebaseConfig.projectId !== "YOUR_PROJECT_ID";

let db   = null;
let rtdb = null;
let auth = null;
let _firebaseReady = false;

if (_isFirebaseConfigured) {
  try {
    // ── Khởi tạo Firebase ──
    firebase.initializeApp(firebaseConfig);

    // ── Các instance dùng chung ──
    db   = firebase.firestore();   // Cloud Firestore
    rtdb = firebase.database();    // Realtime Database
    auth = firebase.auth();        // Authentication

    // Cấu hình Firestore cache (offline support)
    db.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED });
    db.enablePersistence({ synchronizeTabs: true }).catch(err => {
      if (err.code === 'failed-precondition') {
        console.warn("⚠️ Firestore persistence: nhiều tab đang mở");
      } else if (err.code === 'unimplemented') {
        console.warn("⚠️ Firestore persistence: trình duyệt không hỗ trợ");
      }
    });

    _firebaseReady = true;
    console.log("🔥 Firebase đã khởi tạo thành công!");

  } catch (err) {
    console.error("❌ Lỗi khởi tạo Firebase:", err);
    _firebaseReady = false;
  }

} else {
  console.warn("⚠️ Firebase chưa được cấu hình. Ứng dụng chạy ở chế độ offline.");
  console.warn("📋 Mở file js/firebase-init.js và thay 'YOUR_...' bằng config từ Firebase Console.");

  // Hiện thông báo trên giao diện (nếu không phải trang login)
  window.addEventListener("DOMContentLoaded", () => {
    if (window.location.pathname.includes("login.html")) return;

    const banner = document.createElement("div");
    banner.id = "firebase-setup-banner";
    banner.style.cssText = `
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;
      background: linear-gradient(135deg, #1a1a2e, #16213e);
      border-top: 2px solid #ff6b35;
      padding: 1rem 1.5rem;
      display: flex; align-items: center; justify-content: space-between;
      gap: 1rem; flex-wrap: wrap;
      font-family: 'DM Sans', sans-serif;
      animation: slideUpBanner 0.4s ease-out;
    `;
    banner.innerHTML = `
      <div style="flex:1;min-width:200px;">
        <div style="color:#ff6b35;font-weight:700;font-size:0.9rem;margin-bottom:0.3rem;">
          ⚠️ Firebase chưa được cấu hình
        </div>
        <div style="color:#a0aec0;font-size:0.8rem;line-height:1.4;">
          App đang chạy ở chế độ offline. Để bật đầy đủ tính năng (lưu dữ liệu, chat, bạn bè),
          hãy mở <code style="background:#2d3748;padding:0.15rem 0.4rem;border-radius:4px;color:#00d4ff;">js/firebase-init.js</code>
          và điền Firebase config.
          <a href="setup-guide.html" style="color:#00d4ff;text-decoration:underline;margin-left:0.3rem;">Xem hướng dẫn →</a>
        </div>
      </div>
      <button onclick="this.parentElement.remove()" style="
        background:transparent;border:1px solid #4a5568;color:#a0aec0;
        padding:0.4rem 0.8rem;border-radius:6px;cursor:pointer;font-size:0.8rem;
        flex-shrink:0;">✕ Đóng</button>
    `;

    const style = document.createElement("style");
    style.textContent = `@keyframes slideUpBanner { from { transform: translateY(100%); } to { transform: translateY(0); } }`;
    document.head.appendChild(style);
    document.body.appendChild(banner);
  });
}
