/* ================================================
   friends.js — Hệ thống Kết Bạn
   ================================================ */

let friendsRef = null;
let friendReqRef = null;
let myFriends = {};      // { uid: { name, avatar, online } }
let pendingRequests = {}; // { fromUid: { name, avatar, timestamp } }
let myBlocks = {};      // { uid: true } - users I blocked
let myBlockedBy = {};   // { uid: true } - users who blocked me
let friendStatusRefs = {}; // { uid: ref }

/* =============================================
   KHỞI TẠO
   ============================================= */
function initFriends() {
  if (!currentUser || !isFirebaseConfigured) return;
  listenToBlocks();
  listenToFriends();
  listenToFriendRequests();
}

function listenToBlocks() {
  if (!currentUser) return;
  const myUid = currentUser.uid;

  db.ref(`blocks/${myUid}`).on('value', (snap) => {
    myBlocks = snap.val() || {};
    renderFriendList();
  });

  db.ref(`blockedBy/${myUid}`).on('value', (snap) => {
    myBlockedBy = snap.val() || {};
    renderFriendList();
  });
}

/* =============================================
   LƯU USER PROFILE (để có thể tìm kiếm)
   ============================================= */
function saveUserProfile(user) {
  if (!isFirebaseConfigured || !user) return;

  const profileData = {
    uid: user.uid,
    displayName: user.displayName || user.email || 'Ẩn danh',
    email: user.email || '',
    avatar: user.photoURL || '',
    online: true,
    updatedAt: firebase.database.ServerValue.TIMESTAMP
  };

  console.log('[Friends] Saving user profile:', profileData);

  db.ref('users/' + user.uid).update(profileData)
    .then(() => console.log('[Friends] ✅ Profile saved to /users/' + user.uid))
    .catch(err => console.error('[Friends] ❌ Failed to save profile:', err));

  // Đặt offline khi disconnect
  db.ref('users/' + user.uid + '/online').onDisconnect().set(false);
}

/* =============================================
   TÌM KIẾM NGƯỜI DÙNG
   ============================================= */
async function searchUsers(query) {
  if (!query || query.trim().length < 2) return [];
  if (!currentUser || !isFirebaseConfigured) return [];
  const q = query.trim().toLowerCase();

  console.log('[Friends] Searching users with query:', q);

  try {
    const snapshot = await db.ref('users').once('value');
    const allUsers = snapshot.val();
    console.log('[Friends] Total users in DB:', allUsers ? Object.keys(allUsers).length : 0, allUsers);

    if (!allUsers) {
      console.warn('[Friends] /users node is empty or no permission to read.');
      return [];
    }

    const results = [];
    snapshot.forEach(child => {
      const u = child.val();
      if (!u) return;
      if (u.uid === currentUser.uid) return; // bỏ bản thân

      const nameMatch  = (u.displayName || '').toLowerCase().includes(q);
      const emailMatch = (u.email || '').toLowerCase().includes(q);

      if (nameMatch || emailMatch) {
        results.push(u);
      }
    });

    console.log('[Friends] Search results:', results.length, results);
    return results.slice(0, 10);
  } catch (err) {
    console.error('[Friends] ❌ searchUsers error:', err);
    return [];
  }
}

/* =============================================
   GỬI LỜI MỜI KẾT BẠN
   ============================================= */
async function sendFriendRequest(targetUid, targetName, targetAvatar) {
  if (!currentUser || !isFirebaseConfigured) return;
  const myUid = currentUser.uid;

  // Kiểm tra đã là bạn chưa
  if (myFriends[targetUid]) {
    showToast('Đã là bạn bè rồi!', 'info');
    return;
  }

  // Ghi lời mời vào /friendRequests/{targetUid}/{myUid}
  await db.ref(`friendRequests/${targetUid}/${myUid}`).set({
    fromUid: myUid,
    fromName: currentUser.displayName || 'Ẩn danh',
    fromAvatar: currentUser.photoURL || '',
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });

  // Đánh dấu mình đã gửi vào /friends/{myUid}/{targetUid}
  await db.ref(`friends/${myUid}/${targetUid}`).set({
    status: 'pending',
    direction: 'sent',
    name: targetName,
    avatar: targetAvatar,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });

  showToast('✅ Đã gửi lời mời kết bạn!', 'success');
}

