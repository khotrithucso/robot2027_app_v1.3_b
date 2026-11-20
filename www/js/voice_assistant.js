/**
 * VOICE_ASSISTANT.JS - Đánh thức 3 chiều & Bộ định tuyến lệnh Việt-Anh tức thì (onPartialResults)
 */
window.VoiceAssistant = {
  lastCommandTs: 0,

  init() {
    // Sự kiện từ Native Android Plugin
    window.NativeBridge.addListener('speechPartial', (data) => {
      if (data && data.text) this.onPartialHeard(data.text);
    });
    window.NativeBridge.addListener('speechResult', (data) => {
      if (data) this.onFinalHeard(data.best || '', data.alternatives || []);
    });
    window.NativeBridge.addListener('speechRms', (data) => {
      if (data && typeof data.rms === 'number') {
        window.FaceEngine.updateVoiceWave(data.rms);
        // Bắt tiếng vỗ tay / gọi lớn đánh thức khi đang Ngủ Giả
        if (window.FaceEngine.isSleeping && data.rms > 8.5) {
          window.FaceEngine.wakeUp('sound');
        }
      }
    });
    window.NativeBridge.addListener('ttsEvent', (data) => {
      if (data && data.event === 'DONE' && data.id === 'lesson_sample') {
        window.LessonEngine._onSampleFinished();
      }
    });
    window.NativeBridge.addListener('deviceTilt', (data) => {
      window.FaceEngine.wakeUp('sensor');
      window.FaceEngine.setExpression('DIZZY', 3000);
      window.NativeBridge.speak('Whoa! Careful, please hold me steady!', 'en', 1.05, 'tilt');
    });

    // Dự phòng trên trình duyệt Web
    window.addEventListener('web_speech_partial', (e) => this.onPartialHeard(e.detail.text));
    window.addEventListener('web_speech_result', (e) => this.onFinalHeard(e.detail.best, e.detail.alternatives));
  },

  onPartialHeard(text) {
    window.FaceEngine.resetSleepTimer();
    window.FaceEngine.setPartialText(`🎙️ "${text}..."`);

    // Bắt lệnh điều hướng ngay lúc đang nói dở (không đợi ngắt câu)
    const routed = this.routeNavigationCommand(text);
    if (routed) {
      window.NativeBridge.stopMic();
    }
  },

  async onFinalHeard(bestText, alternatives) {
    const clean = (bestText || '').trim();
    if (!clean) return;

    window.FaceEngine.resetSleepTimer();

    // 1. Kiểm tra đánh thức 3 trường hợp: "Hello [Tên]", "Hello", "[Tên]"
    if (window.FaceEngine.isSleeping) {
      if (this.matchesWakeWord(clean)) {
        window.FaceEngine.wakeUp('voice');
      }
      return;
    }

    // 2. Kiểm tra lệnh đổi tên Robot ("Đặt tên bạn là Lucky" / "Your name is Lucky")
    const renameMatch = clean.match(/(?:your name is|call you|đặt tên bạn là|tên bạn là)\s+([a-zA-Z0-9À-ỹ]+)/i);
    if (renameMatch && renameMatch[1]) {
      const newName = renameMatch[1].trim();
      window.RobotStorage.setRobotName(newName);
      window.AppUI.refreshHUD();
      window.FaceEngine.setExpression('HAPPY', 2500);
      await window.NativeBridge.speak(`Yay! My name is ${newName} now!`, 'en', 1.0, 'rename');
      return;
    }

    // 3. Kiểm tra lệnh điều hướng tab / bài học
    if (this.routeNavigationCommand(clean)) return;

    // 4. Nếu đang ở màn hình Robot, chuyển sang chấm điểm phát âm câu học hiện tại
    if (window.AppRouter.currentView === 'robot') {
      await window.LessonEngine.evaluateUserSpeech(clean, alternatives);
    }
  },

  matchesWakeWord(text) {
    const low = text.toLowerCase();
    const botName = window.RobotStorage.getRobotName().toLowerCase();
    return (
      low.includes(`hello ${botName}`) ||
      low.includes(`hey ${botName}`) ||
      low.includes('hello') ||
      low.includes('hey robo') ||
      low.includes(botName)
    );
  },

  // Bộ bắt lệnh đa âm tiết Việt - Anh (chống trượt khi mic đang ở mode en-US)
  routeNavigationCommand(rawText) {
    const now = Date.now();
    if (now - this.lastCommandTs < 1200) return false;

    const low = (rawText || '').toLowerCase();

    const ytTriggers = ['youtube', 'you tube', 'same youtube', 'sam youtube', 'send youtube', 'see youtube', 'xem youtube', 'mo youtube'];
    const gameTriggers = ['play game', 'joy game', 'toy game', 'choi game', 'mo game', 'games'];
    const studyTriggers = ['learn english', 'hoc tieng anh', 'hop ting', 'hot thing', 've robot', 'quay lai'];

    if (ytTriggers.some(k => low.includes(k))) {
      this.lastCommandTs = now;
      window.AppRouter.switchView('youtube');
      return true;
    }
    if (gameTriggers.some(k => low.includes(k))) {
      this.lastCommandTs = now;
      window.AppRouter.switchView('game');
      return true;
    }
    if (studyTriggers.some(k => low.includes(k))) {
      this.lastCommandTs = now;
      window.AppRouter.switchView('robot');
      return true;
    }

    // Lệnh trong lúc học bài
    if (low.includes('học lại') || low.includes('hoc lai') || low.includes('try again') || low.includes('repeat')) {
      this.lastCommandTs = now;
      window.LessonEngine.restartCurrentSentence();
      return true;
    }
    if (low.includes('câu khác') || low.includes('cau khac') || low.includes('bỏ qua') || low.includes('bo qua') || low.includes('next sentence') || low.includes('skip')) {
      this.lastCommandTs = now;
      window.LessonEngine.skipToNextSentence();
      return true;
    }
    if (low.includes('đánh vần') || low.includes('danh van') || low.includes('spell')) {
      this.lastCommandTs = now;
      window.LessonEngine.spellWholeSentence();
      return true;
    }

    return false;
  }
};
