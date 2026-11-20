# Robot 2027 — App Version 1.3 (Full Complete Edition)

Phiên bản hoàn chỉnh kiến trúc **App-First siêu nhẹ, màn hình ngang OLED (#000000), Kiosk chống thoát, Mic không tiếng bíp, Dual TTS 0ms độ trễ và Học Tiếng Anh Karaoke**.

---

## Cấu trúc thư mục trong gói ZIP
```text
├── .github/workflows/build-apk.yml  # Workflow tự động build APK trên GitHub Actions
├── docs/build-apk.yml               # Bản sao lưu workflow (dùng nếu Spck Editor ẩn thư mục .github)
├── scripts/setup_android.py         # Script tự động tích hợp Native Android Kiosk + Speech/TTS
├── native_android/                  # Mã nguồn Java Native (MainActivity, RobotNativePlugin, BootReceiver)
├── www/                             # Toàn bộ giao diện & logic Web App tách module rõ ràng
│   ├── index.html
│   ├── css/ (theme_oled.css, robot_face.css, views_panels.css)
│   └── js/  (12 module chuyên biệt: config, storage, native_bridge, api_client, face_engine, lesson_engine, voice_assistant, power_device, hardware_bridge, mini_games, view_router, app)
├── server_companion/                # File api_user.php (0% Database) để chép lên Hosting cùng api.php
├── capacitor.config.json
└── package.json
```

---

## Hướng dẫn Build file APK trong 3 bước (Spck Editor -> GitHub Actions)
1. **Giải nén & Import:** Giải nén `robot2027-app-v1.3-complete.zip` và mở thư mục dự án bằng **Spck Editor** (hoặc tải thẳng lên repository GitHub của bạn).
   - *Lưu ý Spck Editor:* Nếu Spck Editor ẩn thư mục `.github`, hãy tạo file `.github/workflows/build-apk.yml` và dán nội dung từ `docs/build-apk.yml` vào.
2. **Push lên GitHub:** Commit & Push toàn bộ mã nguồn lên nhánh `main` (hoặc `master`).
3. **Tải file APK:** Vào tab **Actions** trên GitHub -> chọn workflow **Build Robot2027 App V1.3 APK** -> tải artifact **Robot2027-v1.3-complete-apk** về cài trực tiếp lên điện thoại/tablet.

### Mã PIN mặc định trong hệ thống
- **PIN Phụ huynh** (Mở khóa YouTube / Game & Xem nhật ký): `1234`
- **PIN Nhà sản xuất** (Chạm 5 lần vào góc trên bên trái màn hình để tạm tắt khóa Kiosk): `202799`
