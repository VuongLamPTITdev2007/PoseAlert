/**
 * ============================================================
 *  PoseAlert — js/presence.js
 *  Theo dõi trạng thái online/offline bằng Realtime Database
 *  Phụ thuộc: firebase-init.js
 * ============================================================
 */

/**
 * initPresence(uid)
 * Thiết lập presence tracking:
 * - Khi online → set status = "online" trên RTDB
 * - Khi disconnect → tự động set "offline" (onDisconnect)
 * - Đồng bộ sang Firestore để query dễ hơn
 */
function initPresence(uid) {
  if (!uid || !rtdb || !db) return;

  const userStatusRTDBRef = rtdb.ref("/status/" + uid);
  const userStatusFSRef   = db.collection("users").doc(uid);

  const isOnline = {
    state: "online",
    lastChanged: firebase.database.ServerValue.TIMESTAMP,
  };
  const isOffline = {
    state: "offline",
    lastChanged: firebase.database.ServerValue.TIMESTAMP,
  };

  // Lắng nghe kết nối
  rtdb.ref(".info/connected").on("value", (snapshot) => {
    if (snapshot.val() === false) return;

    // Khi disconnect → tự động set offline
    userStatusRTDBRef.onDisconnect().set(isOffline).then(() => {
      // Set online ngay lúc này
      userStatusRTDBRef.set(isOnline);
      userStatusFSRef.update({
        status: "online",
        lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
  });

  // Lắng nghe thay đổi từ RTDB → đồng bộ sang Firestore
  userStatusRTDBRef.on("value", (snapshot) => {
    const status = snapshot.val();
    if (status && status.state === "offline") {
      userStatusFSRef.update({
        status: "offline",
        lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }
  });

  console.log("📡 Presence tracking đã khởi tạo");
}

/**
 * setUserStudying(uid, isStudying)
 * Cập nhật trạng thái "studying" khi đang chạy camera.
 */
function setUserStudying(uid, isStudying) {
  if (!uid || !rtdb || !db) return;

  const status = isStudying ? "studying" : "online";
  rtdb.ref("/status/" + uid).update({ state: status });
  db.collection("users").doc(uid).update({ status: status });
}

/**
 * listenFriendsStatus(friendUids, callback)
 * Lắng nghe trạng thái của danh sách bạn bè.
 * callback(uid, status) được gọi mỗi khi có thay đổi.
 */
function listenFriendsStatus(friendUids, callback) {
  friendUids.forEach(uid => {
    rtdb.ref("/status/" + uid).on("value", (snapshot) => {
      const data = snapshot.val();
      callback(uid, data ? data.state : "offline");
    });
  });
}

/**
 * stopListeningFriendsStatus(friendUids)
 * Dừng lắng nghe trạng thái bạn bè.
 */
function stopListeningFriendsStatus(friendUids) {
  friendUids.forEach(uid => {
    rtdb.ref("/status/" + uid).off();
  });
}
