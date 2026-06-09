/* ================================================
   chat.js — Chat nhắn tin trong Phòng học ảo
   ================================================ */

let chatRef = null;
const MAX_MESSAGES = 50;

// Lưu cache thông tin user từ phòng (uid → {name, avatar})
const _roomUserCache = {};

/* ---------- GỬI TIN NHẮN ---------- */
function sendChatMessage() {
  if (!currentUser || !currentRoomId || !isFirebaseConfigured) return;

  const input = document.getElementById('chat-input');
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  db.ref(`rooms/${currentRoomId}/chat`).push({
    uid: currentUser.uid,
    name: currentUser.displayName || 'Ẩn danh',
    avatar: currentUser.photoURL || '',
    text: text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });

  input.value = '';
  input.focus();
}

/* ---------- LẮNG NGHE TIN NHẮN ---------- */
function listenToChat(roomId) {
  // Tắt listener cũ
  if (chatRef) chatRef.off();

  chatRef = db.ref(`rooms/${roomId}/chat`).orderByChild('timestamp').limitToLast(MAX_MESSAGES);

  chatRef.on('child_added', (snapshot) => {
    const msg = snapshot.val();
    appendChatMessage(msg);
  });
}

/* ---------- HIỂN THỊ TIN NHẮN ---------- */
function appendChatMessage(msg) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  // Xóa placeholder "Chưa có tin nhắn"
  const empty = container.querySelector('.log-empty');
  if (empty) empty.remove();

  const isMe = currentUser && msg.uid === currentUser.uid;
  const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';

  // Cache thông tin user để dùng trong popup
  if (msg.uid && msg.name) {
    _roomUserCache[msg.uid] = { name: msg.name, avatar: msg.avatar || '' };
  }

  const div = document.createElement('div');
  div.className = `chat-msg ${isMe ? 'chat-msg-me' : ''}`;

  // Tên có thể click để xem popup kết bạn (chỉ với người khác)
  const nameHtml = isMe
    ? `<span class="chat-name">${escapeHtml(msg.name)}</span>`
    : `<span class="chat-name-link" onclick="showUserChatPopup('${msg.uid}', '${escapeHtml(msg.name)}', '${msg.avatar || ''}', event)">${escapeHtml(msg.name)}</span>`;

  div.innerHTML = `
    <img class="chat-avatar" src="${msg.avatar || ''}" alt="" onerror="this.style.display='none'"
         ${!isMe ? `style="cursor:pointer" onclick="showUserChatPopup('${msg.uid}', '${escapeHtml(msg.name)}', '${msg.avatar || ''}', event)"` : ''}/>
    <div class="chat-bubble">
      <div class="chat-meta">
        ${nameHtml}
        <span class="chat-time">${time}</span>
      </div>
      <div class="chat-text">${escapeHtml(msg.text)}</div>
    </div>
  `;

  container.appendChild(div);

  // Tự cuộn xuống cuối
  container.scrollTop = container.scrollHeight;

  // Giới hạn số tin nhắn hiển thị
  while (container.children.length > MAX_MESSAGES) {
    container.removeChild(container.firstChild);
  }
}

/* ---------- XỬ LÝ PHÍM ENTER ---------- */
function handleChatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
}

/* ---------- ESCAPE HTML ---------- */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/* ---------- KHỞI TẠO CHAT ---------- */
function initChat(roomId) {
  listenToChat(roomId);

  const input = document.getElementById('chat-input');
  if (input) {
    input.addEventListener('keydown', handleChatKeydown);
  }
}

/* =============================================
   KẾT BẠN QUA CHAT PHÒNG
   ============================================= */

/**
 * Gửi lời mời kết bạn từ danh sách thành viên phòng
 * @param {string} targetUid - UID người cần kết bạn
 */
