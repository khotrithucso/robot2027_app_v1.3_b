/**
 * FACE_ENGINE.JS - Điều khiển đôi mắt OLED, biểu cảm, Karaoke & Chế độ Ngủ Giả
 */
window.FaceEngine = {
  blinkTimer: null,
  burnInTimer: null,
  sleepIdleTimer: null,
  isSleeping: false,
  currentExpr: 'IDLE',
  SLEEP_TIMEOUT_MS: 120000, // 2 phút không tương tác tự vào Ngủ Giả bảo vệ màn hình OLED

  init() {
    this.startNaturalBlink();
    this.startOledAntiBurnIn();
    this.resetSleepTimer();
  },

  startNaturalBlink() {
    if (this.blinkTimer) clearInterval(this.blinkTimer);
    this.blinkTimer = setInterval(() => {
      if (this.isSleeping) return;
      const eyes = document.querySelectorAll('.eye');
      eyes.forEach(el => el.classList.add('blinking'));
      setTimeout(() => {
        eyes.forEach(el => el.classList.remove('blinking'));
      }, 170);
    }, 3800);
  },

  // Dịch chuyển nhẹ tọa độ đôi mắt mỗi 25s chống lưu ảnh (Burn-in) trên màn hình OLED
  startOledAntiBurnIn() {
    if (this.burnInTimer) clearInterval(this.burnInTimer);
    this.burnInTimer = setInterval(() => {
      const row = document.getElementById('eyesRow');
      if (!row) return;
      const dx = Math.floor(Math.random() * 9) - 4;
      const dy = Math.floor(Math.random() * 7) - 3;
      row.style.transform = `translate(${dx}px, ${dy}px)`;
    }, 25000);
  },

  setExpression(expr, autoResetMs = 0) {
    this.currentExpr = expr;
    const box = document.getElementById('robotFaceBox');
    if (!box) return;
    box.className = `robot-face-box expr-${expr}`;

    // Đồng bộ cử chỉ với mạch ESP32 nếu có kết nối
    if (window.HardwareBridge) {
      if (expr === 'HAPPY') window.HardwareBridge.sendCommand('M:HAPPY');
      if (expr === 'DIZZY') window.HardwareBridge.sendCommand('M:STOP');
    }

    if (autoResetMs > 0) {
      setTimeout(() => {
        if (this.currentExpr === expr) this.setExpression('IDLE');
      }, autoResetMs);
    }
  },

  setMouthSpeaking(isSpeaking) {
    const mouth = document.getElementById('robotMouth');
    if (!mouth) return;
    if (isSpeaking) mouth.classList.add('speaking');
    else mouth.classList.remove('speaking');
  },

  setPartialText(text) {
    const el = document.getElementById('livePartialText');
    if (el) el.textContent = text;
  },

  updateVoiceWave(rmsDb) {
    const dot = document.querySelector('.wave-dot');
    if (!dot) return;
    const scale = Math.max(0.8, Math.min(2.1, 1 + (rmsDb + 2) / 10));
    dot.style.transform = `scale(${scale.toFixed(2)})`;
  },

  // Hiển thị câu tiếng Anh lên khung Karaoke nửa dưới (ẩn miệng khi học bài)
  renderKaraokeSentence(item, index, total, topicTitle) {
    const stage = document.getElementById('robotStage');
    if (stage) stage.classList.add('learning-active');

    const topicBadge = document.getElementById('currentTopicBadge');
    const counterBadge = document.getElementById('sentenceCounter');
    const scoreBadge = document.getElementById('pronounceScoreBadge');
    const wordsBox = document.getElementById('karaokeWordsBox');
    const viSub = document.getElementById('vietnameseSub');
    const spellBanner = document.getElementById('spellingBanner');
    const spokenFb = document.getElementById('userSpokenFeedback');
    const retryBox = document.getElementById('retryChoiceBox');

    if (topicBadge) topicBadge.textContent = `📖 ${topicTitle}`;
    if (counterBadge) counterBadge.textContent = `Câu ${index + 1} / ${total}`;
    if (scoreBadge) scoreBadge.classList.add('hidden');
    if (spellBanner) spellBanner.classList.add('hidden');
    if (spokenFb) spokenFb.classList.add('hidden');
    if (retryBox) retryBox.classList.add('hidden');

    if (wordsBox) {
      wordsBox.innerHTML = '';
      const words = (item.en || '').split(/\s+/).filter(Boolean);
      words.forEach((rawWord, idx) => {
        const span = document.createElement('span');
        span.className = 'k-word';
        span.dataset.idx = idx;
        span.textContent = rawWord;
        span.title = 'Chạm để nghe đánh vần từ này';
        span.onclick = (e) => {
          e.stopPropagation();
          this.resetSleepTimer();
          window.LessonEngine.spellSingleWord(rawWord, idx);
        };
        wordsBox.appendChild(span);
      });
    }

    // Tự ẩn dòng tiếng Việt nếu câu chưa có dịch nghĩa
    if (viSub) {
      if (item.vi && item.vi.trim() !== '') {
        viSub.textContent = item.vi;
        viSub.classList.remove('hidden');
      } else {
        viSub.textContent = '';
        viSub.classList.add('hidden');
      }
    }
  },

  highlightWordIndex(idx) {
    document.querySelectorAll('.k-word').forEach((el, i) => {
      if (i === idx) el.classList.add('active-read');
      else el.classList.remove('active-read');
    });
  },

  clearKaraokeHighlight() {
    document.querySelectorAll('.k-word').forEach(el => el.classList.remove('active-read'));
  },

  applyWordGrading(wordResults) {
    const nodes = document.querySelectorAll('.k-word');
    wordResults.forEach((res, i) => {
      if (!nodes[i]) return;
      nodes[i].classList.remove('word-correct', 'word-wrong', 'active-read');
      nodes[i].classList.add(res.matched ? 'word-correct' : 'word-wrong');
    });
  },

  resetSleepTimer() {
    if (this.sleepIdleTimer) clearTimeout(this.sleepIdleTimer);
    this.sleepIdleTimer = setTimeout(() => {
      this.enterSleepMode();
    }, this.SLEEP_TIMEOUT_MS);
  },

  enterSleepMode() {
    if (window.AppRouter && window.AppRouter.currentView !== 'robot') return;
    this.isSleeping = true;
    this.setExpression('SLEEP');
    const ov = document.getElementById('sleepOverlay');
    if (ov) ov.classList.remove('hidden');
    if (window.PowerDevice) window.PowerDevice.applyContextBrightness('sleep');
  },

  wakeUp(source = 'voice') {
    this.resetSleepTimer();
    if (!this.isSleeping) return;
    this.isSleeping = false;
    const ov = document.getElementById('sleepOverlay');
    if (ov) ov.classList.add('hidden');
    this.setExpression('HAPPY', 2000);
    if (window.PowerDevice) window.PowerDevice.applyContextBrightness('active');
    if (source !== 'silent') {
      window.NativeBridge.speak(`I am awake! Let's learn English!`, 'en', 1.0, 'wake');
    }
  }
};