/* =============================================
   CHẤP NHẬN LỜI MỜI
   ============================================= */
async function acceptFriendRequest(fromUid) {
  if (!currentUser || !isFirebaseConfigured) return;
  const myUid = currentUser.uid;
  const req = pendingRequests[fromUid];
  if (!req) return;

  const batch = {};

  // Thêm vào /friends của cả 2
  batch[`friends/${myUid}/${fromUid}`] = {
    status: 'accepted',
    name: req.fromName,
    avatar: req.fromAvatar,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };
  batch[`friends/${fromUid}/${myUid}`] = {
    status: 'accepted',
    name: currentUser.displayName || 'Ẩn danh',
    avatar: currentUser.photoURL || '',
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };

  // Xóa lời mời
  batch[`friendRequests/${myUid}/${fromUid}`] = null;

  await db.ref().update(batch);
  showToast('🎉 Kết bạn thành công!', 'success');
}

/* =============================================
   TỪ CHỐI LỜI MỜI
   ============================================= */
async function declineFriendRequest(fromUid) {
  if (!currentUser || !isFirebaseConfigured) return;
  const myUid = currentUser.uid;

  // Xóa lời mời
  await db.ref(`friendRequests/${myUid}/${fromUid}`).remove();

  // Xóa trạng thái pending phía người gửi
  await db.ref(`friends/${fromUid}/${myUid}`).remove();

  showToast('Đã từ chối lời mời.', 'info');
  delete pendingRequests[fromUid];
  renderFriendRequests();
}

/* =============================================
   XÓA BẠN
   ============================================= */
async function removeFriend(friendUid) {
  if (!currentUser || !isFirebaseConfigured) return;
  const myUid = currentUser.uid;
  if (!confirm('Xóa bạn bè?')) return;

  const batch = {};
  batch[`friends/${myUid}/${friendUid}`] = null;
  batch[`friends/${friendUid}/${myUid}`] = null;
  await db.ref().update(batch);

  showToast('Đã xóa bạn bè.', 'info');
}

/* =============================================
   LẮNG NGHE DANH SÁCH BẠN BÈ
   ============================================= */
function listenToFriends() {
  if (!currentUser) return;
  const myUid = currentUser.uid;

  db.ref(`friends/${myUid}`).on('value', (snapshot) => {
    myFriends = {};
    snapshot.forEach(child => {
      const data = child.val();
      if (data && data.status === 'accepted') {
        myFriends[child.key] = data;
      }
    });
    renderFriendList();
    // Cập nhật friend-picker trong modal tạo nhóm
    if (typeof renderFriendPicker === 'function') renderFriendPicker();
  });
}

/* =============================================
   LẮNG NGHE LỜI MỜI KẾT BẠN ĐẾN
   ============================================= */
function listenToFriendRequests() {
  if (!currentUser) return;
  const myUid = currentUser.uid;

  db.ref(`friendRequests/${myUid}`).on('value', (snapshot) => {
    pendingRequests = {};
    snapshot.forEach(child => {
      pendingRequests[child.key] = child.val();
    });
    renderFriendRequests();
    updateFriendBadge();
  });
}

/* =============================================
   RENDER LỜI MỜI ĐẾN
   ============================================= */
function renderFriendRequests() {
  const container = document.getElementById('friend-requests-list');
  const section   = document.getElementById('friend-requests-section');
  if (!container || !section) return;

  const reqs = Object.entries(pendingRequests);

  if (reqs.length === 0) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');

  container.innerHTML = reqs.map(([uid, req]) => `
    <div class="friend-req-item" id="req-${uid}">
      <img class="friend-req-avatar" src="${req.fromAvatar || ''}"
           alt="" onerror="this.style.display='none'"/>
      <span class="friend-req-name">${escapeHtml(req.fromName || 'Ẩn danh')}</span>
      <div class="friend-req-actions">
        <button class="btn-accept" onclick="acceptFriendRequest('${uid}')">✓</button>
        <button class="btn-decline" onclick="declineFriendRequest('${uid}')">✕</button>
      </div>
    </div>
  `).join('');
}

