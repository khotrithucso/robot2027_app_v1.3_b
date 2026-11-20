/**
 * HARDWARE_BRIDGE.JS - Cầu nối sẵn sàng cho mạch ESP32 / Bluetooth BLE (Giai đoạn 2)
 * Tắt mặc định nếu chưa gắn mạch vật lý; không ảnh hưởng lõi App V1.3.
 */
window.HardwareBridge = {
  enabled: localStorage.getItem('robot_esp32_enabled') === 'true',
  connectedDevice: null,

  setEnabled(flag) {
    this.enabled = !!flag;
    localStorage.setItem('robot_esp32_enabled', this.enabled ? 'true' : 'false');
  },

  // Gửi lệnh cử chỉ / LED / đóng ngắt rơ-le sạc xuống ESP32
  sendCommand(cmd) {
    if (!this.enabled) return;
    console.log('[ESP32-BLE TX]:', cmd);
    window.dispatchEvent(new CustomEvent('esp32_tx', { detail: { cmd } }));
  },

  // Nhận tín hiệu từ ESP32 (4 nút cứng BTN:1..4, cảm biến xoa đầu TOUCH:HEAD, radar RADAR:NEAR)
  handleIncomingEvent(raw) {
    const msg = (raw || '').trim().toUpperCase();
    if (!msg) return;

    if (msg === 'RADAR:NEAR' || msg === 'TOUCH:HEAD') {
      if (window.FaceEngine) {
        window.FaceEngine.wakeUp('sensor');
        window.FaceEngine.setExpression('HAPPY', 2500);
      }
      return;
    }

    if (msg.startsWith('BTN:')) {
      const btnNum = parseInt(msg.split(':')[1], 10);
      if (window.AppRouter && window.AppRouter.currentView === 'game' && window.MiniGames) {
        window.MiniGames.handleHardwareButton(btnNum);
      } else if (window.LessonEngine) {
        // 4 nút cứng điều khiển bài học không cần chạm màn hình:
        // 1 (Đỏ): Nghe lại | 2 (Xanh lá): Đọc lặp lại | 3 (Vàng): Đánh vần | 4 (Xanh dương): Bỏ qua
        if (btnNum === 1) window.LessonEngine.playCurrentAudio(false);
        if (btnNum === 2) window.LessonEngine.startPracticeTurn();
        if (btnNum === 3) window.LessonEngine.spellWholeSentence();
        if (btnNum === 4) window.LessonEngine.trySkipSentence();
      }
    }
  }
};
