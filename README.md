# 🧘 PoseAlert — Hệ thống Nhận diện và Cảnh báo Tư thế AI

[![Live Demo (Giao diện Mới)](https://img.shields.io/badge/Live_Demo-Truy_cập_Giao_diện_mới-success?style=for-the-badge&logo=github)](https://VuongLamPTITdev2007.github.io/PoseAlert/)
[![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-FF6F00?style=for-the-badge&logo=tensorflow&logoColor=white)](https://www.tensorflow.org/js)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)]()

> Ứng dụng web nhận diện tư thế ngồi học theo thời gian thực (Real-time) với **Giao diện 2-Panel hoàn toàn mới**. Tích hợp đồng hồ Pomodoro và Dashboard thống kê sức khỏe. Hoạt động 100% trên trình duyệt (Client-side) đảm bảo quyền riêng tư tối đa.

---

## 🌟 Tính năng nổi bật

- 🎨 **Giao diện Mới (V2)**: Thiết kế 2-Panel thông minh, rộng rãi, hỗ trợ đổi Theme (Cyber, Aurora, Sunset) trực tiếp.
- 🤖 **Nhận diện AI Thời gian thực**: Tích hợp mô hình `MoveNet (Lightning)` cực nhanh, quét 17 điểm khớp trên cơ thể.
- 🎯 **Phân tích 4 Tư thế**: Nhận diện chuẩn xác *Ngồi đúng*, *Cúi đầu*, *Vẹo lưng*, và *Mắt quá gần*.
- ⚠️ **Hệ thống Cảnh báo Thông minh**: Tự động phát âm thanh chuông và hiển thị popup nếu giữ tư thế sai liên tục trong 30 giây.
- ☁️ **Lưu trữ Đám mây (Firebase)**: Đăng nhập Google, đồng bộ lịch sử học tập, phòng học ảo (virtual room) và live chat với bạn bè.
- 🎮 **Gamification (Trò chơi hóa)**: Hệ thống Chuỗi Lửa (Streak) và Nhiệm vụ hàng ngày (Daily Quests) giúp duy trì động lực học tập.
- 📱 **Thiết kế Responsive**: Trải nghiệm giao diện app chuyên nghiệp mượt mà trên cả máy tính và điện thoại di động.
- 🍅 **Pomodoro Timer**: Tích hợp đồng hồ đếm ngược 25 phút làm việc / 5 phút nghỉ ngơi giúp duy trì sự tập trung.
- 📊 **Dashboard Thống kê**: Biểu đồ hình tròn và biểu đồ đường phân tích tỷ lệ tư thế chuẩn trong suốt phiên học.
- 🔒 **Bảo mật Quyền riêng tư**: Camera không bao giờ được ghi lại. Ảnh được phân tích trực tiếp ngay trên máy của bạn (Client-side).

---

## 🚀 Hướng dẫn Sử dụng

Bạn không cần phải cài đặt bất kỳ phần mềm hay thư viện nào!

1. **Cách 1 (Nhanh nhất):** Truy cập trực tiếp link Live Demo (Giao diện mới):
   👉 **[https://VuongLamPTITdev2007.github.io/PoseAlert/](https://VuongLamPTITdev2007.github.io/PoseAlert/)**

2. **Cách 2 (Chạy ở máy tính cục bộ):**
   - Tải toàn bộ mã nguồn về máy.
   - Mở file `index.html` bằng trình duyệt web (Chrome, Edge, Firefox).
   - *Lưu ý:* Cần kết nối Internet trong lần đầu tiên chạy để trình duyệt tải mô hình AI từ CDN.

---

## 🧠 Công nghệ sử dụng

| Thư viện | Vai trò |
|---|---|
| [TensorFlow.js](https://www.tensorflow.org/js) | Framework AI chạy trên trình duyệt |
| [MoveNet SINGLEPOSE_LIGHTNING](https://www.tensorflow.org/hub/tutorials/movenet) | Mô hình pose estimation tốc độ cao (17 keypoints) |
| [@tensorflow-models/pose-detection](https://github.com/tensorflow/tfjs-models/tree/master/pose-detection) | API phát hiện tư thế người |
| [Chart.js](https://www.chartjs.org/) | Vẽ biểu đồ thống kê |

---

## 📐 Thuật toán Nhận diện (Keypoint Heuristics)

Ứng dụng không huấn luyện mô hình phân loại ảnh cồng kềnh, mà trực tiếp phân tích tọa độ hình học của các khớp xương:

- 🙇 **Cúi đầu**: Tính tỷ lệ khoảng cách trục Y từ điểm Mũi đến Tâm 2 vai. (Đã được cân chỉnh độ nhạy để tránh báo động giả).
- ↩️ **Vẹo lưng**: Đo góc nghiêng của đường thẳng nối 2 vai so với phương ngang. Góc nghiêng $> 8^\circ$ $\Rightarrow$ Vẹo lưng.
- 👀 **Mắt quá gần**: Đo khoảng cách giữa 2 tai. Nếu chiếm quá $32\%$ chiều ngang camera $\Rightarrow$ Mắt quá gần màn hình.

> ⚙️ **Tùy chỉnh độ nhạy:** Có thể tự do thay đổi các ngưỡng phát hiện cảnh báo tại file `js/config.js`.

---

## 📁 Cấu trúc Mã nguồn (Modular)

Mã nguồn được viết hoàn toàn bằng Vanilla JavaScript và CSS thuần, được chia nhỏ thành các module cực kỳ dễ bảo trì:

```text
PoseAlert/
├── index.html            ← Giao diện Web SPA (Trang chính duy nhất)
├── README.md             ← Tài liệu Markdown
├── bao_cao.tex           ← Báo cáo học thuật (LaTeX)
├── docs/                 ← Thư mục tài liệu phụ
│   ├── setup-guide.html  (Hướng dẫn cấu hình Firebase)
│   ├── css/setup-guide.css
│   └── js/setup-guide.js
├── css/                  ← (14 Module CSS Giao diện)
│   ├── variables.css, layout.css, camera.css...
│   └── gamification.css, network.css, chat.css...
└── js/                   ← (12 Module JS Logic)
    ├── config.js         (Thông số & Thuật toán)
    ├── pose-classifier.js(Lõi nhận diện AI)
    ├── database.js, auth.js (Kết nối Đám mây Firebase)
    ├── gamification.js   (Logic Nhiệm vụ & Chuỗi lửa)
    └── app.js, charts.js, pomodoro.js, ui.js...
```

---

## 📚 Tài liệu Báo Cáo 

Dự án bao gồm sẵn mã nguồn tài liệu dành cho việc báo cáo học thuật:
- **`bao_cao.tex`**: File báo cáo LaTeX chi tiết (5 chương).
*Có thể biên dịch các file này thông qua Texmaker hoặc dán vào Overleaf để xuất PDF.*

---

## 👤 Tác giả

**Vương Lâm**
- **Dự án**: Bài tập cuối kỳ