/* =============================================
   RENDER DANH SÁCH BẠN BÈ
   ============================================= */
function renderFriendList() {
  const container = document.getElementById('friend-list');
  if (!container) return;

  // Lọc bỏ bạn bè bị chặn
  const friends = Object.entries(myFriends).filter(([uid]) => !myBlocks[uid] && !myBlockedBy[uid]);
  if (friends.length === 0) {
    container.innerHTML = '<p class="log-empty">Chưa có bạn bè. Tìm bạn ngay!</p>';
    return;
  }

  container.innerHTML = friends.map(([uid, f]) => `
    <div class="friend-item" data-uid="${uid}"
         onclick="openDMWithFriend('${uid}', '${escapeHtml(f.name || 'Bạn bè')}', '${f.avatar || ''}')">
      <div class="friend-avatar-wrap">
        <img class="friend-avatar" src="${f.avatar || ''}"
             alt="" onerror="this.style.display='none'"/>
        <span class="friend-online-dot" id="fdot-${uid}"></span>
      </div>
      <div class="friend-info">
        <span class="friend-name">${escapeHtml(f.name || 'Bạn bè')}</span>
        <span class="friend-status-text" id="fstatus-${uid}">—</span>
      </div>
      <div class="friend-actions-row" style="display:flex;gap:0.3rem;align-items:center;" onclick="event.stopPropagation()">
        <button class="btn-call-friend" title="Gọi video" onclick="callFriend('${uid}', '${escapeHtml(f.name || 'Bạn bè')}', '${f.avatar || ''}')" style="padding:0.25rem 0.45rem;border:1px solid rgba(0,255,136,0.3);border-radius:6px;background:rgba(0,255,136,0.08);color:var(--accent-green);font-size:0.7rem;cursor:pointer;">
          📞
        </button>
        <button class="btn-block-friend" title="Chặn" onclick="blockUser('${uid}')" style="padding:0.25rem 0.45rem;border:1px solid rgba(255,71,87,0.3);border-radius:6px;background:rgba(255,71,87,0.08);color:var(--accent-red);font-size:0.7rem;cursor:pointer;">
          🚫
        </button>
      </div>
    </div>
  `).join('');

  // Kích hoạt status check sau khi render
  listenToFriendsStatus();
}

function listenToFriendsStatus() {
  // Gỡ bỏ listener cũ
  Object.entries(friendStatusRefs).forEach(([uid, ref]) => ref.off());
  friendStatusRefs = {};

  Object.keys(myFriends).forEach(uid => {
    // Không nghe nếu bị chặn
    if (myBlocks[uid] || myBlockedBy[uid]) return;

    const statusRef = db.ref(`users/${uid}`);
    friendStatusRefs[uid] = statusRef;

    statusRef.on('value', (snap) => {
      const u = snap.val();
      if (!u) return;

      const isOnline = u.online === true;
      const dot = document.getElementById(`fdot-${uid}`);
      const statusText = document.getElementById(`fstatus-${uid}`);

      if (dot) {
        dot.style.backgroundColor = isOnline ? 'var(--accent-green, #00ff88)' : 'var(--text-secondary, #708090)';
        dot.classList.toggle('online', isOnline);
      }

      if (statusText) {
        statusText.textContent = isOnline ? 'Online' : 'Offline';
        statusText.style.color = isOnline ? 'var(--accent-green, #00ff88)' : 'var(--text-secondary, #a0aec0)';
      }
    });
  });
}

/* =============================================
   CHẶN & BÁO CÁO NGƯỜI DÙNG
   ============================================= */
