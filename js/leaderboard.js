/**
 * ============================================================
 *  PoseAlert — js/leaderboard.js
 *  Bảng xếp hạng: tuần / tháng / toàn bộ
 *  Phụ thuộc: firebase-init.js, auth.js
 * ============================================================
 */

// ============================================================
// BẢNG XẾP HẠNG
// ============================================================

/**
 * getLeaderboard(period)
 * Lấy bảng xếp hạng theo period: "week" | "month" | "all"
 * Trả về array sorted desc theo totalMinutes.
 */
async function getLeaderboard(period = "week") {
  try {
    if (period === "all") {
      return await _getAllTimeLeaderboard();
    }

    // Tính khoảng thời gian
    const now = new Date();
    let startDate;

    if (period === "week") {
      const dayOfWeek = now.getDay() || 7; // CN = 7
      startDate = new Date(now);
      startDate.setDate(now.getDate() - dayOfWeek + 1); // Thứ Hai
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Lấy tất cả sessions trong khoảng thời gian
    const snapshot = await db.collection("sessions")
      .where("startTime", ">=", firebase.firestore.Timestamp.fromDate(startDate))
      .orderBy("startTime", "desc")
      .get();

    // Aggregate theo user
    const userTotals = {};
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const uid = data.uid;
      if (!userTotals[uid]) {
        userTotals[uid] = { uid, totalSeconds: 0, sessions: 0, goodSeconds: 0 };
      }
      userTotals[uid].totalSeconds += data.durationSeconds || 0;
      userTotals[uid].goodSeconds  += data.goodSeconds || 0;
      userTotals[uid].sessions++;
    });

    // Sort và lấy top 20
    const sorted = Object.values(userTotals)
      .sort((a, b) => b.totalSeconds - a.totalSeconds)
      .slice(0, 20);

    // Lấy profile cho tất cả users
    if (sorted.length > 0) {
      const uids = sorted.map(u => u.uid);
      const profiles = await _batchGetUsersForLeaderboard(uids);
      sorted.forEach(entry => {
        const profile = profiles[entry.uid] || {};
        entry.displayName = profile.displayName || "User";
        entry.avatarUrl   = profile.avatarUrl || "";
        entry.totalMinutes = Math.round(entry.totalSeconds / 60);
        entry.goodPercent  = entry.totalSeconds > 0
          ? Math.round((entry.goodSeconds / entry.totalSeconds) * 100) : 0;
      });
    }

    return sorted;
  } catch (err) {
    console.error("❌ Lỗi lấy leaderboard:", err);
    return [];
  }
}

/**
 * _getAllTimeLeaderboard()
 * Bảng xếp hạng tổng (dùng totalStudyMinutes từ user doc).
 */
async function _getAllTimeLeaderboard() {
  try {
    const snapshot = await db.collection("users")
      .orderBy("totalStudyMinutes", "desc")
      .limit(20)
      .get();

    return snapshot.docs.map((doc, index) => ({
      uid: doc.id,
      displayName: doc.data().displayName || "User",
      avatarUrl: doc.data().avatarUrl || "",
      totalMinutes: doc.data().totalStudyMinutes || 0,
      currentStreak: doc.data().currentStreak || 0,
      rank: index + 1,
    }));
  } catch (err) {
    console.error("❌ Lỗi lấy all-time leaderboard:", err);
    return [];
  }
}

/**
 * getUserRank(uid, leaderboard)
 * Tìm vị trí của user trong bảng xếp hạng.
 */
function getUserRank(uid, leaderboard) {
  const index = leaderboard.findIndex(entry => entry.uid === uid);
  return index >= 0 ? index + 1 : null;
}

// ============================================================
// RENDER BẢNG XẾP HẠNG
// ============================================================

/**
 * renderLeaderboard(data, containerEl, currentUid)
 * Render bảng xếp hạng vào DOM element.
 */
function renderLeaderboard(data, containerEl, currentUid) {
  if (!containerEl) return;

  if (data.length === 0) {
    containerEl.innerHTML = `
      <div class="lb-empty">
        <span>📊</span>
        <p>Chưa có dữ liệu xếp hạng</p>
      </div>`;
    return;
  }

  containerEl.innerHTML = data.map((entry, i) => {
    const rank = i + 1;
    const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
    const isMe = entry.uid === currentUid;
    const hours = Math.floor(entry.totalMinutes / 60);
    const mins = entry.totalMinutes % 60;
    const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    return `
      <div class="lb-row ${isMe ? 'lb-me' : ''} ${rank <= 3 ? 'lb-top' : ''}">
        <div class="lb-rank">${medal}</div>
        <div class="lb-user">
          ${entry.avatarUrl
            ? `<img src="${entry.avatarUrl}" class="lb-avatar" alt=""/>`
            : `<div class="lb-avatar-placeholder">${(entry.displayName || "U")[0]}</div>`}
          <span class="lb-name">${entry.displayName}${isMe ? ' (bạn)' : ''}</span>
        </div>
        <div class="lb-stats">
          <span class="lb-time">⏱ ${timeStr}</span>
          ${entry.goodPercent !== undefined ? `<span class="lb-posture">✅ ${entry.goodPercent}%</span>` : ''}
          ${entry.currentStreak ? `<span class="lb-streak">🔥 ${entry.currentStreak}</span>` : ''}
        </div>
      </div>`;
  }).join("");
}

// ============================================================
// TIỆN ÍCH
// ============================================================

async function _batchGetUsersForLeaderboard(uids) {
  const result = {};
  const chunks = [];
  for (let i = 0; i < uids.length; i += 30) {
    chunks.push(uids.slice(i, i + 30));
  }
  for (const chunk of chunks) {
    const snapshot = await db.collection("users")
      .where(firebase.firestore.FieldPath.documentId(), "in", chunk)
      .get();
    snapshot.docs.forEach(doc => { result[doc.id] = doc.data(); });
  }
  return result;
}
