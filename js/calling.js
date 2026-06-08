/* ================================================
   calling.js — Gọi Video/Audio (WebRTC + Firebase Signaling)
   ================================================ */

/* =============================================
   CẤU HÌNH WebRTC
   ============================================= */
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

/* =============================================
   TRẠNG THÁI CUỘC GỌI
   ============================================= */
let localStream       = null;   // Stream camera/mic của mình
let peerConnections   = {};     // { uid: RTCPeerConnection } — hỗ trợ gọi nhóm
let remoteStreams     = {};     // { uid: MediaStream } — lưu trữ stream nhận được
let activeCallId      = null;   // ID cuộc gọi đang hoạt động
let callRole          = null;   // 'caller' | 'callee'
let callType          = null;   // 'friend' | 'group'
let callTimer         = null;   // setInterval đếm thời gian
let callSeconds       = 0;
let isMicMuted        = false;
let isCamOff          = false;
let incomingCallRef   = null;   // Firebase listener
let activeCallRef     = null;   // Firebase listener cuộc gọi đang active
let ringtoneAudio     = null;   // Audio ringing

/* =============================================
   KHỞI TẠO — lắng nghe cuộc gọi đến
   ============================================= */
function initCalling() {
  if (!currentUser || !isFirebaseConfigured) return;
  listenForIncomingCalls();
  console.log('[Calling] ✅ Initialized for', currentUser.uid);
}

/* =============================================
   LẮNG NGHE CUỘC GỌI ĐẾN
   ============================================= */
function listenForIncomingCalls() {
  if (!currentUser) return;
  const myUid = currentUser.uid;

  // Lắng nghe calls mà calleeUid = myUid hoặc trong groupMembers
  if (incomingCallRef) incomingCallRef.off();

  incomingCallRef = db.ref('calls').orderByChild('calleeUid').equalTo(myUid);
  incomingCallRef.on('child_added', (snap) => {
    const call = snap.val();
    const callId = snap.key;
    if (!call || call.status !== 'ringing') return;
    if (call.callerUid === myUid) return; // bỏ qua cuộc gọi do mình tạo
    showIncomingCall(callId, call);
  });

  // Lắng nghe group calls
  db.ref('calls').orderByChild('type').equalTo('group').on('child_added', (snap) => {
    const call = snap.val();
    const callId = snap.key;
    if (!call || call.status !== 'ringing') return;
    if (call.callerUid === myUid) return;
    if (!call.groupMembers || !call.groupMembers[myUid]) return;
    if (activeCallId) return; // đang trong cuộc gọi khác
    showIncomingCall(callId, call);
  });
}

/* =============================================
   GỌI BẠN BÈ (1-1)
   ============================================= */
async function callFriend(friendUid, friendName, friendAvatar) {
  if (!currentUser || !isFirebaseConfigured) return;
  if (activeCallId) {
    showToast('Đang trong cuộc gọi khác!', 'error');
    return;
  }

  // Lấy media stream
  const stream = await getLocalStream();
  if (!stream) return;

  const myUid    = currentUser.uid;
  const callRef  = db.ref('calls').push();
  const callId   = callRef.key;

  activeCallId = callId;
  callRole     = 'caller';
  callType     = 'friend';

  // Tạo peer connection
  const pc = createPeerConnection(friendUid, callId, 'friend');
  peerConnections[friendUid] = pc;

  // Thêm tracks
  stream.getTracks().forEach(track => pc.addTrack(track, stream));

  // Tạo offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Ghi lên Firebase
  await callRef.set({
    callId,
    callerUid:   myUid,
    callerName:  currentUser.displayName || 'Ẩn danh',
    callerAvatar: currentUser.photoURL || '',
    calleeUid:   friendUid,
    calleeName:  friendName,
    type:        'friend',
    status:      'ringing',
    offer:       { sdp: offer.sdp, type: offer.type },
    createdAt:   firebase.database.ServerValue.TIMESTAMP
  });

  // Hiển thị UI đang gọi
  showCallingOverlay(friendName, friendAvatar, 'friend');

  // Lắng nghe trả lời
  activeCallRef = db.ref(`calls/${callId}`);
  activeCallRef.on('value', async (snap) => {
    const data = snap.val();
    if (!data) return;

    if (data.status === 'declined' || data.status === 'ended') {
      handleCallEnded(data.status === 'declined' ? 'Cuộc gọi bị từ chối.' : 'Cuộc gọi đã kết thúc.');
      return;
    }

    if (data.status === 'active' && data.answer && pc.signalingState !== 'stable') {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      } catch (e) { console.warn('[Calling] setRemoteDesc error:', e); }
    }
  });

  // Lắng nghe ICE candidates từ callee
  db.ref(`calls/${callId}/calleeCandidates`).on('child_added', async (snap) => {
    const candidate = snap.val();
    if (candidate && pc.remoteDescription) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (e) { console.warn('[Calling] addIceCandidate error:', e); }
    }
  });

  playRingtone(true);
}