async function blockUser(targetUid) {
  if (!currentUser || !isFirebaseConfigured) return;
  const name = myFriends[targetUid]?.name || 'người dùng này';
  if (!confirm(`Bạn có chắc muốn chặn ${name}? Cả hai sẽ không thể nhắn tin hay gọi điện.`)) return;

  const myUid = currentUser.uid;
  const batch = {};

  batch[`blocks/${myUid}/${targetUid}`] = true;
  batch[`blockedBy/${targetUid}/${myUid}`] = true;

  // Hủy kết bạn
  batch[`friends/${myUid}/${targetUid}`] = null;
  batch[`friends/${targetUid}/${myUid}`] = null;

  // Xóa lời mời kết bạn (nếu có)
  batch[`friendRequests/${myUid}/${targetUid}`] = null;
  batch[`friendRequests/${targetUid}/${myUid}`] = null;

  try {
    await db.ref().update(batch);
    showToast(`🚫 Đã chặn ${name}.`, 'info');
  } catch (err) {
    console.error('Block fail:', err);
    showToast('Lỗi khi chặn người dùng!', 'error');
  }
}

async function unblockUser(targetUid) {
  if (!currentUser || !isFirebaseConfigured) return;
  const myUid = currentUser.uid;
  const batch = {};
  batch[`blocks/${myUid}/${targetUid}`] = null;
  batch[`blockedBy/${targetUid}/${myUid}`] = null;

  try {
    await db.ref().update(batch);
    showToast(`Đã mở chặn.`, 'info');
  } catch (err) {
    console.error('Unblock fail:', err);
  }
}

function reportUser(targetUid) {
  if (!currentUser || !isFirebaseConfigured) return;
  const name = myFriends[targetUid]?.name || 'người dùng này';
  const reason = prompt(`Nhập lý do báo cáo ${name} (ví dụ: gửi tin nhắn rác, quấy rối, ngôn từ thù ghét...):`);
  if (reason === null) return;
  if (!reason.trim()) {
    showToast('Vui lòng nhập lý do báo cáo!', 'error');
    return;
  }

  db.ref(`reports/${targetUid}`).push({
    reporterUid: currentUser.uid,
    reporterName: currentUser.displayName || 'Ẩn danh',
    reason: reason.trim(),
    timestamp: firebase.database.ServerValue.TIMESTAMP
  }).then(() => {
    showToast('⚠️ Đã gửi báo cáo thành công! Admin sẽ xem xét.', 'success');
  }).catch(err => {
    console.error('Report fail:', err);
    showToast('Lỗi khi gửi báo cáo!', 'error');
  });
}

/* =============================================
   CẬP NHẬT BADGE SỐ LỜI MỜI
   ============================================= */
function updateFriendBadge() {
  const badge = document.getElementById('friend-req-badge');
  if (!badge) return;
  const count = Object.keys(pendingRequests).length;
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

/* =============================================
   MỞ MODAL TÌM KIẾM BẠN
   ============================================= */
function openFindFriendModal() {
  const modal = document.getElementById('modal-find-friend');
  if (modal) modal.classList.remove('hidden');
  const input = document.getElementById('search-user-input');
  if (input) { input.value = ''; input.focus(); }
  const results = document.getElementById('search-results');
  if (results) results.innerHTML = '<p class="log-empty">Nhập tên để tìm kiếm...</p>';

  // Force sync profile mỗi lần mở modal (đảm bảo người khác tìm thấy bạn)
  if (currentUser && typeof saveUserProfile === 'function') {
    saveUserProfile(currentUser);
  }
}

function closeFindFriendModal() {
  const modal = document.getElementById('modal-find-friend');
  if (modal) modal.classList.add('hidden');
}

/* =============================================
   XỬ LÝ TÌM KIẾM (debounce 400ms)
   ============================================= */
let _searchTimer = null;
function onSearchInput() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(async () => {
    const q = document.getElementById('search-user-input')?.value || '';
    const container = document.getElementById('search-results');
    if (!container) return;

    if (q.trim().length < 2) {
      container.innerHTML = '<p class="log-empty">Nhập ít nhất 2 ký tự...</p>';
      return;
    }

    container.innerHTML = '<p class="log-empty">Đang tìm...</p>';
    const results = await searchUsers(q);

    if (results.length === 0) {
      container.innerHTML = '<p class="log-empty">Không tìm thấy người dùng.</p>';
      return;
    }

    container.innerHTML = results.map(u => {
      let btnClass = 'btn-add-friend';
      let btnText  = '+ Kết bạn';
      let btnClick = `sendFriendRequest('${u.uid}', '${escapeHtml(u.displayName)}', '${u.avatar}')`;

      if (myFriends[u.uid]) {
        btnClass += ' already'; btnText = '✓ Bạn bè'; btnClick = '';
      } else {
        // Kiểm tra đã gửi lời mời chưa (trong friends/{myUid}/{uid} với status pending)
        // Sẽ cập nhật động từ listener
      }

      return `
        <div class="search-result-item">
          <img class="search-result-avatar" src="${u.avatar || ''}"
               alt="" onerror="this.style.display='none'"/>
          <span class="search-result-name">${escapeHtml(u.displayName || 'Ẩn danh')}</span>
          <button class="${btnClass}" ${btnClick ? `onclick="${btnClick}"` : 'disabled'}>${btnText}</button>
        </div>
      `;
    }).join('');
  }, 400);
}

