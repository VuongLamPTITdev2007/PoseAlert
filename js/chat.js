/* ================================================
   chat.js — Chat nhắn tin trong Phòng học ảo
   ================================================ */

let chatRef = null;
const MAX_MESSAGES = 50;

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

  const div = document.createElement('div');
  div.className = `chat-msg ${isMe ? 'chat-msg-me' : ''}`;
  div.innerHTML = `
    <img class="chat-avatar" src="${msg.avatar || ''}" alt="" onerror="this.style.display='none'"/>
    <div class="chat-bubble">
      <div class="chat-meta">
        <span class="chat-name">${msg.name}</span>
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
