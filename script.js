/**
 * ============================================================
 *  PoseAlert — script.js
 *  Tác giả: [Tên sinh viên]
 *  Mô tả: Logic chính cho ứng dụng nhận diện tư thế ngồi học
 *         sử dụng Teachable Machine Pose của Google.
 * ============================================================
 */

// ============================================================
// PHẦN 1: CẤU HÌNH — Thay URL model của bạn vào đây
// ============================================================

/**
 * HƯỚNG DẪN LẤY MODEL URL:
 * 1. Vào teachablemachine.withgoogle.com
 * 2. Tạo dự án Pose → Train → Export Model → Upload
 * 3. Sao chép URL (kết thúc bằng /)
 * 4. Dán vào biến MODEL_URL bên dưới
 */
const MODEL_URL = "https://teachablemachine.withgoogle.com/models/THAY_URL_CUA_BAN/";
// Ví dụ: "https://teachablemachine.withgoogle.com/models/abc123XYZ/"

// ---- Cấu hình tư thế ----
// QUAN TRỌNG: Thứ tự và tên phải khớp CHÍNH XÁC với nhãn trong Teachable Machine
const POSE_CONFIG = {
  "Ngồi đúng":    { icon: "✅", barClass: "good",  isGood: true  },
  "Cúi đầu":      { icon: "🙇", barClass: "bad-1", isGood: false },
  "Vẹo lưng":     { icon: "↩️", barClass: "bad-2", isGood: false },
  "Mắt quá gần":  { icon: "👀", barClass: "bad-3", isGood: false },
};

// ---- Cấu hình cảnh báo ----
const BAD_POSE_ALERT_SECONDS = 30; // Cảnh báo sau bao nhiêu giây ngồi sai liên tục

// ---- Cấu hình Pomodoro ----
const POMODORO_WORK_MINUTES  = 25; // Thời gian tập trung
const POMODORO_BREAK_MINUTES = 5;  // Thời gian nghỉ

// ============================================================
// PHẦN 2: BIẾN TOÀN CỤC (State của ứng dụng)
// ============================================================

let model, webcam, ctx;   // Model AI, webcam, và canvas context
let isRunning = false;    // App có đang chạy không

// --- State Timer cảnh báo ---
let badPoseTimer = 0;     // Bộ đếm giây tư thế sai (tăng mỗi giây)
let badPoseInterval = null; // ID của setInterval cho timer

// --- State Thống kê ---
let stats = {
  totalSeconds: 0,        // Tổng số giây đã đo
  goodSeconds: 0,         // Số giây ngồi đúng
  badSeconds: 0,          // Số giây ngồi sai
  alertCount: 0,          // Số lần cảnh báo
  sessionStartTime: null, // Thời điểm bắt đầu phiên
};

// --- State Pomodoro ---
let pomodoroInterval = null;
let pomodoroSeconds = POMODORO_WORK_MINUTES * 60;
let pomodoroIsWork = true; // true = đang học, false = đang nghỉ
let pomodoroIsRunning = false;
let pomodoroCycles = 0;

// --- State cho biểu đồ ---
let doughnutChart, lineChart;
// Mảng lưu tỷ lệ % từng tư thế để vẽ biểu đồ tròn
let chartData = { labels: [], data: [], colors: [] };
// Dữ liệu biểu đồ đường (lịch sử theo thời gian)
let lineChartLabels = [];
let lineChartData = [];  // Lưu % "ngồi đúng" theo thời gian
let lineDataInterval = null;

// --- Lưu tư thế hiện tại ---
let currentPoseName = "";
let currentPoseIsGood = true;

// ============================================================
// PHẦN 3: KHỞI ĐỘNG VÀ DỪNG ỨNG DỤNG
// ============================================================

/**
 * startApp() — Khởi động camera và model AI
 * Gọi khi người dùng nhấn nút "Bắt đầu"
 */
