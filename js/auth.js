/**
 * ============================================================
 *  PoseAlert — js/auth.js
 *  Xác thực người dùng: đăng nhập Google, Email, đăng ký,
 *  đăng xuất, và theo dõi trạng thái auth
 *  Phụ thuộc: firebase-init.js
 * ============================================================
 */

// ── Biến auth toàn cục ──
let currentUser = null;

// ============================================================
// ĐĂNG NHẬP / ĐĂNG KÝ
// ============================================================

/**
 * signInWithGoogle()
 * Đăng nhập bằng tài khoản Google (popup).
 */
async function signInWithGoogle() {
  if (!_firebaseReady) { _showFirebaseNotReady(); return; }
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await auth.signInWithPopup(provider);
    console.log("✅ Đăng nhập Google:", result.user.displayName);
    await _ensureUserDocument(result.user);
    return result.user;
  } catch (err) {
    console.error("❌ Lỗi đăng nhập Google:", err);
    _showAuthError(err);
    throw err;
  }
}

/**
 * signInWithEmail(email, password)
 * Đăng nhập bằng email và mật khẩu.
 */
async function signInWithEmail(email, password) {
  if (!_firebaseReady) { _showFirebaseNotReady(); return; }
  try {
    const result = await auth.signInWithEmailAndPassword(email, password);
    console.log("✅ Đăng nhập Email:", result.user.email);
    return result.user;
  } catch (err) {
    console.error("❌ Lỗi đăng nhập Email:", err);
    _showAuthError(err);
    throw err;
  }
}

/**
 * signUpWithEmail(email, password, displayName)
 * Tạo tài khoản mới bằng email.
 */
async function signUpWithEmail(email, password, displayName) {
  if (!_firebaseReady) { _showFirebaseNotReady(); return; }
  try {
    const result = await auth.createUserWithEmailAndPassword(email, password);
    // Cập nhật displayName
    await result.user.updateProfile({ displayName: displayName });
    console.log("✅ Đăng ký thành công:", displayName);
    await _ensureUserDocument(result.user, displayName);
    return result.user;
  } catch (err) {
    console.error("❌ Lỗi đăng ký:", err);
    _showAuthError(err);
    throw err;
  }
}

/**
 * signOutUser()
 * Đăng xuất khỏi ứng dụng.
 */
async function signOutUser() {
  if (!_firebaseReady) { window.location.href = "login.html"; return; }
  try {
    // Cập nhật trạng thái offline trước khi đăng xuất
    if (currentUser && db) {
      await db.collection("users").doc(currentUser.uid).update({
        status: "offline",
        lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }
    await auth.signOut();
    currentUser = null;
    console.log("✅ Đã đăng xuất");
    window.location.href = "login.html";
  } catch (err) {
    console.error("❌ Lỗi đăng xuất:", err);
  }
}

// ============================================================
// THEO DÕI TRẠNG THÁI AUTH
// ============================================================

/**
 * initAuthListener()
 * Gọi khi trang load: theo dõi trạng thái đăng nhập.
 * - Nếu chưa đăng nhập → redirect về login.html
 * - Nếu đã đăng nhập → cập nhật UI, khởi tạo presence
 */
function initAuthListener(options = {}) {
  const { requireAuth = true, onAuthReady = null } = options;

  // Nếu Firebase chưa cấu hình → chạy offline, không redirect
  if (!_firebaseReady || !auth) {
    console.warn("⚠️ Auth chưa sẵn sàng — chế độ offline");
    currentUser = null;
    // Không redirect, cho phép dùng offline
    if (onAuthReady) onAuthReady(null);
    return;
  }

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      console.log("👤 User:", user.displayName || user.email);

      // Cập nhật navbar nếu có
      _updateNavbarUser(user);

      // Khởi tạo presence tracking
      if (typeof initPresence === "function") {
        initPresence(user.uid);
      }

      if (onAuthReady) onAuthReady(user);
    } else {
      currentUser = null;
      if (requireAuth && !window.location.pathname.includes("login.html")) {
        window.location.href = "login.html";
      }
      if (onAuthReady) onAuthReady(null);
    }
  });
}

// ============================================================
// HÀM NỘI BỘ
// ============================================================

/**
 * _ensureUserDocument(user, displayName?)
 * Tạo document user trong Firestore nếu chưa tồn tại (lần đăng nhập đầu).
 */
async function _ensureUserDocument(user, displayName) {
  if (!db) return;
  try {
    const userRef = db.collection("users").doc(user.uid);
    const doc = await userRef.get();

    if (!doc.exists) {
      await userRef.set({
        uid: user.uid,
        displayName: displayName || user.displayName || "Người dùng",
        email: user.email || "",
        avatarUrl: user.photoURL || "",
        status: "online",
        lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
        totalStudyMinutes: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastStudyDate: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      console.log("📝 Tạo hồ sơ user mới trong Firestore");
    } else {
      await userRef.update({
        status: "online",
        lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }
  } catch (err) {
    console.error("❌ Lỗi tạo/cập nhật user document:", err);
  }
}

/**
 * _updateNavbarUser(user)
 * Cập nhật avatar và tên trên thanh navbar.
 */
function _updateNavbarUser(user) {
  const nameEl = document.getElementById("nav-user-name");
  const avatarEl = document.getElementById("nav-user-avatar");

  if (nameEl) nameEl.textContent = user.displayName || user.email || "User";
  if (avatarEl) {
    if (user.photoURL) {
      avatarEl.src = user.photoURL;
      avatarEl.style.display = "block";
    } else {
      avatarEl.style.display = "none";
    }
  }
}

/**
 * _showAuthError(err)
 * Hiển thị thông báo lỗi xác thực thân thiện.
 */
function _showAuthError(err) {
  const errorEl = document.getElementById("auth-error");
  if (!errorEl) return;

  const messages = {
    "auth/user-not-found": "Không tìm thấy tài khoản với email này.",
    "auth/wrong-password": "Mật khẩu không đúng.",
    "auth/email-already-in-use": "Email đã được sử dụng.",
    "auth/weak-password": "Mật khẩu quá yếu (tối thiểu 6 ký tự).",
    "auth/invalid-email": "Định dạng email không hợp lệ.",
    "auth/too-many-requests": "Quá nhiều lần thử. Vui lòng đợi rồi thử lại.",
    "auth/popup-closed-by-user": "Bạn đã đóng cửa sổ đăng nhập.",
    "auth/network-request-failed": "Lỗi kết nối mạng.",
  };

  errorEl.textContent = messages[err.code] || "Có lỗi xảy ra: " + err.message;
  errorEl.classList.remove("hidden");

  // Tự ẩn sau 5 giây
  setTimeout(() => errorEl.classList.add("hidden"), 5000);
}

/**
 * _showFirebaseNotReady()
 * Thông báo khi người dùng cố đăng nhập nhưng Firebase chưa config.
 */
function _showFirebaseNotReady() {
  const errorEl = document.getElementById("auth-error");
  if (errorEl) {
    errorEl.textContent = "⚠️ Firebase chưa được cấu hình. Mở file js/firebase-init.js để điền config.";
    errorEl.classList.remove("hidden");
  }
}
