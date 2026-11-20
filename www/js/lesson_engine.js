/**
 * LESSON_ENGINE.JS - Động cơ học Tiếng Anh 2 chiều, chống vọng âm 4 bước & chấm phát âm thông minh
 */
window.LessonEngine = {
  currentPack: window.RobotConfig.STARTER_PACK,
  orderIndices: [],
  cursor: 0,
  orderMode: 'sequential', // 'sequential' | 'random' | 'review'
  difficultyLevel: 'medium',
  attempts: 0,
  state: 'IDLE', // 'SPEAKING' | 'COOLDOWN' | 'LISTENING' | 'GRADING' | 'IDLE'
  lastRecognizedText: '',
  karaokeTimer: null,
  currentAudioEl: null,

  async loadTopic(topicSlug, autoStart = true) {
    const pack = await window.ApiClient.downloadTopicPack(topicSlug);
    if (!pack || !pack.items || pack.items.length === 0) return;

    this.currentPack = pack;
    this.buildOrderIndices();

    const profile = window.RobotStorage.getActiveProfile();
    if (this.orderMode === 'sequential' && profile.cursors && typeof profile.cursors[topicSlug] === 'number') {
      this.cursor = profile.cursors[topicSlug] % this.orderIndices.length;
    } else {
      this.cursor = 0;
    }

    this.attempts = 0;
    this.renderCurrentSentence();
    if (autoStart) {
      await this.playCurrentAudio(false);
    }
  },

  buildOrderIndices() {
    let items = this.currentPack.items || [];
    let indices = items.map((_, i) => i);

    if (this.orderMode === 'review') {
      const profile = window.RobotStorage.getActiveProfile();
      const hard = (profile.hardWords || []).filter(h => h.topic === this.currentPack.topic).map(h => h.id);
      if (hard.length > 0) indices = hard;
    } else if (this.orderMode === 'random') {
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
    }
    this.orderIndices = indices.length > 0 ? indices : [0];
  },

  setOrderMode(mode) {
    this.orderMode = mode;
    this.buildOrderIndices();
    this.cursor = 0;
    this.renderCurrentSentence();
  },

  setDifficultyLevel(level) {
    this.difficultyLevel = level;
  },

  getCurrentItem() {
    const realIdx = this.orderIndices[this.cursor] ?? 0;
    return this.currentPack.items[realIdx] || this.currentPack.items[0];
  },

  renderCurrentSentence() {
    const item = this.getCurrentItem();
    window.FaceEngine.renderKaraokeSentence(
      item,
      this.cursor,
      this.orderIndices.length,
      this.currentPack.title || this.currentPack.topic
    );
    this.updateSkipButtonState();
  },

  updateSkipButtonState() {
    const btn = document.getElementById('btnSkipSentence');
    if (!btn) return;
    if (this.attempts >= window.RobotConfig.MAX_ATTEMPTS_BEFORE_SKIP) {
      btn.classList.remove('locked');
    } else {
      btn.classList.add('locked');
    }
  },

  // =========================================================================
  // BƯỚC 1: PHÁT ÂM THANH CÂU MẪU + CHẠY CHỮ KARAOKE (KHÓA MIC CHỐNG VỌNG ÂM)
  // =========================================================================
  async playCurrentAudio(slowMode = false) {
    window.FaceEngine.resetSleepTimer();
    await this.interruptSpeech();

    this.state = 'SPEAKING';
    window.FaceEngine.setExpression('IDLE');
    window.FaceEngine.setMouthSpeaking(true);
    window.FaceEngine.setPartialText('🔊 Robot đang đọc mẫu... (Chạm màn hình để nói ngay)');

    const item = this.getCurrentItem();
    const baseRate = parseFloat(localStorage.getItem('robot_tts_rate') || '0.95');
    const rate = slowMode ? 0.72 : baseRate;

    this.startSimulatedKaraoke(item.en, rate);

    // Ưu tiên phát MP3 giọng bản xứ nếu có và không ở chế độ đọc chậm
    if (item.audio_url && !slowMode && navigator.onLine) {
      const playedMp3 = await this._tryPlayMp3(item.audio_url);
      if (playedMp3) {
        this._onSampleFinished();
        return;
      }
    }

    await window.NativeBridge.speak(item.en, 'en', rate, 'lesson_sample');
    // Trong trường hợp browser fallback đã resolve ngay sau onend
    if (!window.NativeBridge.isNative()) {
      this._onSampleFinished();
    }
  },

  _tryPlayMp3(url) {
    return new Promise((resolve) => {
      try {
        const audio = new Audio(url);
        this.currentAudioEl = audio;
        audio.onended = () => { this.currentAudioEl = null; resolve(true); };
        audio.onerror = () => { this.currentAudioEl = null; resolve(false); };
        audio.play().catch(() => resolve(false));
      } catch {
        resolve(false);
      }
    });
  },

  startSimulatedKaraoke(sentence, rate) {
    if (this.karaokeTimer) clearInterval(this.karaokeTimer);
    const words = (sentence || '').split(/\s+/).filter(Boolean);
    if (words.length === 0) return;

    const msPerWord = Math.max(240, Math.round(360 / Math.max(0.5, rate)));
    let idx = 0;
    window.FaceEngine.highlightWordIndex(0);

    this.karaokeTimer = setInterval(() => {
      idx++;
      if (idx < words.length) {
        window.FaceEngine.highlightWordIndex(idx);
      } else {
        clearInterval(this.karaokeTimer);
        window.FaceEngine.clearKaraokeHighlight();
      }
    }, msPerWord);
  },

  _onSampleFinished() {
    if (this.karaokeTimer) clearInterval(this.karaokeTimer);
    window.FaceEngine.clearKaraokeHighlight();
    window.FaceEngine.setMouthSpeaking(false);

    // BƯỚC 2: COOLDOWN 350ms trước khi mở Mic để tuyệt đối không tự nghe vọng âm
    this.state = 'COOLDOWN';
    setTimeout(() => {
      if (this.state === 'COOLDOWN' && window.AppRouter.currentView === 'robot') {
        this.startPracticeTurn();
      }
    }, 350);
  },

  // BƯỚC 3: MỞ MICRO LẮNG NGHE NGƯỜI HỌC ĐỌC
  async startPracticeTurn() {
    window.FaceEngine.resetSleepTimer();
    await this.interruptSpeech();
    this.state = 'LISTENING';
    window.FaceEngine.setExpression('LISTENING');
    window.FaceEngine.setPartialText('🎙️ Mời bạn đọc lại câu tiếng Anh...');
    await window.NativeBridge.startMic('en-US', false);
  },

  // Cơ chế Ngắt lời tức thì (Barge-in) khi chạm vào mặt Robot
  async interruptSpeech() {
    if (this.karaokeTimer) clearInterval(this.karaokeTimer);
    window.FaceEngine.clearKaraokeHighlight();
    window.FaceEngine.setMouthSpeaking(false);
    if (this.currentAudioEl) {
      try { this.currentAudioEl.pause(); } catch {}
      this.currentAudioEl = null;
    }
    await window.NativeBridge.stopSpeak();
  },

  // BƯỚC 4: CHẤM ĐIỂM PHÁT ÂM THÔNG MINH TỪNG TỪ
  async evaluateUserSpeech(spokenText, alternatives = []) {
    if (!spokenText) return;
    this.state = 'GRADING';
    this.lastRecognizedText = spokenText;

    const fb = document.getElementById('userSpokenFeedback');
    if (fb) {
      fb.textContent = `🗣️ Bạn vừa đọc: "${spokenText}"`;
      fb.classList.remove('hidden');
    }

    const item = this.getCurrentItem();
    const candidates = [spokenText, ...(alternatives || [])];
    let bestEval = null;

    for (const cand of candidates) {
      const ev = this._scoreSentence(item.en, cand);
      if (!bestEval || ev.score > bestEval.score) {
        bestEval = ev;
      }
    }

    window.FaceEngine.applyWordGrading(bestEval.wordResults);

    const scoreBadge = document.getElementById('pronounceScoreBadge');
    if (scoreBadge) {
      scoreBadge.textContent = `Điểm: ${bestEval.score}%`;
      scoreBadge.classList.remove('hidden');
    }

    const threshold = this.difficultyLevel === 'easy' ? 68 : (this.difficultyLevel === 'hard' ? 86 : window.RobotConfig.PASS_SCORE_THRESHOLD);

    if (bestEval.score >= threshold) {
      await this._handlePassedSentence(item, bestEval.score);
    } else {
      await this._handleFailedAttempt(item, bestEval.score);
    }
  },

  async _handlePassedSentence(item, score) {
    this.attempts = 0;
    window.FaceEngine.setExpression('HAPPY', 2600);
    window.NativeBridge.vibrate(50);

    // Cập nhật điểm sao & tiến độ của người học
    const profile = window.RobotStorage.getActiveProfile();
    profile.stars = (profile.stars || 0) + 1;
    if (!profile.learned[this.currentPack.topic]) profile.learned[this.currentPack.topic] = [];
    if (!profile.learned[this.currentPack.topic].includes(item.id)) {
      profile.learned[this.currentPack.topic].push(item.id);
    }
    profile.cursors[this.currentPack.topic] = (this.cursor + 1) % this.orderIndices.length;
    window.RobotStorage.saveActiveProfile(profile);
    window.AppUI.refreshHUD();

    // Kiểm tra thưởng giờ giải trí nếu bật chế độ Tích Sao Mở Khóa
    if (window.PowerDevice) {
      window.PowerDevice.checkStarRewardUnlock(profile.stars);
    }

    window.RobotStorage.enqueueSync({
      type: 'lesson_pass',
      profile_id: profile.id,
      topic: this.currentPack.topic,
      sentence_id: item.id,
      score
    });

    await window.NativeBridge.speak('Awesome job!', 'en', 1.05, 'praise');
    if (item.vi && item.vi.trim() !== '') {
      await new Promise(r => setTimeout(r, 400));
      await window.NativeBridge.speak(item.vi, 'vi', 1.0, 'explain_vi');
    }

    setTimeout(() => {
      this.cursor = (this.cursor + 1) % this.orderIndices.length;
      this.renderCurrentSentence();
      this.playCurrentAudio(false);
    }, 1400);
  },

  async _handleFailedAttempt(item, score) {
    this.attempts++;
    this.updateSkipButtonState();

    // Lưu từ sai vào danh sách cần ôn tập
    const profile = window.RobotStorage.getActiveProfile();
    const exists = (profile.hardWords || []).some(h => h.topic === this.currentPack.topic && h.id === item.id);
    if (!exists) {
      profile.hardWords = profile.hardWords || [];
      profile.hardWords.push({ topic: this.currentPack.topic, id: item.id, en: item.en });
      window.RobotStorage.saveActiveProfile(profile);
    }

    if (this.attempts > window.RobotConfig.MAX_ATTEMPTS_BEFORE_SKIP) {
      // Sau >3 lần chưa đạt: dừng chấm điểm, mở hộp thoại hỏi 2 phương án
      window.FaceEngine.setExpression('RETRY');
      const retryBox = document.getElementById('retryChoiceBox');
      if (retryBox) retryBox.classList.remove('hidden');

      await window.NativeBridge.speak(
        'Câu này hơi khó một chút! Bạn muốn học lại câu này từ đầu hay chuyển sang câu khác? Bạn chọn phương án nào?',
        'vi',
        1.0,
        'retry_ask'
      );
      setTimeout(() => {
        window.NativeBridge.startMic('en-US', false);
      }, 450);
    } else {
      window.FaceEngine.setExpression('RETRY', 2000);
      await window.NativeBridge.speak('Almost there! Listen and try again.', 'en', 0.95, 'try_again');
      setTimeout(() => this.playCurrentAudio(false), 1100);
    }
  },

  async restartCurrentSentence() {
    this.attempts = 0;
    const retryBox = document.getElementById('retryChoiceBox');
    if (retryBox) retryBox.classList.add('hidden');
    this.renderCurrentSentence();
    await this.playCurrentAudio(true); // Đọc chậm 0.72x giúp bé nghe rõ từng từ
  },

  skipToNextSentence() {
    this.attempts = 0;
    this.cursor = (this.cursor + 1) % this.orderIndices.length;
    this.renderCurrentSentence();
    this.playCurrentAudio(false);
  },

  trySkipSentence() {
    if (this.attempts < window.RobotConfig.MAX_ATTEMPTS_BEFORE_SKIP) {
      window.FaceEngine.setPartialText(`🔒 Hãy thử đọc thêm ${window.RobotConfig.MAX_ATTEMPTS_BEFORE_SKIP - this.attempts} lần nữa để mở nút Bỏ qua nhé!`);
      return;
    }
    this.skipToNextSentence();
  },

  async spellSingleWord(rawWord, wordIdx = -1) {
    await this.interruptSpeech();
    const clean = rawWord.replace(/[^a-zA-Z0-9']/g, '');
    if (!clean) return;

    if (wordIdx >= 0) window.FaceEngine.highlightWordIndex(wordIdx);
    const info = await window.ApiClient.lookupWordSpelling(clean);
    const banner = document.getElementById('spellingBanner');
    if (banner) {
      banner.textContent = `🔤 ${clean.toUpperCase()}  ➔  ${info.spell}`;
      banner.classList.remove('hidden');
    }

    const lettersSpoken = info.spell.split('-').join(', ');
    await window.NativeBridge.speak(`${clean}. ${lettersSpoken}. ${clean}!`, 'en', 0.85, 'spell_word');
  },

  async spellWholeSentence() {
    const item = this.getCurrentItem();
    const words = (item.en || '').split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      await this.spellSingleWord(words[i], i);
      await new Promise(r => setTimeout(r, 650));
    }
    window.FaceEngine.clearKaraokeHighlight();
  },

  async replayLastRecognized() {
    if (!this.lastRecognizedText) {
      window.FaceEngine.setPartialText('Chưa có bản thu giọng nói nào trong câu này.');
      return;
    }
    await window.NativeBridge.speak(this.lastRecognizedText, 'en', 0.9, 'replay_user');
  },

  // Chuẩn hóa chuỗi (tách viết tắt, quy đổi số 0-10 sang chữ) để chấm phát âm công bằng
  _normalizeText(str) {
    let s = (str || '').toLowerCase().replace(/[’‘]/g, "'");
    const contractions = {
      "i'm": "i am", "you're": "you are", "he's": "he is", "she's": "she is",
      "it's": "it is", "we're": "we are", "they're": "they are", "don't": "do not",
      "can't": "cannot", "won't": "will not", "let's": "let us"
    };
    const numMap = {
      "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
      "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten"
    };
    s = s.replace(/[^a-z0-9'\s]/g, ' ');
    return s.split(/\s+/).filter(Boolean).map(w => {
      if (contractions[w]) return contractions[w];
      if (numMap[w]) return numMap[w];
      return w.replace(/'/g, '');
    }).join(' ').split(/\s+/).filter(Boolean);
  },

  _scoreSentence(targetEn, spokenEn) {
    const targetWords = this._normalizeText(targetEn);
    const spokenWords = this._normalizeText(spokenEn);
    const rawTarget = (targetEn || '').split(/\s+/).filter(Boolean);

    let matchedCount = 0;
    const wordResults = rawTarget.map((raw, idx) => {
      const norm = this._normalizeText(raw)[0] || '';
      const found = spokenWords.some(sw => this._wordSimilarity(norm, sw) >= 0.78);
      if (found) matchedCount++;
      return { word: raw, matched: found };
    });

    const total = Math.max(1, rawTarget.length);
    const score = Math.round((matchedCount / total) * 100);
    return { score, wordResults };
  },

  _wordSimilarity(a, b) {
    if (a === b) return 1.0;
    if (!a || !b) return 0.0;
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return 1.0 - dp[a.length][b.length] / Math.max(a.length, b.length);
  }
};
