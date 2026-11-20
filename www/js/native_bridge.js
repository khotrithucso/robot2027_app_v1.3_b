/**
 * NATIVE_BRIDGE.JS - Cầu nối thống nhất giữa Web App và tầng Native Android (RobotNativePlugin)
 * Tự động dự phòng sang Web Speech / Browser API nếu mở test trên trình duyệt PC.
 */
window.NativeBridge = {
  plugin: null,

  init() {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.RobotNative) {
      this.plugin = window.Capacitor.Plugins.RobotNative;
    }
  },

  isNative() {
    return !!this.plugin;
  },

  addListener(eventName, cb) {
    if (this.plugin && this.plugin.addListener) {
      return this.plugin.addListener(eventName, cb);
    }
    return null;
  },

  async startMic(lang = 'en-US', continuous = false) {
    if (this.plugin) {
      return this.plugin.startMic({ lang, continuous });
    }
    this._startWebSpeechFallback(lang, continuous);
  },

  async resetAndStartMic(lang = 'en-US', continuous = false) {
    if (this.plugin) {
      return this.plugin.resetAndStartMic({ lang, continuous });
    }
    this._startWebSpeechFallback(lang, continuous);
  },

  async stopMic() {
    if (this.plugin) {
      return this.plugin.stopMic();
    }
    if (this._webRec) {
      try { this._webRec.stop(); } catch {}
    }
  },

  async speak(text, lang = 'en', rate = 0.95, id = 'utt') {
    if (this.plugin) {
      const res = await this.plugin.speak({ text, lang, rate, id });
      if (res && res.nativeTts) return true;
    }
    // Dự phòng Web SpeechSynthesis
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) return resolve(false);
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'vi' ? 'vi-VN' : 'en-US';
      u.rate = rate;
      u.onstart = () => window.dispatchEvent(new CustomEvent('web_tts_event', { detail: { event: 'START', lang, id } }));
      u.onend = () => {
        window.dispatchEvent(new CustomEvent('web_tts_event', { detail: { event: 'DONE', lang, id } }));
        resolve(true);
      };
      u.onerror = () => resolve(false);
      window.speechSynthesis.speak(u);
    });
  },

  async stopSpeak() {
    if (this.plugin) {
      return this.plugin.stopSpeak();
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  },

  async setBrightness(level) {
    if (this.plugin) return this.plugin.setBrightness({ level });
  },

  async setVolume(percent) {
    if (this.plugin) return this.plugin.setVolume({ percent });
  },

  async getDeviceStats() {
    if (this.plugin) return this.plugin.getDeviceStats();
    return {
      batteryPercent: 85,
      isCharging: false,
      temperatureC: 33.5,
      volumePercent: 80,
      wifiSsid: 'Web-Preview',
      kioskEnabled: false
    };
  },

  async openWifiPanel() {
    if (this.plugin) return this.plugin.openWifiPanel();
    alert('Trên điện thoại Android, nút này sẽ mở bảng chọn Wi-Fi ngay trong App.');
  },

  async openBluetoothSettings() {
    if (this.plugin) return this.plugin.openBluetoothSettings();
    alert('Trên điện thoại Android, nút này sẽ mở bảng kết nối Bluetooth ESP32.');
  },

  async setKioskLock(enabled) {
    if (this.plugin) return this.plugin.setKioskLock({ enabled });
  },

  async vibrate(ms = 40) {
    if (this.plugin) return this.plugin.vibrate({ ms });
    if (navigator.vibrate) navigator.vibrate(ms);
  },

  _startWebSpeechFallback(lang, continuous) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (this._webRec) { try { this._webRec.abort(); } catch {} }
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = continuous;
    rec.onresult = (e) => {
      const res = e.results[e.results.length - 1];
      const txt = res[0].transcript;
      if (res.isFinal) {
        window.dispatchEvent(new CustomEvent('web_speech_result', { detail: { best: txt, alternatives: [txt] } }));
      } else {
        window.dispatchEvent(new CustomEvent('web_speech_partial', { detail: { text: txt } }));
      }
    };
    this._webRec = rec;
    try { rec.start(); } catch {}
  }
};
