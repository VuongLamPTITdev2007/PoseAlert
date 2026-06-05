/**
 * ============================================================
 *  PoseAlert — js/study-rooms.js
 *  Phòng học nhóm: tạo, tham gia, rời phòng, lắng nghe thành viên
 *  Phụ thuộc: firebase-init.js, auth.js
 * ============================================================
 */

// ============================================================
// TẠO / QUẢN LÝ PHÒNG
// ============================================================

/**
 * createStudyRoom(name, maxMembers)
 * Tạo phòng học nhóm mới.
 */
async function createStudyRoom(name, maxMembers = 10) {
  if (!currentUser) return null;

  try {
    const roomData = {
      name: name,
      creatorUid: currentUser.uid,
      creatorName: currentUser.displayName || "Host",
      maxMembers: maxMembers,
      members: [currentUser.uid],
      memberNames: {
        [currentUser.uid]: currentUser.displayName || "Host",
      },
      isActive: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection("study_rooms").add(roomData);
    console.log("✅ Tạo phòng:", name, "ID:", docRef.id);
    return docRef.id;
  } catch (err) {
    console.error("❌ Lỗi tạo phòng:", err);
    return null;
  }
}

/**
 * joinStudyRoom(roomId)
 * Tham gia phòng học.
 */
async function joinStudyRoom(roomId) {
  if (!currentUser) return false;

  try {
    const roomRef = db.collection("study_rooms").doc(roomId);
    const doc = await roomRef.get();

    if (!doc.exists) {
      console.warn("⚠️ Phòng không tồn tại");
      return false;
    }

    const data = doc.data();
    if (data.members.length >= data.maxMembers) {
      console.warn("⚠️ Phòng đã đầy");
      return false;
    }

    if (data.members.includes(currentUser.uid)) {
      console.log("ℹ️ Đã ở trong phòng rồi");
      return true;
    }

    await roomRef.update({
      members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid),
      [`memberNames.${currentUser.uid}`]: currentUser.displayName || "User",
    });

    console.log("✅ Đã tham gia phòng:", data.name);
    return true;
  } catch (err) {
    console.error("❌ Lỗi tham gia phòng:", err);
    return false;
  }
}

/**
 * leaveStudyRoom(roomId)
 * Rời phòng học.
 */
async function leaveStudyRoom(roomId) {
  if (!currentUser) return;

  try {
    const roomRef = db.collection("study_rooms").doc(roomId);
    const doc = await roomRef.get();

    if (!doc.exists) return;

    const data = doc.data();

    await roomRef.update({
      members: firebase.firestore.FieldValue.arrayRemove(currentUser.uid),
      [`memberNames.${currentUser.uid}`]: firebase.firestore.FieldValue.delete(),
    });

    // Nếu là người cuối cùng → xóa phòng
    if (data.members.length <= 1) {
      await roomRef.update({ isActive: false });
      console.log("🗑 Phòng đã đóng (không còn ai)");
    } else {
      console.log("✅ Đã rời phòng");
    }
  } catch (err) {
    console.error("❌ Lỗi rời phòng:", err);
  }
}

/**
 * deleteStudyRoom(roomId)
 * Xóa phòng (chỉ host mới được xóa).
 */
async function deleteStudyRoom(roomId) {
  if (!currentUser) return;

  try {
    const roomRef = db.collection("study_rooms").doc(roomId);
    const doc = await roomRef.get();

    if (!doc.exists) return;
    if (doc.data().creatorUid !== currentUser.uid) {
      console.warn("⚠️ Chỉ host mới được xóa phòng");
      return;
    }

    await roomRef.update({ isActive: false });
    console.log("✅ Đã xóa phòng");
  } catch (err) {
    console.error("❌ Lỗi xóa phòng:", err);
  }
}

// ============================================================
// LẤY DANH SÁCH PHÒNG
// ============================================================

/**
 * getActiveRooms()
 * Lấy danh sách phòng đang hoạt động.
 */
async function getActiveRooms() {
  try {
    const snapshot = await db.collection("study_rooms")
      .where("isActive", "==", true)
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error("❌ Lỗi lấy danh sách phòng:", err);
    return [];
  }
}

/**
 * listenRoomChanges(roomId, callback)
 * Lắng nghe realtime thay đổi thành viên phòng.
 */
function listenRoomChanges(roomId, callback) {
  return db.collection("study_rooms").doc(roomId)
    .onSnapshot((doc) => {
      if (doc.exists) {
        callback({ id: doc.id, ...doc.data() });
      }
    });
}

/**
 * listenActiveRooms(callback)
 * Lắng nghe realtime danh sách phòng.
 */
function listenActiveRooms(callback) {
  return db.collection("study_rooms")
    .where("isActive", "==", true)
    .orderBy("createdAt", "desc")
    .limit(20)
    .onSnapshot((snapshot) => {
      const rooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(rooms);
    });
}