/* =============================================
   GỌI NHÓM
   ============================================= */
async function callGroup(groupId) {
  if (!currentUser || !isFirebaseConfigured) return;
  if (activeCallId) {
    showToast('Đang trong cuộc gọi khác!', 'error');
    return;
  }

  const group = myGroups[groupId];
  if (!group || !group.members) {
    showToast('Không tìm thấy nhóm!', 'error');
    return;
  }

  const memberUids = Object.keys(group.members).filter(uid => uid !== currentUser.uid);
  if (memberUids.length === 0) {
    showToast('Nhóm không có thành viên khác!', 'info');
    return;
  }

  const stream = await getLocalStream();
  if (!stream) return;

  const myUid   = currentUser.uid;
  const callRef = db.ref('calls').push();
  const callId  = callRef.key;

  activeCallId = callId;
  callRole     = 'caller';
  callType     = 'group';

  // Tạo groupMembers object cho Firebase
  const groupMembers = {};
  memberUids.forEach(uid => { groupMembers[uid] = true; });
  groupMembers[myUid] = true;

  // Tạo offers cho mỗi thành viên
  const offers = {};
  for (const uid of memberUids) {
    const pc = createPeerConnection(uid, callId, 'group');
    peerConnections[uid] = pc;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    offers[uid] = { sdp: offer.sdp, type: offer.type };
  }

  await callRef.set({
    callId,
    callerUid:    myUid,
    callerName:   currentUser.displayName || 'Ẩn danh',
    callerAvatar: currentUser.photoURL || '',
    groupId,
    groupName:    group.name,
    groupMembers,
    type:         'group',
    status:       'ringing',
    offers,
    createdAt:    firebase.database.ServerValue.TIMESTAMP
  });

  showCallingOverlay(group.name, '👥', 'group');
  playRingtone(true);

  // Lắng nghe answers
  activeCallRef = db.ref(`calls/${callId}`);
  activeCallRef.on('value', async (snap) => {
    const data = snap.val();
    if (!data) return;
    if (data.status === 'ended') {
      handleCallEnded('Cuộc gọi đã kết thúc.');
      return;
    }
    if (data.answers) {
      for (const [uid, answer] of Object.entries(data.answers)) {
        const pc = peerConnections[uid];
        if (pc && pc.signalingState !== 'stable') {
          try { await pc.setRemoteDescription(new RTCSessionDescription(answer)); }
          catch (e) { console.warn('[Calling] group setRemoteDesc error:', e); }
        }
      }
    }
  });

  // Lắng nghe ICE candidates từ các thành viên
  memberUids.forEach(uid => {
    db.ref(`calls/${callId}/calleeCandidates_${uid}`).on('child_added', async (snap) => {
      const candidate = snap.val();
      const pc = peerConnections[uid];
      if (candidate && pc && pc.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (e) { console.warn('[Calling] group addIceCandidate error:', e); }
      }
    });
  });
}

/* =============================================
   CHẤP NHẬN CUỘC GỌI
   ============================================= */