/* =============================================
   MỞ CHAT TRỰC TIẾP VỚI BẠN (DM) — trong tab Bạn bè
   ============================================= */
let activeDmGroupId = null;
let activeDmFriendUid = null;
let dmChatRef = null;
let dmPeerStatusRef = null;
let dmLoadedMessages = {};
let pendingDmFiles = [];

async function openDMWithFriend(friendUid, friendName, friendAvatar) {
  if (!currentUser || !isFirebaseConfigured) return;
  const myUid = currentUser.uid;

  // Chuyển sang tab Bạn bè (không phải tab Nhóm)
  switchCommunityTab('friends');

  // ID phòng DM: sort 2 uid để luôn nhất quán
  const dmId = [myUid, friendUid].sort().join('_dm_');

  // Tạo nhóm DM nếu chưa tồn tại
  const snap = await db.ref(`groups/${dmId}`).once('value');
  if (!snap.exists()) {
    const batch = {};
    batch[`groups/${dmId}/name`] = friendName;   // tên bạn, không phải "DM: ..."
    batch[`groups/${dmId}/type`] = 'dm';
    batch[`groups/${dmId}/createdBy`] = myUid;
    batch[`groups/${dmId}/createdAt`] = firebase.database.ServerValue.TIMESTAMP;
    batch[`groups/${dmId}/members/${myUid}`] = {
      name: currentUser.displayName || 'Ẩn danh',
      avatar: currentUser.photoURL || '',
      joinedAt: firebase.database.ServerValue.TIMESTAMP
    };
    batch[`groups/${dmId}/members/${friendUid}`] = {
      name: friendName,
      avatar: friendAvatar,
      joinedAt: firebase.database.ServerValue.TIMESTAMP
    };
    await db.ref().update(batch);
  }

  openDmChat(dmId, friendUid, friendName, friendAvatar);
}

