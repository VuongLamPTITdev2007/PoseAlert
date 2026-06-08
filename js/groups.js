/* ================================================
   groups.js — Nhóm Chat Riêng
   ================================================ */

let myGroups = {};         // { groupId: { name, memberCount, ... } }
let activeGroupId = null;  // Nhóm đang mở
let groupChatRef = null;   // Firebase listener cho chat nhóm
let selectedFriendUids = new Set(); // Danh sách bạn được chọn khi tạo nhóm

/* =============================================
   KHỞI TẠO
   ============================================= */
function initGroups() {
  if (!currentUser || !isFirebaseConfigured) return;
  listenToMyGroups();
}

/* =============================================
   LẮNG NGHE CÁC NHÓM CỦA MÌNH
   ============================================= */
function listenToMyGroups() {
  if (!currentUser) return;
  const myUid = currentUser.uid;

  // Lắng nghe tất cả groups mà mình là member
  db.ref('groups').on('value', (snapshot) => {
    myGroups = {};
    snapshot.forEach(child => {
      const g = child.val();
      if (g && g.members && g.members[myUid]) {
        myGroups[child.key] = {
          ...g,
          id: child.key,
          memberCount: Object.keys(g.members || {}).length
        };
      }
    });
    renderGroupList();

    // Check if we were active in a group and got kicked
    if (activeGroupId && !myGroups[activeGroupId]) {
      activeGroupId = null;
      const chatSection = document.getElementById('group-chat-section');
      const placeholder = document.getElementById('group-chat-placeholder');
      if (chatSection) chatSection.classList.add('hidden');
      if (placeholder) placeholder.classList.remove('hidden');
      if (groupChatRef) { groupChatRef.off(); groupChatRef = null; }
      closeGroupDetailsModal();
      showToast('⚠️ Bạn đã bị kick hoặc nhóm này không còn tồn tại.', 'error');
    }

    // Tự động cập nhật modal chi tiết nhóm nếu đang mở
    const modal = document.getElementById('modal-group-details');
    if (modal && !modal.classList.contains('hidden') && activeGroupId) {
      renderGroupDetails(activeGroupId);
    }
  });
}

/* =============================================
   TẠO NHÓM MỚI
   ============================================= */
async function createGroup() {
  if (!currentUser || !isFirebaseConfigured) return;
  const nameInput = document.getElementById('group-name-input');
  if (!nameInput) return;

  const groupName = nameInput.value.trim();
  if (!groupName) {
    showToast('Nhập tên nhóm!', 'error');
    return;
  }
  if (selectedFriendUids.size === 0) {
    showToast('Chọn ít nhất 1 thành viên!', 'error');
    return;
  }

  const myUid = currentUser.uid;
  const groupRef = db.ref('groups').push();
  const groupId  = groupRef.key;

  const members = {
    [myUid]: {
      name: currentUser.displayName || 'Ẩn danh',
      avatar: currentUser.photoURL || '',
      joinedAt: firebase.database.ServerValue.TIMESTAMP
    }
  };

  // Thêm các bạn được chọn
  selectedFriendUids.forEach(uid => {
    const f = myFriends[uid];
    if (f) {
      members[uid] = {
        name: f.name || 'Bạn bè',
        avatar: f.avatar || '',
        joinedAt: firebase.database.ServerValue.TIMESTAMP
      };
    }
  });

  await groupRef.set({
    name: groupName,
    type: 'group',
    createdBy: myUid,
    highestAdminUid: myUid,
    admins: {
      [myUid]: true
    },
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    members
  });

  closeCreateGroupModal();
  showToast(`🎉 Tạo nhóm "${groupName}" thành công!`, 'success');

  // Tự động mở nhóm vừa tạo
  openGroupChat(groupId);
}

/* =============================================
   MỞ NHÓM CHAT
   ============================================= */
