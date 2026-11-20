/**
 * APP.JS - Điểm khởi chạy trung tâm của Robot 2027 App V1.3
 */
window.AppUI = {
  refreshHUD() {
    const botNameEl = document.getElementById('hudRobotName');
    const learnerEl = document.getElementById('hudLearnerProfile');
    if (botNameEl) botNameEl.textContent = `🤖 ${window.RobotStorage.getRobotName().toUpperCase()}`;

    const p = window.RobotStorage.getActiveProfile();
    if (learnerEl && p) {
      learnerEl.innerHTML = `👤 ${p.name} • ⭐ <b id="hudStarsCount">${p.stars || 0}</b>`;
    }
    this.refreshLockBadges();
  },

  refreshLockBadges() {
    const locked = window.RobotStorage.isStudyOnlyMode();
    ['Youtube', 'Game'].forEach(name => {
      const badge = document.getElementById(`lock${name}`);
      const btn = document.getElementById(`navBtn${name}`);
      if (badge) badge.classList.toggle('hidden', !locked);
      if (btn) btn.classList.toggle('locked-tab', locked);
    });
  },

  async renderTopicsGrid() {
    const grid = document.getElementById('topicsGrid');
    const countSpan = document.getElementById('libTopicCount');
    const revSpan = document.getElementById('reviewCountSpan');
    if (!grid) return;

    const p = window.RobotStorage.getActiveProfile();
    if (revSpan) revSpan.textContent = (p.hardWords || []).length;

    let topics = window.ApiClient.topicsCatalog;
    if (!topics || topics.length === 0) {
      topics = await window.ApiClient.fetchTopicsCatalog();
    }
    if (countSpan) countSpan.textContent = topics.length;

    const q = (document.getElementById('libSearchInput')?.value || '').toLowerCase().trim();
    const filtered = q ? topics.filter(t => t.topic.toLowerCase().includes(q) || (t.title || '').toLowerCase().includes(q)) : topics;

    grid.innerHTML = filtered.map(t => {
      const learnedArr = (p.learned && p.learned[t.topic]) ? p.learned[t.topic] : [];
      const total = Math.max(1, t.count || 1);
      const pct = Math.min(100, Math.round((learnedArr.length / total) * 100));
      const isCurrent = window.LessonEngine.currentPack.topic === t.topic;

      return `
        <div class="topic-card ${isCurrent ? 'active-topic' : ''}" onclick="window.AppUI.openTopicFromLibrary('${t.topic}')">
          <div class="topic-card-title">${t.title || t.topic}</div>
          <div class="topic-card-meta">
            <span>${t.count} câu</span>
            <span>${pct}% hoàn thành</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
  },

  filterTopics() {
    this.renderTopicsGrid();
  },

  async openTopicFromLibrary(topicSlug) {
    await window.AppRouter.switchView('robot');
    await window.LessonEngine.loadTopic(topicSlug, true);
  },

  saveTtsRate(val) {
    localStorage.setItem('robot_tts_rate', val);
  },

  async testHardwareAudio() {
    await window.NativeBridge.speak('Speaker check one two three. Robot 2027 is ready!', 'en', 1.0, 'hw_test');
  },

  async testHardwareMic() {
    alert('Đang chuyển sang màn hình Robot để kiểm tra Micro...');
    await window.AppRouter.switchView('robot');
    await window.LessonEngine.startPracticeTurn();
  },

  saveParentalSettings() {
    const studyOnly = document.getElementById('chkStudyOnly')?.checked ?? true;
    const starGoal = document.getElementById('inpStarGoal')?.value || '10';
    const rewardMins = document.getElementById('inpRewardMins')?.value || '10';
    const bedEnabled = document.getElementById('chkBedtime')?.checked ?? false;
    const newPin = (document.getElementById('inpNewParentPin')?.value || '').trim();

    window.RobotStorage.setStudyOnlyMode(studyOnly);
    localStorage.setItem('robot_star_goal', starGoal);
    localStorage.setItem('robot_reward_mins', rewardMins);
    localStorage.setItem('robot_bedtime_enabled', bedEnabled ? 'true' : 'false');
    if (newPin.length >= 4) {
      localStorage.setItem('robot_parent_pin', newPin);
    }

    this.refreshLockBadges();
    window.AppRouter.closeSettingsSub();
    alert('✅ Đã lưu cài đặt Phụ huynh!');
  },

  unlockTimedFromParent(mins) {
    window.PowerDevice.grantTimedMediaPass(mins * 60);
    window.AppRouter.closeSettingsSub();
    alert(`✅ Đã mở khóa YouTube & Game trong ${mins} phút!`);
  },

  selectLearnerProfile(id) {
    window.RobotStorage.setActiveProfileId(id);
    this.refreshHUD();
    window.AppRouter.closeSettingsSub();
  },

  saveRobotNameFromInput() {
    const val = document.getElementById('inpRobotName')?.value || 'Robo';
    window.RobotStorage.setRobotName(val);
    this.refreshHUD();
    alert(`✅ Đã đổi tên Robot thành "${val}"!`);
  },

  async saveServerBase() {
    const url = (document.getElementById('inpServerBase')?.value || '').trim();
    if (!url) return;
    localStorage.setItem('robot_server_base', url);
    window.AppRouter.closeSettingsSub();
    await window.ApiClient.syncAllTopics(true);
  },

  async verifyManufacturerKioskPin() {
    const pin = (document.getElementById('inpMfgPin')?.value || '').trim();
    if (pin === window.RobotConfig.MANUFACTURER_KIOSK_PIN) {
      await window.NativeBridge.setKioskLock(false);
      window.AppRouter.closeSettingsSub();
      alert('🔓 Đã tạm tắt khóa Kiosk! Bạn có thể vuốt thoát ra màn hình Android.');
    } else {
      alert('❌ Sai mã PIN 6 số của Nhà sản xuất!');
    }
  }
};

// KHỞI ĐỘNG TOÀN BỘ HỆ THỐNG ROBOT 2027 V1.3
window.addEventListener('DOMContentLoaded', async () => {
  await window.RobotStorage.init();
  window.NativeBridge.init();
  window.FaceEngine.init();
  window.VoiceAssistant.init();
  window.PowerDevice.init();
  window.AppRouter.init();

  window.AppUI.refreshHUD();

  // Nạp gói bài học khởi đầu ngay lập tức (0ms offline)
  await window.LessonEngine.loadTopic(window.RobotConfig.STARTER_PACK.topic, false);

  // Chạm vào khuôn mặt robot để ngắt lời (Barge-in) & luyện đọc ngay
  const faceBox = document.getElementById('robotFaceBox');
  if (faceBox) {
    faceBox.addEventListener('click', () => {
      window.FaceEngine.wakeUp('tap');
      window.LessonEngine.startPracticeTurn();
    });
  }

  // Đồng bộ ngầm 32 chủ đề từ Server & đẩy Sync Queue mỗi 30 giây
  if (navigator.onLine) {
    window.ApiClient.syncAllTopics(false);
    window.ApiClient.flushSyncQueue();
  }
  setInterval(() => {
    if (navigator.onLine) window.ApiClient.flushSyncQueue();
  }, 30000);
});