async function answerCall(callId) {
  if (!currentUser || !isFirebaseConfigured) return;

  hideIncomingCallPopup();
  stopRingtone();

  const snap = await db.ref(`calls/${callId}`).once('value');
  const call = snap.val();
  if (!call || call.status === 'ended') return;

  const stream = await getLocalStream();
  if (!stream) return;

  activeCallId = callId;
  callRole     = 'callee';
  callType     = call.type;

  const callerUid = call.callerUid;

  if (call.type === 'friend') {
    // Tạo peer connection
    const pc = createPeerConnection(callerUid, callId, 'friend');
    peerConnections[callerUid] = pc;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    // Set remote offer
    await pc.setRemoteDescription(new RTCSessionDescription(call.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Cập nhật Firebase
    await db.ref(`calls/${callId}`).update({
      status: 'active',
      answer: { sdp: answer.sdp, type: answer.type }
    });

    // Lắng nghe ICE từ caller
    db.ref(`calls/${callId}/callerCandidates`).on('child_added', async (snap) => {
      const candidate = snap.val();
      if (candidate && pc.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (e) { console.warn('[Calling] callee addIceCandidate error:', e); }
      }
    });

    showCallActiveOverlay(call.callerName, call.callerAvatar, 'friend');

  } else if (call.type === 'group') {
    const myUid = currentUser.uid;
    const offer = call.offers && call.offers[myUid];
    if (!offer) return;

    const pc = createPeerConnection(callerUid, callId, 'group');
    peerConnections[callerUid] = pc;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    const updates = {};
    updates[`calls/${callId}/answers/${myUid}`] = { sdp: answer.sdp, type: answer.type };
    updates[`calls/${callId}/status`] = 'active';
    await db.ref().update(updates);

    db.ref(`calls/${callId}/callerCandidates_${myUid}`).on('child_added', async (snap) => {
      const candidate = snap.val();
      if (candidate && pc.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (e) { }
      }
    });

    showCallActiveOverlay(call.groupName || call.callerName, '👥', 'group');
  }

  // Lắng nghe trạng thái kết thúc
  activeCallRef = db.ref(`calls/${callId}`);
  activeCallRef.on('value', (snap) => {
    const data = snap.val();
    if (data && data.status === 'ended') {
      handleCallEnded('Cuộc gọi đã kết thúc.');
    }
  });
}

/* =============================================
   TỪ CHỐI CUỘC GỌI
   ============================================= */
async function declineCall(callId) {
  hideIncomingCallPopup();
  stopRingtone();
  if (!callId || !isFirebaseConfigured) return;
  await db.ref(`calls/${callId}`).update({ status: 'declined' });
  setTimeout(() => db.ref(`calls/${callId}`).remove(), 3000);
}

/* =============================================
   KẾT THÚC CUỘC GỌI
   ============================================= */
async function endCall() {
  if (activeCallId && isFirebaseConfigured) {
    await db.ref(`calls/${activeCallId}`).update({ status: 'ended' });
    setTimeout(() => db.ref(`calls/${activeCallId}`).remove().catch(() => {}), 5000);
  }
  cleanupCall();
  hideCallOverlay();
  showToast('📵 Đã kết thúc cuộc gọi.', 'info');
}

/* =============================================
   DỌN DẸP SAU CUỘC GỌI
   ============================================= */
function cleanupCall() {
  // Dừng local stream
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  // Đóng tất cả peer connections
  Object.values(peerConnections).forEach(pc => {
    try { pc.close(); } catch (e) {}
  });
  peerConnections = {};

  // Reset remote streams
  remoteStreams = {};

  // Tắt firebase listeners
  if (activeCallRef) { activeCallRef.off(); activeCallRef = null; }
  if (activeCallId && isFirebaseConfigured) {
    db.ref(`calls/${activeCallId}/callerCandidates`).off();
    db.ref(`calls/${activeCallId}/calleeCandidates`).off();
    if (currentUser) {
      const myUid = currentUser.uid;
      db.ref(`calls/${activeCallId}/callerCandidates_${myUid}`).off();
      db.ref(`calls/${activeCallId}/calleeCandidates_${myUid}`).off();
    }
    Object.keys(peerConnections).forEach(uid => {
      db.ref(`calls/${activeCallId}/calleeCandidates_${uid}`).off();
      db.ref(`calls/${activeCallId}/callerCandidates_${uid}`).off();
    });
  }

  // Reset state
  activeCallId  = null;
  callRole      = null;
  callType      = null;
  isMicMuted    = false;
  isCamOff      = false;

  // Dừng timer
  if (callTimer) { clearInterval(callTimer); callTimer = null; }
  callSeconds = 0;

  stopRingtone();

  // Xóa remote video elements
  const remoteGrid = document.getElementById('call-remote-grid');
  if (remoteGrid) {
    remoteGrid.innerHTML = '';
    // Khôi phục waiting state
    const ws = document.createElement('div');
    ws.className = 'call-waiting';
    ws.id = 'call-waiting-state';
    ws.innerHTML = '<div class="call-waiting-ring"><div class="call-waiting-icon">📞</div></div><div class="call-waiting-text">Đang chờ kết nối...</div>';
    remoteGrid.appendChild(ws);
  }

  // Reset timer display
  const timerEl = document.getElementById('call-timer');
  if (timerEl) timerEl.textContent = '00:00';
}

/* =============================================
   XỬ LÝ KHI CUỘC GỌI KẾT THÚC TỪ XA
   ============================================= */
function handleCallEnded(message) {
  cleanupCall();
  hideCallOverlay();
  hideIncomingCallPopup();
  showToast(message || '📵 Cuộc gọi đã kết thúc.', 'info');
}

/* =============================================
   TẠO PEER CONNECTION
   ============================================= */
function createPeerConnection(remoteUid, callId, type) {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const myUid = currentUser.uid;

  // ICE candidate handler
  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    const candidateData = {
      candidate:     event.candidate.candidate,
      sdpMid:        event.candidate.sdpMid,
      sdpMLineIndex: event.candidate.sdpMLineIndex
    };

    if (callRole === 'caller') {
      if (type === 'group') {
        db.ref(`calls/${callId}/callerCandidates_${remoteUid}`).push(candidateData);
      } else {
        db.ref(`calls/${callId}/callerCandidates`).push(candidateData);
      }
    } else {
      if (type === 'group') {
        db.ref(`calls/${callId}/calleeCandidates_${myUid}`).push(candidateData);
      } else {
        db.ref(`calls/${callId}/calleeCandidates`).push(candidateData);
      }
    }
  };

  // Remote stream handler
  pc.ontrack = (event) => {
    console.log('[Calling] Remote track received from', remoteUid, event.track.kind);
    if (!remoteStreams[remoteUid]) {
      remoteStreams[remoteUid] = new MediaStream();
    }
    remoteStreams[remoteUid].addTrack(event.track);
    addRemoteStream(remoteUid, remoteStreams[remoteUid]);
  };

  pc.onconnectionstatechange = () => {
    console.log('[Calling] Connection state:', pc.connectionState, 'with', remoteUid);
    if (pc.connectionState === 'connected') {
      stopRingtone();
      startCallTimer();
      updateCallStatus('🟢 Đang kết nối');
    }
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      showToast('Kết nối bị gián đoạn!', 'error');
    }
  };

  return pc;
}