function openGroupChat(groupId) {
  activeGroupId = groupId;

  // Cập nhật UI danh sách nhóm (highlight active)
  document.querySelectorAll('.group-item').forEach(el => {
    el.classList.toggle('active', el.dataset.gid === groupId);
  });

  // Tắt listener cũ
  if (groupChatRef) groupChatRef.off();

  // Hiện khu vực chat
  const chatSection = document.getElementById('group-chat-section');
  const placeholder = document.getElementById('group-chat-placeholder');
  if (chatSection)  chatSection.classList.remove('hidden');
  if (placeholder)  placeholder.classList.add('hidden');

  // Cập nhật header
  const group = myGroups[groupId];
  const headerName = document.getElementById('group-chat-header-name');
  if (headerName && group) {
    const icon = group.type === 'dm' ? '💬' : '👥';
    headerName.textContent = `${icon} ${group.name}`;
  }

  // Xóa tin nhắn cũ
  const msgContainer = document.getElementById('group-chat-messages');
  if (msgContainer) msgContainer.innerHTML = '';

  // Lắng nghe chat nhóm
  groupChatRef = db.ref(`groups/${groupId}/chat`)
    .orderByChild('timestamp')
    .limitToLast(80);

  groupChatRef.on('child_added', (snap) => {
    if (typeof renderOrUpdateMessage === 'function') {
      renderOrUpdateMessage(snap.key, snap.val());
    } else {
      appendGroupMessage(snap.val());
    }
  });

  groupChatRef.on('child_changed', (snap) => {
    if (typeof renderOrUpdateMessage === 'function') {
      renderOrUpdateMessage(snap.key, snap.val());
    }
  });

  // Focus input
  setTimeout(() => {
    const input = document.getElementById('group-chat-input');
    if (input) input.focus();
    // Load saved background
    loadGroupBackground(groupId);
  }, 100);
}

/* =============================================
   GỬI TIN NHẮN NHÓM
   ============================================= */
function sendGroupMessage() {
  if (!currentUser || !activeGroupId || !isFirebaseConfigured) return;

  const input = document.getElementById('group-chat-input');
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  db.ref(`groups/${activeGroupId}/chat`).push({
    uid: currentUser.uid,
    name: currentUser.displayName || 'Ẩn danh',
    avatar: currentUser.photoURL || '',
    text: text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });

  input.value = '';
  input.focus();
}

/* =============================================
   HIỂN THỊ TIN NHẮN NHÓM
   ============================================= */
function appendGroupMessage(msg) {
  const container = document.getElementById('group-chat-messages');
  if (!container) return;

  const isMe = currentUser && msg.uid === currentUser.uid;
  const time  = msg.timestamp
    ? new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : '';

  const div = document.createElement('div');
  div.className = `chat-msg ${isMe ? 'chat-msg-me' : ''}`;
  div.innerHTML = `
    <img class="chat-avatar" src="${msg.avatar || ''}" alt=""
         onerror="this.style.display='none'"/>
    <div class="chat-bubble">
      <div class="chat-meta">
        <span class="chat-name">${escapeHtml(msg.name || 'Ẩn danh')}</span>
        <span class="chat-time">${time}</span>
      </div>
      <div class="chat-text">${escapeHtml(msg.text || '')}</div>
    </div>
  `;

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;

  // Giới hạn tin nhắn hiển thị
  while (container.children.length > 80) {
    container.removeChild(container.firstChild);
  }
}

/* =============================================
   RỜI NHÓM
   ============================================= */
async function leaveGroup(groupId) {
  if (!currentUser || !isFirebaseConfigured) return;
  if (!confirm('Bạn muốn rời khỏi nhóm này?')) return;

  await db.ref(`groups/${groupId}/members/${currentUser.uid}`).remove();

  if (activeGroupId === groupId) {
    activeGroupId = null;
    const chatSection = document.getElementById('group-chat-section');
    const placeholder = document.getElementById('group-chat-placeholder');
    if (chatSection) chatSection.classList.add('hidden');
    if (placeholder) placeholder.classList.remove('hidden');
    if (groupChatRef) { groupChatRef.off(); groupChatRef = null; }
  }

  showToast('Đã rời nhóm.', 'info');
}

/* =============================================
   RENDER DANH SÁCH NHÓM
   ============================================= */