async function startApp() {
  updateStatus("Đang tải model AI...", "");
  try {
    // Bước 1: Tải model từ Teachable Machine
    const modelURL     = MODEL_URL + "model.json";
    const metadataURL  = MODEL_URL + "metadata.json";
    model = await tmPose.load(modelURL, metadataURL);
    console.log("✅ Model AI đã tải xong!");

    // Bước 2: Khởi động webcam
    // tmPose.Webcam(width, height, flip_ngang)
    const size = 400;
    webcam = new tmPose.Webcam(size, size, true);
    await webcam.setup();   // Xin quyền truy cập camera
    await webcam.play();    // Bắt đầu phát camera

    // Bước 3: Thiết lập canvas để vẽ hình ảnh
    const canvas = document.getElementById("canvas");
    canvas.width  = size;
    canvas.height = size;
    ctx = canvas.getContext("2d");

    // Bước 4: Ẩn overlay "chờ khởi động"
    document.getElementById("camera-overlay").classList.add("hidden");

    // Bước 5: Khởi tạo giao diện
    initPoseResultBars();
    initCharts();

    // Bước 6: Bắt đầu đo thống kê và vẽ biểu đồ đường
    stats.sessionStartTime = new Date();
    startStatTracking();
    startLineChartTracking();

    // Bước 7: Cập nhật nút bấm
    document.getElementById("btn-start").classList.add("hidden");
    document.getElementById("btn-stop").classList.remove("hidden");

    isRunning = true;
    updateStatus("Đang nhận diện...", "active");

    // Bước 8: Vào vòng lặp nhận diện chính
    window.requestAnimationFrame(predictionLoop);

  } catch (err) {
    console.error("❌ Lỗi khởi động:", err);
    updateStatus("Lỗi! Kiểm tra URL model.", "");
    alert("Không thể khởi động!\n\nLý do: " + err.message + "\n\nHãy kiểm tra:\n1. URL model trong biến MODEL_URL\n2. Cho phép truy cập camera");
  }
}

/**
 * stopApp() — Dừng camera và model
 */
function stopApp() {
  isRunning = false;
  if (webcam) webcam.stop();
  clearInterval(badPoseInterval);
  clearInterval(lineDataInterval);
  document.getElementById("btn-start").classList.remove("hidden");
  document.getElementById("btn-stop").classList.add("hidden");
  document.getElementById("camera-overlay").classList.remove("hidden");
  document.querySelector(".camera-overlay .overlay-content p").textContent = "Đã dừng. Nhấn Bắt đầu để tiếp tục.";
  updateStatus("Đã dừng", "");
  resetBadPoseTimer();
}

// ============================================================
// PHẦN 4: VÒNG LẶP NHẬN DIỆN CHÍNH (Chạy ~30 lần/giây)
// ============================================================

/**
 * predictionLoop() — Hàm chạy liên tục
 * Mỗi frame: cập nhật webcam → nhận diện → cập nhật UI
 */
async function predictionLoop() {
  if (!isRunning) return; // Dừng vòng lặp nếu app đã stop

  // 1. Cập nhật frame webcam
  webcam.update();

  // 2. Dự đoán tư thế từ frame hiện tại
  await predict();

  // 3. Yêu cầu vẽ frame tiếp theo (vòng lặp animation)
  window.requestAnimationFrame(predictionLoop);
}

/**
 * predict() — Gọi model AI để nhận diện tư thế
 */
async function predict() {
  // Teachable Machine trả về:
  // - pose: thông tin các điểm khớp trên cơ thể (keypoints)
  // - posenetOutput: tensor đặc trưng dùng cho model
  const { pose, posenetOutput } = await model.estimatePose(webcam.canvas);

  // Dự đoán xác suất từng tư thế
  const prediction = await model.predict(posenetOutput);

  // Vẽ khung xương (skeleton) lên canvas
  drawPose(pose);

  // Cập nhật giao diện với kết quả
  updateUI(prediction);
}

/**
 * drawPose() — Vẽ điểm khớp và đường xương lên canvas
 */
function drawPose(pose) {
  if (!webcam || !ctx) return;

  // Vẽ ảnh từ webcam làm nền
  ctx.drawImage(webcam.canvas, 0, 0);

  // Nếu nhận diện được người, vẽ khung xương
  if (pose) {
    const minPartConfidence = 0.5; // Chỉ vẽ điểm có độ tin cậy > 50%
    tmPose.drawKeypoints(pose.keypoints, minPartConfidence, ctx);
    tmPose.drawSkeleton(pose.keypoints, minPartConfidence, ctx);
  }
}

// ============================================================
// PHẦN 5: CẬP NHẬT GIAO DIỆN
// ============================================================

/**
 * updateUI() — Cập nhật tất cả các phần giao diện
 * @param {Array} prediction - Mảng [{className, probability}, ...]
 */
