/* ================================================
   theme.js — Hệ thống chuyển đổi giao diện (Theme Switcher)
   ================================================ */

const THEME_STORAGE_KEY = 'posealert-theme';
const VALID_THEMES = ['cyber', 'aurora', 'sunset', 'eye'];

/**
 * Đặt theme và lưu vào localStorage
 * @param {string} themeName - 'cyber' | 'aurora' | 'sunset'
 */
function setTheme(themeName) {
  if (!VALID_THEMES.includes(themeName)) {
    console.warn('[Theme] Invalid theme:', themeName);
    return;
  }

  const body = document.body;

  // Xóa data-theme cũ (cyber = mặc định, không cần attribute)
  if (themeName === 'cyber') {
    body.removeAttribute('data-theme');
  } else {
    body.setAttribute('data-theme', themeName);
  }

  // Cập nhật nút active
  updateThemeButtons(themeName);

  // Lưu vào localStorage
  try {
    localStorage.setItem(THEME_STORAGE_KEY, themeName);
  } catch (e) {
    console.warn('[Theme] Cannot save to localStorage:', e);
  }

  console.log('[Theme] ✅ Applied:', themeName);
}

/**
 * Cập nhật trạng thái active của các nút theme
 */
function updateThemeButtons(activeTheme) {
  const buttons = document.querySelectorAll('.theme-btn');
  buttons.forEach(btn => {
    const btnTheme = btn.getAttribute('data-theme');
    btn.classList.toggle('active', btnTheme === activeTheme);
  });
}

/**
 * Đọc theme từ localStorage và áp dụng
 * Gọi càng sớm càng tốt để tránh flash
 */
function loadTheme() {
  let savedTheme = 'cyber'; // mặc định

  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && VALID_THEMES.includes(stored)) {
      savedTheme = stored;
    }
  } catch (e) {
    // localStorage không khả dụng, dùng mặc định
  }

  // Áp dụng ngay lập tức (trước khi DOM render xong)
  if (savedTheme !== 'cyber') {
    document.body.setAttribute('data-theme', savedTheme);
  }

  // Cập nhật nút khi DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => updateThemeButtons(savedTheme));
  } else {
    updateThemeButtons(savedTheme);
  }
}

// Tải theme ngay khi script được chạy
loadTheme();

/* ================================================
   MAIN TAB NAVIGATION (Thống kê / Cộng đồng)
   ================================================ */
function switchMainTab(tabId) {
  // Cập nhật nút tab
  document.querySelectorAll('.main-tab').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-maintab') === tabId);
  });
  
  // Cập nhật pane
  document.querySelectorAll('.main-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `pane-${tabId}`);
  });
}
