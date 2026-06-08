/* ==========================================================================
   rich-chat.js — Core Messaging Logic for Rich Communication Features
   ========================================================================== */

// Global state cache
let loadedMessages = {};    // { msgId: msg }
let replyingTo = null;      // { msgId, text, name }
let pendingChatFiles = [];   // Files selected and waiting to send
let activePickerTab = 'emojis';
let searchMatches = [];     // [ { msgId, element } ]
let activeSearchIndex = -1;

// Media recording state
let isVoiceRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;

// lightbox DOM references
let lightboxModal = null;
let lightboxImg = null;

// Cute static/animated stickers list
const STICKER_LIST = [
  { name: 'Bear Dance', url: 'https://media.giphy.com/media/VbAmVUETRz0g8/giphy.gif' },
  { name: 'Cute Cat', url: 'https://media.giphy.com/media/13CoXDiaCcC2EA/giphy.gif' },
  { name: 'Fun Dog', url: 'https://media.giphy.com/media/26xBI73gY5FDUYCIo/giphy.gif' },
  { name: 'Bouncing Bunny', url: 'https://media.giphy.com/media/m7yzyVT75G8da/giphy.gif' },
  { name: 'Cute Panda', url: 'https://media.giphy.com/media/fItgkiBLKWqCC69QRH/giphy.gif' },
  { name: 'Happy Monkey', url: 'https://media.giphy.com/media/3o72EX5QZ9N9d51dqo/giphy.gif' },
  { name: 'Party Cat', url: 'https://media.giphy.com/media/l41YcGT5ShJa0yv3G/giphy.gif' },
  { name: 'Love Hearts', url: 'https://media.giphy.com/media/26hpK0l6WC998D34N/giphy.gif' },
  { name: 'Sleepy Bunny', url: 'https://media.giphy.com/media/d2jjuAZzDSVLZ5kI/giphy.gif' },
  { name: 'Cheering bear', url: 'https://media.giphy.com/media/EPwELHK2R7uEw/giphy.gif' },
  { name: 'Dancing cat', url: 'https://media.giphy.com/media/3o7qE1YN7aBOFPRw8E/giphy.gif' },
  { name: 'Sad dog', url: 'https://media.giphy.com/media/2WxWfiav9b0WM/giphy.gif' }
];

// Curated GIF search queries fallback
const GIF_FALLBACKS = [
  'https://media.giphy.com/media/10yXFkBJ0MwIN2/giphy.gif',
  'https://media.giphy.com/media/l0HtYhHGDsY8Tf7lC/giphy.gif',
  'https://media.giphy.com/media/3oz8xAFtqoOUUrsh7W/giphy.gif',
  'https://media.giphy.com/media/12OMY457TuF56w/giphy.gif',
  'https://media.giphy.com/media/3o7TKSjRrfIPjei1fD/giphy.gif',
  'https://media.giphy.com/media/3o7abKhOpu0NXS3HBS/giphy.gif'
];

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  initPickerPanel();
  initLightbox();

  // Đóng picker panel khi click ngoài
  document.addEventListener('click', (e) => {
    const picker = document.getElementById('chat-picker-panel');
    const toggleBtn = document.getElementById('btn-chat-emoji');
    if (picker && !picker.classList.contains('hidden')) {
      if (!picker.contains(e.target) && e.target !== toggleBtn) {
        picker.classList.add('hidden');
      }
    }

    // Đóng reaction floating box khi click ngoài
    const selectors = document.querySelectorAll('.reaction-floating-selector');
    selectors.forEach(el => {
      if (!el.contains(e.target) && !e.target.classList.contains('btn-react-msg')) {
        el.remove();
      }
    });
  });

  // Ghi đè hoặc thêm sự kiện enter cho chat nhóm
  const groupInput = document.getElementById('group-chat-input');
  if (groupInput) {
    groupInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendGroupMessageRich();
      }
    });
  }
});

/* ==========================================================================
   REACTIVE RENDERING ENGINE
   ========================================================================== */