/* =============================================
   LẤY LOCAL STREAM (camera + mic)
   ============================================= */
async function getLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const localVideo = document.getElementById('call-local-video');
    if (localVideo) {
      localVideo.srcObject = localStream;
      localVideo.muted = true; // tránh echo
    }
    return localStream;
  } catch (err) {
    console.warn('[Calling] Camera/mic not available, trying audio only:', err);
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      isCamOff = true;
      const localVideo = document.getElementById('call-local-video');
      if (localVideo) localVideo.style.display = 'none';
      showToast('📷 Không có camera, chỉ gọi audio.', 'info');
      return localStream;
    } catch (audioErr) {
      showToast('❌ Không thể truy cập mic/camera!', 'error');
      console.error('[Calling] getUserMedia failed:', audioErr);
      return null;
    }
  }
}

/* =============================================
   THÊM REMOTE STREAM VÀO GRID
   ============================================= */
function addRemoteStream(remoteUid, stream) {
  const remoteGrid = document.getElementById('call-remote-grid');
  if (!remoteGrid) return;

  // Ẩn waiting state
  const waitingState = document.getElementById('call-waiting-state');
  if (waitingState) waitingState.style.display = 'none';

  let videoEl = document.getElementById(`remote-video-${remoteUid}`);
  if (!videoEl) {
    const wrapper = document.createElement('div');
    wrapper.className = 'remote-video-wrap';
    wrapper.id = `remote-wrap-${remoteUid}`;

    videoEl = document.createElement('video');
    videoEl.id = `remote-video-${remoteUid}`;
    videoEl.autoplay = true;
    videoEl.playsinline = true;
    videoEl.className = 'remote-video';
    videoEl.muted = false;
    videoEl.volume = 1.0;

    const nameLabel = document.createElement('div');
    nameLabel.className = 'remote-video-label';
    nameLabel.id = `remote-label-${remoteUid}`;

    // Lấy tên từ friends hoặc call data
    const friend = myFriends[remoteUid];
    nameLabel.textContent = friend ? friend.name : 'Thành viên';

    wrapper.appendChild(videoEl);
    wrapper.appendChild(nameLabel);
    remoteGrid.appendChild(wrapper);
  }

  if (videoEl.srcObject !== stream) {
    videoEl.srcObject = stream;
    videoEl.muted = false;
    videoEl.volume = 1.0;
    
    // Đảm bảo phát luồng thành công để tránh browser autoplay restrictions
    videoEl.play().catch(err => {
      console.warn('[Calling] videoEl.play() failed, trying user interaction:', err);
      // fallback: thử lại khi click vào overlay/bất cứ đâu
      const playOnGesture = () => {
        videoEl.play().catch(e => console.error(e));
        document.removeEventListener('click', playOnGesture);
      };
      document.addEventListener('click', playOnGesture);
    });
  }
  updateCallStatus('🟢 Đang kết nối');
}

