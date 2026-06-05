/**
 * ============================================================
 *  PoseAlert — js/history-page.js
 *  Logic cho trang lịch sử: tải dữ liệu, vẽ biểu đồ, streak
 *  Phụ thuộc: firebase-init.js, auth.js, session-storage.js
 * ============================================================
 */

// ============================================================
// KHỞI TẠO TRANG LỊCH SỬ
// ============================================================

let historyChart  = null;
let heatmapData   = {};

/**
 * initHistoryPage()
 * Gọi khi trang history.html load xong + user đã đăng nhập.
 */
async function initHistoryPage() {
  if (!currentUser) return;

  try {
    // Hiển thị loading
    _showHistoryLoading(true);

    // Lấy profile (streak, tổng giờ)
    const profile = await getUserProfile(currentUser.uid);
    _renderStreakDisplay(profile);
    _renderTotalStats(profile);

    // Lấy lịch sử phiên gần đây
    const sessions = await getSessionHistory(currentUser.uid, 50);
    _renderSessionTable(sessions);

    // Lấy dữ liệu 30 ngày cho biểu đồ
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentData = await getStudyDataByDateRange(
      currentUser.uid, thirtyDaysAgo, new Date()
    );
    _renderWeeklyChart(recentData);
    _renderHeatmap(recentData);

    _showHistoryLoading(false);
  } catch (err) {
    console.error("❌ Lỗi tải lịch sử:", err);
    _showHistoryLoading(false);
  }
}

// ============================================================
// RENDER STREAK
// ============================================================

function _renderStreakDisplay(profile) {
  if (!profile) return;

  const streakEl   = document.getElementById("streak-current");
  const longestEl  = document.getElementById("streak-longest");
  const fireEl     = document.getElementById("streak-fire");

  if (streakEl)  streakEl.textContent  = profile.currentStreak || 0;
  if (longestEl) longestEl.textContent = profile.longestStreak || 0;

  // Animation cho streak > 0
  if (fireEl && profile.currentStreak > 0) {
    fireEl.classList.add("active");
  }
}

function _renderTotalStats(profile) {
  if (!profile) return;

  const totalEl = document.getElementById("total-study-time");
  if (totalEl) {
    const hours = Math.floor((profile.totalStudyMinutes || 0) / 60);
    const mins  = (profile.totalStudyMinutes || 0) % 60;
    totalEl.textContent = hours > 0 ? `${hours}h ${mins}m` : `${mins} phút`;
  }
}

// ============================================================
// RENDER BẢNG LỊCH SỬ PHIÊN
// ============================================================

