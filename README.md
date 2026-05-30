# 🧘 PoseAlert — Hệ thống Nhận diện và Cảnh báo Tư thế AI

[![Live Demo](https://img.shields.io/badge/Live_Demo-Truy_cập_ngay-success?style=for-the-badge&logo=github)](https://vietdung29092007-dev.github.io/d-n-b-i-t-p-cu-i-k-/)
[![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-FF6F00?style=for-the-badge&logo=tensorflow&logoColor=white)](https://www.tensorflow.org/js)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)]()

> Ứng dụng web nhận diện tư thế ngồi học theo thời gian thực (Real-time). Tích hợp đồng hồ Pomodoro và Dashboard thống kê sức khỏe. Hoạt động 100% trên trình duyệt (Client-side) đảm bảo quyền riêng tư tối đa.

---

## 🌟 Tính năng nổi bật

- 🤖 **Nhận diện AI Thời gian thực**: Tích hợp mô hình `MoveNet (Lightning)` cực nhanh, quét 17 điểm khớp trên cơ thể.
- 🎯 **Phân tích 4 Tư thế**: Nhận diện chuẩn xác *Ngồi đúng*, *Cúi đầu*, *Vẹo lưng*, và *Mắt quá gần*.
- ⚠️ **Hệ thống Cảnh báo Thông minh**: Tự động phát âm thanh chuông và hiển thị popup nếu giữ tư thế sai liên tục trong 30 giây.
- 🍅 **Pomodoro Timer**: Tích hợp đồng hồ đếm ngược 25 phút làm việc / 5 phút nghỉ ngơi giúp duy trì sự tập trung.
- 📊 **Dashboard Thống kê**: Biểu đồ hình tròn và biểu đồ đường phân tích tỷ lệ tư thế chuẩn trong suốt phiên học.
- 🔒 **Bảo mật Quyền riêng tư**: Camera không bao giờ được ghi lại hay gửi lên bất kỳ máy chủ nào. Mọi xử lý đều diễn ra ngay trên máy của bạn.

---

## 🚀 Hướng dẫn Sử dụng

Bạn không cần phải cài đặt bất kỳ phần mềm hay thư viện nào!

1. **Cách 1 (Nhanh nhất):** Truy cập trực tiếp link Live Demo:
   👉 **[https://vietdung29092007-dev.github.io/d-n-b-i-t-p-cu-i-k-/](https://vietdung29092007-dev.github.io/d-n-b-i-t-p-cu-i-k-/)**

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

- 🙇 **Cúi đầu**: Tính tỷ lệ khoảng cách trục Y từ điểm Mũi đến Tâm 2 vai. Nếu quá thấp $\Rightarrow$ Cúi đầu.
- ↩️ **Vẹo lưng**: Đo góc nghiêng của đường thẳng nối 2 vai so với phương ngang. Góc $> 12^\circ$ $\Rightarrow$ Vẹo lưng.
- 👀 **Mắt quá gần**: Đo khoảng cách giữa 2 tai. Nếu chiếm quá $40\%$ chiều ngang camera $\Rightarrow$ Mắt quá gần màn hình.

> ⚙️ **Tùy chỉnh độ nhạy:** Có thể chỉnh các thông số này tại file `js/config.js`.

---

## 📁 Cấu trúc Mã nguồn (Modular)

Mã nguồn được viết hoàn toàn bằng Vanilla JavaScript và CSS thuần, được chia nhỏ thành các module cực kỳ dễ bảo trì:

```text
d-n-b-i-t-p-cu-i-k-/
├── index.html            ← Giao diện chính
├── README.md             ← Tài liệu này
├── bao_cao.tex           ← Báo cáo chi tiết (LaTeX)
├── slide.tex             ← Slide thuyết trình (LaTeX Beamer)
├── css/                  ← (10 Module CSS Giao diện)
│   ├── variables.css, layout.css, camera.css...
│   └── ai-loading.css, alert-popup.css...
└── js/                   ← (10 Module JS Logic)
    ├── config.js         (Thông số thuật toán)
    ├── pose-classifier.js(Lõi nhận diện AI)
    ├── app.js            (Điều phối chính)
    └── charts.js, pomodoro.js, ui.js...
```

---

## 📚 Tài liệu Báo Cáo & Slide

Dự án bao gồm sẵn mã nguồn tài liệu dành cho việc báo cáo học thuật:
- **`bao_cao.tex`**: File báo cáo LaTeX chi tiết (5 chương).
*Có thể biên dịch các file này thông qua Texmaker hoặc dán vào Overleaf để xuất PDF.*

---

## 👤 Tác giả

**Vương Lâm**
- **Dự án**: Bài tập cuối kỳ