function renderGroupList() {
  const container = document.getElementById('group-list');
  if (!container) return;

  const groups = Object.entries(myGroups);
  if (groups.length === 0) {
    container.innerHTML = '<p class="log-empty">Chưa có nhóm nào...</p>';
    return;
  }

  container.innerHTML = groups.map(([gid, g]) => {
    const icon = g.type === 'dm' ? '💬' : '👥';
    const isActive = gid === activeGroupId;
    return `
      <div class="group-item ${isActive ? 'active' : ''}" data-gid="${gid}"
           onclick="openGroupChat('${gid}')">
        <div class="group-icon">${icon}</div>
        <div class="group-info">
          <span class="group-name">${escapeHtml(g.name || 'Nhóm')}</span>
          <span class="group-member-count">${g.memberCount || 1} thành viên</span>
        </div>
      </div>
    `;
  }).join('');
}

/* =============================================
   MODAL TẠO NHÓM
   ============================================= */
function openCreateGroupModal() {
  const modal = document.getElementById('modal-create-group');
  if (modal) modal.classList.remove('hidden');
  const nameInput = document.getElementById('group-name-input');
  if (nameInput) { nameInput.value = ''; nameInput.focus(); }
  selectedFriendUids.clear();
  renderFriendPicker();
}

function closeCreateGroupModal() {
  const modal = document.getElementById('modal-create-group');
  if (modal) modal.classList.add('hidden');
  selectedFriendUids.clear();
}

/* =============================================
   RENDER DANH SÁCH BẠN ĐỂ CHỌN (trong modal tạo nhóm)
   ============================================= */
function renderFriendPicker() {
  const container = document.getElementById('friend-picker');
  if (!container) return;

  const friends = Object.entries(myFriends);
  if (friends.length === 0) {
    container.innerHTML = '<p class="log-empty">Chưa có bạn bè để thêm vào nhóm.</p>';
    return;
  }

  container.innerHTML = friends.map(([uid, f]) => {
    const selected = selectedFriendUids.has(uid);
    return `
      <div class="friend-pick-item ${selected ? 'selected' : ''}"
           onclick="toggleFriendPick('${uid}')" data-uid="${uid}">
        <img class="friend-pick-avatar" src="${f.avatar || ''}"
             alt="" onerror="this.style.display='none'"/>
        <span class="friend-pick-name">${escapeHtml(f.name || 'Bạn bè')}</span>
        <span class="friend-pick-check">${selected ? '✓' : ''}</span>
      </div>
    `;
  }).join('');
}

function toggleFriendPick(uid) {
  if (selectedFriendUids.has(uid)) {
    selectedFriendUids.delete(uid);
  } else {
    selectedFriendUids.add(uid);
  }
  renderFriendPicker();
}

/* =============================================
   XỬ LÝ PHÍM ENTER TRONG GROUP CHAT INPUT
   ============================================= */
function handleGroupChatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendGroupMessage();
  }
}

/* Khởi tạo keydown listener sau khi DOM ready */
document.addEventListener('DOMContentLoaded', () => {
  const gcInput = document.getElementById('group-chat-input');
  if (gcInput) gcInput.addEventListener('keydown', handleGroupChatKeydown);
});

/* =============================================
   HÀM HỖ TRỢ PHÂN QUYỀN ADMIN NHÓM
   ============================================= */

/**
 * getGroupMemberRole(group, uid)
 * Xác định vai trò của thành viên trong nhóm.
 * Trả về: 'highest_head' (QTV đứng đầu), 'highest' (QTV cao nhất), 'admin' (QTV thường), 'member' (Thành viên)
 */
function getGroupMemberRole(group, uid) {
  if (!group) return 'member';
  const highestAdmin = group.highestAdminUid || group.createdBy;

  // Thu thập tất cả admin (kể cả fallback)
  const adminsObj = group.admins || {};
  const adminsSet = new Set(Object.keys(adminsObj));
  if (highestAdmin) adminsSet.add(highestAdmin);
  const adminsCount = adminsSet.size;

  if (uid === highestAdmin) {
    return adminsCount > 2 ? 'highest_head' : 'highest';
  }

  if (adminsObj[uid]) {
    return 'admin';
  }

  return 'member';
}

function getRoleLabel(role) {
  switch (role) {
    case 'highest_head': return '👑 QTV đứng đầu';
    case 'highest': return '👑 QTV cao nhất';
    case 'admin': return '⭐ QTV';
    default: return 'Thành viên';
  }
}

