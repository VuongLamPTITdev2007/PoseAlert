/**
 * ============================================================
 *  PoseAlert — script.js
 *  Tác giả: [Vương Lâm]
 *  Mô tả: Logic chính cho ứng dụng nhận diện tư thế ngồi học
 *         sử dụng TensorFlow.js MoveNet Pose Estimation.
 *         Phân loại tư thế bằng thuật toán hình học trên keypoints.
 * ============================================================
 */

// ============================================================
// PHẦN 1: CẤU HÌNH
// ============================================================

// ---- Cấu hình tư thế ----
// Mỗi tư thế có icon, class CSS cho thanh %, và cờ isGood
const POSE_CONFIG = {
  "Ngồi đúng":    { icon: "✅", barClass: "good",  isGood: true  },
  "Cúi đầu":      { icon: "🙇", barClass: "bad-1", isGood: false },
  "Vẹo lưng":     { icon: "↩️", barClass: "bad-2", isGood: false },
  "Mắt quá gần":  { icon: "👀", barClass: "bad-3", isGood: false },
};

// ---- Ngưỡng phát hiện tư thế sai ----
// Có thể điều chỉnh các giá trị này để phù hợp với góc camera
const POSE_THRESHOLDS = {
  headBowRatio: 0.5,         // Cúi đầu khi (khoảng cách mũi-vai / rộng vai) < ngưỡng
  shoulderTiltAngle: 12,     // Vẹo vai khi góc nghiêng > ngưỡng (độ)
  lateralOffsetRatio: 0.3,   // Nghiêng người khi lệch ngang vai-hông > ngưỡng
  faceCloseRatio: 0.40,      // Mắt quá gần khi rộng mặt / rộng canvas > ngưỡng
  minKeypointScore: 0.3,     // Độ tin cậy tối thiểu của keypoint
};

// ---- Cấu hình cảnh báo ----
const BAD_POSE_ALERT_SECONDS = 30; // Cảnh báo sau bao nhiêu giây ngồi sai liên tục

// ---- Cấu hình Pomodoro ----
const POMODORO_WORK_MINUTES  = 25; // Thời gian tập trung
const POMODORO_BREAK_MINUTES = 5;  // Thời gian nghỉ

// ---- Kết nối khung xương (17 keypoints COCO) ----
// Mỗi cặp [i, j] = đường nối giữa keypoint thứ i và j
const SKELETON_CONNECTIONS = [
  [0, 1], [0, 2], [1, 3], [2, 4],     // Đầu
  [5, 6],                               // Vai
  [5, 7], [7, 9],                       // Tay trái
  [6, 8], [8, 10],                      // Tay phải
  [5, 11], [6, 12],                     // Thân
  [11, 12],                              // Hông
  [11, 13], [13, 15],                    // Chân trái
  [12, 14], [14, 16],                    // Chân phải
];

// ============================================================
// PHẦN 2: BIẾN TOÀN CỤC (State của ứng dụng)
// ============================================================

let detector, video, ctx;    // MoveNet detector, video element, canvas context
let isRunning = false;       // App có đang chạy không
let mediaStream = null;      // MediaStream từ camera (để dừng khi cần)

// --- State Timer cảnh báo ---
let badPoseTimer = 0;        // Bộ đếm giây tư thế sai (tăng mỗi giây)
let badPoseInterval = null;  // ID của setInterval cho timer

// --- State Thống kê ---
let stats = {
  totalSeconds: 0,           // Tổng số giây đã đo
  goodSeconds: 0,            // Số giây ngồi đúng
  badSeconds: 0,             // Số giây ngồi sai
  alertCount: 0,             // Số lần cảnh báo
  sessionStartTime: null,    // Thời điểm bắt đầu phiên
};

// --- State Pomodoro ---
let pomodoroInterval = null;
let pomodoroSeconds = POMODORO_WORK_MINUTES * 60;
let pomodoroIsWork = true;   // true = đang học, false = đang nghỉ
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

