function parseConfig() {
  const input = document.getElementById("config-paste").value;
  const result = document.getElementById("config-result");

  if (!input.trim()) {
    result.innerHTML = '<div class="warning-box">Vui lòng dán config vào ô trên.</div>';
    return;
  }

  try {
    // Trích xuất các giá trị từ input
    const extract = (key) => {
      const regex = new RegExp(key + '\\s*:\\s*["\']([^"\']+)["\']');
      const match = input.match(regex);
      return match ? match[1] : null;
    };

    const config = {
      apiKey: extract("apiKey"),
      authDomain: extract("authDomain"),
      projectId: extract("projectId"),
      storageBucket: extract("storageBucket"),
      messagingSenderId: extract("messagingSenderId"),
      appId: extract("appId"),
      databaseURL: extract("databaseURL"),
    };

    // Kiểm tra tối thiểu
    if (!config.apiKey || !config.projectId) {
      result.innerHTML = '<div class="warning-box">❌ Không tìm thấy apiKey hoặc projectId. Hãy chắc chắn bạn đã dán đúng config.</div>';
      return;
    }

    // Tạo output
    const output = `const firebaseConfig = {
  apiKey:            "${config.apiKey}",
  authDomain:        "${config.authDomain || config.projectId + '.firebaseapp.com'}",
  projectId:         "${config.projectId}",
  storageBucket:     "${config.storageBucket || config.projectId + '.appspot.com'}",
  messagingSenderId: "${config.messagingSenderId || ''}",
  appId:             "${config.appId || ''}",
  databaseURL:       "${config.databaseURL || 'https://' + config.projectId + '-default-rtdb.asia-southeast1.firebasedatabase.app'}",
};`;

    result.innerHTML = `
      <div class="success-box">✅ Config đã trích xuất thành công!</div>
      <p style="color:var(--text-secondary);font-size:0.82rem;margin:0.5rem 0;">
        Copy đoạn dưới đây → mở <code>js/firebase-init.js</code> → thay thế phần <code>firebaseConfig</code>:
      </p>
      <div class="code-block" style="position:relative;">
        <button onclick="navigator.clipboard.writeText(this.nextElementSibling.textContent).then(()=>this.textContent='✅ Đã copy!')" style="
          position:absolute;top:0.5rem;right:0.5rem;
          background:var(--accent);color:var(--bg-main);border:none;border-radius:6px;
          padding:0.3rem 0.7rem;font-size:0.72rem;cursor:pointer;font-weight:700;">📋 Copy</button>
        <span>${output.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
      </div>
    `;
  } catch (err) {
    result.innerHTML = '<div class="warning-box">❌ Lỗi parse config: ' + err.message + '</div>';
  }
}
