/**
 * MINI_GAMES.JS - Trò chơi tương tác ngay trên mặt Robot (Oẳn Tù Tì, Tìm Ngọc Dưới Cốc & Server Games)
 */
window.MiniGames = {
  currentGame: null,
  winningCup: 0,

  startRPS() {
    this.currentGame = 'rps';
    const iframe = document.getElementById('gameIframe');
    const arena = document.getElementById('gameArena');
    if (iframe) iframe.classList.add('hidden');
    if (!arena) return;
    arena.classList.remove('hidden');

    arena.innerHTML = `
      <h3 style="color:#00f0ff;margin:0;">✊✋✌️ Thi Đấu Oẳn Tù Tì Với Robot</h3>
      <p id="rpsStatus" style="color:#cbd5e1;margin:0;">Chọn Búa, Bao hoặc Kéo (hoặc bấm nút 1, 2, 3 trên thân Robot):</p>
      <div class="rps-choices">
        <button class="game-tile-btn" onclick="window.MiniGames.playRPS('rock')">✊<span>1. Búa (Rock)</span></button>
        <button class="game-tile-btn" onclick="window.MiniGames.playRPS('paper')">✋<span>2. Bao (Paper)</span></button>
        <button class="game-tile-btn" onclick="window.MiniGames.playRPS('scissors')">✌️<span>3. Kéo (Scissors)</span></button>
      </div>
    `;
  },

  async playRPS(userPick) {
    const choices = ['rock', 'paper', 'scissors'];
    const labels = { rock: '✊ Búa', paper: '✋ Bao', scissors: '✌️ Kéo' };
    const botPick = choices[Math.floor(Math.random() * 3)];

    let outcome = 'Hòa rồi!';
    if (
      (userPick === 'rock' && botPick === 'scissors') ||
      (userPick === 'paper' && botPick === 'rock') ||
      (userPick === 'scissors' && botPick === 'paper')
    ) {
      outcome = '🎉 Bạn thắng Robot rồi! (+1 Sao)';
      const p = window.RobotStorage.getActiveProfile();
      p.stars = (p.stars || 0) + 1;
      window.RobotStorage.saveActiveProfile(p);
      window.AppUI.refreshHUD();
      window.HardwareBridge.sendCommand('M:HAPPY');
    } else if (userPick !== botPick) {
      outcome = '🤖 Robot thắng lượt này nhé!';
    }

    const st = document.getElementById('rpsStatus');
    if (st) st.innerHTML = `Bạn chọn <b>${labels[userPick]}</b> — Robot ra <b>${labels[botPick]}</b> ➔ <b style="color:#00e676">${outcome}</b>`;
    await window.NativeBridge.speak(outcome, 'vi', 1.05, 'game_rps');
  },

  startShellGame() {
    this.currentGame = 'shell';
    this.winningCup = Math.floor(Math.random() * 3);
    const iframe = document.getElementById('gameIframe');
    const arena = document.getElementById('gameArena');
    if (iframe) iframe.classList.add('hidden');
    if (!arena) return;
    arena.classList.remove('hidden');

    arena.innerHTML = `
      <h3 style="color:#ffb800;margin:0;">🥤 Tìm Viên Ngọc Ẩn Dưới Cốc</h3>
      <p id="shellStatus" style="color:#cbd5e1;margin:0;">Robot đã giấu viên ngọc dưới 1 trong 3 chiếc cốc. Hãy đoán xem!</p>
      <div class="cups-row">
        <button class="game-tile-btn" onclick="window.MiniGames.pickCup(0)">🥤<span>Cốc số 1</span></button>
        <button class="game-tile-btn" onclick="window.MiniGames.pickCup(1)">🥤<span>Cốc số 2</span></button>
        <button class="game-tile-btn" onclick="window.MiniGames.pickCup(2)">🥤<span>Cốc số 3</span></button>
      </div>
    `;
  },

  async pickCup(idx) {
    const st = document.getElementById('shellStatus');
    if (idx === this.winningCup) {
      if (st) st.innerHTML = `💎 <b style="color:#00e676">Chính xác! Viên ngọc ở Cốc số ${idx + 1}! (+1 Sao)</b>`;
      const p = window.RobotStorage.getActiveProfile();
      p.stars = (p.stars || 0) + 1;
      window.RobotStorage.saveActiveProfile(p);
      window.AppUI.refreshHUD();
      await window.NativeBridge.speak('Tìm thấy viên ngọc rồi! Giỏi quá!', 'vi', 1.05, 'shell_win');
    } else {
      if (st) st.innerHTML = `💨 Tiếc quá! Viên ngọc nằm ở <b>Cốc số ${this.winningCup + 1}</b> cơ. Bấm chơi lại nhé!`;
      await window.NativeBridge.speak('Chưa trúng rồi, thử lại ván nữa nhé!', 'vi', 1.05, 'shell_lose');
    }
    this.winningCup = Math.floor(Math.random() * 3);
  },

  loadServerGames() {
    this.currentGame = 'iframe';
    const arena = document.getElementById('gameArena');
    const iframe = document.getElementById('gameIframe');
    if (arena) arena.classList.add('hidden');
    if (iframe) {
      iframe.classList.remove('hidden');
      const { games } = window.RobotConfig.getEndpoints();
      if (!iframe.src || iframe.src === 'about:blank') {
        iframe.src = `${games}?bot_id=${encodeURIComponent(window.RobotStorage.getBotId())}`;
      }
    }
  },

  handleHardwareButton(btnNum) {
    if (this.currentGame === 'rps') {
      if (btnNum === 1) this.playRPS('rock');
      if (btnNum === 2) this.playRPS('paper');
      if (btnNum === 3) this.playRPS('scissors');
    } else if (this.currentGame === 'shell') {
      if (btnNum >= 1 && btnNum <= 3) this.pickCup(btnNum - 1);
    }
  }
};