function getRoleBadgeClass(role) {
  switch (role) {
    case 'highest_head':
    case 'highest': return 'role-badge-highest';
    case 'admin': return 'role-badge-admin';
    default: return 'role-badge-member';
  }
}

/* =============================================
   MỞ / ĐÓNG MODAL CHI TIẾT NHÓM
   ============================================= */
function openGroupDetailsModal(groupId) {
  const modal = document.getElementById('modal-group-details');
  if (!modal) return;
  modal.dataset.gid = groupId;
  modal.classList.remove('hidden');
  renderGroupDetails(groupId);
}

function closeGroupDetailsModal() {
  const modal = document.getElementById('modal-group-details');
  if (modal) {
    modal.classList.add('hidden');
    delete modal.dataset.gid;
  }
}

/* =============================================
   RENDER CHI TIẾT NHÓM TRONG MODAL
   ============================================= */
function renderGroupDetails(groupId) {
  const group = myGroups[groupId];
  if (!group) return;

  // Cập nhật tiêu đề nhóm
  const titleEl = document.getElementById('group-details-title');
  if (titleEl) {
    const icon = group.type === 'dm' ? '💬' : '👥';
    titleEl.textContent = `ℹ️ Chi tiết: ${icon} ${group.name}`;
  }

  const myUid = currentUser.uid;
  const myRole = getGroupMemberRole(group, myUid);
  const isUserAdmin = (myRole === 'highest' || myRole === 'highest_head' || myRole === 'admin');

  // 1. Render Section Thêm Thành Viên (chỉ hiển thị với Admin)
  const addSection = document.getElementById('group-details-add-section');
  if (addSection) {
    if (isUserAdmin) {
      addSection.classList.remove('hidden');
      const addListContainer = document.getElementById('group-details-add-list');
      if (addListContainer) {
        const groupMembers = group.members || {};
        const friendsNotInGroup = Object.entries(myFriends).filter(([uid, f]) => !groupMembers[uid]);

        if (friendsNotInGroup.length === 0) {
          addListContainer.innerHTML = '<p class="log-empty">Không còn bạn bè nào để thêm...</p>';
        } else {
          addListContainer.innerHTML = friendsNotInGroup.map(([uid, f]) => {
            return `
              <div class="friend-pick-item" onclick="addMemberToGroup('${groupId}', '${uid}')">
                <img class="friend-pick-avatar" src="${f.avatar || ''}" alt="" onerror="this.style.display='none'"/>
                <span class="friend-pick-name">${escapeHtml(f.name || 'Bạn bè')}</span>
                <span class="friend-pick-check" style="border:none;font-weight:700;color:var(--accent-green);font-size:0.75rem;display:flex;align-items:center;">➕</span>
              </div>
            `;
          }).join('');
        }
      }
    } else {
      addSection.classList.add('hidden');
    }
  }

  // 2. Render Section Thành Viên
  const countEl = document.getElementById('group-details-count');
  const totalMembers = Object.keys(group.members || {}).length;
  if (countEl) countEl.textContent = totalMembers;

  const memberListContainer = document.getElementById('group-details-member-list');
  if (memberListContainer) {
    const members = Object.entries(group.members || {});

    // Tính số lượng QTV trong nhóm
    const highestAdmin = group.highestAdminUid || group.createdBy;
    const adminsObj = group.admins || {};
    const adminsSet = new Set(Object.keys(adminsObj));
    if (highestAdmin) adminsSet.add(highestAdmin);
    const adminsCount = adminsSet.size;

    memberListContainer.innerHTML = members.map(([uid, m]) => {
      const role = getGroupMemberRole(group, uid);
      const roleLabel = getRoleLabel(role);
      const badgeClass = getRoleBadgeClass(role);

      let actionsHtml = '';
      const isMe = (uid === myUid);

      if (!isMe) {
        // Nếu người dùng hiện tại là QTV cao nhất/đứng đầu
        if (myRole === 'highest' || myRole === 'highest_head') {
          if (role === 'member') {
            // Phong QTV (chỉ cho phép khi tổng QTV < 6)
            if (adminsCount < 6) {
              actionsHtml += `<button class="btn-member-action btn-promote" onclick="promoteToAdmin('${groupId}', '${uid}')">⭐ Phong QTV</button>`;
            }
            actionsHtml += `<button class="btn-member-action btn-transfer" onclick="transferHighestAdmin('${groupId}', '${uid}')">👑 Nhường Trưởng Nhóm</button>`;
            actionsHtml += `<button class="btn-member-action btn-demote" style="background-color:var(--accent-red);color:white;border-color:rgba(255,71,87,0.3);" onclick="kickMember('${groupId}', '${uid}')">🚫 Kick</button>`;
          } else if (role === 'admin') {
            // Hạ quyền QTV thường
            actionsHtml += `<button class="btn-member-action btn-demote" onclick="demoteFromAdmin('${groupId}', '${uid}')">❌ Hạ QTV</button>`;
            actionsHtml += `<button class="btn-member-action btn-transfer" onclick="transferHighestAdmin('${groupId}', '${uid}')">👑 Nhường Trưởng Nhóm</button>`;
            actionsHtml += `<button class="btn-member-action btn-demote" style="background-color:var(--accent-red);color:white;border-color:rgba(255,71,87,0.3);" onclick="kickMember('${groupId}', '${uid}')">🚫 Kick</button>`;
          }
        }
        // Nếu người dùng hiện tại là QTV thường
        else if (myRole === 'admin') {
          // QTV thường có thể trao chức QTV của mình cho thành viên thường khác
          if (role === 'member') {
            actionsHtml += `<button class="btn-member-action btn-transfer" onclick="transferAdminStatus('${groupId}', '${uid}')">🔄 Trao QTV</button>`;
            actionsHtml += `<button class="btn-member-action btn-demote" style="background-color:var(--accent-red);color:white;border-color:rgba(255,71,87,0.3);" onclick="kickMember('${groupId}', '${uid}')">🚫 Kick</button>`;
          }
        }
      }

      return `
        <div class="friend-pick-item" style="cursor:default; justify-content:space-between; align-items:center;">
          <div style="display:flex;align-items:center;gap:0.55rem;min-width:0;">
            <img class="friend-pick-avatar" src="${m.avatar || ''}" alt="" onerror="this.style.display='none'"/>
            <div style="display:flex;flex-direction:column;min-width:0;">
              <span class="friend-pick-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(m.name || 'Thành viên')}${isMe ? ' (Bạn)' : ''}</span>
              <span class="role-badge ${badgeClass}" style="margin-left:0; margin-top:2px; font-size:0.55rem; width:fit-content;">${roleLabel}</span>
            </div>
          </div>
          <div class="member-item-actions" style="flex-shrink:0;">
            ${actionsHtml}
          </div>
        </div>
      `;
    }).join('');
  }
}

