// audio-recorder-backup.js

const DB_NAME = 'audio-recorder-backup-db';
const DB_VERSION = 1;
const SESSION_STORE = 'sessions';
const CHUNK_STORE = 'chunks';

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txToPromise(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction error'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

let dbPromise = null;

function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        const sessions = db.createObjectStore(SESSION_STORE, { keyPath: 'id' });
        sessions.createIndex('byUpdatedAt', 'updatedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        const chunks = db.createObjectStore(CHUNK_STORE, { keyPath: 'id' });
        chunks.createIndex('bySessionId', 'sessionId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function idbPut(storeName, value) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(value);
  await txToPromise(tx);
}

async function idbGet(storeName, key) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readonly');
  const req = tx.objectStore(storeName).get(key);
  const result = await reqToPromise(req);
  await txToPromise(tx);
  return result;
}

async function idbGetAll(storeName) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readonly');
  const req = tx.objectStore(storeName).getAll();
  const result = await reqToPromise(req);
  await txToPromise(tx);
  return result;
}

async function idbGetAllByIndex(storeName, indexName, query) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readonly');
  const req = tx.objectStore(storeName).index(indexName).getAll(query);
  const result = await reqToPromise(req);
  await txToPromise(tx);
  return result;
}

async function deleteSessionWithChunks(sessionId) {
  const chunks = await idbGetAllByIndex(CHUNK_STORE, 'bySessionId', sessionId);
  const db = await openDatabase();
  const tx = db.transaction([SESSION_STORE, CHUNK_STORE], 'readwrite');

  const chunkStore = tx.objectStore(CHUNK_STORE);
  for (const chunk of chunks) {
    chunkStore.delete(chunk.id);
  }

  tx.objectStore(SESSION_STORE).delete(sessionId);
  await txToPromise(tx);
}

class AutoBackupAudioRecorder {
  constructor({
    timeslice = 5000,
    audioBitsPerSecond,
    onChunkSaved = () => {},
    onStateChange = () => {},
  } = {}) {
    this.timeslice = timeslice;
    this.audioBitsPerSecond = audioBitsPerSecond;
    this.onChunkSaved = onChunkSaved;
    this.onStateChange = onStateChange;

    this.stream = null;
    this.mediaRecorder = null;
    this.sessionId = null;
    this.sessionMeta = null;
    this.chunkIndex = 0;
    this.writeChain = Promise.resolve();
    this.stopPromise = null;
    this._resolveStop = null;
    this._rejectStop = null;
    this._pageHideHandler = null;
  }