function openDmChat(dmId, friendUid, friendName, friendAvatar) {
  activeDmGroupId = dmId;
  activeDmFriendUid = friendUid;
  dmLoadedMessages = {};
  pendingDmFiles = [];
  renderPendingDmFiles();

  // Highlight friend item
  document.querySelectorAll('.friend-item').forEach(el => {
    el.classList.toggle('dm-active', el.dataset.uid === friendUid);
  });

  // Hiện khu chat, ẩn placeholder
  const section = document.getElementById('dm-chat-section');
  const placeholder = document.getElementById('dm-chat-placeholder');
  if (section) section.classList.remove('hidden');
  if (placeholder) placeholder.classList.add('hidden');

  // Cập nhật header
  const nameEl = document.getElementById('dm-peer-name');
  const avatarEl = document.getElementById('dm-peer-avatar');
  if (nameEl) nameEl.textContent = friendName;
  if (avatarEl) { avatarEl.src = friendAvatar || ''; }

  // Xóa tin nhắn cũ
  const msgs = document.getElementById('dm-chat-messages');
  if (msgs) msgs.innerHTML = '';

  // Dừng listener cũ
  if (dmChatRef) dmChatRef.off();
  if (dmPeerStatusRef) dmPeerStatusRef.off();

  // Lắng nghe tin nhắn DM
  dmChatRef = db.ref(`groups/${dmId}/chat`).orderByChild('timestamp').limitToLast(80);
  dmChatRef.on('child_added', (snap) => {
    renderDmMessage(snap.key, snap.val());
  });
  dmChatRef.on('child_changed', (snap) => {
    renderDmMessage(snap.key, snap.val());
  });

  // Lắng nghe trạng thái online của bạn
  dmPeerStatusRef = db.ref(`users/${friendUid}`);
  dmPeerStatusRef.on('value', (snap) => {
    const u = snap.val();
    const dot = document.getElementById('dm-peer-online-dot');
    const statusEl = document.getElementById('dm-peer-status');
    const isOnline = u && u.online === true;
    if (dot) { dot.style.backgroundColor = isOnline ? 'var(--accent-green)' : 'var(--text-secondary)'; dot.classList.toggle('online', isOnline); }
    if (statusEl) { statusEl.textContent = isOnline ? '🟢 Online' : '⚫ Offline'; statusEl.style.color = isOnline ? 'var(--accent-green)' : 'var(--text-secondary)'; }
    // Update avatar if changed
    if (u && u.avatar && avatarEl) avatarEl.src = u.avatar;
  });

  // Load saved background
  if (typeof loadGroupBackground === 'function') {
    setTimeout(() => loadGroupBackground(dmId), 100);
  }

  // Focus input
  setTimeout(() => {
    const input = document.getElementById('dm-chat-input');
    if (input) input.focus();
  }, 150);
}

function renderDmMessage(msgId, msg) {
  if (!msg) return;
  dmLoadedMessages[msgId] = msg;
  const container = document.getElementById('dm-chat-messages');
  if (!container) return;

  const isMe = currentUser && msg.uid === currentUser.uid;
  const time = msg.timestamp
    ? new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : '';

  // Đánh dấu đã xem
  if (currentUser && msg.uid !== currentUser.uid && (!msg.readBy || !msg.readBy[currentUser.uid])) {
    db.ref(`groups/${activeDmGroupId}/chat/${msgId}/readBy/${currentUser.uid}`).set(currentUser.displayName || 'Ẩn danh');
  }

  let div = document.getElementById(`dm-msg-${msgId}`);
  let isNew = false;
  if (!div) { div = document.createElement('div'); div.id = `dm-msg-${msgId}`; isNew = true; }

  div.className = `chat-msg ${isMe ? 'chat-msg-me' : ''}`;

  let bodyHtml = '';
  if (msg.isUnsent) {
    bodyHtml = '<div class="chat-text msg-unsent-text">🚫 Tin nhắn đã được thu hồi</div>';
  } else if (msg.type === 'image') {
    bodyHtml = `<img class="chat-image-render" src="${msg.fileUrl}" onclick="openLightbox('${msg.fileUrl}')" alt="Hình ảnh"/>`;
  } else if (msg.type === 'file') {
    bodyHtml = `<div class="chat-file-card"><span class="chat-file-icon">📄</span><div class="chat-file-info"><span class="chat-file-name">${escapeHtml(msg.fileName||'')}</span></div><a class="btn-file-download" href="${msg.fileUrl}" target="_blank">📥</a></div>`;
  } else {
    bodyHtml = `<div class="chat-text">${escapeHtml(msg.text || '')}</div>`;
  }

  // Seen
  let seenHtml = '';
  if (isMe && msg.readBy) {
    const readers = Object.entries(msg.readBy).filter(([uid]) => uid !== currentUser.uid);
    if (readers.length > 0) seenHtml = '<span class="chat-read-receipts">✓ Đã xem</span>';
  }

  div.innerHTML = `
    <img class="chat-avatar" src="${msg.avatar || ''}" alt="" onerror="this.style.display='none'"/>
    <div class="chat-bubble">
      ${!isMe ? `<div class="chat-meta"><span class="chat-name">${escapeHtml(msg.name||'')}</span><span class="chat-time">${time}</span></div>` : `<div class="chat-meta"><span class="chat-time">${time}</span></div>`}
      ${bodyHtml}
      ${seenHtml}
    </div>
    <div class="chat-msg-actions" style="opacity:0;pointer-events:none;">
      ${!msg.isUnsent && isMe ? `<button class="chat-action-btn btn-delete-msg" title="Thu hồi" onclick="unsendDmMessage('${msgId}')">🗑️</button>` : ''}
    </div>
  `;
  div.onmouseenter = () => { const a = div.querySelector('.chat-msg-actions'); if(a){a.style.opacity='1';a.style.pointerEvents='auto';} };
  div.onmouseleave = () => { const a = div.querySelector('.chat-msg-actions'); if(a){a.style.opacity='0';a.style.pointerEvents='none';} };

  if (isNew) container.appendChild(div);
  if (isNew) container.scrollTop = container.scrollHeight;

  while (container.children.length > 120) container.removeChild(container.firstChild);
}