/* =============================================
   CÁC HÀM XỬ LÝ NGHIỆP VỤ FIREBASE
   ============================================= */

/**
 * addMemberToGroup(groupId, friendUid)
 * Thêm một người bạn vào nhóm.
 */
async function addMemberToGroup(groupId, friendUid) {
  if (!currentUser || !isFirebaseConfigured) return;
  const f = myFriends[friendUid];
  if (!f) return;

  try {
    await db.ref(`groups/${groupId}/members/${friendUid}`).set({
      name: f.name || 'Thành viên',
      avatar: f.avatar || '',
      joinedAt: firebase.database.ServerValue.TIMESTAMP
    });
    showToast(`🎉 Đã thêm ${f.name} vào nhóm!`, 'success');
  } catch (err) {
    console.error('[Groups] addMemberToGroup failed:', err);
    showToast('Lỗi khi thêm thành viên!', 'error');
  }
}

/**
 * promoteToAdmin(groupId, targetUid)
 * Phong một thành viên thường lên làm Quản trị viên (QTV).
 */
async function promoteToAdmin(groupId, targetUid) {
  if (!currentUser || !isFirebaseConfigured) return;
  
  // Kiểm tra số lượng QTV hiện tại (lấy trực tiếp từ db để tránh race conditions, hoặc check local)
  const group = myGroups[groupId];
  if (!group) return;
  const highestAdmin = group.highestAdminUid || group.createdBy;
  const adminsObj = group.admins || {};
  const adminsSet = new Set(Object.keys(adminsObj));
  if (highestAdmin) adminsSet.add(highestAdmin);

  if (adminsSet.size >= 6) {
    showToast('⚠️ Nhóm đã đạt giới hạn tối đa 6 quản trị viên!', 'error');
    return;
  }

  try {
    await db.ref(`groups/${groupId}/admins/${targetUid}`).set(true);
    showToast('⭐ Đã phong làm quản trị viên!', 'success');
  } catch (err) {
    console.error('[Groups] promoteToAdmin failed:', err);
    showToast('Lỗi khi phong quản trị viên!', 'error');
  }
}

