/**
 * ============================================================
 *  PoseAlert — js/session-storage.js
 *  Lưu phiên học tập lên Firestore, tính streak, cập nhật user
 *  Phụ thuộc: firebase-init.js, auth.js, state.js
 * ============================================================
 */

// ============================================================
// LƯU PHIÊN HỌC TẬP
// ============================================================

/**
 * saveSessionToFirestore()
 * Gọi khi người dùng nhấn "Dừng" — lưu toàn bộ stats phiên
 * lên Firestore và cập nhật tổng thời gian + streak.
 */
async function saveSessionToFirestore() {
  if (!currentUser || !db) {
    console.warn("⚠️ Chưa đăng nhập hoặc Firebase chưa sẵn sàng, không lưu phiên");
    return;
  }

  // Chỉ lưu nếu phiên có thời gian thực sự (> 10 giây)
  if (!stats || stats.totalSeconds < 10) {
    console.log("⏭ Phiên quá ngắn, bỏ qua lưu");
    return;
  }

  try {
    const now = new Date();
    const durationMinutes = Math.round(stats.totalSeconds / 60);
    const goodPercent = stats.totalSeconds > 0
      ? Math.round((stats.goodSeconds / stats.totalSeconds) * 100)
      : 0;

    // ── 1. Tạo document phiên trong collection "sessions" ──
    const sessionData = {
      uid: currentUser.uid,
      startTime: stats.sessionStartTime
        ? firebase.firestore.Timestamp.fromDate(stats.sessionStartTime)
        : firebase.firestore.FieldValue.serverTimestamp(),
      endTime: firebase.firestore.Timestamp.fromDate(now),
      durationSeconds: stats.totalSeconds,
      goodSeconds: stats.goodSeconds,
      badSeconds: stats.badSeconds,
      alertCount: stats.alertCount,
      goodPosturePercent: goodPercent,
      pomodoroCompleted: pomodoroCycles || 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("sessions").add(sessionData);
    console.log("✅ Phiên học đã lưu:", durationMinutes, "phút,", goodPercent + "% đúng");

    // ── 2. Cập nhật tổng thời gian cho user ──
    const userRef = db.collection("users").doc(currentUser.uid);
    await userRef.update({
      totalStudyMinutes: firebase.firestore.FieldValue.increment(durationMinutes),
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // ── 3. Cập nhật streak ──
    await _updateStreak(currentUser.uid);

    // Hiện thông báo nhỏ
    _showSaveNotification(durationMinutes, goodPercent);

  } catch (err) {
    console.error("❌ Lỗi lưu phiên học:", err);
  }
}

// ============================================================
// STREAK
// ============================================================

/**
 * _updateStreak(uid)
 * Kiểm tra lastStudyDate:
 * - Nếu hôm nay → giữ nguyên (đã tính rồi)
 * - Nếu hôm qua → streak + 1
 * - Nếu khác    → reset streak về 1
 */
async function _updateStreak(uid) {
  try {
    const userRef = db.collection("users").doc(uid);
    const doc = await userRef.get();
    if (!doc.exists) return;

    const data = doc.data();
    const today = _dateToString(new Date());
    const lastStudy = data.lastStudyDate ? _dateToString(data.lastStudyDate.toDate()) : null;

    if (lastStudy === today) {
      // Đã học hôm nay rồi, giữ nguyên streak
      return;
    }

    const yesterday = _dateToString(new Date(Date.now() - 86400000));
    let newStreak = 1;

    if (lastStudy === yesterday) {
      // Học liên tiếp → tăng streak
      newStreak = (data.currentStreak || 0) + 1;
    }

    const longestStreak = Math.max(newStreak, data.longestStreak || 0);

    await userRef.update({
      currentStreak: newStreak,
      longestStreak: longestStreak,
      lastStudyDate: firebase.firestore.Timestamp.fromDate(new Date()),
    });

    console.log("🔥 Streak:", newStreak, "ngày | Kỷ lục:", longestStreak);
  } catch (err) {
    console.error("❌ Lỗi cập nhật streak:", err);
  }
}

// ============================================================
// ĐỌC DỮ LIỆU LỊCH SỬ
// ============================================================

/**
 * getSessionHistory(uid, limit)
 * Lấy danh sách phiên gần đây nhất.
 */
async function getSessionHistory(uid, limit = 50) {
  if (!db) return [];
  try {
    const snapshot = await db.collection("sessions")
      .where("uid", "==", uid)
      .orderBy("startTime", "desc")
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error("❌ Lỗi đọc lịch sử phiên:", err);
    return [];
  }
}

/**
 * getStudyDataByDateRange(uid, startDate, endDate)
 * Lấy dữ liệu phiên trong khoảng thời gian (cho biểu đồ).
 */
async function getStudyDataByDateRange(uid, startDate, endDate) {
  if (!db) return [];
  try {
    const snapshot = await db.collection("sessions")
      .where("uid", "==", uid)
      .where("startTime", ">=", firebase.firestore.Timestamp.fromDate(startDate))
      .where("startTime", "<=", firebase.firestore.Timestamp.fromDate(endDate))
      .orderBy("startTime", "asc")
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error("❌ Lỗi đọc dữ liệu theo ngày:", err);
    return [];
  }
}

/**
 * getUserProfile(uid)
 * Lấy thông tin profile user (totalStudyMinutes, streak, ...).
 */
async function getUserProfile(uid) {
  if (!db) return null;
  try {
    const doc = await db.collection("users").doc(uid).get();
    return doc.exists ? doc.data() : null;
  } catch (err) {
    console.error("❌ Lỗi đọc profile:", err);
    return null;
  }
}

// ============================================================
// TIỆN ÍCH
// ============================================================

/**
 * _dateToString(date) → "YYYY-MM-DD"
 */
function _dateToString(date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return y + "-" + m + "-" + d;
}

/**
 * _showSaveNotification(minutes, goodPercent)
 * Hiện thông báo nhỏ sau khi lưu phiên thành công.
 */
function _showSaveNotification(minutes, goodPercent) {
  // Tạo toast notification
  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 9999;
    background: linear-gradient(135deg, #111827, #1a2235);
    border: 1px solid var(--accent-green);
    border-radius: 12px; padding: 1rem 1.5rem;
    color: var(--accent-green); font-size: 0.9rem;
    box-shadow: 0 8px 30px rgba(0,255,136,0.15);
    animation: toastSlide 0.4s ease-out;
    font-family: 'DM Sans', sans-serif;
  `;
  toast.innerHTML = `
    <div style="font-weight:600;margin-bottom:0.3rem;">✅ Phiên học đã lưu!</div>
    <div style="color:var(--text-secondary);font-size:0.8rem;">
      ⏱ ${minutes} phút · ✅ ${goodPercent}% tư thế đúng
    </div>
  `;

  // Thêm animation
  const style = document.createElement("style");
  style.textContent = `
    @keyframes toastSlide {
      from { opacity: 0; transform: translateY(20px) scale(0.95); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(toast);

  // Tự ẩn sau 4 giây
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(20px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
