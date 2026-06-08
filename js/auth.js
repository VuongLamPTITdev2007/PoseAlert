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
    // Kết thúc cuộc gọi nếu đang gọi
    if (typeof activeCallId !== 'undefined' && activeCallId) {
      if (typeof endCall === 'function') endCall();
    }
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
  const userStreak = document.getElementById('user-streak');
  const userAvatar = document.getElementById('user-avatar');

  if (btnSignIn)  btnSignIn.classList.add('hidden');
  if (userInfo)   userInfo.classList.remove('hidden');
  if (userName)   userName.textContent = user.displayName || 'Người dùng';
  if (userStreak) userStreak.style.display = 'inline-block';
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

  // Lưu profile lên Firebase để có thể tìm kiếm
  if (typeof saveUserProfile === 'function') saveUserProfile(user);

  // Tự động vào phòng mặc định + bật chat
  joinRoom('general');
  initChat('general');

  // Khởi tạo Kết bạn & Nhóm
  if (typeof initFriends === 'function') initFriends();
  if (typeof initGroups  === 'function') initGroups();

  // Khởi tạo Gọi video/audio
  if (typeof initCalling === 'function') initCalling();

  // Khởi tạo Gamification (Streak & Quests)
  if (typeof initGamification === 'function') {
    initGamification();
  }
}

/* ---------- CẬP NHẬT UI KHI ĐĂNG XUẤT ---------- */
function onAuthSignedOut() {
  const btnSignIn = document.getElementById('btn-sign-in');
  const userInfo  = document.getElementById('user-info');

  if (btnSignIn) btnSignIn.classList.remove('hidden');
  if (userInfo)  userInfo.classList.add('hidden');

  // Ẩn cột thứ 4 và thu lưới về 3 cột
  const networkPanel = document.getElementById('network-panel');
  const mainGrid     = document.querySelector('.main-grid');
  if (networkPanel) networkPanel.classList.add('hidden');
  if (mainGrid)     mainGrid.classList.remove('has-community');
}

/* ---------- CHUYỂN TAB COMMUNITY ---------- */
function switchCommunityTab(tab) {
  // Cập nhật nút tab
  document.querySelectorAll('.community-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  // Chuyển pane — ẩn hết rồi hiện đúng
  ['pane-room', 'pane-history', 'pane-friends', 'pane-groups'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
  const paneMap = {
    room:    'pane-room',
    history: 'pane-history',
    friends: 'pane-friends',
    groups:  'pane-groups'
  };
  if (paneMap[tab]) document.getElementById(paneMap[tab])?.classList.add('active');
}