// --- Smoothing: Tránh nhấp nháy tư thế giữa các frame ---
let poseHistory = [];              // Buffer lưu kết quả N frame gần nhất
const POSE_SMOOTHING_FRAMES = 5;   // Số frame để smoothing

// ============================================================
// PHẦN 3: KHỞI ĐỘNG VÀ DỪNG ỨNG DỤNG
// ============================================================

/**
 * startApp() — Khởi động camera và model MoveNet
 * Gọi khi người dùng nhấn nút "Bắt đầu"
 */
async function startApp() {
  updateStatus("Đang tải model AI...", "");
  try {
    // Bước 1: Tải MoveNet model (Lightning = nhanh, phù hợp realtime)
    detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
      }
    );
    console.log("✅ MoveNet model đã tải xong!");

    // Bước 2: Khởi động webcam bằng getUserMedia (native browser API)
    video = document.getElementById("webcam-video");
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false,
    });
    video.srcObject = mediaStream;

    // Đợi video sẵn sàng
    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        video.play();
        resolve();
      };
    });
    console.log("✅ Camera đã khởi động!");

    // Bước 3: Thiết lập canvas để vẽ hình ảnh
    const canvas = document.getElementById("canvas");
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
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

    // Reset smoothing buffer
    poseHistory = [];

    isRunning = true;
    updateStatus("Đang nhận diện...", "active");

    // Bước 8: Vào vòng lặp nhận diện chính
    window.requestAnimationFrame(predictionLoop);

  } catch (err) {
    console.error("❌ Lỗi khởi động:", err);
    updateStatus("Lỗi! Kiểm tra camera.", "");
    alert("Không thể khởi động!\n\nLý do: " + err.message + "\n\nHãy kiểm tra:\n1. Cho phép truy cập camera\n2. Kết nối internet để tải model");
  }
}

/**
 * stopApp() — Dừng camera và model
 */
