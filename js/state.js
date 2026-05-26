/**
 * ============================================================
 *  PoseAlert — js/state.js
 *  Biến toàn cục lưu trạng thái (state) của ứng dụng
 *  Phụ thuộc: config.js
 * ============================================================
 */

// ---- Camera & AI ----
let detector    = null;  // MoveNet detector instance
let video       = null;  // Thẻ <video> ẩn làm nguồn webcam
let ctx         = null;  // Canvas 2D context để vẽ
let mediaStream = null;  // MediaStream từ camera (để dừng khi cần)
let isRunning   = false; // App có đang chạy không

// ---- Tư thế hiện tại ----
let currentPoseName   = "";
let currentPoseIsGood = true;

// ---- Smoothing: tránh nhấp nháy giữa các frame ----
let poseHistory = []; // Buffer lưu kết quả N frame gần nhất

// ---- Timer cảnh báo tư thế sai ----
let badPoseTimer    = 0;    // Đếm giây tư thế sai liên tục
let badPoseInterval = null; // ID setInterval

// ---- Thống kê phiên ----
let stats = {
  totalSeconds:     0,    // Tổng số giây đã đo
  goodSeconds:      0,    // Số giây ngồi đúng
  badSeconds:       0,    // Số giây ngồi sai
  alertCount:       0,    // Số lần cảnh báo
  sessionStartTime: null, // Thời điểm bắt đầu phiên
};

// ---- Biểu đồ (Chart.js) ----
let doughnutChart  = null;
let lineChart      = null;
let chartData      = { labels: [], data: [], colors: [] };
let lineChartLabels = [];
let lineChartData   = [];
let lineDataInterval = null;

// ---- Pomodoro ----
let pomodoroInterval  = null;
let pomodoroSeconds   = POMODORO_WORK_MINUTES * 60;
let pomodoroIsWork    = true;  // true = học, false = nghỉ
let pomodoroIsRunning = false;
let pomodoroCycles    = 0;
// chế độ ẩn danh người dùng ( chỉ hiện khung vẽ)
let isPrivacyMode = false; 