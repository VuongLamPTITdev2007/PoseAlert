/**
 * ============================================================
 *  PoseAlert — js/chat.js
 *  Chat realtime dùng Firebase Realtime Database
 *  Phụ thuộc: firebase-init.js, auth.js
 * ============================================================
 */

// Listener hiện tại (để dọn dẹp khi chuyển phòng)
let _currentChatListener = null;
let _currentChatRoomId   = null;

// ============================================================
// GỬI TIN NHẮN
// ============================================================

/**
 * sendMessage(roomId, text)
 * Gửi tin nhắn vào phòng chat.
 */
function sendMessage(roomId, text) {
  if (!currentUser || !text.trim()) return;

  const messageData = {
    senderUid:  currentUser.uid,
    senderName: currentUser.displayName || "User",
    senderAvatar: currentUser.photoURL || "",
    text: text.trim(),
    sentAt: firebase.database.ServerValue.TIMESTAMP,
  };

  rtdb.ref("chats/" + roomId + "/messages").push(messageData);
}

// ============================================================
// LẮNG NGHE TIN NHẮN (REALTIME)
// ============================================================

/**
 * listenMessages(roomId, callback)
 * Lắng nghe tin nhắn mới trong phòng.
 * callback(message) được gọi mỗi khi có tin nhắn mới.
 */
function listenMessages(roomId, callback) {
  // Dọn dẹp listener cũ
  stopListeningMessages();

  _currentChatRoomId = roomId;
  const ref = rtdb.ref("chats/" + roomId + "/messages")
    .orderByChild("sentAt")
    .limitToLast(100);

  _currentChatListener = ref.on("child_added", (snapshot) => {
    const msg = snapshot.val();
    if (msg) {
      callback({
        id: snapshot.key,
        ...msg,
        isOwn: currentUser && msg.senderUid === currentUser.uid,
      });
    }
  });

  return _currentChatListener;
}

/**
 * stopListeningMessages()
 * Dừng lắng nghe tin nhắn.
 */
function stopListeningMessages() {
  if (_currentChatRoomId) {
    rtdb.ref("chats/" + _currentChatRoomId + "/messages").off();
    _currentChatListener = null;
    _currentChatRoomId   = null;
  }
}

// ============================================================
// HIỂN THỊ TIN NHẮN TRÊN UI
// ============================================================

/**
 * renderMessage(msg, containerEl)
 * Render 1 tin nhắn vào container.
 */
function renderMessage(msg, containerEl) {
  if (!containerEl) return;

  const div = document.createElement("div");
  div.className = "chat-message" + (msg.isOwn ? " own" : "");

  const time = msg.sentAt
    ? new Date(msg.sentAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : "";

  div.innerHTML = `
    <div class="chat-msg-header">
      ${msg.senderAvatar ? `<img src="${msg.senderAvatar}" class="chat-avatar" alt=""/>` : `<div class="chat-avatar-placeholder">${(msg.senderName || "U")[0]}</div>`}
      <span class="chat-sender">${_escapeHtml(msg.senderName || "User")}</span>
      <span class="chat-time">${time}</span>
    </div>
    <div class="chat-msg-body">${_escapeHtml(msg.text)}</div>
  `;

  containerEl.appendChild(div);

  // Auto-scroll xuống
  containerEl.scrollTop = containerEl.scrollHeight;
}

/**
 * setupChatInput(roomId, inputEl, sendBtnEl)
 * Gắn event cho ô nhập tin nhắn và nút gửi.
 */
function setupChatInput(roomId, inputEl, sendBtnEl) {
  if (!inputEl) return;

  const send = () => {
    const text = inputEl.value.trim();
    if (text) {
      sendMessage(roomId, text);
      inputEl.value = "";
      inputEl.focus();
    }
  };

  // Gửi bằng Enter
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  // Gửi bằng nút
  if (sendBtnEl) {
    sendBtnEl.addEventListener("click", send);
  }
}

// ============================================================
// TYPING INDICATOR (tùy chọn)
// ============================================================

/**
 * setTyping(roomId, isTyping)
 * Báo cho phòng biết mình đang gõ.
 */
function setTyping(roomId, isTyping) {
  if (!currentUser) return;
  const ref = rtdb.ref("chats/" + roomId + "/typing/" + currentUser.uid);
  if (isTyping) {
    ref.set({ name: currentUser.displayName, timestamp: firebase.database.ServerValue.TIMESTAMP });
    // Auto-remove sau 5 giây
    ref.onDisconnect().remove();
    setTimeout(() => ref.remove(), 5000);
  } else {
    ref.remove();
  }
}

/**
 * listenTyping(roomId, callback)
 * Lắng nghe ai đang gõ.
 * callback(typingUsers) → array of { uid, name }.
 */
function listenTyping(roomId, callback) {
  rtdb.ref("chats/" + roomId + "/typing").on("value", (snapshot) => {
    const data = snapshot.val() || {};
    const typingUsers = Object.entries(data)
      .filter(([uid]) => uid !== (currentUser && currentUser.uid))
      .map(([uid, val]) => ({ uid, name: val.name }));
    callback(typingUsers);
  });
}

// ============================================================
// TIỆN ÍCH
// ============================================================

function _escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
