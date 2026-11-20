/**
 * VIEW_ROUTER.JS - Điều hướng đơn lớp chống lag, Khóa giải trí phụ huynh & Sub-panel 92%
 */
window.AppRouter = {
  currentView: 'robot',
  lastTapTab: '',
  lastTapTime: 0,
  secretCornerTaps: 0,
  secretCornerTimer: null,

  init() {
    document.querySelectorAll('.nav-icon-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.view;
        this.handleNavClick(target);
      });
    });

    // Vùng chạm ẩn 5 lần góc trên trái để mở khóa Kiosk nhà sản xuất
    const secretZone = document.getElementById('secretKioskZone');
    if (secretZone) {
      secretZone.addEventListener('click', () => {
        this.secretCornerTaps++;
        clearTimeout(this.secretCornerTimer);
        this.secretCornerTimer = setTimeout(() => { this.secretCornerTaps = 0; }, 2200);
        if (this.secretCornerTaps >= 5) {
          this.secretCornerTaps = 0;
          this.openSettingsSub('security');
        }
      });
    }
  },

  handleNavClick(target) {
    window.FaceEngine.resetSleepTimer();

    // Khi đang ở YouTube/Game, yêu cầu chạm 2 lần (Double-tap) chống trẻ chạm nhầm
    if ((this.currentView === 'youtube' || this.currentView === 'game') && target !== this.currentView) {
      const now = Date.now();
      const bar = document.getElementById('topRightNav');
      if (bar) bar.classList.remove('dimmed');
      if (this.lastTapTab !== target || (now - this.lastTapTime > 2000)) {
        this.lastTapTab = target;
        this.lastTapTime = now;
        return;
      }
    }
    this.switchView(target);
  },

  async switchView(target) {
    // 1. Kiểm tra Khóa "Chế độ Chỉ Học Tập" & Giờ đi ngủ cho YouTube / Game
    if (target === 'youtube' || target === 'game') {
      if (this.isBedtimeLocked()) {
        await window.NativeBridge.speak('Đã đến giờ đi ngủ rồi, hẹn gặp bạn sáng mai nhé!', 'vi', 1.0, 'bedtime');
        return;
      }
      if (window.RobotStorage.isStudyOnlyMode()) {
        await window.NativeBridge.speak('Đang trong giờ học tập, nhờ bố mẹ mở khóa trong Cài đặt nhé!', 'vi', 1.0, 'locked_msg');
        return;
      }
      window.RobotStorage.logMediaUsage(target.toUpperCase(), 'Mở mục giải trí');
    }

    const prevView = this.currentView;
    this.currentView = target;

    // 2. Giải phóng tài nguyên trang cũ (Single-Layer Cleanup)
    if (prevView === 'youtube' || prevView === 'game') {
      this.pauseIframes();
    }
    if (prevView === 'robot' && target !== 'robot') {
      await window.LessonEngine.interruptSpeech();
      await window.NativeBridge.stopMic();
    }

    // 3. Chuyển hiển thị màn hình đơn lớp
    document.querySelectorAll('.view-screen').forEach(sec => sec.classList.remove('active'));
    const activeSec = document.getElementById(`view-${target}`);
    if (activeSec) activeSec.classList.add('active');

    document.querySelectorAll('.nav-icon-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === target);
    });

    const navBar = document.getElementById('topRightNav');
    if (navBar) {
      if (target === 'youtube' || target === 'game') navBar.classList.add('dimmed');
      else navBar.classList.remove('dimmed');
    }

    // 4. Kích hoạt tài nguyên màn hình mới
    if (target === 'library') {
      window.AppUI.renderTopicsGrid();
    } else if (target === 'youtube') {
      this.loadYoutubeIframe();
    } else if (target === 'robot') {
      // Hủy & tạo mới SpeechRecognizer sau 350ms chống mất mic khi từ YouTube/Game quay về
      setTimeout(() => {
        window.NativeBridge.resetAndStartMic('en-US', false);
      }, 350);
    }
  },

  loadYoutubeIframe() {
    const iframe = document.getElementById('youtubeIframe');
    const fallback = document.getElementById('youtubeFallback');
    if (!navigator.onLine) {
      if (fallback) fallback.classList.remove('hidden');
      return;
    }
    if (fallback) fallback.classList.add('hidden');
    const { youtube } = window.RobotConfig.getEndpoints();
    if (iframe && (!iframe.src || iframe.src === 'about:blank')) {
      iframe.src = `${youtube}?bot_id=${encodeURIComponent(window.RobotStorage.getBotId())}`;
    }
  },

  reloadIframe(which) {
    if (which === 'youtube') {
      const iframe = document.getElementById('youtubeIframe');
      if (iframe) iframe.src = '';
      this.loadYoutubeIframe();
    }
  },

  pauseIframes() {
    ['youtubeIframe', 'gameIframe'].forEach(id => {
      const f = document.getElementById(id);
      if (f && f.contentWindow) {
        try { f.contentWindow.postMessage({ action: 'pause' }, '*'); } catch {}
      }
    });
  },

  isBedtimeLocked() {
    if (localStorage.getItem('robot_bedtime_enabled') !== 'true') return false;
    const startH = parseInt(localStorage.getItem('robot_bedtime_start') || '21', 10);
    const endH = parseInt(localStorage.getItem('robot_bedtime_end') || '6', 10);
    const h = new Date().getHours();
    return startH > endH ? (h >= startH || h < endH) : (h >= startH && h < endH);
  },

  // Xác thực PIN Phụ huynh trước khi mở mục nhạy cảm
  openParentalGate(subType) {
    const pin = prompt('🔒 Nhập mã PIN Phụ huynh (mặc định 1234):');
    const savedPin = localStorage.getItem('robot_parent_pin') || window.RobotConfig.DEFAULT_PARENT_PIN;
    if (pin !== savedPin) {
      if (pin !== null) alert('❌ Sai mã PIN Phụ huynh!');
      return;
    }
    this.openSettingsSub(subType);
  },

  // Mở Sub-panel cấp 2 (92% diện tích, duy nhất 1 lớp)
  openSettingsSub(subType) {
    if (this.currentView !== 'settings') {
      this.switchView('settings');
    }
    const modal = document.getElementById('settingsSubModal');
    const title = document.getElementById('subpanelTitle');
    const body = document.getElementById('subpanelBody');
    if (!modal || !title || !body) return;

    modal.classList.remove('hidden');

    if (subType === 'parental') {
      const studyOnly = window.RobotStorage.isStudyOnlyMode();
      const starGoal = localStorage.getItem('robot_star_goal') || '10';
      const rewardMins = localStorage.getItem('robot_reward_mins') || '10';
      const bedEnabled = localStorage.getItem('robot_bedtime_enabled') === 'true';

      title.textContent = '🔒 Kiểm Soát Giải Trí Phụ Huynh & Tích Sao';
      body.innerHTML = `
        <div class="set-card">
          <label style="flex-direction:row;align-items:center;gap:10px;font-size:15px;color:#fff;">
            <input type="checkbox" id="chkStudyOnly" ${studyOnly ? 'checked' : ''} style="width:22px;height:22px;" />
            <span><b>Bật Chế độ Chỉ Học Tập</b> (Khóa biểu tượng YouTube ▶️ & Game 🎮)</span>
          </label>
          <div class="btn-row" style="margin-top:8px;">
            <button class="btn-neon btn-green" onclick="window.AppUI.unlockTimedFromParent(15)">⏱️ Mở khóa nhanh 15 phút</button>
            <button class="btn-neon btn-amber" onclick="window.AppUI.unlockTimedFromParent(30)">⏱️ Mở khóa nhanh 30 phút</button>
          </div>
        </div>
        <div class="set-card">
          <h3>⭐ Học Đổi Giờ Giải Trí (Gamification)</h3>
          <label>Số câu đọc đúng (Sao) để tự mở khóa giải trí (0 = tắt):
            <input type="number" id="inpStarGoal" value="${starGoal}" min="0" max="100" />
          </label>
          <label>Số phút thưởng YouTube / Game mỗi lần đạt mốc:
            <input type="number" id="inpRewardMins" value="${rewardMins}" min="5" max="60" />
          </label>
        </div>
        <div class="set-card">
          <h3>🌙 Khung Giờ Đi Ngủ (Bedtime Schedule)</h3>
          <label style="flex-direction:row;align-items:center;gap:10px;">
            <input type="checkbox" id="chkBedtime" ${bedEnabled ? 'checked' : ''} />
            <span>Tự khóa giải trí & nhắc đi ngủ từ 21:00 đến 06:00 sáng</span>
          </label>
          <label>Đổi mã PIN Phụ huynh (4 số):
            <input type="password" id="inpNewParentPin" maxlength="6" placeholder="Để trống nếu giữ nguyên" />
          </label>
          <button class="btn-neon btn-cyan" onclick="window.AppUI.saveParentalSettings()">💾 Lưu Cài Đặt Phụ Huynh</button>
        </div>
      `;
    } else if (subType === 'monitor') {
      const p = window.RobotStorage.getActiveProfile();
      const learnedTotal = Object.values(p.learned || {}).reduce((acc, arr) => acc + arr.length, 0);
      const hardList = (p.hardWords || []).slice(-10).map(h => `<li>${h.en}</li>`).join('') || '<li>Chưa có câu sai nào!</li>';
      const mediaLogs = window.RobotStorage.getMediaLogs().slice(0, 10).map(l => `<li>[${l.time}] ${l.tab}: ${l.detail}</li>`).join('') || '<li>Chưa mở YouTube/Game</li>';

      title.textContent = '📊 Nhật Ký Học Tập & Giám Sát Camera Từ Xa';
      body.innerHTML = `
        <div class="set-card">
          <h3>📈 Thống Kê Của ${p.name}</h3>
          <p>⭐ Tổng sao tích lũy: <b>${p.stars || 0}</b> | ✅ Số câu đã thuộc: <b>${learnedTotal}</b></p>
          <p><b>Các câu phát âm chưa chuẩn gần đây:</b></p>
          <ul>${hardList}</ul>
        </div>
        <div class="set-card">
          <h3>📹 Giám Sát Camera Trước Từ Xa (WebRTC P2P)</h3>
          <p style="font-size:13px;color:#94a3b8;">Camera trước luôn tắt 100% để mát máy. Khi phụ huynh mở trang xem trên điện thoại và nhập Bot ID <b>${window.RobotStorage.getBotId()}</b>, robot tự kết nối P2P.</p>
          <p><b>Lịch sử mở giải trí:</b></p>
          <ul>${mediaLogs}</ul>
        </div>
      `;
    } else if (subType === 'profiles') {
      const profiles = window.RobotStorage.getProfiles();
      const activeId = window.RobotStorage.getActiveProfile().id;
      const cards = profiles.map(pr => `
        <button class="btn-neon ${pr.id === activeId ? 'btn-green' : 'btn-cyan'}" onclick="window.AppUI.selectLearnerProfile('${pr.id}')">
          👤 ${pr.name} (${pr.age} tuổi) — ⭐ ${pr.stars || 0}
        </button>
      `).join('');

      title.textContent = '👤 Hồ Sơ Người Học & Đặt Tên Robot';
      body.innerHTML = `
        <div class="set-card">
          <h3>🤖 Tên Gọi Của Robot (Từ khóa đánh thức)</h3>
          <div class="btn-row">
            <input type="text" id="inpRobotName" value="${window.RobotStorage.getRobotName()}" />
            <button class="btn-neon btn-cyan" onclick="window.AppUI.saveRobotNameFromInput()">Lưu Tên</button>
          </div>
        </div>
        <div class="set-card">
          <h3>👨‍👩‍👧‍👦 Chọn Người Đang Học</h3>
          <div class="btn-col">${cards}</div>
        </div>
      `;
    } else if (subType === 'bluetooth') {
      const espOn = window.HardwareBridge.enabled;
      title.textContent = '🔵 Kết Nối Bluetooth & Mạch Phần Cứng ESP32';
      body.innerHTML = `
        <div class="set-card">
          <label style="flex-direction:row;align-items:center;gap:10px;font-size:14px;color:#fff;">
            <input type="checkbox" id="chkEsp32" ${espOn ? 'checked' : ''} onchange="window.HardwareBridge.setEnabled(this.checked)" />
            <span>Bật cầu nối điều khiển thân Robot ESP32 (Motor, 4 Nút cứng, Rơ-le sạc 50-90%)</span>
          </label>
          <div class="btn-row">
            <button class="btn-neon btn-cyan" onclick="window.NativeBridge.openBluetoothSettings()">🔍 Mở Cài Đặt Bluetooth Máy</button>
            <button class="btn-neon btn-green" onclick="window.HardwareBridge.sendCommand('M:WAVE')">👋 Test Lệnh Vẫy Tay ESP32</button>
          </div>
        </div>
      `;
    } else if (subType === 'server') {
      const { base } = window.RobotConfig.getEndpoints();
      title.textContent = '🌐 Cấu Hình Địa Chỉ Máy Chủ Backend';
      body.innerHTML = `
        <div class="set-card">
          <label>Đường dẫn gốc chứa api.php & api_user.php:
            <input type="text" id="inpServerBase" value="${base}" />
          </label>
          <div class="btn-row">
            <button class="btn-neon btn-cyan" onclick="window.AppUI.saveServerBase()">💾 Lưu & Đồng Bộ Ngay</button>
          </div>
        </div>
      `;
    } else if (subType === 'security') {
      title.textContent = '🔐 Bảo Mật Kiosk Vĩnh Viễn (Nhà Sản Xuất)';
      body.innerHTML = `
        <div class="set-card">
          <p style="font-size:13px;color:#cbd5e1;">Chế độ Kiosk khóa thanh trạng thái và 3 phím điều hướng Android. Để thoát khỏi App Robot ra màn hình chính Android, nhập mã PIN 6 số của Nhà sản xuất:</p>
          <div class="btn-row">
            <input type="password" id="inpMfgPin" maxlength="6" placeholder="Nhập PIN 6 số..." />
            <button class="btn-neon btn-rose" onclick="window.AppUI.verifyManufacturerKioskPin()">🔓 Tạm Tắt Khóa Kiosk</button>
            <button class="btn-neon btn-green" onclick="window.NativeBridge.setKioskLock(true); alert('Đã bật lại khóa Kiosk!');">🔒 Bật Lại Kiosk</button>
          </div>
        </div>
      `;
    }
  },

  closeSettingsSub() {
    const modal = document.getElementById('settingsSubModal');
    if (modal) modal.classList.add('hidden');
  }
};