function updateUI(prediction) {
  // Tìm tư thế có xác suất cao nhất
  let maxProb = 0;
  let maxPose = prediction[0];

  prediction.forEach(p => {
    if (p.probability > maxProb) {
      maxProb = p.probability;
      maxPose = p;
    }
  });

  const poseName   = maxPose.className;
  const poseConf   = Math.round(maxPose.probability * 100);
  const poseInfo   = POSE_CONFIG[poseName] || { icon: "❓", isGood: true };
  const isGoodPose = poseInfo.isGood;

  // Lưu tư thế hiện tại vào biến global
  currentPoseName  = poseName;
  currentPoseIsGood = isGoodPose;

  // --- Cập nhật hiển thị tư thế lớn ---
  const display = document.querySelector(".current-pose-display");
  document.getElementById("pose-icon").textContent       = poseInfo.icon || "❓";
  document.getElementById("pose-name").textContent       = poseName;
  document.getElementById("pose-confidence").textContent = poseConf + "%";

  display.classList.remove("state-good", "state-bad");
  display.classList.add(isGoodPose ? "state-good" : "state-bad");

  // Cập nhật đèn trạng thái header
  const dot = document.getElementById("status-dot");
  dot.className = "status-dot " + (isGoodPose ? "active" : "warning");

  // --- Cập nhật các thanh % ---
  prediction.forEach(p => {
    const pct = Math.round(p.probability * 100);
    const fillEl = document.getElementById("bar-fill-" + sanitizeId(p.className));
    const pctEl  = document.getElementById("bar-pct-"  + sanitizeId(p.className));
    if (fillEl) fillEl.style.width = pct + "%";
    if (pctEl)  pctEl.textContent  = pct + "%";
  });

  // --- Xử lý timer cảnh báo ---
  if (!isGoodPose) {
    startBadPoseTimer(poseName);
  } else {
    resetBadPoseTimer();
  }
}

// ============================================================
// PHẦN 6: LOGIC TIMER CẢNH BÁO 30 GIÂY
// ============================================================

/**
 * startBadPoseTimer() — Bắt đầu đếm ngược khi phát hiện tư thế sai
 * Logic: Chỉ cảnh báo nếu giữ nguyên tư thế sai LIÊN TỤC 30 giây
 */
function startBadPoseTimer(poseName) {
  // Nếu timer chưa chạy, bắt đầu chạy
  if (!badPoseInterval) {
    badPoseInterval = setInterval(() => {
      badPoseTimer++;

      // Cập nhật thanh tiến độ
      const percentage = (badPoseTimer / BAD_POSE_ALERT_SECONDS) * 100;
      document.getElementById("timer-bar").style.width = percentage + "%";
      document.getElementById("timer-countdown").textContent =
        badPoseTimer + " / " + BAD_POSE_ALERT_SECONDS + " giây";

      // Khi đếm đủ 30 giây → kích hoạt cảnh báo!
      if (badPoseTimer >= BAD_POSE_ALERT_SECONDS) {
        triggerAlert(poseName);
        resetBadPoseTimer(); // Reset timer sau khi đã cảnh báo
      }
    }, 1000); // Chạy mỗi 1 giây
  }
}

/**
 * resetBadPoseTimer() — Reset bộ đếm về 0
 * Gọi khi: người dùng ngồi đúng / đã cảnh báo xong / dừng app
 */
function resetBadPoseTimer() {
  clearInterval(badPoseInterval);
  badPoseInterval = null;
  badPoseTimer = 0;
  document.getElementById("timer-bar").style.width = "0%";
  document.getElementById("timer-countdown").textContent = "0 / " + BAD_POSE_ALERT_SECONDS + " giây";
}

/**
 * triggerAlert() — Phát cảnh báo: Popup + Âm thanh
 */
function triggerAlert(poseName) {
  stats.alertCount++;
  updateStatDisplay();

  // Cập nhật nội dung popup
  document.getElementById("alert-title").textContent   = "⚠️ Cảnh báo Tư thế!";
  document.getElementById("alert-message").textContent =
    "Bạn đang " + poseName.toLowerCase() + " trong " + BAD_POSE_ALERT_SECONDS + " giây liên tục!\nHãy điều chỉnh và ngồi thẳng lưng.";

  // Hiện popup
  document.getElementById("alert-overlay").classList.remove("hidden");

  // Phát âm thanh tiếng chuông nhẹ bằng Web Audio API
  playAlertSound();

  // Thêm vào nhật ký
  addAlertLog(poseName);
}

/**
 * closeAlert() — Đóng popup cảnh báo
 */
function closeAlert() {
  document.getElementById("alert-overlay").classList.add("hidden");
}

