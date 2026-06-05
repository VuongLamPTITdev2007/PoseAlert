/**
 * ============================================================
 *  PoseAlert — js/app.js
 *  Logic điều phối chính: khởi động/dừng app, vòng lặp nhận diện,
 *  smoothing và khởi chạy khi trang load
 *  Phụ thuộc: tất cả các module còn lại
 * ============================================================
 */

// ============================================================
// KHỞI ĐỘNG & DỪNG ỨNG DỤNG
// ============================================================

/**
 * startApp()
 * Được gọi khi người dùng nhấn nút "▶ Bắt đầu".
 * Thứ tự: hiện loading → tải MoveNet → bật camera → thiết lập canvas → khởi UI → vào vòng lặp
 */
async function startApp() {
  const loadingEl = document.getElementById("ai-loading");
  const overlayEl = document.getElementById("camera-overlay");
  const barEl     = document.getElementById("ai-loading-bar");
  const labelEl   = document.getElementById("ai-loading-label");
  const subEl     = document.getElementById("ai-loading-sub");

  // Helpers cập nhật UI loading
  const setLabel = (text, sub) => {
    labelEl.textContent = text;
    if (sub !== undefined) subEl.textContent = sub;
  };
  const setBar = pct => { barEl.style.width = pct + "%"; };
  const setStep = (id, state) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = "ai-step " + state;
    const icons = { done: "✅", active: "⏳", "": "⬜" };
    el.textContent = el.textContent.replace(/^[✅⏳⬜]\s/, (icons[state] || "⬜") + " ");
  };

  // Ẩn overlay mặc định, hiện loading
  overlayEl.classList.add("hidden");
  loadingEl.classList.remove("hidden");
  setBar(5);
  updateStatus("Đang tải model AI...", "");

  try {
    // ── BƯỚC 1: TensorFlow.js + MoveNet detector ──
    setStep("step-tfjs", "active");
    setLabel("Khởi tạo TensorFlow.js...", "Có thể mất 5 – 10 giây lần đầu");

    detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
    );
    console.log("✅ MoveNet model đã tải xong!");

    setStep("step-tfjs", "done");
    setBar(38);

    // ── BƯỚC 2: Nạp trọng số model (hoàn tất cùng detector, dừng nhịp UI) ──
    setStep("step-model", "active");
    setLabel("Nạp trọng số mô hình...", "Đang xử lý...");
    await new Promise(r => setTimeout(r, 320));
    setStep("step-model", "done");
    setBar(65);

    // ── BƯỚC 3: Khởi động camera ──
    setStep("step-cam", "active");
    setLabel("Kết nối camera...", "Hãy cho phép truy cập camera");

    video       = document.getElementById("webcam-video");
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false,
    });
    video.srcObject = mediaStream;

    await new Promise(resolve => {
      video.onloadedmetadata = () => { video.play(); resolve(); };
    });
    console.log("✅ Camera đã khởi động!");

    setStep("step-cam", "done");
    setBar(100);
    setLabel("Sẵn sàng!", "");

    // Dừng nhịp để người dùng thấy trạng thái "Sẵn sàng"
    await new Promise(r => setTimeout(r, 420));

    // Ẩn loading
    loadingEl.classList.add("hidden");

    // ── Thiết lập canvas ──
    const canvas  = document.getElementById("canvas");
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    ctx           = canvas.getContext("2d");

    // ── Khởi tạo UI & biểu đồ ──
    initPoseResultBars();
    initCharts();

    // ── Bắt đầu thống kê ──
    stats.sessionStartTime = new Date();
    startStatTracking();
    startLineChartTracking();

    // ── Đổi nút Bắt đầu → Dừng ──
    document.getElementById("btn-start").classList.add("hidden");
    document.getElementById("btn-stop").classList.remove("hidden");

    // ── Vào vòng lặp nhận diện ──
    poseHistory = [];
    isRunning   = true;
    updateStatus("Đang nhận diện...", "active");

    // Cập nhật trạng thái "đang học" trên Firebase
    updateOnlineStatus('studying', 'Đang tập trung');
    sessionStartTime = Date.now();

    window.requestAnimationFrame(predictionLoop);

  } catch (err) {
    console.error("❌ Lỗi khởi động:", err);

    // Reset icon các bước còn đang "active"
    ["step-tfjs", "step-model", "step-cam"].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.classList.contains("active")) setStep(id, "");
    });

    // Ẩn loading, hiện lại overlay với thông báo lỗi thân thiện
    loadingEl.classList.add("hidden");
    overlayEl.classList.remove("hidden");

    let errMsg = "Có lỗi xảy ra. Hãy thử lại.";
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      errMsg = "Bạn đã từ chối quyền camera.\nVào Settings trình duyệt để cấp lại quyền.";
    } else if (err.name === "NotFoundError") {
      errMsg = "Không tìm thấy camera.\nHãy kết nối webcam và thử lại.";
    } else if (!navigator.onLine) {
      errMsg = "Không có kết nối internet.\nModel AI cần tải lần đầu qua mạng.";
    } else {
      errMsg = "Lỗi: " + err.message;
    }

    const iconEl = document.querySelector(".camera-overlay .overlay-content .big-icon");
    const msgEl  = document.querySelector(".camera-overlay .overlay-content p");
    if (iconEl) iconEl.textContent = "❌";
    if (msgEl)  msgEl.textContent  = errMsg;

    updateStatus("Lỗi khởi động", "");
  }
}