function _renderSessionTable(sessions) {
  const container = document.getElementById("session-history-table");
  if (!container) return;

  if (sessions.length === 0) {
    container.innerHTML = `
      <div class="history-empty">
        <span>📝</span>
        <p>Chưa có phiên học nào. Hãy bắt đầu học ngay!</p>
      </div>`;
    return;
  }

  const rows = sessions.map(s => {
    const start = s.startTime ? s.startTime.toDate() : new Date();
    const dateStr = start.toLocaleDateString("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric"
    });
    const timeStr = start.toLocaleTimeString("vi-VN", {
      hour: "2-digit", minute: "2-digit"
    });
    const durationMin = Math.round((s.durationSeconds || 0) / 60);
    const goodPct = s.goodPosturePercent || 0;
    const goodClass = goodPct >= 80 ? "good" : goodPct >= 50 ? "warn" : "bad";

    return `
      <tr>
        <td>${dateStr}</td>
        <td>${timeStr}</td>
        <td>${durationMin} phút</td>
        <td class="pct-${goodClass}">${goodPct}%</td>
        <td>${s.alertCount || 0}</td>
        <td>${s.pomodoroCompleted || 0}</td>
      </tr>`;
  }).join("");

  container.innerHTML = `
    <table class="history-table">
      <thead>
        <tr>
          <th>📅 Ngày</th>
          <th>🕐 Giờ</th>
          <th>⏱ Thời lượng</th>
          <th>✅ Tư thế đúng</th>
          <th>🔔 Cảnh báo</th>
          <th>🍅 Pomodoro</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ============================================================
// BIỂU ĐỒ TUẦN/THÁNG
// ============================================================

function _renderWeeklyChart(sessions) {
  const canvas = document.getElementById("history-chart");
  if (!canvas) return;

  // Nhóm theo ngày
  const dailyData = {};
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dailyData[_dateToString(d)] = { minutes: 0, goodPercent: 0, count: 0 };
  }

  sessions.forEach(s => {
    const date = s.startTime ? _dateToString(s.startTime.toDate()) : null;
    if (date && dailyData[date] !== undefined) {
      dailyData[date].minutes += Math.round((s.durationSeconds || 0) / 60);
      dailyData[date].goodPercent += s.goodPosturePercent || 0;
      dailyData[date].count++;
    }
  });

  const labels = Object.keys(dailyData).map(d => {
    const parts = d.split("-");
    return parts[2] + "/" + parts[1]; // DD/MM
  });
  const minutes = Object.values(dailyData).map(d => d.minutes);
  const avgGood = Object.values(dailyData).map(d =>
    d.count > 0 ? Math.round(d.goodPercent / d.count) : 0
  );

  // Destroy old chart
  if (historyChart) historyChart.destroy();

  historyChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Phút học",
          data: minutes,
          backgroundColor: "rgba(0, 212, 255, 0.6)",
          borderColor: "rgba(0, 212, 255, 1)",
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: "y",
        },
        {
          label: "% Tư thế đúng",
          data: avgGood,
          type: "line",
          borderColor: "rgba(0, 255, 136, 0.8)",
          backgroundColor: "rgba(0, 255, 136, 0.1)",
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.3,
          fill: true,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "#7986a3", font: { size: 11 } },
        },
      },
      scales: {
        x: {
          ticks: { color: "#7986a3", font: { size: 9 }, maxRotation: 45 },
          grid: { color: "rgba(30, 45, 71, 0.5)" },
        },
        y: {
          position: "left",
          title: { display: true, text: "Phút", color: "#7986a3" },
          ticks: { color: "#7986a3" },
          grid: { color: "rgba(30, 45, 71, 0.5)" },
        },
        y1: {
          position: "right",
          title: { display: true, text: "%", color: "#7986a3" },
          ticks: { color: "#7986a3" },
          grid: { display: false },
          min: 0,
          max: 100,
        },
      },
    },
  });
}

// ============================================================
// HEATMAP CALENDAR
// ============================================================

function _renderHeatmap(sessions) {
  const container = document.getElementById("heatmap-container");
  if (!container) return;

  // Nhóm dữ liệu theo ngày
  const dayMinutes = {};
  sessions.forEach(s => {
    const date = s.startTime ? _dateToString(s.startTime.toDate()) : null;
    if (date) {
      dayMinutes[date] = (dayMinutes[date] || 0) + Math.round((s.durationSeconds || 0) / 60);
    }
  });

  // Tạo grid 30 ngày
  const today = new Date();
  let html = '<div class="heatmap-grid">';

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = _dateToString(d);
    const mins = dayMinutes[dateStr] || 0;
    const level = mins === 0 ? 0 : mins < 30 ? 1 : mins < 60 ? 2 : mins < 120 ? 3 : 4;
    const dayLabel = d.getDate();
    const tooltip = `${dateStr}: ${mins} phút`;

    html += `<div class="heatmap-cell level-${level}" title="${tooltip}">
      <span class="heatmap-day">${dayLabel}</span>
    </div>`;
  }

  html += '</div>';
  html += `<div class="heatmap-legend">
    <span>Ít</span>
    <div class="heatmap-cell level-0 small"></div>
    <div class="heatmap-cell level-1 small"></div>
    <div class="heatmap-cell level-2 small"></div>
    <div class="heatmap-cell level-3 small"></div>
    <div class="heatmap-cell level-4 small"></div>
    <span>Nhiều</span>
  </div>`;

  container.innerHTML = html;
}

// ============================================================
// TIỆN ÍCH
// ============================================================

function _showHistoryLoading(show) {
  const el = document.getElementById("history-loading");
  if (el) el.classList.toggle("hidden", !show);
}