/**
 * playAlertSound() — Tạo âm thanh chuông nhẹ bằng Web Audio API
 * Không cần file âm thanh, tạo động bằng code
 */
function playAlertSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // Cài đặt âm thanh: giống chuông nhẹ
    oscillator.type = "sine"; // Dạng sóng hình sin (mềm mại)
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);         // Nốt A5
    oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.5); // Giảm xuống A4

    // Fade in → hold → fade out
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.0);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 1.0);
  } catch (e) {
    console.warn("Không thể phát âm thanh:", e);
  }
}

// ============================================================
// PHẦN 7: THỐNG KÊ PHIÊN
// ============================================================

/**
 * startStatTracking() — Theo dõi thống kê mỗi giây
 */
function startStatTracking() {
  setInterval(() => {
    if (!isRunning) return;
    stats.totalSeconds++;

    // Cập nhật đồng hồ phiên (góc trên)
    updateSessionClock();

    if (currentPoseIsGood) {
      stats.goodSeconds++;
    } else {
      stats.badSeconds++;
    }

    updateStatDisplay();
    updateDoughnutChart();
  }, 1000);
}

/**
 * updateStatDisplay() — Cập nhật 3 số liệu thống kê
 */
function updateStatDisplay() {
  const goodPct = stats.totalSeconds > 0
    ? Math.round((stats.goodSeconds / stats.totalSeconds) * 100) : 0;
  const badPct  = 100 - goodPct;

  document.getElementById("stat-good").textContent   = goodPct + "%";
  document.getElementById("stat-bad").textContent    = badPct  + "%";
  document.getElementById("stat-alerts").textContent = stats.alertCount;
}

/**
 * updateSessionClock() — Cập nhật đồng hồ phiên ở header
 */
function updateSessionClock() {
  const elapsed = stats.totalSeconds;
  const h = Math.floor(elapsed / 3600).toString().padStart(2, "0");
  const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, "0");
  const s = (elapsed % 60).toString().padStart(2, "0");
  document.getElementById("session-time").textContent = "Phiên: " + h + ":" + m + ":" + s;
}

/**
 * updateStatus() — Cập nhật trạng thái ở header
 */
function updateStatus(text, dotClass) {
  document.getElementById("status-label").textContent = text;
  const dot = document.getElementById("status-dot");
  dot.className = "status-dot " + dotClass;
}

/**
 * addAlertLog() — Thêm một dòng vào nhật ký cảnh báo
 */
function addAlertLog(poseName) {
  const logEl = document.getElementById("alert-log");
  const emptyEl = logEl.querySelector(".log-empty");
  if (emptyEl) emptyEl.remove();

  const now = new Date();
  const timeStr = now.getHours().toString().padStart(2,"0") + ":" +
                  now.getMinutes().toString().padStart(2,"0") + ":" +
                  now.getSeconds().toString().padStart(2,"0");

  const item = document.createElement("div");
  item.className = "log-item";
  item.innerHTML =
    '<span>' + poseName + '</span>' +
    '<span class="log-time">' + timeStr + '</span>';

  logEl.insertBefore(item, logEl.firstChild); // Thêm vào đầu (mới nhất trên cùng)
}

// ============================================================
// PHẦN 8: BIỂU ĐỒ (Chart.js)
// ============================================================

/**
 * initCharts() — Khởi tạo hai biểu đồ
 */
function initCharts() {
  initDoughnutChart();
  initLineChart();
}

/**
 * initDoughnutChart() — Biểu đồ tròn: tỷ lệ các tư thế
 */
function initDoughnutChart() {
  const labels = Object.keys(POSE_CONFIG);
  const colors = ["#00ff88", "#ff4757", "#ffd700", "#ff6b35"];

  // Lưu để dùng trong legend và update
  chartData.labels = labels;
  chartData.colors = colors;

  const ctx = document.getElementById("doughnut-chart").getContext("2d");

  doughnutChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [{
        data: [1, 0, 0, 0], // Dữ liệu ban đầu
        backgroundColor: colors,
        borderColor: "#111827",
        borderWidth: 3,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      cutout: "65%",
      plugins: {
        legend: { display: false }, // Tự vẽ legend bên dưới
        tooltip: {
          callbacks: {
            label: (ctx) => " " + ctx.label + ": " + ctx.parsed.toFixed(1) + "%"
          }
        }
      }
    }
  });

  // Vẽ legend tự tạo (đẹp hơn legend mặc định)
  const legendEl = document.getElementById("chart-legend");
  labels.forEach((label, i) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML =
      '<div class="legend-dot" style="background:' + colors[i] + '"></div>' +
      '<span>' + label + '</span>';
    legendEl.appendChild(item);
  });
}