function stopApp() {
  isRunning = false;

  // Dừng camera stream (giải phóng camera)
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  if (video) {
    video.srcObject = null;
  }

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
 * Mỗi frame: nhận diện pose → phân loại tư thế → cập nhật UI
 */
async function predictionLoop() {
  if (!isRunning) return; // Dừng vòng lặp nếu app đã stop

  // Chạy nhận diện
  await predict();

  // Yêu cầu vẽ frame tiếp theo (vòng lặp animation)
  window.requestAnimationFrame(predictionLoop);
}

/**
 * predict() — Gọi MoveNet để nhận diện tư thế
 */
async function predict() {
  // Kiểm tra video đã sẵn sàng chưa
  if (!detector || !video || video.readyState < 2) return;

  // MoveNet trả về mảng poses, mỗi pose có 17 keypoints
  const poses = await detector.estimatePoses(video);

  // Vẽ camera + skeleton lên canvas
  drawFrame(poses);

  // Nếu phát hiện người, phân loại tư thế
  if (poses.length > 0) {
    const keypoints = poses[0].keypoints;

    // Phân loại tư thế bằng thuật toán hình học
    const classification = classifyPose(keypoints);

    // Smoothing: lấy tư thế xuất hiện nhiều nhất trong N frame
    const smoothedResult = smoothPoseResult(classification);

    // Tạo prediction tương thích với updateUI()
    const prediction = buildPrediction(smoothedResult);
    updateUI(prediction);
  }
}

// ============================================================
// PHẦN 4a: PHÂN LOẠI TƯ THẾ BẰNG THUẬT TOÁN HÌNH HỌC
// ============================================================

/**
 * classifyPose() — Phân tích keypoints để xác định tư thế
 * Trả về: { name: "Tên tư thế", confidence: 0.0 - 1.0 }
 *
 * 17 Keypoints (MoveNet COCO):
 *        0-nose
 *       / \
 *    1-L_eye  2-R_eye
 *    3-L_ear  4-R_ear
 *    5-L_shoulder --- 6-R_shoulder
 *    |                |
 *   11-L_hip  ---- 12-R_hip
 */
function classifyPose(keypoints) {
  const minScore = POSE_THRESHOLDS.minKeypointScore;

  // Lấy các keypoint cần thiết
  const nose          = keypoints[0];
  const leftEye       = keypoints[1];
  const rightEye      = keypoints[2];
  const leftEar       = keypoints[3];
  const rightEar      = keypoints[4];
  const leftShoulder  = keypoints[5];
  const rightShoulder = keypoints[6];
  const leftHip       = keypoints[11];
  const rightHip      = keypoints[12];

  // Kiểm tra đủ keypoint quan trọng không
  const hasShoulders = leftShoulder.score > minScore && rightShoulder.score > minScore;
  const hasNose      = nose.score > minScore;
  const hasEyes      = leftEye.score > minScore && rightEye.score > minScore;

  if (!hasShoulders) {
    // Không nhìn thấy vai → không đủ dữ liệu, mặc định ngồi đúng
    return { name: "Ngồi đúng", confidence: 0.5 };
  }

  const canvasWidth = ctx.canvas.width;

  // --- Kiểm tra 1: Mắt quá gần (ưu tiên cao nhất) ---
  if (hasEyes || (leftEar.score > minScore && rightEar.score > minScore)) {
    const tooCloseResult = detectTooClose(keypoints, canvasWidth);
    if (tooCloseResult.detected) {
      return { name: "Mắt quá gần", confidence: tooCloseResult.confidence };
    }
  }

  // --- Kiểm tra 2: Cúi đầu ---
  if (hasNose) {
    const headBowResult = detectHeadBow(keypoints);
    if (headBowResult.detected) {
      return { name: "Cúi đầu", confidence: headBowResult.confidence };
    }
  }

  // --- Kiểm tra 3: Vẹo lưng ---
  const tiltResult = detectSpineTilt(keypoints);
  if (tiltResult.detected) {
    return { name: "Vẹo lưng", confidence: tiltResult.confidence };
  }

  // --- Mặc định: Ngồi đúng ---
  return { name: "Ngồi đúng", confidence: 0.9 };
}

/**
 * detectHeadBow() — Phát hiện cúi đầu
 * Nguyên lý: Khi ngồi thẳng, mũi (nose) ở xa phía trên vai.
 *            Khi cúi đầu, mũi hạ xuống gần hoặc ngang vai.
 * Tính: ratio = (vai.y - mũi.y) / rộng_vai
 *       ratio < ngưỡng → đang cúi đầu
 */
function detectHeadBow(keypoints) {
  const nose          = keypoints[0];
  const leftShoulder  = keypoints[5];
  const rightShoulder = keypoints[6];

  const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);

  if (shoulderWidth < 10) return { detected: false }; // Tránh chia cho 0

  // Khoảng cách dọc: vai.y - mũi.y (dương = mũi ở trên vai)
  const verticalDiff = midShoulderY - nose.y;
  const ratio = verticalDiff / shoulderWidth;

  const threshold = POSE_THRESHOLDS.headBowRatio;
  if (ratio < threshold) {
    // Confidence tỷ lệ thuận với mức vi phạm
    const confidence = Math.min(0.95, 0.6 + (threshold - ratio) * 0.5);
    return { detected: true, confidence, ratio };
  }

  return { detected: false, ratio };
}

/**
 * detectSpineTilt() — Phát hiện vẹo lưng / nghiêng người
 * Nguyên lý 1: Hai vai không cân bằng → góc nghiêng vai > ngưỡng
 * Nguyên lý 2: Trung tâm vai lệch ngang so với trung tâm hông
 */
