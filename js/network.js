/* ================================================
   network.js — Phòng học ảo & Trạng thái Online
   ================================================ */

let currentRoomId = null;
let membersRef = null;
let presenceRef = null;

/* ---------- THAM GIA PHÒNG ---------- */
function joinRoom(roomId) {
  if (!currentUser || !isFirebaseConfigured) return;

  // Rời phòng cũ nếu có
  if (currentRoomId) leaveRoom();

  currentRoomId = roomId;
  const uid = currentUser.uid;

  // Tạo dữ liệu thành viên
  const memberData = {
    name: currentUser.displayName || 'Ẩn danh',
    avatar: currentUser.photoURL || '',
    status: 'online',    // online, studying, warning, break
    poseState: '—',      // Trạng thái tư thế hiện tại
    joinedAt: firebase.database.ServerValue.TIMESTAMP
  };

  // Ghi vào phòng
  membersRef = db.ref(`rooms/${roomId}/members/${uid}`);
  membersRef.set(memberData);

  // Tự động xóa khi mất kết nối (disconnect)
  membersRef.onDisconnect().remove();

  // Theo dõi trạng thái kết nối
  presenceRef = db.ref('.info/connected');
  presenceRef.on('value', (snap) => {
    if (snap.val() === true) {
      membersRef.onDisconnect().remove();
    }
  });

  // Lắng nghe danh sách thành viên trong phòng
  listenToRoomMembers(roomId);

  // Cập nhật UI phòng
  const roomName = document.getElementById('room-name');
  if (roomName) roomName.textContent = '📖 Phòng: ' + roomId;
}

/* ---------- RỜI PHÒNG ---------- */
async function leaveRoom() {
  if (!currentRoomId || !currentUser) return;

  const uid = currentUser.uid;
  
  // Tắt listener
  db.ref(`rooms/${currentRoomId}/members`).off();
  if (presenceRef) presenceRef.off();

  // Xóa khỏi phòng
  await db.ref(`rooms/${currentRoomId}/members/${uid}`).remove();
  currentRoomId = null;
}

/* ---------- CẬP NHẬT TRẠNG THÁI TRỰC TUYẾN ---------- */
function updateOnlineStatus(status, poseState) {
  if (!currentUser || !currentRoomId || !isFirebaseConfigured) return;

  const uid = currentUser.uid;
  db.ref(`rooms/${currentRoomId}/members/${uid}`).update({
    status: status,         // 'studying' | 'warning' | 'break' | 'online'
    poseState: poseState    // 'Ngồi đúng' | 'Cúi đầu' | ...
  });
}

/* ---------- LẮNG NGHE THÀNH VIÊN PHÒNG ---------- */
function listenToRoomMembers(roomId) {
  db.ref(`rooms/${roomId}/members`).on('value', (snapshot) => {
    const members = [];
    snapshot.forEach((child) => {
      members.push({ uid: child.key, ...child.val() });
    });
    renderMemberList(members);
    updateOnlineCount(members.length);
  });
}

/* ---------- HIỂN THỊ DANH SÁCH THÀNH VIÊN ---------- */
function renderMemberList(members) {
  const container = document.getElementById('member-list');
  if (!container) return;

  if (members.length === 0) {
    container.innerHTML = '<p class="log-empty">Phòng trống...</p>';
    return;
  }

  container.innerHTML = members.map(m => {
    const isMe = currentUser && m.uid === currentUser.uid;
    const statusIcon = getStatusIcon(m.status);
    const statusClass = getStatusClass(m.status);

    return `
      <div class="member-item ${isMe ? 'member-me' : ''}" data-uid="${m.uid}">
        <div class="member-avatar-wrap">
          <img class="member-avatar" src="${m.avatar || ''}" alt="" onerror="this.style.display='none'"/>
          <span class="member-status-dot ${statusClass}"></span>
        </div>
        <div class="member-info">
          <span class="member-name">${m.name}${isMe ? ' (Bạn)' : ''}</span>
          <span class="member-pose">${statusIcon} ${m.poseState || '—'}</span>
        </div>
      </div>
    `;
  }).join('');
}

function getStatusIcon(status) {
  switch (status) {
    case 'studying': return '🟢';
    case 'warning':  return '🔴';
    case 'break':    return '☕';
    default:         return '⚪';
  }
}

function getStatusClass(status) {
  switch (status) {
    case 'studying': return 'dot-studying';
    case 'warning':  return 'dot-warning';
    case 'break':    return 'dot-break';
    default:         return 'dot-online';
  }
}

function updateOnlineCount(count) {
  const el = document.getElementById('online-count');
  if (el) el.textContent = count;
}
