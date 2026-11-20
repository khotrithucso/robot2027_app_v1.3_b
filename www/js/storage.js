/**
 * STORAGE.JS - Quản lý lưu trữ Offline 2 tầng (IndexedDB + LocalStorage + Sync Queue)
 */
window.RobotStorage = {
  db: null,
  DB_NAME: 'Robot2027_OfflineDB',
  DB_VERSION: 1,

  async init() {
    this.ensureDefaults();
    return new Promise((resolve) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('topics_data')) {
          db.createObjectStore('topics_data', { keyPath: 'topic' });
        }
        if (!db.objectStoreNames.contains('audio_cache')) {
          db.createObjectStore('audio_cache', { keyPath: 'url' });
        }
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(true);
      };
      req.onerror = () => resolve(false);
    });
  },

  ensureDefaults() {
    if (!localStorage.getItem('robot_bot_id')) {
      const randId = 'BOT_' + Math.random().toString(36).substring(2, 8).toUpperCase();
      localStorage.setItem('robot_bot_id', randId);
    }
    if (!localStorage.getItem('robot_name')) {
      localStorage.setItem('robot_name', 'Robo');
    }
    if (!localStorage.getItem('robot_parent_pin')) {
      localStorage.setItem('robot_parent_pin', window.RobotConfig.DEFAULT_PARENT_PIN);
    }
    if (localStorage.getItem('robot_study_only') === null) {
      localStorage.setItem('robot_study_only', 'true'); // Mặc định BẬT Chế độ Chỉ Học Tập
    }
    if (!localStorage.getItem('robot_profiles')) {
      const initialProfiles = [
        { id: 'p1', name: 'Bé Bi', age: 6, stars: 0, streak: 1, learned: {}, cursors: {}, hardWords: [] },
        { id: 'p2', name: 'Bé Bông', age: 8, stars: 0, streak: 1, learned: {}, cursors: {}, hardWords: [] },
        { id: 'p3', name: 'Người Lớn', age: 30, stars: 0, streak: 1, learned: {}, cursors: {}, hardWords: [] }
      ];
      localStorage.setItem('robot_profiles', JSON.stringify(initialProfiles));
      localStorage.setItem('robot_active_profile', 'p1');
    }
  },

  getBotId() { return localStorage.getItem('robot_bot_id') || 'BOT_DEFAULT'; },
  getRobotName() { return localStorage.getItem('robot_name') || 'Robo'; },
  setRobotName(name) {
    const clean = (name || 'Robo').trim();
    localStorage.setItem('robot_name', clean);
    this.enqueueSync({ type: 'settings', robot_name: clean, updated_at: Date.now() });
  },

  isStudyOnlyMode() { return localStorage.getItem('robot_study_only') !== 'false'; },
  setStudyOnlyMode(val) { localStorage.setItem('robot_study_only', val ? 'true' : 'false'); },

  getProfiles() {
    try { return JSON.parse(localStorage.getItem('robot_profiles')) || []; }
    catch { return []; }
  },

  getActiveProfile() {
    const list = this.getProfiles();
    const activeId = localStorage.getItem('robot_active_profile') || 'p1';
    return list.find(p => p.id === activeId) || list[0];
  },

  saveActiveProfile(updated) {
    const list = this.getProfiles();
    const idx = list.findIndex(p => p.id === updated.id);
    if (idx >= 0) list[idx] = updated;
    else list.push(updated);
    localStorage.setItem('robot_profiles', JSON.stringify(list));
  },

  setActiveProfileId(id) {
    localStorage.setItem('robot_active_profile', id);
  },

  // Lưu & đọc gói chủ đề từ IndexedDB
  async saveTopicPack(pack) {
    if (!this.db) return;
    return new Promise((resolve) => {
      const tx = this.db.transaction('topics_data', 'readwrite');
      tx.objectStore('topics_data').put(pack);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  },

  async getTopicPack(topic) {
    if (!this.db) {
      return topic === window.RobotConfig.STARTER_PACK.topic ? window.RobotConfig.STARTER_PACK : null;
    }
    return new Promise((resolve) => {
      const tx = this.db.transaction('topics_data', 'readonly');
      const req = tx.objectStore('topics_data').get(topic);
      req.onsuccess = () => {
        if (req.result) resolve(req.result);
        else if (topic === window.RobotConfig.STARTER_PACK.topic) resolve(window.RobotConfig.STARTER_PACK);
        else resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  },

  async getAllCachedTopicsMeta() {
    if (!this.db) return [window.RobotConfig.STARTER_PACK];
    return new Promise((resolve) => {
      const tx = this.db.transaction('topics_data', 'readonly');
      const req = tx.objectStore('topics_data').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  },

  // Hàng đợi đồng bộ Offline (Sync Queue)
  enqueueSync(eventObj) {
    try {
      const q = JSON.parse(localStorage.getItem('robot_sync_queue') || '[]');
      q.push({ ...eventObj, bot_id: this.getBotId(), ts: Date.now() });
      if (q.length > 500) q.splice(0, q.length - 500);
      localStorage.setItem('robot_sync_queue', JSON.stringify(q));
    } catch {}
  },

  getSyncQueue() {
    try { return JSON.parse(localStorage.getItem('robot_sync_queue') || '[]'); }
    catch { return []; }
  },

  clearSyncQueue(count) {
    const q = this.getSyncQueue();
    q.splice(0, count);
    localStorage.setItem('robot_sync_queue', JSON.stringify(q));
  },

  // Nhật ký giải trí (YouTube / Game) cho phụ huynh giám sát
  logMediaUsage(tabName, detail) {
    const logs = JSON.parse(localStorage.getItem('robot_media_logs') || '[]');
    logs.unshift({ time: new Date().toLocaleString('vi-VN'), tab: tabName, detail });
    if (logs.length > 60) logs.pop();
    localStorage.setItem('robot_media_logs', JSON.stringify(logs));
  },

  getMediaLogs() {
    try { return JSON.parse(localStorage.getItem('robot_media_logs') || '[]'); }
    catch { return []; }
  }
};