/* =============================================
   UI — HIỂN THỊ INCOMING CALL POPUP
   ============================================= */
function showIncomingCall(callId, call) {
  const popup = document.getElementById('incoming-call-popup');
  if (!popup) return;

  // Nếu đang trong cuộc gọi khác, auto-decline
  if (activeCallId) {
    declineCall(callId);
    return;
  }

  const avatar = document.getElementById('incoming-call-avatar');
  const name   = document.getElementById('incoming-call-name');
  const sub    = document.getElementById('incoming-call-sub');

  if (avatar) {
    if (call.callerAvatar) {
      avatar.style.backgroundImage = `url(${call.callerAvatar})`;
      avatar.textContent = '';
    } else {
      avatar.style.backgroundImage = 'none';
      avatar.textContent = (call.callerName || '?')[0].toUpperCase();
    }
  }
  if (name) name.textContent = call.callerName || 'Ẩn danh';
  if (sub)  sub.textContent  = call.type === 'group' ? `📹 Gọi nhóm: ${call.groupName || ''}` : '📹 Gọi video';

  popup.dataset.callId = callId;
  popup.classList.remove('hidden');
  playRingtone(false);
}

function hideIncomingCallPopup() {
  const popup = document.getElementById('incoming-call-popup');
  if (popup) popup.classList.add('hidden');
  stopRingtone();
}

/* =============================================
   UI — HIỂN THỊ OVERLAY ĐANG GỌI (chờ kết nối)
   ============================================= */