  static pickMimeType() {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];

    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return '';
  }

  async start(deviceId) {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      return this.sessionId;
    }

    const audioConstraints = deviceId
      ? { deviceId: { exact: deviceId } }
      : true;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });

    const mimeType = AutoBackupAudioRecorder.pickMimeType();
    this.sessionId = crypto.randomUUID();
    this.chunkIndex = 0;

    this.sessionMeta = {
      id: this.sessionId,
      mimeType,
      status: 'recording',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      lastIndex: 0,
    };

    await idbPut(SESSION_STORE, this.sessionMeta);

    const options = {};
    if (mimeType) options.mimeType = mimeType;
    if (this.audioBitsPerSecond) {
      options.audioBitsPerSecond = this.audioBitsPerSecond;
    }

    this.mediaRecorder = new MediaRecorder(this.stream, options);

    this.stopPromise = new Promise((resolve, reject) => {
      this._resolveStop = resolve;
      this._rejectStop = reject;
    });

    this.mediaRecorder.addEventListener('dataavailable', (event) => {
      if (!event.data || event.data.size === 0) return;

      this.writeChain = this.writeChain
        .then(() => this.persistChunk(event.data))
        .catch((err) => {
          console.error('Chunk persist failed:', err);
          throw err;
        });
    });

    this.mediaRecorder.addEventListener('error', async (event) => {
      console.error('MediaRecorder error:', event.error || event);

      try {
        await this.writeChain;
        this.sessionMeta.status = 'error';
        this.sessionMeta.updatedAt = Date.now();
        this.sessionMeta.error = event.error?.message || 'MediaRecorder error';
        await idbPut(SESSION_STORE, this.sessionMeta);
      } catch (e) {
        console.error('Failed to save recorder error state:', e);
      }
    });

    this.mediaRecorder.addEventListener('stop', async () => {
      try {
        await this.writeChain;
        this.sessionMeta.status = 'stopped';
        this.sessionMeta.updatedAt = Date.now();
        await idbPut(SESSION_STORE, this.sessionMeta);
        this.cleanupLiveResources();
        this._resolveStop?.();
      } catch (err) {
        this.cleanupLiveResources();
        this._rejectStop?.(err);
      }
    });

    this._pageHideHandler = () => {
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        try {
          this.mediaRecorder.requestData();
        } catch (_) {
          // ignore
        }
      }
    };

    window.addEventListener('pagehide', this._pageHideHandler);

    this.mediaRecorder.start(this.timeslice);
    this.onStateChange({ state: 'recording', sessionId: this.sessionId });

    return this.sessionId;
  }

  async persistChunk(blob) {
    const index = ++this.chunkIndex;

    const chunkRecord = {
      id: `${this.sessionId}:${index}`,
      sessionId: this.sessionId,
      index,
      blob,
      size: blob.size,
      type: blob.type || this.sessionMeta.mimeType || '',
      createdAt: Date.now(),
    };

    await idbPut(CHUNK_STORE, chunkRecord);

    this.sessionMeta.lastIndex = index;
    this.sessionMeta.updatedAt = Date.now();
    await idbPut(SESSION_STORE, this.sessionMeta);

    this.onChunkSaved({
      sessionId: this.sessionId,
      index,
      size: blob.size,
    });
  }

  async stop() {
    if (!this.mediaRecorder) {
      return this.restoreSession(this.sessionId);
    }

    if (this.mediaRecorder.state === 'inactive') {
      return this.restoreSession(this.sessionId);
    }

    try {
      this.mediaRecorder.requestData();
    } catch (_) {
      // ignore
    }

    this.mediaRecorder.stop();
    await this.stopPromise;

    return this.restoreSession(this.sessionId);
  }

  cleanupLiveResources() {
    if (this._pageHideHandler) {
      window.removeEventListener('pagehide', this._pageHideHandler);
      this._pageHideHandler = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.mediaRecorder = null;
    this.onStateChange({ state: 'inactive', sessionId: this.sessionId });
  }

  async listSessions() {
    const sessions = await idbGetAll(SESSION_STORE);
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async recoverLatestSession() {
    const sessions = await this.listSessions();
    const session = sessions.find((s) =>
      ['recording', 'stopped', 'error'].includes(s.status)
    );

    if (!session) return null;
    return this.restoreSession(session.id);
  }

  async restoreSession(sessionId) {
    if (!sessionId) return null;

    const session = await idbGet(SESSION_STORE, sessionId);
    if (!session) return null;

    const chunks = await idbGetAllByIndex(CHUNK_STORE, 'bySessionId', sessionId);
    chunks.sort((a, b) => a.index - b.index);

    const mimeType =
      session.mimeType ||
      chunks[0]?.type ||
      chunks[0]?.blob?.type ||
      'audio/webm';

    const blob = new Blob(
      chunks.map((c) => c.blob),
      { type: mimeType }
    );

    return {
      session,
      chunksCount: chunks.length,
      blob,
      url: URL.createObjectURL(blob),
    };
  }

  async clearSession(sessionId) {
    await deleteSessionWithChunks(sessionId);

    if (this.sessionId === sessionId) {
      this.sessionId = null;
      this.sessionMeta = null;
      this.chunkIndex = 0;
    }
  }
}