async function sendDmMessage() {
  if (!currentUser || !activeDmGroupId || !isFirebaseConfigured) return;

  // Check block
  if (activeDmFriendUid && (myBlocks[activeDmFriendUid] || myBlockedBy[activeDmFriendUid])) {
    showToast('⚠️ Không thể gửi tin nhắn! Người dùng đã bị chặn.', 'error');
    return;
  }

  const input = document.getElementById('dm-chat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text && pendingDmFiles.length === 0) return;

  if (pendingDmFiles.length > 0) {
    await sendPendingDmFiles();
  }

  if (!text) {
    input.value = '';
    input.focus();
    return;
  }

  db.ref(`groups/${activeDmGroupId}/chat`).push({
    uid: currentUser.uid,
    name: currentUser.displayName || 'Ẩn danh',
    avatar: currentUser.photoURL || '',
    text: text,
    type: 'text',
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });

  input.value = '';
  input.focus();
}

async function unsendDmMessage(msgId) {
  if (!currentUser || !activeDmGroupId) return;
  await db.ref(`groups/${activeDmGroupId}/chat/${msgId}`).update({ isUnsent: true, text: '' });
}

function toggleDmSearch() {
  const bar = document.getElementById('dm-chat-search-bar');
  if (!bar) return;
  const isHidden = bar.style.display === 'none' || bar.style.display === '';
  bar.style.display = isHidden ? 'flex' : 'none';
  if (isHidden) document.getElementById('dm-search-input')?.focus();
}
function closeDmSearch() {
  const bar = document.getElementById('dm-chat-search-bar');
  if (bar) bar.style.display = 'none';
}
function toggleDmPickerPanel() { showToast('Tính năng emoji cho DM sắp ra mắt!', 'info'); }
function triggerDmFileSelect() { document.getElementById('dm-file-input')?.click(); }
async function handleDmFileSelected(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  if (!activeDmGroupId) {
    showToast('⚠️ Chưa chọn bạn để gửi tệp.', 'error');
    event.target.value = '';
    return;
  }

  if (activeDmFriendUid && (myBlocks[activeDmFriendUid] || myBlockedBy[activeDmFriendUid])) {
    showToast('⚠️ Không thể gửi tệp! Người dùng đã bị chặn.', 'error');
    event.target.value = '';
    return;
  }

  const newFiles = files.map(file => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file
  }));

  pendingDmFiles = pendingDmFiles.concat(newFiles);
  renderPendingDmFiles();
  showToast('📁 Đã thêm tệp. Nhấn nút gửi để gửi tệp.', 'info');
  event.target.value = '';
}

async function sendPendingDmFiles() {
  if (!currentUser || !activeDmGroupId || pendingDmFiles.length === 0) return;

  const filesToSend = [...pendingDmFiles];
  for (const item of filesToSend) {
    const success = await sendSinglePendingDmFile(item);
    if (success) {
      pendingDmFiles = pendingDmFiles.filter(p => p.id !== item.id);
      renderPendingDmFiles();
    }
  }
}

