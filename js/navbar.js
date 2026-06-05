/**
 * ============================================================
 *  PoseAlert — js/navbar.js
 *  Thanh điều hướng chung: logo, links, user info
 *  Phụ thuộc: auth.js
 * ============================================================
 */

/**
 * initNavbar()
 * Inject thanh navbar vào đầu <body>. Gọi trên mọi trang.
 */
function initNavbar() {
  // Xác định trang hiện tại
  const path = window.location.pathname;
  const isIndex     = path.endsWith("index.html") || path.endsWith("/");
  const isCommunity = path.includes("community");
  const isHistory   = path.includes("history");

  const navHTML = `
    <nav class="navbar" id="main-navbar">
      <div class="nav-left">
        <a href="index.html" class="nav-logo">
          <span class="nav-logo-icon">🧘</span>
          <span class="nav-logo-text">Pose<span class="accent">Alert</span></span>
        </a>
      </div>

      <div class="nav-center">
        <a href="index.html" class="nav-link ${isIndex ? 'active' : ''}">
          <span class="nav-link-icon">📷</span>
          <span>Trang chính</span>
        </a>
        <a href="community.html" class="nav-link ${isCommunity ? 'active' : ''}">
          <span class="nav-link-icon">👥</span>
          <span>Cộng đồng</span>
        </a>
        <a href="history.html" class="nav-link ${isHistory ? 'active' : ''}">
          <span class="nav-link-icon">📊</span>
          <span>Lịch sử</span>
        </a>
      </div>

      <div class="nav-right">
        <div class="nav-streak" id="nav-streak" title="Chuỗi ngày học liên tục">
          🔥 <span id="nav-streak-count">0</span>
        </div>
        <div class="nav-user" id="nav-user">
          <img class="nav-avatar" id="nav-user-avatar" src="" alt="" style="display:none"/>
          <span class="nav-username" id="nav-user-name">...</span>
        </div>
        <button class="nav-logout" onclick="signOutUser()" title="Đăng xuất">
          🚪
        </button>
      </div>

      <!-- Mobile hamburger -->
      <button class="nav-hamburger" id="nav-hamburger" onclick="toggleMobileNav()">
        <span></span><span></span><span></span>
      </button>
    </nav>

    <!-- Mobile overlay -->
    <div class="nav-mobile-overlay hidden" id="nav-mobile-overlay" onclick="toggleMobileNav()"></div>
  `;

  document.body.insertAdjacentHTML("afterbegin", navHTML);

  // Cập nhật streak từ Firestore
  _loadNavStreak();
}

/**
 * _loadNavStreak()
 * Đọc streak từ Firestore và hiển thị trên navbar.
 */
async function _loadNavStreak() {
  if (!currentUser) return;
  try {
    const profile = await getUserProfile(currentUser.uid);
    if (profile) {
      const el = document.getElementById("nav-streak-count");
      if (el) el.textContent = profile.currentStreak || 0;
    }
  } catch (err) {
    // Không quan trọng, bỏ qua
  }
}

/**
 * toggleMobileNav()
 * Bật/tắt menu mobile.
 */
function toggleMobileNav() {
  const navbar  = document.getElementById("main-navbar");
  const overlay = document.getElementById("nav-mobile-overlay");
  navbar.classList.toggle("mobile-open");
  overlay.classList.toggle("hidden");
}
