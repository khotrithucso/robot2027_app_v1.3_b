/**
 * CONFIG.JS - Cấu hình trung tâm của Robot 2027 App V1.3
 */
window.RobotConfig = {
  APP_VERSION: '1.3.0',

  // Địa chỉ gốc Backend trên Hosting (có thể đổi trực tiếp trong Setting -> Server)
  DEFAULT_SERVER_BASE: 'https://khotrithucso.io.vn/robot2027_2_4/test1',

  // Mã PIN mặc định
  DEFAULT_PARENT_PIN: '1234',       // PIN Phụ huynh mở khóa YouTube/Game & Giám sát
  MANUFACTURER_KIOSK_PIN: '202799', // PIN 6 số Nhà sản xuất thoát khóa Kiosk vĩnh viễn

  // Ngưỡng quản lý pin thông minh (50% - 90%)
  BATTERY_SURVIVAL_MIN: 50,         // Dưới 50% bật Chế độ Sinh tồn tiết kiệm điện
  BATTERY_CHARGE_STOP: 90,          // Đạt 90% gửi lệnh ngắt sạc qua ESP32

  // Ngưỡng chấm điểm phát âm & số lần thử trước khi mở nút Bỏ qua
  PASS_SCORE_THRESHOLD: 78,
  MAX_ATTEMPTS_BEFORE_SKIP: 3,

  // Gói dữ liệu khởi đầu tích hợp sẵn (Chạy ngay 0ms kể cả khi chưa có mạng lần đầu)
  STARTER_PACK: {
    topic: 'starter_animals',
    title: 'Animals & Greetings (Offline Ready)',
    version_hash: 'v1_3_builtin',
    items: [
      {
        id: 0,
        en: 'Hello! I am happy to see you today.',
        vi: 'Xin chào! Mình rất vui được gặp bạn hôm nay.',
        audio_url: '',
        spelling: [
          { word: 'Hello', spell: 'H-E-L-L-O' },
          { word: 'I', spell: 'I' },
          { word: 'am', spell: 'A-M' },
          { word: 'happy', spell: 'H-A-P-P-Y' },
          { word: 'to', spell: 'T-O' },
          { word: 'see', spell: 'S-E-E' },
          { word: 'you', spell: 'Y-O-U' },
          { word: 'today', spell: 'T-O-D-A-Y' }
        ]
      },
      {
        id: 1,
        en: 'The cute white rabbit likes eating carrots.',
        vi: 'Chú thỏ trắng dễ thương thích ăn cà rốt.',
        audio_url: '',
        spelling: [
          { word: 'The', spell: 'T-H-E' },
          { word: 'cute', spell: 'C-U-T-E' },
          { word: 'white', spell: 'W-H-I-T-E' },
          { word: 'rabbit', spell: 'R-A-B-B-I-T' },
          { word: 'likes', spell: 'L-I-K-E-S' },
          { word: 'eating', spell: 'E-A-T-I-N-G' },
          { word: 'carrots', spell: 'C-A-R-R-O-T-S' }
        ]
      },
      {
        id: 2,
        en: 'Can you count from one to five with me?',
        vi: 'Bạn có thể đếm từ một đến năm cùng mình không?',
        audio_url: '',
        spelling: [
          { word: 'Can', spell: 'C-A-N' },
          { word: 'you', spell: 'Y-O-U' },
          { word: 'count', spell: 'C-O-U-N-T' },
          { word: 'from', spell: 'F-R-O-M' },
          { word: 'one', spell: 'O-N-E' },
          { word: 'to', spell: 'T-O' },
          { word: 'five', spell: 'F-I-V-E' },
          { word: 'with', spell: 'W-I-T-H' },
          { word: 'me', spell: 'M-E' }
        ]
      },
      {
        id: 3,
        en: 'The big elephant has a very long trunk.',
        vi: 'Chú voi to lớn có một chiếc vòi rất dài.',
        audio_url: '',
        spelling: [
          { word: 'The', spell: 'T-H-E' },
          { word: 'big', spell: 'B-I-G' },
          { word: 'elephant', spell: 'E-L-E-P-H-A-N-T' },
          { word: 'has', spell: 'H-A-S' },
          { word: 'a', spell: 'A' },
          { word: 'very', spell: 'V-E-R-Y' },
          { word: 'long', spell: 'L-O-N-G' },
          { word: 'trunk', spell: 'T-R-U-N-K' }
        ]
      },
      {
        id: 4,
        en: 'Thank you for practicing English every day!',
        vi: 'Cảm ơn bạn đã luyện tập tiếng Anh mỗi ngày!',
        audio_url: '',
        spelling: [
          { word: 'Thank', spell: 'T-H-A-N-K' },
          { word: 'you', spell: 'Y-O-U' },
          { word: 'for', spell: 'F-O-R' },
          { word: 'practicing', spell: 'P-R-A-C-T-I-C-I-N-G' },
          { word: 'English', spell: 'E-N-G-L-I-S-H' },
          { word: 'every', spell: 'E-V-E-R-Y' },
          { word: 'day', spell: 'D-A-Y' }
        ]
      }
    ]
  },

  getEndpoints() {
    const base = (localStorage.getItem('robot_server_base') || this.DEFAULT_SERVER_BASE).replace(/\/+$/, '');
    return {
      base,
      api: `${base}/api.php`,
      apiUser: `${base}/api_user.php`,
      youtube: `${base}/youtube.php`,
      games: `${base}/games.php`
    };
  }
};
