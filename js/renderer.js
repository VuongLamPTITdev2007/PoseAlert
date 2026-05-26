/**
 * ============================================================
 *  PoseAlert — js/renderer.js
 *  Vẽ hình ảnh webcam, keypoints và skeleton lên canvas
 *  Phụ thuộc: config.js, state.js
 * ============================================================
 */

/**
 * drawFrame(poses) — Entry point: vẽ 1 frame đầy đủ lên canvas
 * Gồm: ảnh camera (mirror) + keypoints + skeleton
 */
function drawFrame(poses) {
  if (!ctx || !video) return;

  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // ---- ĐÂY CHÍNH LÀ BƯỚC BỌC LẠI BẰNG LỆNH ĐIỀU KIỆN ----
  if (!isPrivacyMode) {
    // Nếu KHÔNG bật bảo mật -> Vẽ hình ảnh camera lên màn hình như bình thường
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
  } else {
    // Nếu CÓ bật bảo mật -> Không vẽ camera nữa, mà tô một hình chữ nhật màu đen che toàn bộ màn hình
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
  }
  // -----------------------------------------------------

  // Đoạn này nằm ngoài lệnh if-else che mặt, nên dù nền đen hay nền camera 
  // thì khung xương (skeleton) màu xanh vẫn luôn luôn được vẽ đè lên
  if (poses.length > 0) {
    const keypoints = poses[0].keypoints;
    drawKeypoints(keypoints, w);
    drawSkeleton(keypoints, w);
  }
}

/**
 * drawKeypoints(keypoints, canvasWidth)
 * Vẽ chấm tròn xanh lá tại mỗi keypoint đủ độ tin cậy
 */
function drawKeypoints(keypoints, canvasWidth) {
  const minScore = POSE_THRESHOLDS.minKeypointScore;

  keypoints.forEach(kp => {
    if (kp.score < minScore) return;

    const x = canvasWidth - kp.x; // Flip x theo mirror
    const y = kp.y;

    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 2 * Math.PI);
    ctx.fillStyle   = "#00ff88";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  });
}

/**
 * drawSkeleton(keypoints, canvasWidth)
 * Vẽ đường xanh cyan nối các keypoint theo SKELETON_CONNECTIONS
 */
function drawSkeleton(keypoints, canvasWidth) {
  const minScore = POSE_THRESHOLDS.minKeypointScore;

  SKELETON_CONNECTIONS.forEach(([i, j]) => {
    const kp1 = keypoints[i];
    const kp2 = keypoints[j];

    if (kp1.score < minScore || kp2.score < minScore) return;

    // Flip x theo mirror
    ctx.beginPath();
    ctx.moveTo(canvasWidth - kp1.x, kp1.y);
    ctx.lineTo(canvasWidth - kp2.x, kp2.y);
    ctx.strokeStyle = "#00d4ff";
    ctx.lineWidth   = 2;
    ctx.stroke();
  });
}
