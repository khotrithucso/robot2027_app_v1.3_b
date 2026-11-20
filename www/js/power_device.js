/**
 * POWER_DEVICE.JS - Quản lý Pin 50%-90%, Nhiệt độ, Chế độ Sinh tồn, Tích Sao & WebRTC Camera P2P
 */
window.PowerDevice = {
  isSurvivalMode: false,
  rewardRemainingSec: 0,
  rewardInterval: null,
  pollTimer: null,
  webrtcPc: null,
  webrtcStream: null,
  webrtcPollTimer: null,

  init() {
    this.pollDeviceStats();
    this.pollTimer = setInterval(() => this.pollDeviceStats(), 15000);
    this.startWebRtcSignalingPoll();
  },

  async pollDeviceStats() {
    const stats = await window.NativeBridge.getDeviceStats();
    const pct = stats.batteryPercent ?? 85;
    const temp = stats.temperatureC ?? 33;
    const charging = stats.isCharging ? '⚡' : '🔋';

    const hudBat = document.getElementById('hudBattery');
    if (hudBat) hudBat.textContent = `${charging} ${pct}% • ${temp.toFixed(1)}°C`;

    const infoEl = document.getElementById('settingsDeviceInfo');
    if (infoEl) {
      infoEl.textContent = `Bot ID: ${window.RobotStorage.getBotId()} | Wi-Fi: ${stats.wifiSsid || 'Offline'} | Nhiệt độ: ${temp.toFixed(1)}°C`;
    }

    // Chu kỳ bảo vệ pin 50% - 90% qua mạch sạc ESP32
    if (pct <= window.RobotConfig.BATTERY_SURVIVAL_MIN && !stats.isCharging) {
      window.HardwareBridge.sendCommand('CHG:ON');
      if (!this.isSurvivalMode) {
        this.activateSurvivalMode(pct, temp);
      }
    } else if (pct >= window.RobotConfig.BATTERY_CHARGE_STOP && stats.isCharging) {
      window.HardwareBridge.sendCommand('CHG:OFF');
    }

    if (this.isSurvivalMode && stats.isCharging && pct > 52) {
      this.isSurvivalMode = false;
      this.applyContextBrightness('active');
    }

    // Cảnh báo nhiệt độ cao > 42°C
    if (temp > 42.0) {
      this.applyContextBrightness('night');
    }
  },

  activateSurvivalMode(pct, temp) {
    this.isSurvivalMode = true;
    this.applyContextBrightness('survival');
    window.RobotStorage.enqueueSync({
      type: 'SURVIVAL_MODE_50',
      battery: pct,
      temperature: temp
    });
    window.ApiClient.flushSyncQueue();
    window.FaceEngine.setPartialText('🪫 Pin dưới 50% - Đã bật Chế độ Sinh tồn tiết kiệm năng lượng!');
  },

  applyContextBrightness(context) {
    let level = 0.70;
    if (context === 'night') level = 0.30;
    if (context === 'sleep') level = 0.01;
    if (context === 'survival') level = 0.01;

    const hour = new Date().getHours();
    if (context === 'active' && (hour >= 20 || hour < 6)) {
      level = 0.30;
    }
    window.NativeBridge.setBrightness(level);
  },

  setManualBrightness(percent) {
    const val = parseInt(percent, 10);
    const lbl = document.getElementById('valBrightness');
    if (lbl) lbl.textContent = `${val}%`;
    window.NativeBridge.setBrightness(val / 100.0);
  },

  setManualVolume(percent) {
    const val = parseInt(percent, 10);
    const lbl = document.getElementById('valVolume');
    if (lbl) lbl.textContent = `${val}%`;
    window.NativeBridge.setVolume(val);
  },

  toggleFakeSleep() {
    window.AppRouter.switchView('robot');
    window.FaceEngine.enterSleepMode();
  },

  // =========================================================================
  // CƠ CHẾ TÍCH SAO MỞ KHÓA GIẢI TRÍ (GAMIFICATION)
  // =========================================================================
  checkStarRewardUnlock(totalStars) {
    const starGoal = parseInt(localStorage.getItem('robot_star_goal') || '0', 10);
    if (starGoal <= 0) return;
    if (totalStars > 0 && totalStars % starGoal === 0) {
      const rewardMins = parseInt(localStorage.getItem('robot_reward_mins') || '10', 10);
      this.grantTimedMediaPass(rewardMins * 60);
    }
  },

  grantTimedMediaPass(seconds) {
    window.RobotStorage.setStudyOnlyMode(false);
    window.AppUI.refreshLockBadges();
    this.rewardRemainingSec = seconds;

    const timerBadge = document.getElementById('hudRewardTimer');
    if (timerBadge) timerBadge.classList.remove('hidden');

    if (this.rewardInterval) clearInterval(this.rewardInterval);
    this.rewardInterval = setInterval(() => {
      this.rewardRemainingSec--;
      if (timerBadge) {
        const m = Math.floor(this.rewardRemainingSec / 60);
        const s = String(this.rewardRemainingSec % 60).padStart(2, '0');
        timerBadge.textContent = `⏳ ${m}:${s}`;
      }
      if (this.rewardRemainingSec <= 0) {
        clearInterval(this.rewardInterval);
        if (timerBadge) timerBadge.classList.add('hidden');
        window.RobotStorage.setStudyOnlyMode(true);
        window.AppUI.refreshLockBadges();
        window.AppRouter.switchView('robot');
        window.NativeBridge.speak('Hết giờ giải trí rồi, mình quay lại học tiếng Anh nhé!', 'vi', 1.0, 'time_up');
      }
    }, 1000);
  },

  // =========================================================================
  // CAMERA TRƯỚC WEBRTC P2P ON-DEMAND (TẮT 100% KHI KHÔNG CÓ NGƯỜI GỌI)
  // =========================================================================
  startWebRtcSignalingPoll() {
    if (this.webrtcPollTimer) clearInterval(this.webrtcPollTimer);
    this.webrtcPollTimer = setInterval(async () => {
      if (this.isSurvivalMode || !navigator.onLine) return;
      const { apiUser } = window.RobotConfig.getEndpoints();
      const botId = window.RobotStorage.getBotId();
      try {
        const res = await fetch(`${apiUser}?action=webrtc_poll&bot_id=${encodeURIComponent(botId)}`, { cache: 'no-store' });
        const data = await res.json();
        if (data && data.status === 'offer' && data.sdp && !this.webrtcPc) {
          await this.answerParentCameraCall(data.sdp);
        } else if (data && data.status === 'hangup' && this.webrtcPc) {
          this.stopWebRtcCamera();
        }
      } catch {}
    }, 5000);
  },

  async answerParentCameraCall(remoteOfferSdp) {
    try {
      this.webrtcStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 360 },
        audio: true
      });
      this.webrtcPc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      this.webrtcStream.getTracks().forEach(t => this.webrtcPc.addTrack(t, this.webrtcStream));

      this.webrtcPc.onconnectionstatechange = () => {
        if (this.webrtcPc && ['disconnected', 'failed', 'closed'].includes(this.webrtcPc.connectionState)) {
          this.stopWebRtcCamera();
        }
      };

      await this.webrtcPc.setRemoteDescription(new RTCSessionDescription(remoteOfferSdp));
      const answer = await this.webrtcPc.createAnswer();
      await this.webrtcPc.setLocalDescription(answer);

      // Chờ ICE gathering hoàn tất
      await new Promise(resolve => setTimeout(resolve, 1200));

      const { apiUser } = window.RobotConfig.getEndpoints();
      await fetch(apiUser, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'webrtc_answer',
          bot_id: window.RobotStorage.getBotId(),
          sdp: this.webrtcPc.localDescription
        })
      });
    } catch {
      this.stopWebRtcCamera();
    }
  },

  stopWebRtcCamera() {
    if (this.webrtcStream) {
      this.webrtcStream.getTracks().forEach(t => t.stop());
      this.webrtcStream = null;
    }
    if (this.webrtcPc) {
      try { this.webrtcPc.close(); } catch {}
      this.webrtcPc = null;
    }
  }
};