function renderOrUpdateMessage(msgId, msg) {
  loadedMessages[msgId] = msg;
  const container = document.getElementById('group-chat-messages');
  if (!container) return;

  // Xóa placeholder "Chưa có nhóm nào" hoặc "Chọn nhóm"
  const empty = container.querySelector('.log-empty');
  if (empty) empty.remove();

  const isMe = currentUser && msg.uid === currentUser.uid;
  const time = msg.timestamp
    ? new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : '';

  // Đánh dấu đã xem (Read Receipts) nếu mình nhận được tin nhắn của người khác
  if (currentUser && msg.uid !== currentUser.uid && (!msg.readBy || !msg.readBy[currentUser.uid])) {
    db.ref(`groups/${activeGroupId}/chat/${msgId}/readBy/${currentUser.uid}`).set(currentUser.displayName || 'Ẩn danh');
  }

  // Tìm div tin nhắn cũ hoặc tạo mới
  let div = document.getElementById(`msg-${msgId}`);
  let isNew = false;
  if (!div) {
    div = document.createElement('div');
    div.id = `msg-${msgId}`;
    isNew = true;
  }
  div.className = `chat-msg ${isMe ? 'chat-msg-me' : ''}`;
  div.style.position = 'relative';

  // Build message HTML
  let bubbleContentHtml = '';

  // 1. Quoted Inline Reply (nếu có)
  if (msg.replyTo) {
    bubbleContentHtml += `
      <div class="chat-reply-quote" onclick="scrollToMessage('${msg.replyTo.msgId}')">
        <span class="chat-reply-quote-sender">↩️ ${escapeHtml(msg.replyTo.name)}</span>
        <span class="chat-reply-quote-text">${escapeHtml(msg.replyTo.text)}</span>
      </div>
    `;
  }

  // 2. Nội dung tin nhắn chính theo type
  if (msg.isUnsent) {
    bubbleContentHtml += `<div class="chat-text msg-unsent-text">🚫 Tin nhắn đã được thu hồi</div>`;
  } else {
    switch (msg.type) {
      case 'voice':
        bubbleContentHtml += renderVoicePlayerHtml(msgId, msg.fileUrl);
        break;
      case 'image':
        bubbleContentHtml += `<img class="chat-image-render" src="${msg.fileUrl}" onclick="openLightbox('${msg.fileUrl}')" alt="Hình ảnh"/>`;
        break;
      case 'video':
        bubbleContentHtml += `<video class="chat-video-render" src="${msg.fileUrl}" controls></video>`;
        break;
      case 'file':
        bubbleContentHtml += renderFileCardHtml(msg.fileUrl, msg.fileName, msg.fileSize);
        break;
      case 'sticker':
        bubbleContentHtml += `<img class="chat-sticker-render" src="${msg.fileUrl}" alt="Sticker"/>`;
        break;
      default:
        // Text message
        let textHtml = escapeHtml(msg.text || '');
        // Highlight search term if active
        const searchInput = document.getElementById('group-chat-search-input');
        const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
        if (query && textHtml.toLowerCase().includes(query)) {
          const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
          textHtml = textHtml.replace(regex, `<span class="search-highlight">$1</span>`);
        }
        bubbleContentHtml += `<div class="chat-text">${textHtml}</div>`;
        break;
    }
  }

  // 3. Reactions render
  let reactionsHtml = '';
  if (msg.reactions && !msg.isUnsent) {
    reactionsHtml += `<div class="chat-reactions-wrapper">`;
    Object.entries(msg.reactions).forEach(([emoji, votersObj]) => {
      const voters = Object.entries(votersObj);
      if (voters.length === 0) return;

      const isMyReaction = currentUser && votersObj[currentUser.uid];
      const voterNames = voters.map(([_, name]) => name).join(', ');
      reactionsHtml += `
        <span class="chat-reaction-badge ${isMyReaction ? 'my-reaction' : ''}" 
              onclick="addReaction('${msgId}', '${emoji}')" 
              data-tooltip="Đã thả: ${voterNames}">
          <span>${emoji}</span>
          <span class="chat-reaction-badge-count">${voters.length}</span>
        </span>
      `;
    });
    reactionsHtml += `</div>`;
  }
  bubbleContentHtml += reactionsHtml;

  // 4. Read Receipts rendering
  let seenHtml = '';
  if (isMe && msg.readBy) {
    const readers = Object.entries(msg.readBy)
      .filter(([uid]) => uid !== currentUser.uid)
      .map(([_, name]) => name);
    
    if (readers.length > 0) {
      const group = myGroups[activeGroupId];
      if (group && group.type === 'dm') {
        seenHtml = `<span class="chat-read-receipts">✓ Đã xem</span>`;
      } else {
        seenHtml = `<span class="chat-read-receipts" title="Đã xem bởi: ${readers.join(', ')}">✓ Đã xem (${readers.length})</span>`;
      }
    }
  }
  bubbleContentHtml += seenHtml;

  // Build full message layout
  div.innerHTML = `
    <img class="chat-avatar" src="${msg.avatar || ''}" alt=""
         onerror="this.style.display='none'"/>
    <div class="chat-bubble">
      <div class="chat-meta">
        <span class="chat-name">${escapeHtml(msg.name || 'Ẩn danh')}</span>
        <span class="chat-time">${time}</span>
      </div>
      <div class="bubble-body-content">
        ${bubbleContentHtml}
      </div>
    </div>

    <!-- Actions floating buttons on hover -->
    ${!msg.isUnsent ? `
      <div class="chat-msg-actions">
        <button class="chat-action-btn btn-react-msg" title="Thả cảm xúc" onclick="showReactionPicker(event, '${msgId}')">😊</button>
        <button class="chat-action-btn btn-reply-msg" title="Phản hồi" onclick="replyToMessage('${msgId}', '${escapeHtml(msg.text || (msg.type === 'file' ? '[Tập tin]' : '[' + msg.type + ']'))}', '${escapeHtml(msg.name)}')">↩️</button>
        ${isMe ? `<button class="chat-action-btn btn-delete-msg" title="Thu hồi" onclick="unsendMessage('${msgId}')">🗑️</button>` : ''}
      </div>
    ` : ''}
  `;

  if (isNew) {
    container.appendChild(div);
  }

  // Tự động cuộn xuống khi nhận tin mới hoặc nếu tin nhắn do chính mình gửi
  if (isNew) {
    container.scrollTop = container.scrollHeight;
  }

  // Dọn dẹp tin nhắn cũ để giảm lag
  while (container.children.length > 120) {
    container.removeChild(container.firstChild);
  }

  // Kích hoạt audio player script hooks
  if (msg.type === 'voice') {
    hookAudioPlayer(msgId);
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ==========================================================================
   RICH SEND MESSAGE
   ========================================================================== */
async function sendGroupMessageRich() {
  if (!currentUser || !activeGroupId || !isFirebaseConfigured) return;

  // Check block status
  const group = myGroups[activeGroupId];
  if (group && group.type === 'dm') {
    const peerUid = Object.keys(group.members).find(uid => uid !== currentUser.uid);
    if (peerUid && (myBlocks[peerUid] || myBlockedBy[peerUid])) {
      showToast('⚠️ Không thể gửi tin nhắn! Người dùng đã bị chặn hoặc bạn đã bị chặn.', 'error');
      return;
    }
  }

  const input = document.getElementById('group-chat-input');
  if (!input) return;

  const text = input.value.trim();
  if (!text && pendingChatFiles.length === 0) return;

  if (pendingChatFiles.length > 0) {
    await sendPendingChatFiles();
  }

  if (!text) {
    input.value = '';
    input.focus();
    return;
  }

  const messageData = {
    uid: currentUser.uid,
    name: currentUser.displayName || 'Ẩn danh',
    avatar: currentUser.photoURL || '',
    text: text,
    type: 'text',
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };

  // Đính kèm replyTo nếu đang phản hồi
  if (replyingTo) {
    messageData.replyTo = replyingTo;
    cancelReply();
  }

  db.ref(`groups/${activeGroupId}/chat`).push(messageData);

  input.value = '';
  input.focus();
}

// override global sendGroupMessage from groups.js
window.sendGroupMessage = sendGroupMessageRich;

/* ==========================================================================
   VOICE RECORDER LOGIC (Voice Message)
   ========================================================================== */
async function toggleVoiceRecord() {
  if (isVoiceRecording) {
    stopVoiceRecording();
  } else {
    await startVoiceRecording();
  }
}

async function startVoiceRecording() {
  if (!currentUser || !activeGroupId) {
    showToast('Chưa chọn nhóm để gửi tin nhắn thoại.', 'error');
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Trình duyệt không hỗ trợ ghi âm!', 'error');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      
      // Release tracks
      stream.getTracks().forEach(t => t.stop());

      if (audioBlob.size < 100) return; // Quá ngắn

      showToast('🎤 Đang gửi tin nhắn thoại...', 'info');

      try {
        let voiceUrl = '';
        if (storage) {
          const voiceRef = storage.ref().child(`chats/${activeGroupId}/voice_${Date.now()}.webm`);
          const snapshot = await voiceRef.put(audioBlob);
          voiceUrl = await snapshot.ref.getDownloadURL();
        } else {
          // fallback to base64
          if (audioBlob.size > 50000) {
            showToast('Lỗi: File ghi âm quá lớn!', 'error');
            return;
          }
          voiceUrl = await fileToBase64(audioBlob);
        }

        db.ref(`groups/${activeGroupId}/chat`).push({
          uid: currentUser.uid,
          name: currentUser.displayName || 'Ẩn danh',
          avatar: currentUser.photoURL || '',
          text: '',
          type: 'voice',
          fileUrl: voiceUrl,
          timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        showToast('Tin nhắn thoại đã gửi thành công!', 'success');
      } catch (err) {
        console.error(err);
        showToast('Không thể gửi tin nhắn thoại!', 'error');
      }
    };

    mediaRecorder.start();
    isVoiceRecording = true;
    recordingSeconds = 0;

    const micBtn = document.getElementById('btn-chat-mic');
    if (micBtn) {
      micBtn.classList.add('recording');
      micBtn.title = 'Nhấn để dừng ghi âm và gửi';
      micBtn.textContent = '🛑';
    }

    recordingTimer = setInterval(() => {
      recordingSeconds++;
      showToast(` Ghi âm: ${recordingSeconds}s`, 'info');
    }, 1000);

  } catch (err) {
    console.error('Record error:', err);
    showToast('Lỗi truy cập microphone!', 'error');
  }
}

function stopVoiceRecording() {
  if (!isVoiceRecording || !mediaRecorder) return;
  
  mediaRecorder.stop();
  isVoiceRecording = false;

  clearInterval(recordingTimer);
  recordingSeconds = 0;

  const micBtn = document.getElementById('btn-chat-mic');
  if (micBtn) {
    micBtn.classList.remove('recording');
    micBtn.title = 'Gửi tin nhắn thoại';
    micBtn.textContent = '🎤';
  }
}

/* ==========================================================================
   CUSTOM PLAYBACK (Audio Player rendering)
   ========================================================================== */
function renderVoicePlayerHtml(msgId, fileUrl) {
  return `
    <div class="chat-voice-player" id="voice-player-${msgId}">
      <button class="voice-play-btn" id="voice-btn-${msgId}">▶</button>
      <div class="voice-progress-container" id="voice-track-${msgId}">
        <div class="voice-progress-bar" id="voice-bar-${msgId}"></div>
      </div>
      <span class="voice-duration" id="voice-time-${msgId}">0:00</span>
      <audio id="audio-el-${msgId}" src="${fileUrl}" style="display:none;"></audio>
    </div>
  `;
}

function hookAudioPlayer(msgId) {
  const audio = document.getElementById(`audio-el-${msgId}`);
  const playBtn = document.getElementById(`voice-btn-${msgId}`);
  const progressBar = document.getElementById(`voice-bar-${msgId}`);
  const track = document.getElementById(`voice-track-${msgId}`);
  const timeLabel = document.getElementById(`voice-time-${msgId}`);

  if (!audio || !playBtn) return;

  // Play/Pause toggle
  playBtn.onclick = () => {
    // Dừng các player khác nếu đang phát
    document.querySelectorAll('audio').forEach(aud => {
      if (aud !== audio) {
        aud.pause();
        const otherId = aud.id.replace('audio-el-', '');
        const otherBtn = document.getElementById(`voice-btn-${otherId}`);
        if (otherBtn) otherBtn.textContent = '▶';
      }
    });

    if (audio.paused) {
      audio.play().catch(() => showToast('Không thể phát âm thanh!', 'error'));
      playBtn.textContent = '⏸';
    } else {
      audio.pause();
      playBtn.textContent = '▶';
    }
  };

  // Time & Progress update
  audio.ontimeupdate = () => {
    const pct = (audio.currentTime / audio.duration) * 100 || 0;
    if (progressBar) progressBar.style.width = `${pct}%`;

    const m = Math.floor(audio.currentTime / 60);
    const s = Math.floor(audio.currentTime % 60);
    if (timeLabel) timeLabel.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  };

  audio.onended = () => {
    playBtn.textContent = '▶';
    if (progressBar) progressBar.style.width = '0%';
    if (timeLabel) timeLabel.textContent = '0:00';
  };

  // Loaded metadata setup duration display
  audio.onloadedmetadata = () => {
    const m = Math.floor(audio.duration / 60);
    const s = Math.floor(audio.duration % 60);
    if (timeLabel) timeLabel.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Seek click listener
  if (track) {
    track.onclick = (e) => {
      const rect = track.getBoundingClientRect();
      const clickPos = (e.clientX - rect.left) / rect.width;
      audio.currentTime = clickPos * audio.duration;
    };
  }
}

/* ==========================================================================
   FILE SHARING CARD HTML
   ========================================================================== */
function renderFileCardHtml(url, name, size) {
  const sizeText = formatBytes(size);
  let icon = '📄';
  if (name.endsWith('.pdf')) icon = '📕';
  else if (name.endsWith('.zip') || name.endsWith('.rar')) icon = '📦';
  else if (name.endsWith('.doc') || name.endsWith('.docx')) icon = '📘';
  else if (name.endsWith('.xls') || name.endsWith('.xlsx')) icon = '📗';

  return `
    <div class="chat-file-card">
      <span class="chat-file-icon">${icon}</span>
      <div class="chat-file-info">
        <span class="chat-file-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
        <span class="chat-file-size">${sizeText}</span>
      </div>
      <a class="btn-file-download" href="${url}" target="_blank" download="${escapeHtml(name)}" title="Tải xuống tệp">📥</a>
    </div>
  `;
}

function formatBytes(bytes, decimals = 1) {
  if (!bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

/* ==========================================================================
   ATTACHMENT UPLOADING (File / Image / Video)
   ========================================================================== */
function triggerFileSelect() {
  document.getElementById('chat-file-input').click();
}

async function handleChatFileSelected(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  if (!activeGroupId) {
    showToast('⚠️ Chưa chọn nhóm để gửi tệp.', 'error');
    event.target.value = '';
    return;
  }

  const group = myGroups[activeGroupId];
  if (group && group.type === 'dm') {
    const peerUid = Object.keys(group.members).find(uid => uid !== currentUser.uid);
    if (peerUid && (myBlocks[peerUid] || myBlockedBy[peerUid])) {
      showToast('⚠️ Không thể gửi tệp! Người dùng đã bị chặn hoặc bạn đã bị chặn.', 'error');
      event.target.value = '';
      return;
    }
  }

  const newPending = files.map(file => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file
  }));

  pendingChatFiles = pendingChatFiles.concat(newPending);
  renderPendingChatFiles();
  showToast('📁 Đã thêm tệp. Nhấn nút gửi để gửi tệp.', 'info');
  event.target.value = '';
}

async function sendPendingChatFiles() {
  if (!currentUser || !activeGroupId || pendingChatFiles.length === 0) return;

  const filesToSend = [...pendingChatFiles];
  for (const item of filesToSend) {
    const success = await sendSinglePendingFile(item);
    if (success) {
      pendingChatFiles = pendingChatFiles.filter(p => p.id !== item.id);
      renderPendingChatFiles();
    }
  }
}

async function sendSinglePendingFile(item) {
  if (!currentUser || !activeGroupId || !item || !item.file) return false;

  try {
    showToast(`📁 Đang tải tệp lên: ${item.file.name}`, 'info');

    let fileUrl = '';
    if (storage) {
      const fileRef = storage.ref().child(`chats/${activeGroupId}/${Date.now()}_${item.file.name}`);
      const snapshot = await fileRef.put(item.file);
      fileUrl = await snapshot.ref.getDownloadURL();
    } else {
      if (item.file.size > 102400) {
        showToast('Tệp quá lớn! Vui lòng gửi tệp nhỏ hơn 100KB khi không dùng Firebase Storage.', 'error');
        return false;
      }
      fileUrl = await fileToBase64(item.file);
    }

    let type = 'file';
    if (item.file.type.startsWith('image/')) type = 'image';
    else if (item.file.type.startsWith('video/')) type = 'video';

    await db.ref(`groups/${activeGroupId}/chat`).push({
      uid: currentUser.uid,
      name: currentUser.displayName || 'Ẩn danh',
      avatar: currentUser.photoURL || '',
      text: '',
      type: type,
      fileUrl: fileUrl,
      fileName: item.file.name,
      fileSize: item.file.size,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });

    showToast(`Tệp ${item.file.name} đã gửi thành công!`, 'success');
    return true;
  } catch (err) {
    console.error(err);
    showToast(`Không thể tải tệp ${item.file.name} lên!`, 'error');
    return false;
  }
}

function getFilePreviewIcon(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.pdf')) return '📕';
  if (name.endsWith('.zip') || name.endsWith('.rar') || name.endsWith('.7z') || name.endsWith('.tar') || name.endsWith('.gz')) return '📦';
  if (name.endsWith('.doc') || name.endsWith('.docx')) return '📘';
  if (name.endsWith('.xls') || name.endsWith('.xlsx') || name.endsWith('.csv')) return '📗';
  if (name.endsWith('.ppt') || name.endsWith('.pptx')) return '📙';
  if (file.type.startsWith('image/')) return '🖼️';
  if (file.type.startsWith('video/')) return '🎞️';
  if (file.type.startsWith('audio/')) return '🎧';
  return '📎';
}

function renderPendingChatFiles() {
  const preview = document.getElementById('chat-file-preview');
  if (!preview) return;

  if (pendingChatFiles.length === 0) {
    preview.classList.add('hidden');
    preview.innerHTML = '';
    return;
  }

  preview.classList.remove('hidden');
  const toolbar = `
    <div class="chat-file-preview-toolbar">
      <button class="btn-file-send" onclick="sendGroupMessage()">Gửi tệp</button>
    </div>
  `;

  const itemsHtml = pendingChatFiles.map(item => {
    const itemName = escapeHtml(item.file.name);
    const itemSize = formatBytes(item.file.size);
    const itemIcon = getFilePreviewIcon(item.file);
    return `
      <div class="chat-file-preview-card">
        <span class="chat-file-preview-icon">${itemIcon}</span>
        <div class="chat-file-preview-info">
          <div class="chat-file-preview-name" title="${itemName}">${itemName}</div>
          <div class="chat-file-preview-size">${itemSize}</div>
        </div>
        <button class="chat-file-preview-cancel" onclick="removePendingChatFile('${item.id}')" title="Hủy tệp">✕</button>
      </div>
    `;
  }).join('');

  preview.innerHTML = toolbar + itemsHtml;
}

function removePendingChatFile(id) {
  pendingChatFiles = pendingChatFiles.filter(item => item.id !== id);
  renderPendingChatFiles();
}

/* ==========================================================================
   PICKER PANEL (Emoji, Sticker, GIF Picker)
   ========================================================================== */
function initPickerPanel() {
  // 1. Render Emojis Tab
  const emojiContainer = document.getElementById('picker-content-emojis');
  if (emojiContainer) {
    const emojis = [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'
    ];
    emojiContainer.innerHTML = emojis.map(em => `
      <button class="picker-emoji-btn" onclick="insertEmoji('${em}')">${em}</button>
    `).join('');
  }

  // 2. Render Stickers Tab
  const stickerContainer = document.getElementById('picker-content-stickers');
  if (stickerContainer) {
    stickerContainer.innerHTML = STICKER_LIST.map(st => `
      <img class="picker-sticker-img" src="${st.url}" alt="${st.name}" onclick="sendSticker('${st.url}')"/>
    `).join('');
  }

  // 3. Render Fallback GIFs immediately
  const gifResults = document.getElementById('gif-results');
  if (gifResults) {
    gifResults.innerHTML = GIF_FALLBACKS.map(gUrl => `
      <img class="picker-gif-img" src="${gUrl}" alt="GIF" onclick="sendSticker('${gUrl}')"/>
    `).join('');
  }
}

function togglePickerPanel() {
  const panel = document.getElementById('chat-picker-panel');
  if (panel) {
    panel.classList.toggle('hidden');
    switchPickerTab('emojis');
  }
}

function switchPickerTab(tab) {
  activePickerTab = tab;
  ['emojis', 'stickers', 'gifs'].forEach(t => {
    const btn = document.getElementById(`picker-tab-${t}`);
    const content = document.getElementById(`picker-content-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
    if (content) content.classList.toggle('hidden', t !== tab);
  });
}

function insertEmoji(emoji) {
  const input = document.getElementById('group-chat-input');
  if (input) {
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;
    input.value = text.substring(0, start) + emoji + text.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + emoji.length;
  }
}

function sendSticker(stickerUrl) {
  if (!activeGroupId || !currentUser) return;

  // Check block
  const group = myGroups[activeGroupId];
  if (group && group.type === 'dm') {
    const peerUid = Object.keys(group.members).find(uid => uid !== currentUser.uid);
    if (peerUid && (myBlocks[peerUid] || myBlockedBy[peerUid])) {
      showToast('⚠️ Không thể gửi sticker! Người dùng đã bị chặn hoặc bạn đã bị chặn.', 'error');
      return;
    }
  }

  db.ref(`groups/${activeGroupId}/chat`).push({
    uid: currentUser.uid,
    name: currentUser.displayName || 'Ẩn danh',
    avatar: currentUser.photoURL || '',
    text: '',
    type: 'sticker',
    fileUrl: stickerUrl,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });

  const panel = document.getElementById('chat-picker-panel');
  if (panel) panel.classList.add('hidden');
}

// GIF Search logic using Giphy API (Public Key Fallback)
let _gifTimer = null;
function searchGifs() {
  clearTimeout(_gifTimer);
  _gifTimer = setTimeout(async () => {
    const q = document.getElementById('gif-search-input')?.value.trim() || '';
    const resultsContainer = document.getElementById('gif-results');
    if (!resultsContainer) return;

    if (!q) {
      // Restore Fallbacks
      resultsContainer.innerHTML = GIF_FALLBACKS.map(gUrl => `
        <img class="picker-gif-img" src="${gUrl}" alt="GIF" onclick="sendSticker('${gUrl}')"/>
      `).join('');
      return;
    }

    resultsContainer.innerHTML = '<div style="color:var(--text-secondary);font-size:0.75rem;padding:0.5rem;">Đang tìm...</div>';

    try {
      const response = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(q)}&limit=10`);
      const resData = await response.json();
      const gifs = resData.data || [];

      if (gifs.length === 0) {
        resultsContainer.innerHTML = '<div style="color:var(--text-secondary);font-size:0.75rem;padding:0.5rem;">Không tìm thấy kết quả.</div>';
        return;
      }

      resultsContainer.innerHTML = gifs.map(g => {
        const gifUrl = g.images.fixed_height.url;
        return `
          <img class="picker-gif-img" src="${gifUrl}" alt="GIF" onclick="sendSticker('${gifUrl}')"/>
        `;
      }).join('');

    } catch (err) {
      console.warn('GIF search error:', err);
      // Fallback filter locally
      const filtered = GIF_FALLBACKS.filter(g => g.toLowerCase().includes(q.toLowerCase()));
      if (filtered.length > 0) {
        resultsContainer.innerHTML = filtered.map(gUrl => `
          <img class="picker-gif-img" src="${gUrl}" alt="GIF" onclick="sendSticker('${gUrl}')"/>
        `).join('');
      } else {
        resultsContainer.innerHTML = '<div style="color:var(--text-secondary);font-size:0.75rem;padding:0.5rem;">Lỗi tìm kiếm, hiển thị mặc định:</div>' + GIF_FALLBACKS.map(gUrl => `
          <img class="picker-gif-img" src="${gUrl}" alt="GIF" onclick="sendSticker('${gUrl}')"/>
        `).join('');
      }
    }
  }, 500);
}

/* ==========================================================================
   REACTIONS LOGIC
   ========================================================================== */
function showReactionPicker(event, msgId) {
  event.stopPropagation();
  // Remove existing floating pickers
  const exist = document.querySelectorAll('.reaction-floating-selector');
  exist.forEach(el => el.remove());

  const div = document.createElement('div');
  div.className = 'reaction-floating-selector';

  const emojis = ['❤️', '😂', '😮', '😢', '👍', '🔥'];
  div.innerHTML = emojis.map(em => `
    <span class="reaction-select-emoji" onclick="addReaction('${msgId}', '${em}')">${em}</span>
  `).join('');

  // Position it inside the parent message element
  const msgElement = document.getElementById(`msg-${msgId}`);
  if (msgElement) {
    msgElement.appendChild(div);
  }
}

async function addReaction(msgId, emoji) {
  if (!currentUser || !isFirebaseConfigured) return;
  const myUid = currentUser.uid;
  const myName = currentUser.displayName || 'Ẩn danh';

  // Toggle reaction logic
  const msg = loadedMessages[msgId];
  const hasReacted = msg && msg.reactions && msg.reactions[emoji] && msg.reactions[emoji][myUid];
  const ref = db.ref(`groups/${activeGroupId}/chat/${msgId}/reactions/${emoji}/${myUid}`);

  if (hasReacted) {
    await ref.remove();
  } else {
    await ref.set(myName);
  }

  // Remove reaction selector overlay
  const selector = document.querySelector('.reaction-floating-selector');
  if (selector) selector.remove();
}

/* ==========================================================================
   IN-LINE REPLY LOGIC
   ========================================================================== */
function replyToMessage(msgId, text, senderName) {
  replyingTo = {
    msgId: msgId,
    text: text.length > 50 ? text.substring(0, 48) + '...' : text,
    name: senderName
  };

  const preview = document.getElementById('reply-preview-bar');
  const nameEl = document.getElementById('reply-to-name');
  const textEl = document.getElementById('reply-to-text');

  if (preview && nameEl && textEl) {
    nameEl.textContent = senderName;
    textEl.textContent = text;
    preview.classList.remove('hidden');
  }

  const input = document.getElementById('group-chat-input');
  if (input) input.focus();
}

function cancelReply() {
  replyingTo = null;
  const preview = document.getElementById('reply-preview-bar');
  if (preview) preview.classList.add('hidden');
}

function scrollToMessage(msgId) {
  const el = document.getElementById(`msg-${msgId}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('search-highlight-active');
    setTimeout(() => {
      el.classList.remove('search-highlight-active');
    }, 1500);
  } else {
    showToast('Không tìm thấy tin nhắn gốc hoặc tin nhắn cũ quá!', 'info');
  }
}

/* ==========================================================================
   UNSEND / DELETE MESSAGE
   ========================================================================== */
async function unsendMessage(msgId) {
  if (!currentUser || !isFirebaseConfigured) return;
  if (!confirm('Bạn có chắc chắn muốn thu hồi tin nhắn này?')) return;

  try {
    await db.ref(`groups/${activeGroupId}/chat/${msgId}`).update({
      isUnsent: true,
      text: null,
      fileUrl: null,
      fileName: null,
      fileSize: null,
      replyTo: null
    });
    showToast('Tin nhắn đã được thu hồi.', 'info');
  } catch (err) {
    console.error(err);
    showToast('Không thể thu hồi tin nhắn!', 'error');
  }
}

/* ==========================================================================
   SEARCH HISTORY LOGIC
   ========================================================================== */
function toggleChatSearch() {
  const bar = document.getElementById('group-chat-search-bar');
  if (bar) {
    const isHidden = bar.style.display === 'none' || bar.classList.contains('hidden');
    if (isHidden) {
      bar.style.display = 'flex';
      bar.classList.remove('hidden');
      const input = document.getElementById('group-chat-search-input');
      if (input) { input.value = ''; input.focus(); }
    } else {
      closeChatSearch();
    }
  }
}

function closeChatSearch() {
  const bar = document.getElementById('group-chat-search-bar');
  if (bar) {
    bar.style.display = 'none';
    bar.classList.add('hidden');
  }

  // Clear Highlights
  document.querySelectorAll('.search-highlight').forEach(el => {
    const txt = el.textContent;
    el.replaceWith(document.createTextNode(txt));
  });

  searchMatches = [];
  activeSearchIndex = -1;
  const countEl = document.getElementById('search-result-count');
  if (countEl) countEl.textContent = '0/0';
}

function searchChatHistory() {
  const query = document.getElementById('group-chat-search-input')?.value.trim().toLowerCase() || '';
  
  // Reset highlights first
  document.querySelectorAll('.search-highlight').forEach(el => {
    const txt = el.textContent;
    el.replaceWith(document.createTextNode(txt));
  });

  searchMatches = [];
  activeSearchIndex = -1;

  if (!query) {
    const countEl = document.getElementById('search-result-count');
    if (countEl) countEl.textContent = '0/0';
    return;
  }

  // Find matches and re-render
  Object.entries(loadedMessages).forEach(([msgId, msg]) => {
    if (msg.type === 'text' && msg.text && msg.text.toLowerCase().includes(query)) {
      renderOrUpdateMessage(msgId, msg);
    }
  });

  // Collect matches in DOM
  const container = document.getElementById('group-chat-messages');
  if (!container) return;

  const msgDivs = container.querySelectorAll('.chat-msg');
  msgDivs.forEach(div => {
    const highlight = div.querySelector('.search-highlight');
    if (highlight) {
      searchMatches.push({
        msgId: div.id.replace('msg-', ''),
        element: div
      });
    }
  });

  // Set first match active
  if (searchMatches.length > 0) {
    activeSearchIndex = 0;
    scrollToMatch(0);
  }

  updateSearchCounter();
}

function navigateSearch(direction) {
  if (searchMatches.length === 0) return;

  // Clear active highlight
  searchMatches.forEach(m => m.element.classList.remove('search-highlight-active'));

  if (direction === 'next') {
    activeSearchIndex = (activeSearchIndex + 1) % searchMatches.length;
  } else {
    activeSearchIndex = (activeSearchIndex - 1 + searchMatches.length) % searchMatches.length;
  }

  scrollToMatch(activeSearchIndex);
  updateSearchCounter();
}

function scrollToMatch(idx) {
  const match = searchMatches[idx];
  if (match && match.element) {
    match.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    match.element.classList.add('search-highlight-active');
  }
}

function updateSearchCounter() {
  const countEl = document.getElementById('search-result-count');
  if (countEl) {
    if (searchMatches.length === 0) {
      countEl.textContent = '0/0';
    } else {
      countEl.textContent = `${activeSearchIndex + 1}/${searchMatches.length}`;
    }
  }
}

/* ==========================================================================
   IMAGE LIGHTBOX PREVIEW
   ========================================================================== */
function initLightbox() {
  lightboxModal = document.createElement('div');
  lightboxModal.className = 'lightbox-modal hidden';
  lightboxModal.id = 'lightbox-modal';

  lightboxModal.innerHTML = `
    <button class="lightbox-close" onclick="closeLightbox()">✕</button>
    <img class="lightbox-img" id="lightbox-img" src="" alt="Lightbox View"/>
  `;

  document.body.appendChild(lightboxModal);
}

function openLightbox(url) {
  if (lightboxModal && lightboxImg) {
    lightboxImg.src = url;
    lightboxModal.classList.remove('hidden');
  } else {
    lightboxImg = document.getElementById('lightbox-img');
    lightboxModal = document.getElementById('lightbox-modal');
    if (lightboxModal && lightboxImg) {
      lightboxImg.src = url;
      lightboxModal.classList.remove('hidden');
    }
  }
}

function closeLightbox() {
  if (lightboxModal) {
    lightboxModal.classList.add('hidden');
  }
}
window.openLightbox = openLightbox;
window.closeLightbox = closeLightbox;