function showCallingOverlay(name, avatar, type) {
  const overlay = document.getElementById('call-overlay');
  if (!overlay) return;

  const headerName = document.getElementById('call-header-name');
  const headerSub  = document.getElementById('call-header-sub');
  const localVid   = document.getElementById('call-local-video');

  if (headerName) headerName.textContent = name;
  if (headerSub)  headerSub.textContent  = '📞 Đang gọi...';
  if (localVid)   localVid.srcObject = localStream;

  updateCallControls();
  overlay.classList.remove('hidden');
}

function showCallActiveOverlay(name, avatar, type) {
  const overlay = document.getElementById('call-overlay');
  if (!overlay) return;

  const headerName = document.getElementById('call-header-name');
  const headerSub  = document.getElementById('call-header-sub');
  const localVid   = document.getElementById('call-local-video');

  if (headerName) headerName.textContent = name;
  if (headerSub)  headerSub.textContent  = '🟢 Đang kết nối...';
  if (localVid)   localVid.srcObject = localStream;

  updateCallControls();
  overlay.classList.remove('hidden');
  startCallTimer();
}

function hideCallOverlay() {
  const overlay = document.getElementById('call-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function updateCallStatus(text) {
  const sub = document.getElementById('call-header-sub');
  if (sub) sub.textContent = text;
}

/* =============================================
   UI — CẬP NHẬT NÚT ĐIỀU KHIỂN
   ============================================= */
function updateCallControls() {
  const btnMic = document.getElementById('call-btn-mic');
  const btnCam = document.getElementById('call-btn-cam');
  if (btnMic) {
    btnMic.textContent = isMicMuted ? '🎙️ Mở mic' : '🔇 Tắt mic';
    btnMic.classList.toggle('active-off', isMicMuted);
  }
  if (btnCam) {
    btnCam.textContent = isCamOff ? '📷 Mở cam' : '📵 Tắt cam';
    btnCam.classList.toggle('active-off', isCamOff);
  }
}

/* =============================================
   TOGGLE MIC / CAM
   ============================================= */
function toggleMic() {
  if (!localStream) return;
  isMicMuted = !isMicMuted;
  localStream.getAudioTracks().forEach(t => { t.enabled = !isMicMuted; });
  updateCallControls();
}

function toggleCam() {
  if (!localStream) return;
  isCamOff = !isCamOff;
  localStream.getVideoTracks().forEach(t => { t.enabled = !isCamOff; });
  const localVid = document.getElementById('call-local-video');
  if (localVid) localVid.style.opacity = isCamOff ? '0' : '1';
  updateCallControls();
}

/* =============================================
   TIMER ĐẾM THỜI GIAN
   ============================================= */
function startCallTimer() {
  if (callTimer) return;
  callSeconds = 0;
  callTimer = setInterval(() => {
    callSeconds++;
    const h = Math.floor(callSeconds / 3600);
    const m = Math.floor((callSeconds % 3600) / 60);
    const s = callSeconds % 60;
    const timeStr = h > 0
      ? `${pad(h)}:${pad(m)}:${pad(s)}`
      : `${pad(m)}:${pad(s)}`;
    const timerEl = document.getElementById('call-timer');
    if (timerEl) timerEl.textContent = timeStr;
  }, 1000);
}

function pad(n) { return String(n).padStart(2, '0'); }

/* =============================================
   RINGTONE
   ============================================= */
function playRingtone(isCaller) {
  stopRingtone();
  // Dùng AudioContext để tạo ringtone không cần file
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let playing = true;

    function beep() {
      if (!playing) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = isCaller ? 440 : 880;
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
      osc.onended = () => { if (playing) setTimeout(beep, 800); };
    }
    beep();

    ringtoneAudio = { stop: () => { playing = false; audioCtx.close(); } };
  } catch (e) {
    console.warn('[Calling] Ringtone AudioContext not available:', e);
  }
}

function stopRingtone() {
  if (ringtoneAudio) {
    try { ringtoneAudio.stop(); } catch (e) {}
    ringtoneAudio = null;
  }
}

/* =============================================
   HELPER: escapeHtml (nếu chưa có global)
   ============================================= */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