/**
 * stopApp()
 * Dừng camera, vòng lặp và các interval.
 */
function stopApp() {
  isRunning = false;

  // Lưu phiên học lên Firebase trước khi reset
  autoSaveSession();

  // Cập nhật trạng thái về "online" (không còn "studying")
  updateOnlineStatus('online', 'Rảnh');
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  if (video) video.srcObject = null;

  clearInterval(badPoseInterval);
  clearInterval(lineDataInterval);
  resetBadPoseTimer();

  document.getElementById("btn-start").classList.remove("hidden");
  document.getElementById("btn-stop").classList.add("hidden");
  document.getElementById("camera-overlay").classList.remove("hidden");
  document.querySelector(".camera-overlay .overlay-content p").textContent =
    "Đã dừng. Nhấn Bắt đầu để tiếp tục.";

  updateStatus("Đã dừng", "");
}

// ============================================================
// VÒNG LẶP NHẬN DIỆN (~30 FPS)
// ============================================================

/**
 * predictionLoop()
 * Chạy liên tục qua requestAnimationFrame.
 * Mỗi frame: ước tính pose → vẽ → phân loại → cập nhật UI.
 */
async function predictionLoop() {
  if (!isRunning) return;
  await predict();
  window.requestAnimationFrame(predictionLoop);
}

/**
 * predict()
 * Gọi MoveNet ước tính pose, vẽ frame, rồi phân loại tư thế.
 */
async function predict() {
  if (!detector || !video || video.readyState < 2) return;

  try {
    const poses = await detector.estimatePoses(video);

    // Vẽ camera + skeleton lên canvas
    drawFrame(poses);

    // Phân loại và cập nhật UI nếu phát hiện người
    if (poses.length > 0) {
      const raw      = classifyPose(poses[0].keypoints);
      const smoothed = smoothPoseResult(raw);
      updateUI(buildPrediction(smoothed));

      // Đồng bộ trạng thái tư thế lên phòng học ảo
      const isGood = smoothed.name === 'Ngồi đúng ✅';
      updateOnlineStatus(
        isGood ? 'studying' : 'warning',
        smoothed.name
      );
    }
  } catch (err) {
    console.error("❌ Lỗi trong vòng lặp nhận diện:", err);
    // Tiếp tục chạy, không dừng app
  }
}

// ============================================================
// SMOOTHING & FORMAT PREDICTION
// ============================================================

/**
 * smoothPoseResult(result) → { name, confidence }
 * Majority vote trên N frame gần nhất để tránh nhấp nháy.
 */
function smoothPoseResult(result) {
  poseHistory.push(result);
  if (poseHistory.length > POSE_SMOOTHING_FRAMES) poseHistory.shift();

  // Đếm số lần xuất hiện mỗi tư thế
  const counts = {};
  poseHistory.forEach(r => { counts[r.name] = (counts[r.name] || 0) + 1; });

  // Tìm tư thế xuất hiện nhiều nhất
  let dominantPose = result.name;
  let maxCount     = 0;
  Object.entries(counts).forEach(([name, count]) => {
    if (count > maxCount) { maxCount = count; dominantPose = name; }
  });

  // Confidence trung bình của tư thế dominant
  const dominantResults = poseHistory.filter(r => r.name === dominantPose);
  const avgConf = dominantResults.reduce((sum, r) => sum + r.confidence, 0) / dominantResults.length;

  return { name: dominantPose, confidence: avgConf };
}

/**
 * buildPrediction(result) → [{className, probability}, ...]
 * Chuyển kết quả smoothed thành định dạng mảng cho updateUI().
 */
function buildPrediction(result) {
  const poseNames    = Object.keys(POSE_CONFIG);
  const remainingProb = (1 - result.confidence) / Math.max(1, poseNames.length - 1);

  return poseNames.map(name => ({
    className:   name,
    probability: name === result.name ? result.confidence : remainingProb,
  }));
}

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

/**
 * Global error handler cách ly các lỗi chưa bắt được
 */
window.addEventListener("error", (event) => {
  console.error("🚨 GLOBAL ERROR:", event.error);
  console.error("Stack:", event.error?.stack);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("🚨 UNHANDLED PROMISE REJECTION:", event.reason);
});

// ============================================================
// KHỞI CHẠY KHI TRANG TẢI XONG
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  try {
    initCharts();            // Vẽ biểu đồ trống
    updatePomodoroDisplay(); // Hiển thị Pomodoro ban đầu (25:00)
    initAuth();              // Khởi tạo Firebase Auth listener

    console.log("🚀 PoseAlert đã khởi động! (MoveNet Pose Estimation)");
    console.log("📋 Nhấn 'Bắt đầu' để sử dụng — không cần URL model!");
  } catch (err) {
    console.error("🚨 Lỗi khởi động DOMContentLoaded:", err);
  }
});