/**
 * demoteFromAdmin(groupId, targetUid)
 * Hạ quyền một QTV thường thành thành viên thường.
 */
async function demoteFromAdmin(groupId, targetUid) {
  if (!currentUser || !isFirebaseConfigured) return;
  try {
    await db.ref(`groups/${groupId}/admins/${targetUid}`).remove();
    showToast('❌ Đã hạ quyền quản trị viên!', 'info');
  } catch (err) {
    console.error('[Groups] demoteFromAdmin failed:', err);
    showToast('Lỗi khi hạ quyền quản trị viên!', 'error');
  }
}

/**
 * transferAdminStatus(groupId, targetUid)
 * QTV thường chuyển giao quyền của mình cho một thành viên thường khác.
 * Người chuyển giao trở thành thành viên thường, người nhận thành QTV.
 */
async function transferAdminStatus(groupId, targetUid) {
  if (!currentUser || !isFirebaseConfigured) return;
  const myUid = currentUser.uid;

  if (!confirm('Bạn có chắc chắn muốn trao quyền Quản trị viên của mình cho thành viên này? Bạn sẽ trở thành thành viên thường.')) return;

  try {
    const updates = {};
    updates[`groups/${groupId}/admins/${myUid}`] = null;
    updates[`groups/${groupId}/admins/${targetUid}`] = true;

    await db.ref().update(updates);
    showToast('🔄 Đã chuyển giao quyền quản trị viên!', 'success');
  } catch (err) {
    console.error('[Groups] transferAdminStatus failed:', err);
    showToast('Lỗi khi chuyển giao quyền quản trị viên!', 'error');
  }
}

/**
 * transferHighestAdmin(groupId, targetUid)
 * QTV cao nhất/đứng đầu chuyển quyền cho một thành viên khác.
 * Người nhận trở thành QTV cao nhất mới, người chuyển giao trở thành thành viên thường.
 */
async function transferHighestAdmin(groupId, targetUid) {
  if (!currentUser || !isFirebaseConfigured) return;
  const myUid = currentUser.uid;

  if (!confirm('Bạn có chắc chắn muốn nhường quyền Quản trị viên cao nhất/đứng đầu cho thành viên này? Bạn sẽ trở thành thành viên thường.')) return;

  try {
    const updates = {};
    updates[`groups/${groupId}/highestAdminUid`] = targetUid;
    // Đảm bảo người mới là admin
    updates[`groups/${groupId}/admins/${targetUid}`] = true;
    // Người cũ mất quyền admin
    updates[`groups/${groupId}/admins/${myUid}`] = null;

    await db.ref().update(updates);
    showToast('👑 Đã chuyển giao quyền Trưởng nhóm!', 'success');
  } catch (err) {
    console.error('[Groups] transferHighestAdmin failed:', err);
    showToast('Lỗi khi chuyển giao quyền Trưởng nhóm!', 'error');
  }
}

/**
 * kickMember(groupId, targetUid)
 * Kick một thành viên ra khỏi nhóm.
 */
async function kickMember(groupId, targetUid) {
  if (!currentUser || !isFirebaseConfigured) return;
  const group = myGroups[groupId];
  if (!group) return;
  const targetMember = group.members[targetUid];
  if (!targetMember) return;

  if (!confirm(`Bạn có chắc chắn muốn kick ${targetMember.name} ra khỏi nhóm?`)) return;

  try {
    // Xóa thành viên khỏi nhóm trên database
    await db.ref(`groups/${groupId}/members/${targetUid}`).remove();
    
    // Nếu người bị kick là admin, xóa quyền admin luôn
    if (group.admins && group.admins[targetUid]) {
      await db.ref(`groups/${groupId}/admins/${targetUid}`).remove();
    }

    showToast(`🚫 Đã kick ${targetMember.name} ra khỏi nhóm!`, 'info');
    
    // Refresh modal details if still open
    renderGroupDetails(groupId);
  } catch (err) {
    console.error('[Groups] kickMember failed:', err);
    showToast('Lỗi khi kick thành viên!', 'error');
  }
}

