/* ================================================
   database.js — Lưu trữ phiên học tập lên Firebase
   ================================================ */

/* ---------- LƯU PHIÊN HỌC TẬP ---------- */
function saveStudySession(uid, sessionData) {
  if (!isFirebaseConfigured || !uid) return;

  const sessionRef = db.ref('sessions/' + uid).push();
  sessionRef.set({
    date: new Date().toISOString(),
    timestamp: firebase.database.ServerValue.TIMESTAMP,
    durationMinutes: sessionData.durationMinutes || 0,
    goodPosturePct: sessionData.goodPosturePct || 0,
    badPosturePct: sessionData.badPosturePct || 0,
    totalAlerts: sessionData.totalAlerts || 0,
    pomodoroCompleted: sessionData.pomodoroCompleted || 0
  });
}

/* ---------- TẢI LỊCH SỬ HỌC TẬP ---------- */
function loadStudyHistory(uid) {
  if (!isFirebaseConfigured || !uid) return;

  const historyContainer = document.getElementById('study-history-list');
  if (!historyContainer) return;

  // Lấy 30 phiên gần nhất
  db.ref('sessions/' + uid)
    .orderByChild('timestamp')
    .limitToLast(30)
    .on('value', (snapshot) => {
      const sessions = [];
      snapshot.forEach((child) => {
        sessions.push({ id: child.key, ...child.val() });
      });
      sessions.reverse(); // Mới nhất lên đầu
      renderStudyHistory(sessions);
      renderWeeklySummary(sessions);
    });
}

/* ---------- HIỂN THỊ LỊCH SỬ ---------- */
function renderStudyHistory(sessions) {
  const container = document.getElementById('study-history-list');
  if (!container) return;

  if (sessions.length === 0) {
    container.innerHTML = '<p class="log-empty">Chưa có phiên học tập nào...</p>';
    return;
  }

  container.innerHTML = sessions.slice(0, 10).map(s => {
    const d = new Date(s.date);
    const dateStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    const timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const mins = Math.round(s.durationMinutes || 0);
    const pct = Math.round(s.goodPosturePct || 0);

    return `
      <div class="history-item">
        <div class="history-date">
          <span class="history-day">${dateStr}</span>
          <span class="history-time">${timeStr}</span>
        </div>
        <div class="history-stats">
          <span class="history-duration">⏱ ${mins} phút</span>
          <span class="history-posture ${pct >= 70 ? 'good' : 'bad'}">🎯 ${pct}%</span>
          <span class="history-alerts">🔔 ${s.totalAlerts || 0}</span>
        </div>
      </div>
    `;
  }).join('');
}

/* ---------- TỔNG HỢP TUẦN ---------- */
function renderWeeklySummary(sessions) {
  const totalEl = document.getElementById('weekly-total-minutes');
  const avgEl = document.getElementById('weekly-avg-posture');
  const streakEl = document.getElementById('weekly-sessions');
  if (!totalEl) return;

  // Lọc 7 ngày gần nhất
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = sessions.filter(s => s.timestamp >= weekAgo);

  const totalMins = thisWeek.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const avgPosture = thisWeek.length > 0
    ? thisWeek.reduce((sum, s) => sum + (s.goodPosturePct || 0), 0) / thisWeek.length
    : 0;

  totalEl.textContent = Math.round(totalMins);
  if (avgEl) avgEl.textContent = Math.round(avgPosture) + '%';
  if (streakEl) streakEl.textContent = thisWeek.length;
}

/* ---------- LƯU TỰ ĐỘNG KHI DỪNG APP ---------- */
function autoSaveSession() {
  if (!currentUser || !isFirebaseConfigured) return;
  if (!sessionStartTime) return;

  const elapsed = (Date.now() - sessionStartTime) / 60000; // phút
  if (elapsed < 0.5) return; // Bỏ qua phiên < 30 giây

  const total = poseCounts.good + poseCounts.bad1 + poseCounts.bad2 + poseCounts.bad3;
  const goodPct = total > 0 ? (poseCounts.good / total * 100) : 0;
  const badPct = 100 - goodPct;

  saveStudySession(currentUser.uid, {
    durationMinutes: Math.round(elapsed * 10) / 10,
    goodPosturePct: Math.round(goodPct * 10) / 10,
    badPosturePct: Math.round(badPct * 10) / 10,
    totalAlerts: alertCount,
    pomodoroCompleted: pomoCycles
  });
}