async function sendSinglePendingDmFile(item) {
  if (!currentUser || !activeDmGroupId || !item || !item.file) return false;

  try {
    showToast(`📁 Đang tải tệp lên: ${item.file.name}`, 'info');

    let fileUrl = '';
    if (storage) {
      const ref = storage.ref().child(`chats/${activeDmGroupId}/${Date.now()}_${item.file.name}`);
      const snap = await ref.put(item.file);
      fileUrl = await snap.ref.getDownloadURL();
    } else {
      if (item.file.size > 102400) {
        showToast('Tệp quá lớn!', 'error');
        return false;
      }
      fileUrl = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = e => res(e.target.result);
        reader.onerror = rej;
        reader.readAsDataURL(item.file);
      });
    }

    const type = item.file.type.startsWith('image/') ? 'image' : 'file';

    await db.ref(`groups/${activeDmGroupId}/chat`).push({
      uid: currentUser.uid,
      name: currentUser.displayName || 'Ẩn danh',
      avatar: currentUser.photoURL || '',
      text: '',
      type,
      fileUrl,
      fileName: item.file.name,
      fileSize: item.file.size,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });

    showToast(`Tệp ${item.file.name} đã gửi thành công!`, 'success');
    return true;
  } catch (e) {
    console.error(e);
    showToast(`Lỗi tải tệp ${item.file.name}!`, 'error');
    return false;
  }
}

function renderPendingDmFiles() {
  const preview = document.getElementById('dm-file-preview');
  if (!preview) return;

  if (pendingDmFiles.length === 0) {
    preview.classList.add('hidden');
    preview.innerHTML = '';
    return;
  }

  preview.classList.remove('hidden');
  const toolbar = `
    <div class="chat-file-preview-toolbar">
      <button class="btn-file-send" onclick="sendDmMessage()">Gửi tệp</button>
    </div>
  `;

  const itemsHtml = pendingDmFiles.map(item => {
    const name = escapeHtml(item.file.name);
    const size = formatBytes(item.file.size);
    const icon = getFilePreviewIcon(item.file);
    return `
      <div class="chat-file-preview-card">
        <span class="chat-file-preview-icon">${icon}</span>
        <div class="chat-file-preview-info">
          <div class="chat-file-preview-name" title="${name}">${name}</div>
          <div class="chat-file-preview-size">${size}</div>
        </div>
        <button class="chat-file-preview-cancel" onclick="removePendingDmFile('${item.id}')" title="Hủy tệp">✕</button>
      </div>
    `;
  }).join('');

  preview.innerHTML = toolbar + itemsHtml;
}

function removePendingDmFile(id) {
  pendingDmFiles = pendingDmFiles.filter(item => item.id !== id);
  renderPendingDmFiles();
}

// Enter to send DM
document.addEventListener('DOMContentLoaded', () => {
  const dmInput = document.getElementById('dm-chat-input');
  if (dmInput) dmInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDmMessage(); }
  });
});

/* =============================================
   TOAST NOTIFICATION
   ============================================= */
function showToast(message, type = 'info') {
  let toast = document.getElementById('toast-notification');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.style.cssText = `
      position: fixed; bottom: 1.5rem; right: 1.5rem;
      padding: 0.65rem 1rem;
      border-radius: 10px;
      font-size: 0.82rem;
      font-weight: 600;
      font-family: 'DM Sans', sans-serif;
      z-index: 99999;
      max-width: 280px;
      animation: slideUp 0.25s ease;
      pointer-events: none;
    `;
    document.body.appendChild(toast);
  }

  const colors = {
    success: 'background:rgba(0,255,136,0.15);border:1px solid rgba(0,255,136,0.4);color:#00ff88',
    info:    'background:rgba(0,212,255,0.12);border:1px solid rgba(0,212,255,0.35);color:#00d4ff',
    error:   'background:rgba(255,71,87,0.12);border:1px solid rgba(255,71,87,0.4);color:#ff4757'
  };
  toast.style.cssText += ';' + (colors[type] || colors.info);
  toast.textContent = message;
  toast.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 3000);
}