/**
 * updateDoughnutChart() — Cập nhật dữ liệu biểu đồ tròn
 */
function updateDoughnutChart() {
  if (!doughnutChart || stats.totalSeconds === 0) return;

  // Tạm thời: tỷ lệ đơn giản good/bad (có thể mở rộng cho từng loại)
  const goodPct = (stats.goodSeconds / stats.totalSeconds) * 100;
  const badPct  = stats.totalSeconds > 0 ? 100 - goodPct : 0;

  // Phân chia badPct đều cho 3 loại tư thế sai (đơn giản hóa)
  doughnutChart.data.datasets[0].data = [
    goodPct,
    badPct / 3,
    badPct / 3,
    badPct / 3
  ];
  doughnutChart.update("none"); // Cập nhật không animation để tránh giật
}

/**
 * initLineChart() — Biểu đồ đường: lịch sử % ngồi đúng theo thời gian
 */
function initLineChart() {
  const ctx = document.getElementById("line-chart").getContext("2d");

  lineChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: lineChartLabels,
      datasets: [{
        label: "% Ngồi đúng",
        data: lineChartData,
        borderColor: "#00ff88",
        backgroundColor: "rgba(0,255,136,0.1)",
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        pointBackgroundColor: "#00ff88",
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0, max: 100,
          ticks: { color: "#7986a3", font: { size: 10 }, callback: v => v + "%" },
          grid:  { color: "rgba(255,255,255,0.05)" },
        },
        x: {
          ticks: { color: "#7986a3", font: { size: 9 }, maxRotation: 0 },
          grid:  { color: "rgba(255,255,255,0.05)" },
        }
      },
      plugins: {
        legend: { display: false },
      }
    }
  });
}

/**
 * startLineChartTracking() — Cập nhật biểu đồ đường mỗi 5 giây
 */
function startLineChartTracking() {
  lineDataInterval = setInterval(() => {
    if (!isRunning) return;

    // Tính % ngồi đúng tại thời điểm này
    const goodPct = stats.totalSeconds > 0
      ? Math.round((stats.goodSeconds / stats.totalSeconds) * 100) : 0;

    // Nhãn thời gian (phút:giây)
    const elapsed = stats.totalSeconds;
    const m = Math.floor(elapsed / 60).toString().padStart(2,"0");
    const s = (elapsed % 60).toString().padStart(2,"0");

    lineChartLabels.push(m + ":" + s);
    lineChartData.push(goodPct);

    // Chỉ giữ 20 điểm gần nhất để biểu đồ không bị chật
    if (lineChartLabels.length > 20) {
      lineChartLabels.shift();
      lineChartData.shift();
    }

    lineChart.update("none");
  }, 5000); // Mỗi 5 giây cập nhật một lần
}

// ============================================================
// PHẦN 9: POMODORO TIMER
// ============================================================

/**
 * togglePomodoro() — Bật/tắt Pomodoro
 */
function togglePomodoro() {
  if (pomodoroIsRunning) {
    // Đang chạy → Pause
    clearInterval(pomodoroInterval);
    pomodoroIsRunning = false;
    document.getElementById("btn-pomo-start").textContent = "▶ Tiếp tục";
  } else {
    // Chưa chạy → Start
    pomodoroIsRunning = true;
    document.getElementById("btn-pomo-start").textContent = "⏸ Pause";

    pomodoroInterval = setInterval(() => {
      pomodoroSeconds--;

      if (pomodoroSeconds <= 0) {
        // Hết giờ! Chuyển phase
        clearInterval(pomodoroInterval);
        pomodoroIsRunning = false;

        if (pomodoroIsWork) {
          // Hết giờ làm → Nghỉ 5 phút
          pomodoroCycles++;
          document.getElementById("pomo-cycles").textContent = pomodoroCycles;
          pomodoroIsWork = false;
          pomodoroSeconds = POMODORO_BREAK_MINUTES * 60;
          playPomodoroSound("break");
          // Hiện thông báo nghỉ
          showPomodoroAlert("🎉 Nghỉ ngơi 5 phút!", "Bạn đã học được 25 phút. Đứng dậy vận động và thư giãn mắt nhé!");
        } else {
          // Hết giờ nghỉ → Học tiếp
          pomodoroIsWork = true;
          pomodoroSeconds = POMODORO_WORK_MINUTES * 60;
          playPomodoroSound("work");
          showPomodoroAlert("📚 Bắt đầu phiên học mới!", "Hết giờ nghỉ. Bắt đầu 25 phút học tập trung!");
        }

        updatePomodoroDisplay();
        document.getElementById("btn-pomo-start").textContent = "▶ Bắt đầu";
        return;
      }

      updatePomodoroDisplay();
    }, 1000);
  }
}

