/**
 * ============================================================
 *  PoseAlert — js/friends.js
 *  Hệ thống bạn bè: gửi/nhận lời mời, danh sách, tìm kiếm
 *  Phụ thuộc: firebase-init.js, auth.js
 * ============================================================
 */

// ============================================================
// GỬI / NHẬN LỜI MỜI KẾT BẠN
// ============================================================

/**
 * sendFriendRequest(targetUid)
 * Gửi lời mời kết bạn → tạo document trong "friends" collection.
 */
async function sendFriendRequest(targetUid) {
  if (!currentUser) return;
  if (targetUid === currentUser.uid) {
    console.warn("⚠️ Không thể kết bạn với chính mình");
    return;
  }

  try {
    // Kiểm tra đã có request/friendship chưa
    const existing = await _findFriendship(currentUser.uid, targetUid);
    if (existing) {
      console.warn("⚠️ Đã có yêu cầu kết bạn hoặc đã là bạn bè");
      return "existing";
    }

    await db.collection("friends").add({
      user1: currentUser.uid,
      user2: targetUid,
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    console.log("✅ Đã gửi lời mời kết bạn");
    return "sent";
  } catch (err) {
    console.error("❌ Lỗi gửi lời mời:", err);
    return "error";
  }
}

/**
 * acceptFriendRequest(friendshipId)
 * Chấp nhận lời mời kết bạn.
 */
async function acceptFriendRequest(friendshipId) {
  try {
    await db.collection("friends").doc(friendshipId).update({
      status: "accepted",
    });
    console.log("✅ Đã chấp nhận kết bạn");
  } catch (err) {
    console.error("❌ Lỗi chấp nhận kết bạn:", err);
  }
}

/**
 * rejectFriendRequest(friendshipId)
 * Từ chối lời mời kết bạn (xóa document).
 */
async function rejectFriendRequest(friendshipId) {
  try {
    await db.collection("friends").doc(friendshipId).delete();
    console.log("✅ Đã từ chối lời mời");
  } catch (err) {
    console.error("❌ Lỗi từ chối:", err);
  }
}

/**
 * removeFriend(friendshipId)
 * Hủy kết bạn.
 */
async function removeFriend(friendshipId) {
  try {
    await db.collection("friends").doc(friendshipId).delete();
    console.log("✅ Đã hủy kết bạn");
  } catch (err) {
    console.error("❌ Lỗi hủy kết bạn:", err);
  }
}

// ============================================================
// LẤY DANH SÁCH
// ============================================================

/**
 * getFriendsList(uid)
 * Lấy danh sách bạn bè (status = "accepted").
 * Trả về array of { friendshipId, friendUid, friendData }.
 */
async function getFriendsList(uid) {
  try {
    // Query cả 2 chiều (user có thể là user1 hoặc user2)
    const [q1, q2] = await Promise.all([
      db.collection("friends")
        .where("user1", "==", uid)
        .where("status", "==", "accepted")
        .get(),
      db.collection("friends")
        .where("user2", "==", uid)
        .where("status", "==", "accepted")
        .get(),
    ]);

    const friends = [];
    const friendUids = [];

    q1.docs.forEach(doc => {
      const d = doc.data();
      friends.push({ friendshipId: doc.id, friendUid: d.user2 });
      friendUids.push(d.user2);
    });
    q2.docs.forEach(doc => {
      const d = doc.data();
      friends.push({ friendshipId: doc.id, friendUid: d.user1 });
      friendUids.push(d.user1);
    });

    // Lấy thông tin profile của từng friend
    if (friendUids.length > 0) {
      const profiles = await _batchGetUsers(friendUids);
      friends.forEach(f => {
        f.friendData = profiles[f.friendUid] || { displayName: "User" };
      });
    }

    return friends;
  } catch (err) {
    console.error("❌ Lỗi lấy danh sách bạn:", err);
    return [];
  }
}

/**
 * getPendingRequests(uid)
 * Lấy lời mời kết bạn đang chờ (gửi cho mình).
 */
async function getPendingRequests(uid) {
  try {
    const snapshot = await db.collection("friends")
      .where("user2", "==", uid)
      .where("status", "==", "pending")
      .get();

    const requests = [];
    const senderUids = snapshot.docs.map(doc => doc.data().user1);

    const profiles = senderUids.length > 0
      ? await _batchGetUsers(senderUids) : {};

    snapshot.docs.forEach(doc => {
      const d = doc.data();
      requests.push({
        friendshipId: doc.id,
        senderUid: d.user1,
        senderData: profiles[d.user1] || { displayName: "User" },
        createdAt: d.createdAt,
      });
    });

    return requests;
  } catch (err) {
    console.error("❌ Lỗi lấy lời mời:", err);
    return [];
  }
}

// ============================================================
// TÌM KIẾM NGƯỜI DÙNG
// ============================================================

/**
 * searchUsers(query)
 * Tìm user theo tên hiển thị (prefix search).
 */
async function searchUsers(query) {
  if (!query || query.length < 2) return [];

  try {
    const snapshot = await db.collection("users")
      .where("displayName", ">=", query)
      .where("displayName", "<=", query + "\uf8ff")
      .limit(10)
      .get();

    return snapshot.docs
      .map(doc => ({ uid: doc.id, ...doc.data() }))
      .filter(u => u.uid !== (currentUser && currentUser.uid));
  } catch (err) {
    console.error("❌ Lỗi tìm kiếm:", err);
    return [];
  }
}

// ============================================================
// HÀM NỘI BỘ
// ============================================================

/**
 * _findFriendship(uid1, uid2)
 * Kiểm tra xem đã có friendship giữa 2 user chưa.
 */
async function _findFriendship(uid1, uid2) {
  const [q1, q2] = await Promise.all([
    db.collection("friends")
      .where("user1", "==", uid1)
      .where("user2", "==", uid2)
      .limit(1).get(),
    db.collection("friends")
      .where("user1", "==", uid2)
      .where("user2", "==", uid1)
      .limit(1).get(),
  ]);
  if (!q1.empty) return q1.docs[0];
  if (!q2.empty) return q2.docs[0];
  return null;
}

/**
 * _batchGetUsers(uids)
 * Lấy profile nhiều user cùng lúc (batch).
 * Trả về { uid: userData }.
 */
async function _batchGetUsers(uids) {
  const result = {};
  // Firestore "in" query giới hạn 30 items
  const chunks = [];
  for (let i = 0; i < uids.length; i += 30) {
    chunks.push(uids.slice(i, i + 30));
  }

  for (const chunk of chunks) {
    const snapshot = await db.collection("users")
      .where(firebase.firestore.FieldPath.documentId(), "in", chunk)
      .get();
    snapshot.docs.forEach(doc => {
      result[doc.id] = doc.data();
    });
  }

  return result;
}
