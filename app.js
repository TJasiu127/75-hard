(() => {
  const TASKS = [
    { key: 'workout1', label: '45-min workout #1' },
    { key: 'workout2_outdoor', label: '45-min workout #2 (outdoors)' },
    { key: 'diet', label: 'Follow your diet (no cheat, no alcohol)' },
    { key: 'water', label: 'Drink 1 gallon of water' },
    { key: 'reading', label: 'Read 10 pages (non-fiction)' },
    { key: 'progress_photo', label: 'Progress photo' }
  ];
  const toISODate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const parseISODate = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setHours(0, 0, 0, 0);
    return date;
  };
  const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const daysBetween = (a, b) => {
    const ms = parseISODate(toISODate(b)) - parseISODate(toISODate(a));
    return Math.round(ms / 86400000);
  };
  const DB_NAME = 'seventyFiveHardDB';
  const DB_VERSION = 1;
  const STORE_ENTRIES = 'entries';
  const STORE_META = 'meta';
  let _dbPromise = null;
  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
          const store = db.createObjectStore(STORE_ENTRIES, { keyPath: 'id' });
          store.createIndex('by_date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }
  async function getMeta(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_META, 'readonly');
      const store = tx.objectStore(STORE_META);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  }
  async function setMeta(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_META, 'readwrite');
      const store = tx.objectStore(STORE_META);
      store.put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function getEntriesByDate(isoDate) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ENTRIES, 'readonly');
      const store = tx.objectStore(STORE_ENTRIES);
      const idx = store.index('by_date');
      const req = idx.getAll(isoDate);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  async function getEntry(isoDate, taskKey) {
    const db = await openDB();
    const id = `${isoDate}|${taskKey}`;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ENTRIES, 'readonly');
      const store = tx.objectStore(STORE_ENTRIES);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  async function putEntry(entry) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ENTRIES, 'readwrite');
      const store = tx.objectStore(STORE_ENTRIES);
      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  async function compressImage(file, maxSize = 1600, quality = 0.82) {
    try {
      const img = await fileToImage(file);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > height && width > maxSize) {
        height = Math.round((maxSize / width) * height);
        width = maxSize;
      } else if (height > width && height > maxSize) {
        width = Math.round((maxSize / height) * width);
        height = maxSize;
      } else if (width === height && width > maxSize) {
        width = maxSize;
        height = maxSize;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      const type = 'image/jpeg';
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
      return { blob, type };
    } catch (e) {
      return { blob: file, type: file.type || 'application/octet-stream' };
    }
  }
  function createObjectURLSafe(blob) {
    if (!blob) return null;
    try {
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }
  const els = {
    startDateInput: null,
    saveStartDateBtn: null,
    todayBtn: null,
    dayLabel: null,
    dateLabel: null,
    prevDayBtn: null,
    nextDayBtn: null,
    tasksContainer: null,
    progressBarInner: null,
    progressText: null
  };
  let state = {
    startDateISO: null,
    currentISO: toISODate(new Date())
  };
  function $(sel) { return document.querySelector(sel); }
  function setText(el, text) { if (el) el.textContent = text; }
  function updateDayHeader() {
    const current = parseISODate(state.currentISO);
    const start = state.startDateISO ? parseISODate(state.startDateISO) : current;
    const offset = Math.max(0, daysBetween(start, current));
    const dayNumber = offset + 1;
    setText(els.dayLabel, `Day ${dayNumber}`);
    setText(els.dateLabel, current.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' }));
    if (state.startDateISO) {
      els.prevDayBtn.disabled = dayNumber <= 1;
      els.nextDayBtn.disabled = dayNumber >= 75;
    } else {
      els.prevDayBtn.disabled = false;
      els.nextDayBtn.disabled = false;
    }
  }
  function computeProgress(entriesMap) {
    const total = TASKS.length;
    let done = 0;
    for (const t of TASKS) {
      const e = entriesMap.get(t.key);
      if (e && e.completed) done++;
    }
    const pct = Math.round((done / total) * 100);
    els.progressBarInner.style.width = `${pct}%`;
    setText(els.progressText, `${done}/${total} tasks completed`);
  }
  async function loadDay(isoDate) {
    state.currentISO = isoDate;
    updateDayHeader();
    const entries = await getEntriesByDate(isoDate);
    const map = new Map(entries.map((e) => [e.taskKey, e]));
    renderTasks(map);
    computeProgress(map);
  }
  function renderTasks(entriesMap) {
    const container = els.tasksContainer;
    container.innerHTML = '';
    TASKS.forEach((task) => {
      const entry = entriesMap.get(task.key) || { completed: false, description: '', imageBlob: null, imageType: null };
      const wrapper = document.createElement('div');
      wrapper.className = 'task';
      wrapper.dataset.taskKey = task.key;
      const head = document.createElement('div');
      head.className = 'task-head';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!entry.completed;
      const label = document.createElement('div');
      label.className = 'task-label';
      label.textContent = task.label;
      head.appendChild(checkbox);
      head.appendChild(label);
      const body = document.createElement('div');
      body.className = 'task-body';
      const row1 = document.createElement('div');
      row1.className = 'task-row';
      const preview = document.createElement('img');
      preview.className = 'preview';
      if (entry.imageBlob) {
        preview.src = createObjectURLSafe(entry.imageBlob);
      } else {
        preview.alt = 'No image';
      }
      const file = document.createElement('input');
      file.type = 'file';
      file.accept = 'image/*';
      file.capture = 'environment';
      file.className = 'file';
      const clearBtn = document.createElement('button');
      clearBtn.className = 'btn btn-secondary clear-btn';
      clearBtn.textContent = 'Clear Photo';
      row1.appendChild(preview);
      row1.appendChild(file);
      row1.appendChild(clearBtn);
      const row2 = document.createElement('div');
      row2.className = 'task-row';
      const desc = document.createElement('textarea');
      desc.className = 'desc';
      desc.placeholder = 'Add a short note about this activity...';
      desc.value = entry.description || '';
      const saved = document.createElement('div');
      saved.className = 'save-indicator';
      saved.textContent = entry.updatedAt ? `Saved` : '';
      row2.appendChild(desc);
      row2.appendChild(saved);
      body.appendChild(row1);
      body.appendChild(row2);
      wrapper.appendChild(head);
      wrapper.appendChild(body);
      container.appendChild(wrapper);
      checkbox.addEventListener('change', async () => {
        await saveEntry(task.key, { completed: checkbox.checked, description: desc.value });
        const map = await reloadMap();
        computeProgress(map);
        saved.textContent = 'Saved';
      });
      let descTimer = null;
      const scheduleSave = () => {
        if (descTimer) clearTimeout(descTimer);
        descTimer = setTimeout(async () => {
          await saveEntry(task.key, { completed: checkbox.checked, description: desc.value });
          saved.textContent = 'Saved';
        }, 500);
      };
      desc.addEventListener('input', scheduleSave);
      file.addEventListener('change', async () => {
        if (file.files && file.files[0]) {
          const { blob, type } = await compressImage(file.files[0]);
          await saveEntry(task.key, { imageBlob: blob, imageType: type, completed: true });
          preview.src = createObjectURLSafe(blob);
          checkbox.checked = true;
          const map = await reloadMap();
          computeProgress(map);
          saved.textContent = 'Saved';
        }
        file.value = '';
      });
      clearBtn.addEventListener('click', async () => {
        await saveEntry(task.key, { imageBlob: null, imageType: null });
        preview.removeAttribute('src');
        saved.textContent = 'Saved';
      });
    });
  }
  async function saveEntry(taskKey, patch) {
    const iso = state.currentISO;
    const existing = await getEntry(iso, taskKey);
    const now = Date.now();
    const entry = {
      id: `${iso}|${taskKey}`,
      date: iso,
      taskKey,
      completed: patch.completed ?? (existing ? existing.completed : false),
      description: patch.description ?? (existing ? existing.description : ''),
      imageBlob: ('imageBlob' in patch) ? patch.imageBlob : (existing ? existing.imageBlob : null),
      imageType: ('imageType' in patch) ? patch.imageType : (existing ? existing.imageType : null),
      updatedAt: now
    };
    await putEntry(entry);
  }
  async function reloadMap() {
    const entries = await getEntriesByDate(state.currentISO);
    return new Map(entries.map((e) => [e.taskKey, e]));
  }
  async function setStartDate(iso) {
    await setMeta('startDate', iso);
    state.startDateISO = iso;
    els.startDateInput.value = iso;
    updateDayHeader();
  }
  async function init() {
    els.startDateInput = document.querySelector('#startDateInput');
    els.saveStartDateBtn = document.querySelector('#saveStartDateBtn');
    els.todayBtn = document.querySelector('#todayBtn');
    els.dayLabel = document.querySelector('#dayLabel');
    els.dateLabel = document.querySelector('#dateLabel');
    els.prevDayBtn = document.querySelector('#prevDayBtn');
    els.nextDayBtn = document.querySelector('#nextDayBtn');
    els.tasksContainer = document.querySelector('#tasksContainer');
    els.progressBarInner = document.querySelector('#progressBarInner');
    els.progressText = document.querySelector('#progressText');
    await openDB();
    const metaStart = await getMeta('startDate');
    if (metaStart) {
      state.startDateISO = metaStart;
      els.startDateInput.value = metaStart;
      const today = toISODate(new Date());
      if (parseISODate(today) < parseISODate(metaStart)) {
        state.currentISO = metaStart;
      }
    } else {
      const today = toISODate(new Date());
      els.startDateInput.value = today;
    }
    els.saveStartDateBtn.addEventListener('click', async () => {
      if (!els.startDateInput.value) return;
      await setStartDate(els.startDateInput.value);
      await loadDay(state.currentISO);
    });
    els.todayBtn.addEventListener('click', async () => {
      state.currentISO = toISODate(new Date());
      await loadDay(state.currentISO);
    });
    els.prevDayBtn.addEventListener('click', async () => {
      const prev = addDays(parseISODate(state.currentISO), -1);
      if (state.startDateISO) {
        const lower = parseISODate(state.startDateISO);
        if (prev < lower) return;
      }
      await loadDay(toISODate(prev));
    });
    els.nextDayBtn.addEventListener('click', async () => {
      const next = addDays(parseISODate(state.currentISO), 1);
      if (state.startDateISO) {
        const lower = parseISODate(state.startDateISO);
        const upper = addDays(lower, 74);
        if (next > upper) return;
      }
      await loadDay(toISODate(next));
    });
    await loadDay(state.currentISO);
  }
  window.addEventListener('DOMContentLoaded', init);
})();