function detectSpineTilt(keypoints) {
  const leftShoulder  = keypoints[5];
  const rightShoulder = keypoints[6];
  const leftHip       = keypoints[11];
  const rightHip      = keypoints[12];
  const minScore      = POSE_THRESHOLDS.minKeypointScore;

  // Góc nghiêng vai
  const shoulderDy = Math.abs(leftShoulder.y - rightShoulder.y);
  const shoulderDx = Math.abs(leftShoulder.x - rightShoulder.x);
  const shoulderTiltAngle = Math.atan2(shoulderDy, shoulderDx) * (180 / Math.PI);

  if (shoulderTiltAngle > POSE_THRESHOLDS.shoulderTiltAngle) {
    const confidence = Math.min(0.95, 0.6 + (shoulderTiltAngle - POSE_THRESHOLDS.shoulderTiltAngle) * 0.02);
    return { detected: true, confidence, angle: shoulderTiltAngle };
  }

  // Nếu thấy hông: kiểm tra lệch ngang thân
  if (leftHip.score > minScore && rightHip.score > minScore) {
    const midShoulderX  = (leftShoulder.x + rightShoulder.x) / 2;
    const midHipX       = (leftHip.x + rightHip.x) / 2;
    const lateralOffset = Math.abs(midShoulderX - midHipX);
    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);

    if (shoulderWidth > 10) {
      const offsetRatio = lateralOffset / shoulderWidth;
      if (offsetRatio > POSE_THRESHOLDS.lateralOffsetRatio) {
        const confidence = Math.min(0.95, 0.6 + (offsetRatio - POSE_THRESHOLDS.lateralOffsetRatio) * 1.0);
        return { detected: true, confidence, offsetRatio };
      }
    }
  }

  return { detected: false };
}

/**
 * detectTooClose() — Phát hiện mắt/mặt quá gần màn hình
 * Nguyên lý: Khi lại gần camera, mặt chiếm tỷ lệ lớn hơn trong khung hình.
 *            Tính: rộng_mặt / rộng_canvas > ngưỡng → quá gần
 */
function detectTooClose(keypoints, canvasWidth) {
  const leftEye  = keypoints[1];
  const rightEye = keypoints[2];
  const leftEar  = keypoints[3];
  const rightEar = keypoints[4];
  const minScore = POSE_THRESHOLDS.minKeypointScore;

  let faceWidth = 0;

  // Ưu tiên dùng khoảng cách tai (phản ánh kích thước mặt chính xác hơn)
  if (leftEar.score > minScore && rightEar.score > minScore) {
    faceWidth = Math.abs(leftEar.x - rightEar.x);
  } else if (leftEye.score > minScore && rightEye.score > minScore) {
    // Fallback: khoảng cách mắt × 2.5 ≈ chiều rộng mặt
    faceWidth = Math.abs(leftEye.x - rightEye.x) * 2.5;
  }

  if (faceWidth === 0 || canvasWidth === 0) return { detected: false };

  const faceRatio = faceWidth / canvasWidth;

  if (faceRatio > POSE_THRESHOLDS.faceCloseRatio) {
    const confidence = Math.min(0.95, 0.6 + (faceRatio - POSE_THRESHOLDS.faceCloseRatio) * 2.0);
    return { detected: true, confidence, faceRatio };
  }

  return { detected: false, faceRatio };
}

// ============================================================
// PHẦN 4b: SMOOTHING & PREDICTION FORMAT
// ============================================================

/**
 * smoothPoseResult() — Lấy tư thế xuất hiện nhiều nhất trong N frame
 * Tránh nhấp nháy: thay vì thay đổi mỗi frame, dùng "bỏ phiếu đa số"
 */
