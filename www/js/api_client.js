/**
 * API_CLIENT.JS - Đồng bộ 32 chủ đề từ api.php & đẩy log/WebRTC qua api_user.php
 */
window.ApiClient = {
  topicsCatalog: [],

  async fetchTopicsCatalog() {
    const { api } = window.RobotConfig.getEndpoints();
    try {
      const res = await fetch(`${api}?action=topics`, { cache: 'no-store' });
      const data = await res.json();
      if (data && data.status === 'ok' && Array.isArray(data.topics)) {
        this.topicsCatalog = data.topics;
        localStorage.setItem('robot_topics_catalog', JSON.stringify(data.topics));
        return data.topics;
      }
    } catch {}

    // Offline fallback từ danh sách đã lưu
    const saved = JSON.parse(localStorage.getItem('robot_topics_catalog') || '[]');
    if (saved.length > 0) {
      this.topicsCatalog = saved;
      return saved;
    }
    this.topicsCatalog = [{
      topic: window.RobotConfig.STARTER_PACK.topic,
      title: window.RobotConfig.STARTER_PACK.title,
      count: window.RobotConfig.STARTER_PACK.items.length,
      version_hash: window.RobotConfig.STARTER_PACK.version_hash
    }];
    return this.topicsCatalog;
  },

  async downloadTopicPack(topicSlug) {
    const { api } = window.RobotConfig.getEndpoints();
    const cached = await window.RobotStorage.getTopicPack(topicSlug);
    try {
      const res = await fetch(`${api}?action=download&topic=${encodeURIComponent(topicSlug)}`, { cache: 'no-store' });
      const data = await res.json();
      if (data && data.status === 'ok' && Array.isArray(data.items) && data.items.length > 0) {
        await window.RobotStorage.saveTopicPack(data);
        return data;
      }
    } catch {}
    return cached;
  },

  async syncAllTopics(showToast = false) {
    const list = await this.fetchTopicsCatalog();
    let updatedCount = 0;
    for (const meta of list.slice(0, 32)) {
      const localPack = await window.RobotStorage.getTopicPack(meta.topic);
      if (!localPack || localPack.version_hash !== meta.version_hash) {
        const fresh = await this.downloadTopicPack(meta.topic);
        if (fresh) updatedCount++;
      }
    }
    if (window.AppUI) window.AppUI.renderTopicsGrid();
    if (showToast && window.FaceEngine) {
      window.FaceEngine.setPartialText(`✅ Đã đồng bộ xong ${list.length} chủ đề (cập nhật mới ${updatedCount} gói)!`);
    }
  },

  async lookupWordSpelling(word) {
    const { api } = window.RobotConfig.getEndpoints();
    try {
      const res = await fetch(`${api}?action=word&w=${encodeURIComponent(word)}`);
      const data = await res.json();
      if (data && data.status === 'ok' && data.spell) return data;
    } catch {}
    const clean = word.replace(/[^a-zA-Z0-9']/g, '').toUpperCase();
    return { word: clean, spell: clean.split('').join('-') };
  },

  // Đẩy hàng đợi tiến độ học tập & cảnh báo pin lên api_user.php
  async flushSyncQueue() {
    if (window.PowerDevice && window.PowerDevice.isSurvivalMode) return; // Đóng băng khi pin <= 50%
    const queue = window.RobotStorage.getSyncQueue();
    if (queue.length === 0) return;

    const { apiUser } = window.RobotConfig.getEndpoints();
    try {
      const res = await fetch(apiUser, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batch_sync',
          bot_id: window.RobotStorage.getBotId(),
          events: queue
        })
      });
      const data = await res.json();
      if (data && data.status === 'ok') {
        window.RobotStorage.clearSyncQueue(queue.length);
      }
    } catch {}
  }
};
