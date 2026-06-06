/* ================================================
   auth.js — Xử lý Đăng nhập / Đăng xuất Google
   ================================================ */

let currentUser = null;

/* ---------- ĐĂNG NHẬP GOOGLE ---------- */
async function signInWithGoogle() {
  if (!isFirebaseConfigured) {
    alert('⚠️ Chưa cấu hình Firebase!\n\nMở file js/firebase-config.js và điền thông tin project Firebase của bạn.\n\nXem hướng dẫn trong file đó.');
    return;
  }
  try {
    const result = await auth.signInWithPopup(googleProvider);
    currentUser = result.user;
    onAuthSuccess(currentUser);
  } catch (error) {
    console.error('Lỗi đăng nhập:', error);
    if (error.code !== 'auth/popup-closed-by-user') {
      alert('Lỗi đăng nhập: ' + error.message);
    }
  }
}

/* ---------- ĐĂNG XUẤT ---------- */
async function signOut() {
  try {
    // Xóa presence trước khi đăng xuất
    if (currentUser && currentRoomId) {
      await leaveRoom();
    }
    await auth.signOut();
    currentUser = null;
    onAuthSignedOut();
  } catch (error) {
    console.error('Lỗi đăng xuất:', error);
  }
}

/* ---------- LẮNG NGHE TRẠNG THÁI AUTH ---------- */
function initAuth() {
  if (!isFirebaseConfigured) {
    // Ẩn các tính năng online, chỉ chạy offline
    document.getElementById('auth-section').classList.add('offline-mode');
    return;
  }

  auth.onAuthStateChanged((user) => {
    if (user) {
      currentUser = user;
      onAuthSuccess(user);
    } else {
      currentUser = null;
      onAuthSignedOut();
    }
  });
}

/* ---------- CẬP NHẬT UI KHI ĐĂNG NHẬP ---------- */
function onAuthSuccess(user) {
  const btnSignIn = document.getElementById('btn-sign-in');
  const userInfo  = document.getElementById('user-info');
  const userName  = document.getElementById('user-name');
  const userAvatar = document.getElementById('user-avatar');

  if (btnSignIn)  btnSignIn.classList.add('hidden');
  if (userInfo)   userInfo.classList.remove('hidden');
  if (userName)   userName.textContent = user.displayName || 'Người dùng';
  if (userAvatar) {
    userAvatar.src = user.photoURL || '';
    userAvatar.alt = user.displayName || '';
  }

  // Hiện cột thứ 4 + thêm lưới 4 cột
  const networkPanel = document.getElementById('network-panel');
  const mainGrid     = document.querySelector('.main-grid');
  if (networkPanel) networkPanel.classList.remove('hidden');
  if (mainGrid)     mainGrid.classList.add('has-community');

  // Tải lịch sử học tập
  loadStudyHistory(user.uid);

  // Tự động vào phòng mặc định + bật chat
  joinRoom('general');
  initChat('general');
}

/* ---------- CẬP NHẬT UI KHI ĐĂNG XUẤT ---------- */
function onAuthSignedOut() {
  const btnSignIn = document.getElementById('btn-sign-in');
  const userInfo = document.getElementById('user-info');

  if (btnSignIn) btnSignIn.classList.remove('hidden');
  if (userInfo) userInfo.classList.add('hidden');

  // Ẩn các panel online
  const networkPanel = document.getElementById('network-panel');
  if (networkPanel) networkPanel.classList.add('hidden');
}