/* =============================================
   ẢNH NỀN NHÓM — BG PICKER
   ============================================= */

const BG_PRESETS = [
  { label: 'Không', value: null },
  { gradient: 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)', label: 'Deep Purple' },
  { gradient: 'linear-gradient(135deg,#0a1628,#0d3b6e,#00d4ff22)', label: 'Cyber Blue' },
  { gradient: 'linear-gradient(135deg,#0d1117,#0a3622,#00ff8833)', label: 'Matrix Green' },
  { gradient: 'linear-gradient(135deg,#1a0a2e,#6b1a4c,#ff6b9d33)', label: 'Neon Pink' },
  { gradient: 'linear-gradient(135deg,#1c1c2e,#2d1b4e,#a855f744)', label: 'Violet Dream' },
  { gradient: 'linear-gradient(135deg,#0f2027,#203a43,#2c5364)', label: 'Midnight Ocean' },
  { gradient: 'linear-gradient(135deg,#1a1a2e,#16213e,#e94560)', label: 'Crimson Night' },
  { gradient: 'linear-gradient(135deg,#0d0d0d,#1a1a1a,#ff9f4344)', label: 'Dark Amber' },
  { gradient: 'linear-gradient(135deg,#021b21,#033d44,#07737a)', label: 'Deep Teal' },
];

let _bgPickerGroupId = null;
let _bgSelectedValue = null; // null = remove, string = gradient/url

function openBgPickerModal(groupId) {
  _bgPickerGroupId = groupId;
  _bgSelectedValue = undefined; // undefined = not changed yet

  const modal = document.getElementById('modal-bg-picker');
  if (modal) modal.classList.remove('hidden');

  // Reset preview
  const previewWrap = document.getElementById('bg-preview-wrap');
  if (previewWrap) previewWrap.style.display = 'none';

  // Reset file input
  const fileInput = document.getElementById('bg-image-upload');
  if (fileInput) fileInput.value = '';

  renderBgPresets(groupId);
}

function closeBgPickerModal() {
  const modal = document.getElementById('modal-bg-picker');
  if (modal) modal.classList.add('hidden');
  _bgPickerGroupId = null;
  _bgSelectedValue = undefined;
}

function renderBgPresets(groupId) {
  const grid = document.getElementById('bg-preset-grid');
  if (!grid) return;

  // Get current bg
  const currentBg = localStorage.getItem(`group_bg_${groupId}`) || '';

  grid.innerHTML = BG_PRESETS.map((p, i) => {
    const isNone = p.value === null;
    const val = isNone ? '' : p.gradient;
    const isSelected = (currentBg === val) || (isNone && !currentBg);
    const style = isNone ? '' : `background:${p.gradient};`;
    return `
      <div class="bg-preset-item ${isNone ? 'bg-preset-none' : ''} ${isSelected ? 'selected' : ''}"
           style="${style}" title="${p.label}"
           onclick="selectBgPreset(${i})">
        ${isNone ? '🚫' : ''}
      </div>
    `;
  }).join('');
}

function selectBgPreset(index) {
  const p = BG_PRESETS[index];
  _bgSelectedValue = p.value === null ? '' : p.gradient;

  // Highlight selected
  document.querySelectorAll('.bg-preset-item').forEach((el, i) => {
    el.classList.toggle('selected', i === index);
  });

  // Show preview
  const previewWrap = document.getElementById('bg-preview-wrap');
  const previewBox = document.getElementById('bg-preview-box');
  if (previewWrap && previewBox) {
    if (_bgSelectedValue) {
      previewBox.style.background = _bgSelectedValue;
      previewWrap.style.display = 'block';
    } else {
      previewWrap.style.display = 'none';
    }
  }
}

function handleBgImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Limit size 3MB
  if (file.size > 3 * 1024 * 1024) {
    showToast('⚠️ Ảnh quá lớn! Tối đa 3MB.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    _bgSelectedValue = `url(${dataUrl})`;

    // Clear preset selection
    document.querySelectorAll('.bg-preset-item').forEach(el => el.classList.remove('selected'));

    // Show preview
    const previewWrap = document.getElementById('bg-preview-wrap');
    const previewBox = document.getElementById('bg-preview-box');
    if (previewWrap && previewBox) {
      previewBox.style.background = '';
      previewBox.style.backgroundImage = `url(${dataUrl})`;
      previewBox.style.backgroundSize = 'cover';
      previewBox.style.backgroundPosition = 'center';
      previewWrap.style.display = 'block';
    }
    showToast('📸 Ảnh đã sẵn sàng, nhấn Áp dụng!', 'info');
  };
  reader.readAsDataURL(file);
}

function applyGroupBackground() {
  if (!_bgPickerGroupId) return;
  if (_bgSelectedValue === undefined) {
    showToast('Hãy chọn một ảnh nền!', 'error');
    return;
  }

  const groupId = _bgPickerGroupId;
  const bgValue = _bgSelectedValue;

  // Save to localStorage (instant, works offline)
  if (bgValue) {
    localStorage.setItem(`group_bg_${groupId}`, bgValue);
  } else {
    localStorage.removeItem(`group_bg_${groupId}`);
  }

  // Also save key/type to Firebase (not the full data url to save DB quota)
  if (isFirebaseConfigured && currentUser) {
    // Save gradient string (short) or a flag for custom image
    const isDataUrl = bgValue && bgValue.startsWith('url(data:');
    const fbValue = isDataUrl ? '__custom__' : (bgValue || null);
    db.ref(`groups/${groupId}/bgPreset`).set(fbValue).catch(() => {});
  }

  applyBgToUI(groupId, bgValue);
  closeBgPickerModal();
  showToast('✅ Đã đổi ảnh nền nhóm!', 'success');
}

function removeGroupBackground() {
  if (!_bgPickerGroupId) return;
  _bgSelectedValue = '';
  applyGroupBackground();
}

function applyBgToUI(groupId, bgValue) {
  const chatSection = document.getElementById('group-chat-section');

  if (bgValue && bgValue.startsWith('url(')) {
    // Image URL
    if (chatSection) {
      chatSection.style.setProperty('--chat-bg-img', bgValue);
    }
  } else if (bgValue) {
    // Gradient — convert to url-equivalent for ::before via CSS property hack
    // We use a direct background on the pseudo-element via inline style trick
    // Actually set it as a CSS var used in the ::before
    if (chatSection) {
      chatSection.style.setProperty('--chat-bg-img', 'none');
      // Apply gradient directly to element with a before trick via data attr
      chatSection.dataset.bgGradient = bgValue;
      // Use a style tag trick
      applyChatBgGradient(chatSection, bgValue);
    }
  } else {
    if (chatSection) {
      chatSection.style.setProperty('--chat-bg-img', 'none');
      chatSection.dataset.bgGradient = '';
      const overlay = chatSection.querySelector('.chat-bg-overlay');
      if (overlay) overlay.remove();
    }
  }

  // Also update group item in sidebar
  const groupItem = document.querySelector(`.group-item[data-gid="${groupId}"]`);
  if (groupItem) {
    if (bgValue && bgValue.startsWith('url(')) {
      groupItem.style.setProperty('--group-bg-img', bgValue);
    } else if (bgValue) {
      groupItem.style.setProperty('--group-bg-img', 'none');
    } else {
      groupItem.style.setProperty('--group-bg-img', 'none');
    }
  }
}

function applyChatBgGradient(chatSection, gradient) {
  let overlay = chatSection.querySelector('.chat-bg-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'chat-bg-overlay';
    overlay.style.cssText = `
      position:absolute;inset:0;pointer-events:none;
      border-radius:9px;z-index:0;opacity:0.12;
    `;
    chatSection.insertBefore(overlay, chatSection.firstChild);
  }
  overlay.style.background = gradient;
}

function loadGroupBackground(groupId) {
  const bgValue = localStorage.getItem(`group_bg_${groupId}`);
  if (bgValue) {
    applyBgToUI(groupId, bgValue);
  } else {
    applyBgToUI(groupId, '');
  }
}
