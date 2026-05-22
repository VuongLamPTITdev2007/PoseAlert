# 🧘 PoseAlert — Cảnh báo Tư thế Ngồi Học

> Ứng dụng web nhận diện tư thế ngồi học theo thời gian thực, sử dụng **TensorFlow.js MoveNet** để phân tích 17 điểm keypoint trên cơ thể — không cần train model, không cần URL, hoạt động ngay trong trình duyệt.

---

## 📸 Tính năng

| Tính năng | Mô tả |
|---|---|
| 🤖 **Nhận diện tư thế realtime** | Phân tích 4 tư thế: Ngồi đúng, Cúi đầu, Vẹo lưng, Mắt quá gần |
| ⚠️ **Cảnh báo thông minh** | Popup + âm thanh sau 30 giây giữ nguyên tư thế sai liên tục |
| 🦴 **Vẽ skeleton trực quan** | Hiển thị 17 keypoint và đường xương lên canvas camera |
| 📊 **Dashboard thống kê** | Biểu đồ tròn tỷ lệ tư thế + biểu đồ đường lịch sử phiên |
| 🍅 **Pomodoro Timer** | Hẹn giờ 25 phút học / 5 phút nghỉ tích hợp sẵn |
| 🔔 **Nhật ký cảnh báo** | Lưu lại lịch sử các lần cảnh báo trong phiên |

---

## 🚀 Cách sử dụng

### Yêu cầu
- Trình duyệt hiện đại (Chrome, Edge, Firefox)
- Webcam
- Kết nối internet (lần đầu để tải model từ CDN)

### Chạy ứng dụng

```
1. Mở file index.html bằng trình duyệt
   (hoặc serve qua localhost để đảm bảo camera hoạt động)

2. Nhấn nút "▶ Bắt đầu"

3. Cho phép truy cập camera khi được hỏi

4. Đợi ~2–3 giây để model MoveNet tải xong

5. Bắt đầu sử dụng!
```

> **Lưu ý:** Một số trình duyệt yêu cầu trang phải chạy qua `https://` hoặc `localhost` mới cho phép truy cập camera. Nếu mở file trực tiếp gặp lỗi camera, hãy dùng extension **Live Server** (VS Code) hoặc lệnh:
> ```bash
> npx serve .
> ```

---

## 🧠 Công nghệ sử dụng

| Thư viện | Vai trò |
|---|---|
| [TensorFlow.js](https://www.tensorflow.org/js) | Framework AI chạy trên trình duyệt |
| [MoveNet SINGLEPOSE_LIGHTNING](https://www.tensorflow.org/hub/tutorials/movenet) | Mô hình pose estimation tốc độ cao (17 keypoints) |
| [@tensorflow-models/pose-detection](https://github.com/tensorflow/tfjs-models/tree/master/pose-detection) | API phát hiện tư thế người |
| [Chart.js](https://www.chartjs.org/) | Vẽ biểu đồ thống kê |

---

## 📐 Thuật toán nhận diện tư thế

Ứng dụng **không** sử dụng model học máy riêng mà phân tích trực tiếp tọa độ 17 điểm keypoint:

```
        0-mũi
       / \
  1-mắt   2-mắt
  3-tai   4-tai
  5-vai(T)——6-vai(P)
  |              |
 11-hông(T)——12-hông(P)
```

### Cúi đầu 🙇
```
ratio = (vai.y - mũi.y) / rộng_vai
Phát hiện khi: ratio < 0.5
```
*Khi ngồi thẳng, mũi ở cao hơn vai nhiều. Khi cúi, mũi hạ xuống gần vai.*

### Vẹo lưng ↩️
```
Cách 1: góc_nghiêng_vai = atan2(|Lvai.y - Pvai.y|, |Lvai.x - Pvai.x|) > 12°
Cách 2: |trung_tâm_vai.x - trung_tâm_hông.x| / rộng_vai > 30%
```

### Mắt quá gần 👀
```
ratio = rộng_mặt(tai-tai) / rộng_canvas > 40%
```
*Khi người dùng lại gần camera, mặt chiếm tỷ lệ lớn hơn trong khung hình.*

---

## ⚙️ Điều chỉnh ngưỡng phát hiện

Nếu ứng dụng quá nhạy (cảnh báo sai) hoặc không đủ nhạy, mở `script.js` và chỉnh `POSE_THRESHOLDS`:

```javascript
const POSE_THRESHOLDS = {
  headBowRatio: 0.5,         // ↑ tăng = ít nhạy cúi đầu hơn
  shoulderTiltAngle: 12,     // ↑ tăng = ít nhạy vẹo vai hơn (đơn vị: độ)
  lateralOffsetRatio: 0.3,   // ↑ tăng = ít nhạy nghiêng người hơn
  faceCloseRatio: 0.40,      // ↑ tăng = ít nhạy mắt quá gần hơn
  minKeypointScore: 0.3,     // ↑ tăng = chỉ xét keypoint có độ tin cậy cao hơn
};
```

---

## 📁 Cấu trúc dự án

```
d-n-b-i-t-p-cu-i-k-/
├── index.html    ← Giao diện HTML + CDN scripts
├── style.css     ← Giao diện dark theme / AI aesthetic
├── script.js     ← Logic AI + nhận diện tư thế + UI
└── README.md     ← Tài liệu này
```

---

## 🎨 Giao diện

- **Dark theme** kiểu AI/Tech với màu neon cyan và xanh lá
- **3-cột layout**: Camera | Trạng thái + Pomodoro | Biểu đồ
- **Responsive**: Thu gọn về 2 cột (tablet) và 1 cột (mobile)
- **Font**: Space Mono (mono/code) + DM Sans (body)

---

## 👤 Tác giả

**Vương Lâm**

---

## 📝 Ghi chú kỹ thuật

- Model MoveNet được tải tự động từ CDN khi nhấn "Bắt đầu" (cần internet lần đầu)
- Ứng dụng dùng **smoothing 5 frame** (majority vote) để tránh kết quả nhấp nháy
- Camera được hiển thị **mirror flip** (lật ngang) để người dùng thấy tự nhiên như soi gương
- Skeleton và keypoints được vẽ trực tiếp lên `<canvas>` bằng Canvas 2D API
- Cảnh báo âm thanh tạo động bằng **Web Audio API** (không cần file âm thanh)