async function roomAddFriend(targetUid) {
  if (!currentUser || !isFirebaseConfigured) {
    showToast('Vui lòng đăng nhập để kết bạn!', 'error');
    return;
  }
  if (targetUid === currentUser.uid) return;

  // Lấy thông tin user từ cache phòng
  const userInfo = _roomUserCache[targetUid] || {};
  const targetName   = userInfo.name   || 'Người dùng';
  const targetAvatar = userInfo.avatar || '';

  // Dùng sendFriendRequest từ friends.js
  if (typeof sendFriendRequest === 'function') {
    await sendFriendRequest(targetUid, targetName, targetAvatar);
  } else {
    // Fallback: ghi trực tiếp nếu friends.js chưa load
    const myUid = currentUser.uid;
    const batch = {};
    batch[`friendRequests/${targetUid}/${myUid}`] = {
      fromUid: myUid,
      fromName: currentUser.displayName || 'Ẩn danh',
      fromAvatar: currentUser.photoURL || '',
      timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    batch[`friends/${myUid}/${targetUid}`] = {
      status: 'pending',
      direction: 'sent',
      name: targetName,
      avatar: targetAvatar,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    await db.ref().update(batch);
    showToast('✅ Đã gửi lời mời kết bạn!', 'success');
  }

  // Cập nhật nút trong danh sách thành viên
  const btn = document.getElementById(`room-add-btn-${targetUid}`);
  if (btn) {
    btn.textContent = '✓ Đã gửi';
    btn.className = 'btn-add-room-friend sent';
    btn.disabled = true;
  }

  // Cập nhật nút trong popup nếu đang mở
  const popupAddBtn = document.getElementById('popup-add-btn');
  if (popupAddBtn && popupAddBtn.dataset.uid === targetUid) {
    popupAddBtn.textContent = '✓ Đã gửi';
    popupAddBtn.className = 'popup-btn-add sent';
    popupAddBtn.onclick = null;
  }
}

/* =============================================
   POPUP THÔNG TIN USER KHI CLICK TÊN TRONG CHAT
   ============================================= */

let _activePopup = null;

/**
 * Hiện popup thông tin user với nút kết bạn
 * @param {string} uid
 * @param {string} name
 * @param {string} avatar
 * @param {MouseEvent} event
 */
function showUserChatPopup(uid, name, avatar, event) {
  // Ngăn sự kiện lan ra ngoài
  if (event) event.stopPropagation();

  // Xóa popup cũ nếu có
  closeUserChatPopup();

  if (!currentUser || uid === currentUser.uid) return;

  // Xác định trạng thái kết bạn
  let addBtnClass = 'popup-btn-add';
  let addBtnText  = '👤+ Kết bạn';
  let addBtnClick = `roomAddFriend('${uid}')`;
  let addBtnDisabled = false;

  const friends = (typeof myFriends !== 'undefined') ? myFriends : {};
  const pending = (typeof pendingRequests !== 'undefined') ? pendingRequests : {};

  if (friends[uid] && friends[uid].status === 'accepted') {
    addBtnClass += ' friend';
    addBtnText   = '✓ Bạn bè';
    addBtnClick  = '';
    addBtnDisabled = true;
  } else if (friends[uid] && friends[uid].status === 'pending') {
    addBtnClass += ' sent';
    addBtnText   = '✓ Đã gửi';
    addBtnClick  = '';
    addBtnDisabled = true;
  } else if (pending[uid]) {
    addBtnClass += ' sent';
    addBtnText   = '🔔 Chấp nhận';
    addBtnClick  = `acceptFriendRequest('${uid}')`;
    addBtnDisabled = false;
  }

  // Tạo popup element
  const popup = document.createElement('div');
  popup.className = 'user-chat-popup';
  popup.id = 'user-chat-popup';
  popup.innerHTML = `
    <div class="popup-info">
      <img class="popup-avatar" src="${avatar || ''}" alt=""
           onerror="this.src='';this.style.background='var(--bg-main)'"/>
      <div>
        <div class="popup-name">${escapeHtml(name)}</div>
        <div class="popup-uid">Trong phòng học</div>
      </div>
    </div>
    <div class="popup-actions">
      <button class="${addBtnClass}" id="popup-add-btn"
              data-uid="${uid}"
              ${addBtnDisabled ? 'disabled' : `onclick="${addBtnClick}"`}>
        ${addBtnText}
      </button>
      <button class="popup-btn-close" onclick="closeUserChatPopup()">✕</button>
    </div>
  `;

  document.body.appendChild(popup);
  _activePopup = popup;

  // Định vị popup gần điểm click
  if (event) {
    const rect = event.target.getBoundingClientRect();
    let top  = rect.bottom + 6;
    let left = rect.left;

    // Không bị tràn màn hình
    const popupW = 240;
    const popupH = 130;
    if (left + popupW > window.innerWidth)  left  = window.innerWidth  - popupW - 12;
    if (top  + popupH > window.innerHeight) top   = rect.top - popupH - 6;

    popup.style.top  = `${top}px`;
    popup.style.left = `${left}px`;
  } else {
    popup.style.top  = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
  }

  // Click ngoài → đóng popup
  setTimeout(() => {
    document.addEventListener('click', _onClickOutsidePopup, { once: true });
  }, 50);
}

function _onClickOutsidePopup(e) {
  const popup = document.getElementById('user-chat-popup');
  if (popup && !popup.contains(e.target)) {
    closeUserChatPopup();
  }
}

function closeUserChatPopup() {
  const existing = document.getElementById('user-chat-popup');
  if (existing) existing.remove();
  _activePopup = null;
}