function smoothPoseResult(result) {
  poseHistory.push(result);
  if (poseHistory.length > POSE_SMOOTHING_FRAMES) {
    poseHistory.shift();
  }

  // Đếm tần suất từng tư thế
  const counts = {};
  poseHistory.forEach(r => {
    counts[r.name] = (counts[r.name] || 0) + 1;
  });

  // Tìm tư thế xuất hiện nhiều nhất
  let maxCount = 0;
  let dominantPose = result.name;
  Object.entries(counts).forEach(([name, count]) => {
    if (count > maxCount) {
      maxCount = count;
      dominantPose = name;
    }
  });

  // Tính confidence trung bình của tư thế dominant
  const dominantResults = poseHistory.filter(r => r.name === dominantPose);
  const avgConfidence = dominantResults.reduce((sum, r) => sum + r.confidence, 0) / dominantResults.length;

  return { name: dominantPose, confidence: avgConfidence };
}

/**
 * buildPrediction() — Tạo mảng prediction tương thích với updateUI()
 * Format giống Teachable Machine: [{className, probability}, ...]
 */
function buildPrediction(result) {
  const poseNames = Object.keys(POSE_CONFIG);
  const remainingProb = (1 - result.confidence) / Math.max(1, poseNames.length - 1);

  return poseNames.map(name => ({
    className: name,
    probability: name === result.name ? result.confidence : remainingProb,
  }));
}

// ============================================================
// PHẦN 4c: VẼ CAMERA + SKELETON LÊN CANVAS
// ============================================================

/**
 * drawFrame() — Vẽ hình ảnh webcam + skeleton lên canvas
 */
function drawFrame(poses) {
  if (!ctx || !video) return;

  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // Flip ngang (mirror) để người dùng thấy tự nhiên như soi gương
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();

  // Vẽ skeleton nếu phát hiện người
  if (poses.length > 0) {
    const keypoints = poses[0].keypoints;
    drawKeypoints(keypoints, w);
    drawSkeleton(keypoints, w);
  }
}

/**
 * drawKeypoints() — Vẽ các điểm khớp (chấm tròn) lên canvas
 */
function drawKeypoints(keypoints, canvasWidth) {
  const minScore = POSE_THRESHOLDS.minKeypointScore;

  keypoints.forEach(kp => {
    if (kp.score > minScore) {
      // Flip x vì canvas đã mirror
      const x = canvasWidth - kp.x;
      const y = kp.y;

      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = "#00ff88";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });
}

/**
 * drawSkeleton() — Vẽ đường xương nối các keypoint
 */
function drawSkeleton(keypoints, canvasWidth) {
  const minScore = POSE_THRESHOLDS.minKeypointScore;

  SKELETON_CONNECTIONS.forEach(([i, j]) => {
    const kp1 = keypoints[i];
    const kp2 = keypoints[j];

    if (kp1.score > minScore && kp2.score > minScore) {
      // Flip x
      const x1 = canvasWidth - kp1.x;
      const y1 = kp1.y;
      const x2 = canvasWidth - kp2.x;
      const y2 = kp2.y;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = "#00d4ff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });
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
  // Destroy chart cũ nếu đã tồn tại (tránh lỗi "Canvas is already in use")
  if (doughnutChart) {
    doughnutChart.destroy();
    doughnutChart = null;
  }

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
  // Xóa legend cũ trước khi vẽ lại (tránh bị trùng khi restart)
  const legendEl = document.getElementById("chart-legend");
  legendEl.innerHTML = "";
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
  // Destroy chart cũ nếu đã tồn tại
  if (lineChart) {
    lineChart.destroy();
    lineChart = null;
  }
  // Reset dữ liệu biểu đồ đường
  lineChartLabels.length = 0;
  lineChartData.length = 0;

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
 * Ví dụ: "Cúi đầu" → "Cui-dau"  (dùng cho id HTML)
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
  // Vẽ biểu đồ trống để giao diện không bị trống
  initCharts();
  updatePomodoroDisplay();

  console.log("🚀 PoseAlert đã khởi động! (MoveNet Pose Estimation)");
  console.log("📋 Nhấn 'Bắt đầu' để sử dụng. Không cần URL model!");
});
