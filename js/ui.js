/**
 * ============================================================
 *  PoseAlert — js/ui.js
 *  Cập nhật giao diện: hiển thị tư thế, thanh %, trạng thái,
 *  nhật ký cảnh báo, và khởi tạo các phần tử động
 *  Phụ thuộc: config.js, state.js
 * ============================================================
 */

// ------------------------------------------------------------
// Cập nhật giao diện theo kết quả nhận diện
// ------------------------------------------------------------

/**
 * updateUI(prediction)
 * Cập nhật toàn bộ giao diện: tư thế lớn, thanh %, đèn header,
 * và trigger timer cảnh báo nếu tư thế sai.
 * @param {Array} prediction - [{className, probability}, ...]
 */
function updateUI(prediction) {
  // Tìm tư thế có xác suất cao nhất
  const maxPose = prediction.reduce((best, p) =>
    p.probability > best.probability ? p : best
  , prediction[0]);

  const poseName   = maxPose.className;
  const poseConf   = Math.round(maxPose.probability * 100);
  const poseInfo   = POSE_CONFIG[poseName] || { icon: "❓", isGood: true };
  const isGoodPose = poseInfo.isGood;

  // Lưu tư thế hiện tại vào state toàn cục
  currentPoseName   = poseName;
  currentPoseIsGood = isGoodPose;

  // Cập nhật khối hiển thị tư thế lớn (giữa màn hình)
  const display = document.querySelector(".current-pose-display");
  document.getElementById("pose-icon").textContent       = poseInfo.icon || "❓";
  document.getElementById("pose-name").textContent       = poseName;
  document.getElementById("pose-confidence").textContent = poseConf + "%";
  display.classList.remove("state-good", "state-bad");
  display.classList.add(isGoodPose ? "state-good" : "state-bad");

  // Cập nhật đèn trạng thái ở header
  document.getElementById("status-dot").className =
    "status-dot " + (isGoodPose ? "active" : "warning");

  // Cập nhật các thanh % bên dưới camera
  prediction.forEach(p => {
    const pct    = Math.round(p.probability * 100);
    const fillEl = document.getElementById("bar-fill-" + sanitizeId(p.className));
    const pctEl  = document.getElementById("bar-pct-"  + sanitizeId(p.className));
    if (fillEl) fillEl.style.width  = pct + "%";
    if (pctEl)  pctEl.textContent   = pct + "%";
  });

  // Kích hoạt hoặc reset timer cảnh báo
  if (!isGoodPose) {
    startBadPoseTimer(poseName);
  } else {
    resetBadPoseTimer();
  }
}

// ------------------------------------------------------------
// Cập nhật các phần tử header
// ------------------------------------------------------------

/**
 * updateStatus(text, dotClass)
 * Thay đổi văn bản và màu đèn trạng thái ở header
 */
function updateStatus(text, dotClass) {
  document.getElementById("status-label").textContent = text;
  document.getElementById("status-dot").className     = "status-dot " + dotClass;
}

/**
 * updateSessionClock()
 * Cập nhật đồng hồ phiên HH:MM:SS ở góc trên header
 */
function updateSessionClock() {
  const e = stats.totalSeconds;
  const h = Math.floor(e / 3600).toString().padStart(2, "0");
  const m = Math.floor((e % 3600) / 60).toString().padStart(2, "0");
  const s = (e % 60).toString().padStart(2, "0");
  document.getElementById("session-time").textContent = "Phiên: " + h + ":" + m + ":" + s;
}

// ------------------------------------------------------------
// Nhật ký cảnh báo
// ------------------------------------------------------------

/**
 * addAlertLog(poseName)
 * Thêm một dòng log (tên tư thế + giờ) vào nhật ký cảnh báo.
 * Mục mới nhất xuất hiện trên cùng.
 */
function addAlertLog(poseName) {
  const logEl   = document.getElementById("alert-log");
  const emptyEl = logEl.querySelector(".log-empty");
  if (emptyEl) emptyEl.remove();

  const now     = new Date();
  const timeStr = now.getHours().toString().padStart(2, "0") + ":" +
                  now.getMinutes().toString().padStart(2, "0") + ":" +
                  now.getSeconds().toString().padStart(2, "0");

  const item = document.createElement("div");
  item.className = "log-item";
  item.innerHTML =
    "<span>" + poseName + "</span>" +
    '<span class="log-time">' + timeStr + "</span>";

  logEl.insertBefore(item, logEl.firstChild);
}

// ------------------------------------------------------------
// Khởi tạo các phần tử giao diện động
// ------------------------------------------------------------

/**
 * initPoseResultBars()
 * Tạo các thanh % cho từng tư thế trong POSE_CONFIG.
 * Gọi một lần khi app bắt đầu (hoặc khi restart).
 */
function initPoseResultBars() {
  const container = document.getElementById("pose-results");
  container.innerHTML = "";

  Object.entries(POSE_CONFIG).forEach(([name, config]) => {
    const id   = sanitizeId(name);
    const item = document.createElement("div");
    item.className = "pose-bar-item";
    item.innerHTML = `
      <div class="pose-bar-header">
        <span class="pose-bar-label">${config.icon} ${name}</span>
        <span class="pose-bar-pct" id="bar-pct-${id}">0%</span>
      </div>
      <div class="pose-bar-track">
        <div class="pose-bar-fill ${config.barClass}" id="bar-fill-${id}" style="width:0%"></div>
      </div>`;
    container.appendChild(item);
  });
}

// ------------------------------------------------------------
// Hàm tiện ích
// ------------------------------------------------------------

/**
 * sanitizeId(name) → string
 * Chuyển tên tư thế có dấu thành ID HTML hợp lệ.
 * Ví dụ: "Cúi đầu" → "Cui-dau"
 */
function sanitizeId(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/\s+/g, "-");
}
// Bật/tắt chế độ giấu mặt
function togglePrivacy() {
  isPrivacyMode = !isPrivacyMode;
  const btn = document.getElementById("btn-privacy");
  if (isPrivacyMode) {
    btn.style.background = "var(--accent-green)";
    btn.style.color = "#000";
    btn.textContent = "🕵️ Đã giấu mặt";
  } else {
    btn.style.background = "#374151";
    btn.style.color = "white";
    btn.textContent = "👻 Bảo mật";
  }
}