/**
 * resetPomodoro() — Reset Pomodoro về trạng thái ban đầu
 */
function resetPomodoro() {
  clearInterval(pomodoroInterval);
  pomodoroIsRunning = false;
  pomodoroIsWork = true;
  pomodoroSeconds = POMODORO_WORK_MINUTES * 60;
  updatePomodoroDisplay();
  document.getElementById("btn-pomo-start").textContent = "▶ Bắt đầu";
}

/**
 * updatePomodoroDisplay() — Cập nhật hiển thị đồng hồ Pomodoro
 */
function updatePomodoroDisplay() {
  const m = Math.floor(pomodoroSeconds / 60).toString().padStart(2, "0");
  const s = (pomodoroSeconds % 60).toString().padStart(2, "0");
  document.getElementById("pomodoro-time").textContent  = m + ":" + s;
  document.getElementById("pomodoro-phase").textContent =
    pomodoroIsWork ? "🎯 Tập trung học" : "☕ Nghỉ ngơi";

  // Đổi màu theo phase
  const timeEl = document.getElementById("pomodoro-time");
  timeEl.style.color = pomodoroIsWork ? "var(--accent-orange)" : "var(--accent-green)";
}

/**
 * showPomodoroAlert() — Hiện popup thông báo Pomodoro
 * Dùng lại popup cảnh báo nhưng với nội dung khác
 */
function showPomodoroAlert(title, message) {
  document.getElementById("alert-title").textContent   = title;
  document.getElementById("alert-message").textContent = message;
  document.getElementById("alert-overlay").classList.remove("hidden");
  playPomodoroSound(pomodoroIsWork ? "work" : "break");
}

/**
 * playPomodoroSound() — Âm thanh thông báo Pomodoro
 */
function playPomodoroSound(type) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const gainNode = audioCtx.createGain();
    gainNode.connect(audioCtx.destination);

    // Phát 3 nốt ngắn (ding-ding-ding)
    const notes = type === "break" ? [523, 659, 784] : [784, 659, 523];
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      osc.connect(gainNode);
      osc.type = "sine";
      osc.frequency.value = freq;

      const t = audioCtx.currentTime + i * 0.25;
      gainNode.gain.setValueAtTime(0.2, t);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

      osc.start(t);
      osc.stop(t + 0.25);
    });
  } catch (e) {
    console.warn("Không thể phát âm thanh Pomodoro:", e);
  }
}

// ============================================================
// PHẦN 10: HÀM KHỞI TẠO GIAO DIỆN
// ============================================================

/**
 * initPoseResultBars() — Tạo các thanh % cho từng tư thế
 * Gọi một lần khi app khởi động
 */
function initPoseResultBars() {
  const container = document.getElementById("pose-results");
  container.innerHTML = ""; // Xóa nội dung cũ

  Object.entries(POSE_CONFIG).forEach(([name, config]) => {
    const id = sanitizeId(name);
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

/**
 * sanitizeId() — Chuyển tên tư thế thành ID hợp lệ (không dấu, không khoảng trắng)
 * Ví dụ: "Cúi đầu" → "Ci-u-u"  (dùng cho id HTML)
 */
function sanitizeId(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/\s+/g, "-");
}

// ============================================================
// PHẦN 11: KHỞI CHẠY KHI TRANG TẢI XONG
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  // Kiểm tra cấu hình model
  if (MODEL_URL.includes("THAY_URL_CUA_BAN")) {
    console.warn("⚠️ Bạn chưa thay URL model! Hãy cập nhật biến MODEL_URL trong script.js");
    document.getElementById("status-label").textContent = "⚠️ Chưa cấu hình Model URL";
    document.getElementById("status-label").style.color = "var(--accent-yellow)";
  }

  // Vẽ biểu đồ trống để giao diện không bị trống
  initCharts();
  updatePomodoroDisplay();

  console.log("🚀 PoseAlert đã khởi động! Nhấn 'Bắt đầu' để sử dụng.");
});
